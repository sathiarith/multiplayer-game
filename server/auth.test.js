import { test, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { createTestApp, ALICE } from "./test-helpers.js";

let app;
let db;
beforeEach(async () => {
  ({ app, db } = await createTestApp());
  await request(app).post("/api/register").send(ALICE);
});
afterEach(async () => db.close());

test("login succeeds, sets a safe cookie, and /me then identifies the user", async () => {
  const agent = request.agent(app);
  const login = await agent.post("/api/login").send(ALICE);
  expect(login.status).toBe(200);
  expect(login.body.username).toBe("alice");
  expect(JSON.stringify(login.body)).not.toMatch(/hash|\$2/);

  const cookie = login.headers["set-cookie"][0];
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/SameSite=Lax/i);

  const me = await agent.get("/api/me");
  expect(me.status).toBe(200);
  expect(me.body.username).toBe("alice");
});

test("/me without a session is 401", async () => {
  const res = await request(app).get("/api/me");
  expect(res.status).toBe(401);
  expect(res.body.error.code).toBe("not_authenticated");
});

test("wrong password and unknown user get the same response", async () => {
  const wrongPassword = await request(app)
    .post("/api/login")
    .send({ username: "alice", password: "definitely-not-it" });
  const unknownUser = await request(app)
    .post("/api/login")
    .send({ username: "nobody", password: "definitely-not-it" });
  expect(wrongPassword.status).toBe(401);
  expect(unknownUser.status).toBe(401);
  expect(unknownUser.body).toEqual(wrongPassword.body);
});

test("a failed login does not create a session", async () => {
  const agent = request.agent(app);
  await agent
    .post("/api/login")
    .send({ username: "alice", password: "definitely-not-it" });
  expect((await agent.get("/api/me")).status).toBe(401);
});

test("login ignores username case and returns the stored spelling", async () => {
  const res = await request(app)
    .post("/api/login")
    .send({ username: "ALICE", password: ALICE.password });
  expect(res.status).toBe(200);
  expect(res.body.username).toBe("alice");
});

test("login rejects missing or non-string fields with 400", async () => {
  expect((await request(app).post("/api/login").send({})).status).toBe(400);
  const res = await request(app)
    .post("/api/login")
    .send({ username: "alice", password: 123 });
  expect(res.status).toBe(400);
});

test("logout ends the session, and the old cookie cannot be reused", async () => {
  const agent = request.agent(app);
  const login = await agent.post("/api/login").send(ALICE);
  const stolen = login.headers["set-cookie"][0].split(";")[0]; // "sid=s%3A..."

  expect((await agent.post("/api/logout")).status).toBe(204);
  expect((await agent.get("/api/me")).status).toBe(401);

  const replay = await request(app).get("/api/me").set("Cookie", stolen);
  expect(replay.status).toBe(401);
});

// The session id inside a "sid" cookie: s%3A<id>.<signature>
const sessionIdOf = (res) =>
  decodeURIComponent(res.headers["set-cookie"][0].split(";")[0].split("=")[1])
    .slice(2)
    .split(".")[0];

test("a login that replaces a session reports the old session as ended", async () => {
  const { app } = await createTestApp();
  const ended = vi.fn();
  app.locals.onSessionEnded = ended;
  const agent = request.agent(app);
  await agent.post("/api/register").send(ALICE);

  const first = await agent.post("/api/login").send(ALICE);
  expect(ended).not.toHaveBeenCalled(); // there was no earlier session

  await agent.post("/api/login").send(ALICE); // the agent sends the first cookie

  expect(ended).toHaveBeenCalledTimes(1);
  expect(ended).toHaveBeenCalledWith(sessionIdOf(first));
});

test("a failed login leaves the existing session and its game alone", async () => {
  const { app } = await createTestApp();
  const ended = vi.fn();
  app.locals.onSessionEnded = ended;
  const agent = request.agent(app);
  await agent.post("/api/register").send(ALICE);
  await agent.post("/api/login").send(ALICE);

  const wrong = await agent
    .post("/api/login")
    .send({ ...ALICE, password: "definitely-not-it" });

  expect(wrong.status).toBe(401);
  expect(ended).not.toHaveBeenCalled();
  expect((await agent.get("/api/me")).status).toBe(200);
});
