import { test, expect, afterEach } from "vitest";
import request from "supertest";
import { createTestApp, ALICE } from "./test-helpers.js";

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
