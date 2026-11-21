import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { buildLevel } from "../shared/map.js";
import { openTestDb } from "./pg/test-db.js";
import { createUser } from "./users.js";
import { createCharacter, listCharacters } from "./characters.js";
import { createWorld } from "./world.js";
import { createPersistence } from "./persistence.js";
import { loadLevels } from "./levels.js";

const hall = buildLevel({
  tileSize: 40,
  spawn: { col: 1, row: 1 },
  rows: [
    "#".repeat(20),
    `#${".".repeat(18)}#`,
    `#${".".repeat(18)}#`,
    `#${".".repeat(18)}#`,
    "#".repeat(20),
  ],
});

let db;
let world;
let owners;
let logger;
let persistence;
let alice;
let aria;
let seq;

// Moves Aria to the right by n steps (10 px each).
function move(n) {
  seq += 1;
  world.setInput(aria.id, {
    seq,
    up: false,
    down: false,
    left: false,
    right: true,
  });
  for (let i = 0; i < n; i++) world.step();
}
const saved = async (user = alice) => (await listCharacters(db, user.id))[0];
// Writes now go through db.run, and the SQL starts with a line break, hence trim().
const updates = (spy) =>
  spy.mock.calls.filter(([sql]) => sql.trim().startsWith("UPDATE characters"));

beforeEach(async () => {
  seq = 0;
  db = await openTestDb();
  alice = await createUser(db, "alice", "hash");
  aria = await createCharacter(db, alice.id, "Aria"); // starts at the spawn point, (100, 60)
  world = createWorld(hall);
  world.add(aria);
  owners = new Map([[aria.id, alice.id]]);
  logger = { error: vi.fn() };
  persistence = createPersistence({
    db,
    world,
    ownerOf: (id) => owners.get(id),
    logger,
    intervalMs: 1000,
  });
});

afterEach(async () => {
  persistence.stop();
  vi.useRealTimers();
  if (db.open) await db.close();
});

test("a character that has moved is written, with its exact values", async () => {
  move(3);
  expect(await persistence.save(aria.id)).toBe(true);
  expect((await saved()).x).toBeCloseTo(130);
  expect(await saved()).toMatchObject({ y: 60, hp: 100 });
});

test("a character that has not changed is not written again", async () => {
  const run = vi.spyOn(db, "run");
  expect(await persistence.save(aria.id)).toBe(true); // the first save always writes
  expect(await persistence.save(aria.id)).toBe(false);
  expect(await persistence.save(aria.id)).toBe(false);
  expect(updates(run)).toHaveLength(1);
});

test("it writes again once the character moves", async () => {
  await persistence.save(aria.id);
  move(2);
  expect(await persistence.save(aria.id)).toBe(true);
  expect((await saved()).x).toBeCloseTo(120);
});

test("forgetting a character makes the next save write again", async () => {
  await persistence.save(aria.id);
  persistence.forget(aria.id);
  expect(await persistence.save(aria.id)).toBe(true);
});

test("a character with nobody online, or not in the world, is not written", async () => {
  move(2);
  owners.clear();
  expect(await persistence.save(aria.id)).toBe(false);

  owners.set(aria.id, alice.id);
  world.remove(aria.id);
  expect(await persistence.save(aria.id)).toBe(false);
  expect((await saved()).x).toBe(100); // nothing was written
});

test("saveAll writes everyone who changed, and says how many", async () => {
  const bob = await createUser(db, "bobby", "hash");
  const borin = await createCharacter(db, bob.id, "Borin");
  world.add(borin);
  owners.set(borin.id, bob.id);

  move(2); // only Aria moves
  expect(await persistence.saveAll()).toBe(2); // the first time, both are written
  expect(await persistence.saveAll()).toBe(0);
  move(1);
  expect(await persistence.saveAll()).toBe(1); // only Aria changed
  expect((await saved(bob)).x).toBe(100);
});

