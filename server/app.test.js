import { test, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createTestApp, ALICE } from "./test-helpers.js";

let app;
let db;
beforeEach(() => {
  ({ app, db } = createTestApp());
});
afterEach(() => db.close());

const register = (body) => request(app).post("/api/register").send(body);

test("registers a user and never returns the hash", async () => {
  const res = await register(ALICE);
  expect(res.status).toBe(201);
  expect(res.body.username).toBe("alice");
  expect(JSON.stringify(res.body)).not.toMatch(/hash|\$2/);
});

test("stores a bcrypt hash, not the password", async () => {
  await register(ALICE);
  const row = db
    .prepare("SELECT password_hash FROM users WHERE username = ?")
    .get("alice");
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
