import { test, expect, beforeAll, afterAll } from "vitest";
import { startTestServer } from "./test-helpers.js";
import { SPAWN } from "./characters.js";

let t;
beforeAll(async () => {
  t = await startTestServer();
});
afterAll(() => t.close());

// Registers a user and returns a client that is logged in as them.
async function loggedIn(username) {
  const c = t.client();
  const creds = { username, password: "correct-horse-battery" };
  await c.post("/api/register", creds);
  await c.post("/api/login", creds);
  return c;
}

test("every character route requires login", async () => {
  const c = t.client();
  expect((await c.get("/api/characters")).status).toBe(401);
  expect((await c.post("/api/characters", { name: "Aria" })).status).toBe(401);
  expect(
    (await c.put("/api/characters/1/position", { x: 1, y: 1 })).status,
  ).toBe(401);
});

test("create a character, then list it", async () => {
  const c = await loggedIn("alice");
  const res = await c.post("/api/characters", { name: "Aria" });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({
    name: "Aria",
    class: "warrior",
    level: 1,
    x: SPAWN.x,
    y: SPAWN.y,
  });

  const list = await c.get("/api/characters");
  expect(list.body.map((ch) => ch.name)).toEqual(["Aria"]);
});

test("invalid names and classes return 400", async () => {
  const c = await loggedIn("bobby");
  for (const name of ["", "ab", "x".repeat(17), "bad name", 42, undefined]) {
    expect((await c.post("/api/characters", { name })).status).toBe(400);
  }
  const res = await c.post("/api/characters", {
    name: "Valid",
    class: "wizard",
  });
  expect(res.status).toBe(400);
});

test("a fourth character returns 409", async () => {
  const c = await loggedIn("carol");
  for (const name of ["four1", "four2", "four3"]) {
    expect((await c.post("/api/characters", { name })).status).toBe(201);
  }
  const res = await c.post("/api/characters", { name: "four4" });
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe("character_limit");
});

test("character names are unique across users, ignoring case", async () => {
  const a = await loggedIn("dupa");
  const b = await loggedIn("dupb");
  expect((await a.post("/api/characters", { name: "Shared" })).status).toBe(
    201,
  );
  const res = await b.post("/api/characters", { name: "SHARED" });
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe("name_taken");
});

test("users only see their own characters", async () => {
  const a = await loggedIn("lista");
  const b = await loggedIn("listb");
  await a.post("/api/characters", { name: "OnlyForA" });
  await b.post("/api/characters", { name: "OnlyForB" });
  expect((await a.get("/api/characters")).body.map((c) => c.name)).toEqual([
    "OnlyForA",
  ]);
  expect((await b.get("/api/characters")).body.map((c) => c.name)).toEqual([
    "OnlyForB",
  ]);
});

test("the owner can save a position", async () => {
  const c = await loggedIn("mover");
  const { body: ch } = await c.post("/api/characters", { name: "Mover" });
  const res = await c.put(`/api/characters/${ch.id}/position`, {
    x: 150.5,
    y: 200,
  });
  expect(res.status).toBe(200);
  const list = await c.get("/api/characters");
  expect(list.body[0]).toMatchObject({ x: 150.5, y: 200 });
});

test("another user's character cannot be changed, and looks like it does not exist", async () => {
  const owner = await loggedIn("owner");
  const intruder = await loggedIn("intruder");
  const { body: ch } = await owner.post("/api/characters", { name: "Guarded" });

  const res = await intruder.put(`/api/characters/${ch.id}/position`, {
    x: 5,
    y: 5,
  });
  expect(res.status).toBe(404);

  const list = await owner.get("/api/characters");
  expect(list.body[0]).toMatchObject({ x: SPAWN.x, y: SPAWN.y }); // unchanged
});

test("bad positions are rejected with 400", async () => {
  const c = await loggedIn("badpos");
  const { body: ch } = await c.post("/api/characters", { name: "BadPos" });
  const bad = [
    { x: "5", y: 5 },
    { x: -1, y: 5 },
    { x: 5, y: 601 },
    { x: null, y: 5 },
    {},
  ];
  for (const body of bad) {
    const res = await c.put(`/api/characters/${ch.id}/position`, body);
    expect(res.status).toBe(400);
  }
});

test("unknown or malformed character ids return 404", async () => {
  const c = await loggedIn("noid");
  expect(
    (await c.put("/api/characters/99999/position", { x: 1, y: 1 })).status,
  ).toBe(404);
  expect(
    (await c.put("/api/characters/abc/position", { x: 1, y: 1 })).status,
  ).toBe(404);
});
