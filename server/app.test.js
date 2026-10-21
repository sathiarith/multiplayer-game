import { test, expect, beforeAll, afterAll } from "vitest";
import { openDb } from "./db.js";
import { createApp } from "./app.js";

let server;
let base;
let db;

beforeAll(async () => {
  db = openDb(":memory:");
  const app = createApp(db, { bcryptCost: 4 }); // low cost keeps tests fast
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve); // port 0 = any free port
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
  server.close();
  db.close();
});

const register = (body) =>
  fetch(`${base}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("registers a user and never returns the hash", async () => {
  const res = await register({
    username: "alice",
    password: "correct-horse-battery",
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.username).toBe("alice");
  expect(JSON.stringify(body)).not.toMatch(/hash|\$2/);
});

test("stores a bcrypt hash, not the password", async () => {
  await register({ username: "carol", password: "another-long-passphrase" });
  const row = db
    .prepare("SELECT password_hash FROM users WHERE username = ?")
    .get("carol");
  expect(row.password_hash).toMatch(/^\$2[aby]\$/);
  expect(row.password_hash).not.toContain("another-long-passphrase");
});

test("duplicate username returns 409, even with different case", async () => {
  await register({ username: "dave", password: "correct-horse-battery" });
  const res = await register({
    username: "DAVE",
    password: "correct-horse-battery",
  });
  expect(res.status).toBe(409);
});

test("invalid input returns 400 with field messages", async () => {
  const res = await register({ username: "x", password: "short" });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error.fields.username).toBeDefined();
  expect(body.error.fields.password).toBeDefined();
});
