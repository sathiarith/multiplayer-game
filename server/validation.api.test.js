import { test, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createTestApp, loggedInAgent, ALICE } from "./test-helpers.js";

let app;
let db;
beforeEach(async () => {
  ({ app, db } = await createTestApp());
});
afterEach(async () => db.close());

const count = async (table) =>
  (await db.one(`SELECT CAST(COUNT(*) AS integer) AS n FROM ${table}`)).n;

test("registration with extra fields is refused and creates nothing", async () => {
  const res = await request(app)
    .post("/api/register")
    .send({ ...ALICE, isAdmin: true });
  expect(res.status).toBe(400);
  expect(res.body.error.fields.isAdmin).toBe("not allowed");
  expect(await count("users")).toBe(0);
});

test("a character cannot be created with chosen stats", async () => {
  const agent = await loggedInAgent(app, "alice");
  const res = await agent
    .post("/api/characters")
    .send({ name: "Cheater", level: 99, hp: 9999 });
  expect(res.status).toBe(400);
  expect(res.body.error.fields.level).toBe("not allowed");
  expect(await count("characters")).toBe(0);
});

test("a JSON array instead of an object is a 400 with a body error", async () => {
  const res = await request(app)
    .post("/api/login")
    .set("Content-Type", "application/json")
    .send("[]");
  expect(res.status).toBe(400);
  expect(res.body.error.fields.body).toBeDefined();
});

test("login with extra fields is refused", async () => {
  const res = await request(app)
    .post("/api/login")
    .send({ ...ALICE, remember: true });
  expect(res.status).toBe(400);
  expect(res.body.error.fields.remember).toBe("not allowed");
});

test("every 400 uses the same error shape", async () => {
  const agent = await loggedInAgent(app, "alice");
  const bad = [
    request(app).post("/api/register").send({}),
    request(app).post("/api/login").send({}),
    agent.post("/api/characters").send({}),
  ];
  for (const res of await Promise.all(bad)) {
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: "invalid_input",
      message: "Invalid input",
    });
    expect(typeof res.body.error.fields).toBe("object");
  }
});
