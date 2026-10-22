import { test, expect, beforeAll, afterAll } from "vitest";
import { openDb } from "./db.js";
import { createApp } from "./app.js";

let server;
let base;
let db;

const ALICE = { username: "alice", password: "correct-horse-battery" };

// A minimal "browser": stores cookies from Set-Cookie and sends them back.
function makeClient() {
  const jar = new Map();

  async function request(method, path, body) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (jar.size) {
      headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    const res = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const setCookies = res.headers.getSetCookie();
    for (const line of setCookies) {
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (value === "")
        jar.delete(name); // an empty value means "delete this cookie"
      else jar.set(name, value);
    }

    const text = await res.text();
    return {
      status: res.status,
      setCookies,
      body: text ? JSON.parse(text) : null,
    };
  }

  return {
    jar,
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
  };
}

beforeAll(async () => {
  db = openDb(":memory:");
  const app = createApp(db, { bcryptCost: 4, sessionSecret: "test-secret" });
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
  await makeClient().post("/api/register", ALICE);
});

afterAll(() => {
  server.close();
  db.close();
});

test("login succeeds, sets a safe cookie, and /me then identifies the user", async () => {
  const c = makeClient();
  const login = await c.post("/api/login", ALICE);
  expect(login.status).toBe(200);
  expect(login.body.username).toBe("alice");
  expect(JSON.stringify(login.body)).not.toMatch(/hash|\$2/);

  expect(login.setCookies[0]).toMatch(/HttpOnly/i);
  expect(login.setCookies[0]).toMatch(/SameSite=Lax/i);

  const me = await c.get("/api/me");
  expect(me.status).toBe(200);
  expect(me.body.username).toBe("alice");
});

test("/me without a session is 401", async () => {
  const res = await makeClient().get("/api/me");
  expect(res.status).toBe(401);
  expect(res.body.error.code).toBe("not_authenticated");
});

test("wrong password and unknown user get the same response", async () => {
  const wrongPassword = await makeClient().post("/api/login", {
    username: "alice",
    password: "definitely-not-it",
  });
  const unknownUser = await makeClient().post("/api/login", {
    username: "nobody",
    password: "definitely-not-it",
  });
  expect(wrongPassword.status).toBe(401);
  expect(unknownUser.status).toBe(401);
  expect(unknownUser.body).toEqual(wrongPassword.body);
});

test("a failed login does not create a session", async () => {
  const c = makeClient();
  await c.post("/api/login", {
    username: "alice",
    password: "definitely-not-it",
  });
  expect((await c.get("/api/me")).status).toBe(401);
});

test("login ignores username case and returns the stored spelling", async () => {
  const res = await makeClient().post("/api/login", {
    username: "ALICE",
    password: ALICE.password,
  });
  expect(res.status).toBe(200);
  expect(res.body.username).toBe("alice");
});

test("login rejects missing or non-string fields with 400", async () => {
  const c = makeClient();
  expect((await c.post("/api/login", {})).status).toBe(400);
  expect(
    (await c.post("/api/login", { username: "alice", password: 123 })).status,
  ).toBe(400);
});

test("logout ends the session, and the old cookie cannot be reused", async () => {
  const c = makeClient();
  await c.post("/api/login", ALICE);
  const copiedCookies = new Map(c.jar); // what someone who stole the cookie would have

  const logout = await c.post("/api/logout");
  expect(logout.status).toBe(204);
  expect((await c.get("/api/me")).status).toBe(401);

  const thief = makeClient();
  for (const [k, v] of copiedCookies) thief.jar.set(k, v);
  expect((await thief.get("/api/me")).status).toBe(401);
});
