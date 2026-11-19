import { test, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import {
  createTestApp,
  createLogCapture,
  loggedInAgent,
  ALICE,
} from "./test-helpers.js";

let app;
let db;
let lines;
beforeEach(async () => {
  const capture = createLogCapture();
  lines = capture.lines;
  ({ app, db } = await createTestApp({ logger: capture.logger }));
});
afterEach(async () => {
  if (db.open) await db.close();
});

// pino-http writes its line when the response finishes, so wait for it.
const completedLine = (url) =>
  vi.waitFor(() => {
    const line = lines.find((l) => l.req?.url === url && l.res);
    expect(line).toBeDefined();
    return line;
  });

test("every response carries a request id, and ids are unique", async () => {
  const a = await request(app).get("/health");
  const b = await request(app).get("/health");
  expect(a.headers["x-request-id"]).toMatch(/^[\w-]{20,}$/);
  expect(a.headers["x-request-id"]).not.toBe(b.headers["x-request-id"]);
});

test("a well-formed incoming request id is kept; a hostile one is replaced", async () => {
  const kept = await request(app)
    .get("/health")
    .set("X-Request-Id", "trace-abc.123");
  expect(kept.headers["x-request-id"]).toBe("trace-abc.123");

  const hostile = "<script>".repeat(10);
  const replaced = await request(app)
    .get("/health")
    .set("X-Request-Id", hostile);
  expect(replaced.headers["x-request-id"]).not.toBe(hostile);
});

test("a request produces one log line with its id, status and timing", async () => {
  const res = await request(app).get("/api/me");
  const line = await completedLine("/api/me");
  expect(line.req.id).toBe(res.headers["x-request-id"]);
  expect(line.req.method).toBe("GET");
  expect(line.res.statusCode).toBe(401);
  expect(line.level).toBe(40); // 4xx is logged as a warning
  expect(typeof line.responseTime).toBe("number");
});

test("successful requests log at info and include the user id", async () => {
  const agent = await loggedInAgent(app, "alice");
  await agent.get("/api/me");
  const line = await completedLine("/api/me");
  expect(line.level).toBe(30);
  expect(line.userId).toBe(1);
});

test("cookies and passwords never appear in the logs", async () => {
  await request(app).post("/api/register").send(ALICE);
  const agent = request.agent(app);
  const login = await agent.post("/api/login").send(ALICE);
  await agent.get("/api/me");

  const loginLine = await completedLine("/api/login");
  const meLine = await completedLine("/api/me");
  expect(loginLine.res.headers["set-cookie"]).toBe("[redacted]");
  expect(meLine.req.headers.cookie).toBe("[redacted]");

  const sid = login.headers["set-cookie"][0].split(";")[0].split("=")[1];
  const everything = JSON.stringify(lines);
  expect(everything).not.toContain(sid);
  expect(everything).not.toContain(ALICE.password);
});

test("/health reports status and uptime, creates no session, and is not logged", async () => {
  const res = await request(app).get("/health");
  expect(res.status).toBe(200);
  expect(res.body.status).toBe("ok");
  expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  expect(res.headers["set-cookie"]).toBeUndefined();

  // Make a logged request, then check the health check left no line before it.
  await request(app).get("/api/me");
  await completedLine("/api/me");
  expect(lines.find((l) => l.req?.url === "/health")).toBeUndefined();
});

test("/health answers 503 and logs an error when the database is unusable", async () => {
  await db.close();
  const res = await request(app).get("/health");
  expect(res.status).toBe(503);
  expect(res.body.status).toBe("unavailable");

  const line = await vi.waitFor(() => {
    const l = lines.find((x) => x.msg === "health check failed");
    expect(l).toBeDefined();
    return l;
  });
  expect(line.level).toBe(50);
});

test("an unexpected error is logged with its request id and message; the client sees neither", async () => {
  const agent = await loggedInAgent(app, "alice");
  await db.run("DROP TABLE characters CASCADE"); // the session and user still work
  const res = await agent.post("/api/characters").send({ name: "Aria" });
  expect(res.status).toBe(500);
  expect(res.text).not.toMatch(/no such table|does not exist/);

  const line = await vi.waitFor(() => {
    const l = lines.find((x) => x.err);
    expect(l).toBeDefined();
    return l;
  });
  expect(line.level).toBe(50);
  expect(line.err.message).toMatch(/does not exist/);
  expect(line.req.id).toBe(res.headers["x-request-id"]);
  expect(line.req.headers.cookie).toBe("[redacted]");
});
