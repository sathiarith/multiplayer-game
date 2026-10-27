import { test, expect, beforeEach, afterEach } from "vitest";
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
  const put = await request(app)
    .put("/api/characters/1/position")
    .send({ x: 1, y: 1 });
  expect(put.status).toBe(401);
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

test("the owner can save a position", async () => {
  const agent = await loggedInAgent(app, "alice");
  const { body: ch } = await agent
    .post("/api/characters")
    .send({ name: "Mover" });
  const res = await agent
    .put(`/api/characters/${ch.id}/position`)
    .send({ x: 150.5, y: 200 });
  expect(res.status).toBe(200);
  const list = await agent.get("/api/characters");
  expect(list.body[0]).toMatchObject({ x: 150.5, y: 200 });
});

test("another user's character cannot be changed, and looks like it does not exist", async () => {
  const owner = await loggedInAgent(app, "alice");
  const intruder = await loggedInAgent(app, "mallory");
  const { body: ch } = await owner
    .post("/api/characters")
    .send({ name: "Guarded" });

  const res = await intruder
    .put(`/api/characters/${ch.id}/position`)
    .send({ x: 5, y: 5 });
  expect(res.status).toBe(404);

  const list = await owner.get("/api/characters");
  expect(list.body[0]).toMatchObject({ x: SPAWN.x, y: SPAWN.y }); // unchanged
});

test("bad positions are rejected with 400", async () => {
  const agent = await loggedInAgent(app, "alice");
  const { body: ch } = await agent
    .post("/api/characters")
    .send({ name: "BadPos" });
  const bad = [
    { x: "5", y: 5 },
    { x: -1, y: 5 },
    { x: 5, y: 601 },
    { x: null, y: 5 },
    {},
  ];
  for (const body of bad) {
    const res = await agent.put(`/api/characters/${ch.id}/position`).send(body);
    expect(res.status).toBe(400);
  }
});

test("unknown or malformed character ids return 404", async () => {
  const agent = await loggedInAgent(app, "alice");
  expect(
    (await agent.put("/api/characters/99999/position").send({ x: 1, y: 1 }))
      .status,
  ).toBe(404);
  expect(
    (await agent.put("/api/characters/abc/position").send({ x: 1, y: 1 }))
      .status,
  ).toBe(404);
});