test("a database error is logged and does not escape", async () => {
  await db.close();
  expect(await persistence.save(aria.id)).toBe(false);
  expect(logger.error).toHaveBeenCalledTimes(1);
});

test("start saves on a timer, and stop ends it", async () => {
  // Only the save timer is faked: the database driver keeps its real timers.
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  persistence.start();
  persistence.start(); // starting twice is harmless
  move(3);

  vi.advanceTimersByTime(999);
  await persistence.drain();
  expect((await saved()).x).toBe(100);
  vi.advanceTimersByTime(1);
  await persistence.drain(); // a write is a real round trip now: wait for it
  expect((await saved()).x).toBeCloseTo(130);

  persistence.stop();
  move(2);
  vi.advanceTimersByTime(5000);
  await persistence.drain();
  expect((await saved()).x).toBeCloseTo(130); // no more saves
});

test("level, XP and score are saved with the position", async () => {
  // A one-hit monster next to Aria (she stands at (100, 60), it at (140, 60)) that never strikes.
  const fighting = createWorld(hall, {
    levels: await loadLevels(db),
    monsters: {
      types: {
        dummy: {
          name: "Dummy",
          maxHp: 10,
          damage: 1,
          xp: 60,
          attackRange: 1,
          cooldownMs: 99999,
          respawnSeconds: 99,
        },
      },
      spawns: [{ type: "dummy", col: 3, row: 1 }],
    },
  });
  fighting.add(aria);
  expect(fighting.attack(aria.id)).toMatchObject({ killed: true, level: 2 });

  const saver = createPersistence({
    db,
    world: fighting,
    ownerOf: (id) => owners.get(id),
    logger,
  });
  await saver.save(aria.id);

  expect(await saved()).toMatchObject({ level: 2, xp: 60, score: 60 });
});

test("onSaved is told about every write, and only about writes", async () => {
  const onSaved = vi.fn();
  const watching = createPersistence({
    db,
    world,
    ownerOf: (id) => owners.get(id),
    logger,
    onSaved,
    intervalMs: 1000,
  });
  move(4);

  await watching.save(aria.id);
  await watching.save(aria.id); // nothing changed: nothing written, nothing announced

  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(onSaved).toHaveBeenCalledWith(
    aria.id,
    expect.objectContaining({ x: expect.any(Number) }),
  );
});

test("a failing onSaved is logged and does not stop the save", async () => {
  const watching = createPersistence({
    db,
    world,
    ownerOf: (id) => owners.get(id),
    logger,
    onSaved: vi.fn().mockRejectedValue(new Error("redis down")),
    intervalMs: 1000,
  });
  move(4);

  expect(await watching.save(aria.id)).toBe(true);
  await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(1));
  expect((await saved()).x).toBeCloseTo(140);
});

test("an onSaved that throws at once is logged too", async () => {
  const watching = createPersistence({
    db,
    world,
    ownerOf: (id) => owners.get(id),
    logger,
    onSaved: () => {
      throw new Error("broken");
    },
    intervalMs: 1000,
  });
  move(4);

  expect(await watching.save(aria.id)).toBe(true);
  expect(logger.error).toHaveBeenCalledTimes(1);
});

test("saves of one character never overlap: the newest state lands last, and is written once", async () => {
  const realRun = db.run;
  const delays = [80, 10, 10]; // the first write is the slowest
  vi.spyOn(db, "run").mockImplementation(async (sql, params) => {
    await new Promise((resolve) => setTimeout(resolve, delays.shift() ?? 0));
    return realRun(sql, params);
  });

  move(1);
  const first = persistence.save(aria.id); // x = 110, slow
  move(1);
  const second = persistence.save(aria.id); // x = 120
  const third = persistence.save(aria.id); // still 120: nothing new
  await Promise.all([first, second, third]);

  expect((await saved()).x).toBeCloseTo(120); // the newer position, not the older one
  expect(db.run).toHaveBeenCalledTimes(2); // 110, then 120: the repeat is skipped
});
