import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { buildLevel } from "../shared/map.js";
import { openDb } from "./db.js";
import { createUser } from "./users.js";
import { createCharacter, listCharacters } from "./characters.js";
import { createWorld } from "./world.js";
import { createPersistence } from "./persistence.js";

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
const saved = (user = alice) => listCharacters(db, user.id)[0];
const updates = (spy) =>
  spy.mock.calls.filter(([sql]) => sql.startsWith("UPDATE characters"));

beforeEach(() => {
  seq = 0;
  db = openDb(":memory:");
  alice = createUser(db, "alice", "hash");
  aria = createCharacter(db, alice.id, "Aria"); // starts at the spawn point, (100, 60)
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

afterEach(() => {
  persistence.stop();
  vi.useRealTimers();
  if (db.open) db.close();
});

test("a character that has moved is written, with its exact values", () => {
  move(3);
  expect(persistence.save(aria.id)).toBe(true);
  expect(saved().x).toBeCloseTo(130);
  expect(saved()).toMatchObject({ y: 60, hp: 100 });
});

test("a character that has not changed is not written again", () => {
  const prepare = vi.spyOn(db, "prepare");
  expect(persistence.save(aria.id)).toBe(true); // the first save always writes
  expect(persistence.save(aria.id)).toBe(false);
  expect(persistence.save(aria.id)).toBe(false);
  expect(updates(prepare)).toHaveLength(1);
});

test("it writes again once the character moves", () => {
  persistence.save(aria.id);
  move(2);
  expect(persistence.save(aria.id)).toBe(true);
  expect(saved().x).toBeCloseTo(120);
});

test("forgetting a character makes the next save write again", () => {
  persistence.save(aria.id);
  persistence.forget(aria.id);
  expect(persistence.save(aria.id)).toBe(true);
});

test("a character with nobody online, or not in the world, is not written", () => {
  move(2);
  owners.clear();
  expect(persistence.save(aria.id)).toBe(false);

  owners.set(aria.id, alice.id);
  world.remove(aria.id);
  expect(persistence.save(aria.id)).toBe(false);
  expect(saved().x).toBe(100); // nothing was written
});

test("saveAll writes everyone who changed, and says how many", () => {
  const bob = createUser(db, "bobby", "hash");
  const borin = createCharacter(db, bob.id, "Borin");
  world.add(borin);
  owners.set(borin.id, bob.id);

  move(2); // only Aria moves
  expect(persistence.saveAll()).toBe(2); // the first time, both are written
  expect(persistence.saveAll()).toBe(0);
  move(1);
  expect(persistence.saveAll()).toBe(1); // only Aria changed
  expect(saved(bob).x).toBe(100);
});

test("a database error is logged and does not escape", () => {
  db.close();
  expect(persistence.save(aria.id)).toBe(false);
  expect(logger.error).toHaveBeenCalledTimes(1);
});

test("start saves on a timer, and stop ends it", () => {
  vi.useFakeTimers();
  persistence.start();
  persistence.start(); // starting twice is harmless
  move(3);

  vi.advanceTimersByTime(999);
  expect(saved().x).toBe(100);
  vi.advanceTimersByTime(1);
  expect(saved().x).toBeCloseTo(130);

  persistence.stop();
  move(2);
  vi.advanceTimersByTime(5000);
  expect(saved().x).toBeCloseTo(130); // no more saves
});
