import { test, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { createTestApp, loggedInAgent } from "./test-helpers.js";
import { SPAWN } from "./characters.js";

let app;
let db;
beforeEach(() => {
  ({ app, db } = createTestApp());
});
afterEach(() => db.close());

test("every character route requires login", async () => {
  expect((await request(app).get("/api/characters")).status).toBe(401);
  expect(
    (await request(app).post("/api/characters").send({ name: "Aria" })).status,
  ).toBe(401);
});

test("create a character, then list it", async () => {
  const agent = await loggedInAgent(app, "alice");
  const res = await agent.post("/api/characters").send({ name: "Aria" });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({
    name: "Aria",
    class: "warrior",
    level: 1,
    x: SPAWN.x,
    y: SPAWN.y,
  });

  const list = await agent.get("/api/characters");
  expect(list.body.map((c) => c.name)).toEqual(["Aria"]);
});

test("invalid names and classes return 400", async () => {
  const agent = await loggedInAgent(app, "alice");
  for (const name of ["", "ab", "x".repeat(17), "bad name", 42, undefined]) {
    expect((await agent.post("/api/characters").send({ name })).status).toBe(
      400,
    );
  }
  const res = await agent
    .post("/api/characters")
    .send({ name: "Valid", class: "wizard" });
  expect(res.status).toBe(400);
});

test("a fourth character returns 409", async () => {
  const agent = await loggedInAgent(app, "alice");
  for (const name of ["four1", "four2", "four3"]) {
    expect((await agent.post("/api/characters").send({ name })).status).toBe(
      201,
    );
  }
  const res = await agent.post("/api/characters").send({ name: "four4" });
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe("character_limit");
});

test("character names are unique across users, ignoring case", async () => {
  const a = await loggedInAgent(app, "alice");
  const b = await loggedInAgent(app, "bobby");
  expect(
    (await a.post("/api/characters").send({ name: "Shared" })).status,
  ).toBe(201);
  const res = await b.post("/api/characters").send({ name: "SHARED" });
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe("name_taken");
});

test("users only see their own characters", async () => {
  const a = await loggedInAgent(app, "alice");
  const b = await loggedInAgent(app, "bobby");
  await a.post("/api/characters").send({ name: "OnlyForA" });
  await b.post("/api/characters").send({ name: "OnlyForB" });
  expect((await a.get("/api/characters")).body.map((c) => c.name)).toEqual([
    "OnlyForA",
  ]);
  expect((await b.get("/api/characters")).body.map((c) => c.name)).toEqual([
    "OnlyForB",
  ]);
});

test("an unexpected database failure creating a character returns a generic 500", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const agent = await loggedInAgent(app, "alice");
  db.exec("DROP TABLE characters"); // the user and session still exist
  const res = await agent.post("/api/characters").send({ name: "Aria" });
  expect(res.status).toBe(500);
  expect(res.body.error.code).toBe("internal_error");
  spy.mockRestore();
});

test("character routes with no request body answer 400, not a crash", async () => {
  const agent = await loggedInAgent(app, "alice");
  expect((await agent.post("/api/characters")).status).toBe(400);
});

test("clients can no longer report their own position over REST", async () => {
  const agent = await loggedInAgent(app, "alice");
  const { body: ch } = await agent
    .post("/api/characters")
    .send({ name: "Aria" });

  const res = await agent
    .put(`/api/characters/${ch.id}/position`)
    .send({ x: 5, y: 5 });

  expect(res.status).toBe(404);
  expect(res.body.error.message).toBe("Route not found");
  const list = await agent.get("/api/characters");
  expect(list.body[0]).toMatchObject({ x: SPAWN.x, y: SPAWN.y });
});
