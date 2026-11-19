import { test, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { createTestApp, ALICE } from "./test-helpers.js";
import { createApp } from "./app.js";

let app;
let db;
beforeEach(async () => {
  ({ app, db } = await createTestApp());
});
afterEach(async () => db.close());

const register = (body) => request(app).post("/api/register").send(body);

test("registers a user and never returns the hash", async () => {
  const res = await register(ALICE);
  expect(res.status).toBe(201);
  expect(res.body.username).toBe("alice");
  expect(JSON.stringify(res.body)).not.toMatch(/hash|\$2/);
});

test("stores a bcrypt hash, not the password", async () => {
  await register(ALICE);
  const row = await db.one(
    "SELECT password_hash FROM users WHERE username = $1",
    ["alice"],
  );
  expect(row.password_hash).toMatch(/^\$2[aby]\$/);
  expect(row.password_hash).not.toContain(ALICE.password);
});

test("duplicate username returns 409, even with different case", async () => {
  await register(ALICE);
  const res = await register({ ...ALICE, username: "ALICE" });
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe("username_taken");
});

test("invalid input returns 400 with field messages", async () => {
  const res = await register({ username: "x", password: "short" });
  expect(res.status).toBe(400);
  expect(res.body.error.fields.username).toBeDefined();
  expect(res.body.error.fields.password).toBeDefined();
});

test("an unexpected database failure during registration returns a generic 500", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  await db.run("DROP TABLE users CASCADE"); // simulate a broken database
  const res = await register(ALICE);
  expect(res.status).toBe(500);
  expect(res.body.error.code).toBe("internal_error");
  spy.mockRestore();
});

test("createApp refuses to start without a session secret", async () => {
  expect(() => createApp(db)).toThrow(/sessionSecret/);
  expect(() => createApp(db, { sessionSecret: "" })).toThrow(/sessionSecret/);
});
