import { test, expect, afterEach } from "vitest";
import request from "supertest";
import {
  createTestApp,
  loggedInAgent,
  ALICE,
  TEST_ORIGIN,
} from "./test-helpers.js";

const opened = [];
function make(options) {
  const t = createTestApp(options);
  opened.push(t.db);
  return t.app;
}
afterEach(() => {
  while (opened.length) opened.pop().close();
});

test("responses carry security headers and hide the framework", async () => {
  const res = await request(make()).get("/health");
  expect(res.headers["x-content-type-options"]).toBe("nosniff");
  expect(res.headers["x-frame-options"]).toBeDefined();
  expect(res.headers["content-security-policy"]).toBeDefined();
  expect(res.headers["x-powered-by"]).toBeUndefined();
});

test("error responses carry the headers too", async () => {
  const res = await request(make()).get("/nope");
  expect(res.status).toBe(404);
  expect(res.headers["x-content-type-options"]).toBe("nosniff");
});

test("login is blocked after too many failed attempts", async () => {
  const app = make({ rateLimits: { login: { limit: 3, windowMs: 60_000 } } });
  await request(app).post("/api/register").send(ALICE);
  const bad = { username: "alice", password: "definitely-not-it" };

  for (let i = 0; i < 3; i++) {
    expect((await request(app).post("/api/login").send(bad)).status).toBe(401);
  }
  const blocked = await request(app).post("/api/login").send(bad);
  expect(blocked.status).toBe(429);
  expect(blocked.body.error.code).toBe("rate_limited");
  expect(blocked.headers["retry-after"]).toBeDefined();

  // While blocked, even the correct password is refused.
  expect((await request(app).post("/api/login").send(ALICE)).status).toBe(429);
});

test("successful logins do not count against the limit", async () => {
  const app = make({ rateLimits: { login: { limit: 2, windowMs: 60_000 } } });
  await request(app).post("/api/register").send(ALICE);
  for (let i = 0; i < 5; i++) {
    expect((await request(app).post("/api/login").send(ALICE)).status).toBe(
      200,
    );
  }
});

test("registration is limited", async () => {
  const app = make({
    rateLimits: { register: { limit: 2, windowMs: 60_000 } },
  });
  for (const username of ["user_one", "user_two"]) {
    const res = await request(app)
      .post("/api/register")
      .send({ ...ALICE, username });
    expect(res.status).toBe(201);
  }
  const res = await request(app)
    .post("/api/register")
    .send({ ...ALICE, username: "user_three" });
  expect(res.status).toBe(429);
});

const EVIL = "http://evil.example";

test("a preflight from the allowed origin is approved, with credentials", async () => {
  const res = await request(make())
    .options("/api/login")
    .set("Origin", TEST_ORIGIN)
    .set("Access-Control-Request-Method", "POST")
    .set("Access-Control-Request-Headers", "content-type");
  expect(res.status).toBe(204);
  expect(res.headers["access-control-allow-origin"]).toBe(TEST_ORIGIN);
  expect(res.headers["access-control-allow-credentials"]).toBe("true");
  expect(res.headers["access-control-allow-headers"]).toMatch(/content-type/i);
  expect(res.headers.vary).toMatch(/Origin/);
});

test("a preflight from any other origin gets no approval", async () => {
  const res = await request(make())
    .options("/api/login")
    .set("Origin", EVIL)
    .set("Access-Control-Request-Method", "POST");
  // Without an Allow-Origin header naming the page, a browser refuses the
  // response, whatever other CORS headers the server sends along.
  expect(res.headers["access-control-allow-origin"]).toBeUndefined();
});

test("responses are readable by the allowed origin only", async () => {
  const app = make();
  const ok = await request(app).get("/health").set("Origin", TEST_ORIGIN);
  expect(ok.headers["access-control-allow-origin"]).toBe(TEST_ORIGIN);
  expect(ok.headers["access-control-expose-headers"]).toMatch(/x-request-id/i);

  const other = await request(app).get("/health").set("Origin", EVIL);
  expect(other.status).toBe(200); // the server still answers; the browser refuses to show it
  expect(other.headers["access-control-allow-origin"]).toBeUndefined();
});

test("a cross-site login attempt is refused before any route runs", async () => {
  const app = make();
  await request(app).post("/api/register").send(ALICE);
  const res = await request(app)
    .post("/api/login")
    .set("Origin", EVIL)
    .send(ALICE);
  expect(res.status).toBe(403);
  expect(res.body.error.code).toBe("forbidden_origin");
  expect(res.headers["set-cookie"]).toBeUndefined();
});

test("a forged cross-site request cannot act as a logged-in user", async () => {
  const app = make();
  const agent = await loggedInAgent(app, "alice");
  const { body: ch } = await agent
    .post("/api/characters")
    .send({ name: "Aria" });

  const forged = [
    () =>
      agent
        .post("/api/characters")
        .set("Origin", EVIL)
        .send({ name: "Forged" }),
    () =>
      agent
        .put(`/api/characters/${ch.id}/position`)
        .set("Origin", EVIL)
        .send({ x: 1, y: 1 }),
    () => agent.post("/api/logout").set("Origin", EVIL),
  ];
  for (const attempt of forged) expect((await attempt()).status).toBe(403);

  // Nothing changed, and the session survived.
  const list = await agent.get("/api/characters");
  expect(list.body).toHaveLength(1);
  expect(list.body[0].x).not.toBe(1);
  expect((await agent.get("/api/me")).status).toBe(200);
});

test("the opaque 'null' origin is refused", async () => {
  const res = await request(make())
    .post("/api/register")
    .set("Origin", "null")
    .send(ALICE);
  expect(res.status).toBe(403);
});

test("the allowed origin may make state-changing requests", async () => {
  const res = await request(make())
    .post("/api/register")
    .set("Origin", TEST_ORIGIN)
    .send(ALICE);
  expect(res.status).toBe(201);
});

test("form-encoded bodies are ignored, so a plain HTML form cannot log anyone in", async () => {
  const app = make();
  await request(app).post("/api/register").send(ALICE);
  const res = await request(app).post("/api/login").type("form").send(ALICE);
  expect(res.status).toBe(400);
  expect(res.headers["set-cookie"]).toBeUndefined();
});
