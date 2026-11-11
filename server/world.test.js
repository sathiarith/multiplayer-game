import { test, expect } from "vitest";
import { buildLevel } from "../shared/map.js";
import { createWorld, parseInput, STALE_AFTER_TICKS } from "./world.js";

const room = buildLevel({
  tileSize: 40,
  spawn: { col: 1, row: 1 },
  rows: ["#######", "#.....#", "#.....#", "#.....#", "#######"],
});
const hall = buildLevel({
  tileSize: 40,
  spawn: { col: 1, row: 1 },
  rows: [
    "#".repeat(40),
    `#${".".repeat(38)}#`,
    `#${".".repeat(38)}#`,
    `#${".".repeat(38)}#`,
    "#".repeat(40),
  ],
});
const aria = { id: 1, name: "Aria", hp: 100, x: 100, y: 100 };
const borin = { id: 2, name: "Borin", hp: 80, x: 60, y: 60 };
const hold = (seq, keys = {}) => ({
  seq,
  up: false,
  down: false,
  left: false,
  right: false,
  ...keys,
});
const player = (world, id) => world.snapshot().players.find((p) => p.id === id);
const steps = (world, n) => {
  for (let i = 0; i < n; i++) world.step();
};

test("a player starts where the character was saved", () => {
  const world = createWorld(room);
  world.add(aria);
  expect(player(world, 1)).toEqual({
    id: 1,
    name: "Aria",
    x: 100,
    y: 100,
    hp: 100,
    maxHp: 100,
    ack: 0,
  });
});

test("a saved position inside a wall starts at the spawn point", () => {
  const world = createWorld(room);
  world.add({ ...aria, x: 5, y: 5 });
  expect(player(world, 1)).toMatchObject({ x: 60, y: 60 });
});

test("holding a key moves the player at the shared speed", () => {
  const world = createWorld(room);
  world.add(aria);
  expect(world.setInput(1, hold(1, { right: true }))).toBe(true);
  steps(world, 4);
  expect(player(world, 1).x).toBeCloseTo(140); // 200 px/s * 0.05 s * 4 steps
  expect(player(world, 1).y).toBe(100);
});

test("walls stop the player on the server", () => {
  const world = createWorld(room);
  world.add(aria);
  world.setInput(1, hold(1, { right: true }));
  steps(world, 18);
  const { x } = player(world, 1);
  expect(x).toBeGreaterThan(200);
  expect(x).toBeLessThanOrEqual(228); // the right wall starts at 240, half a player is 12
});

test("diagonal movement is not faster than straight movement", () => {
  const world = createWorld(room);
  world.add(aria);
  world.setInput(1, hold(1, { up: true, right: true }));
  steps(world, 4);
  const { x, y } = player(world, 1);
  expect(Math.hypot(x - 100, y - 100)).toBeCloseTo(40, 1);
});

test("an input that is not newer than the last one is ignored", () => {
  const world = createWorld(room);
  world.add(aria);
  expect(world.setInput(1, hold(5, { right: true }))).toBe(true);
  expect(world.setInput(1, hold(5, { left: true }))).toBe(false); // same number
  expect(world.setInput(1, hold(3, { left: true }))).toBe(false); // older
  expect(player(world, 1).ack).toBe(5);
  expect(world.setInput(1, hold(6, { left: true }))).toBe(true);
  expect(player(world, 1).ack).toBe(6);
});

test("malformed input is refused", () => {
  const world = createWorld(room);
  world.add(aria);
  const bad = [
    null,
    undefined,
    "right",
    5,
    [],
    {},
    { seq: 1 },
    { ...hold(1), x: 700 },
    hold(0),
    hold(-1),
    hold(1.5),
    hold("1"),
    hold(2 ** 31),
    hold(1, { up: "yes" }),
    hold(1, { left: 1 }),
  ];
  for (const raw of bad) {
    expect(parseInput(raw), JSON.stringify(raw)).toBeNull();
    expect(world.setInput(1, raw)).toBe(false);
  }
  expect(parseInput(hold(7, { up: true }))).toEqual(hold(7, { up: true }));
});

test("input for a player who is not in the world is ignored", () => {
  const world = createWorld(room);
  expect(world.setInput(99, hold(1))).toBe(false);
});

test("a player who stops sending input stops moving", () => {
  const world = createWorld(hall);
  world.add(aria);
  world.setInput(1, hold(1, { right: true }));
  steps(world, STALE_AFTER_TICKS);
  const x = player(world, 1).x;
  expect(x).toBeCloseTo(300); // moved for one second
  steps(world, 5);
  expect(player(world, 1).x).toBe(x); // then released
});

test("refreshed input keeps the player moving", () => {
  const world = createWorld(hall);
  world.add(aria);
  for (let seq = 1; seq <= 3; seq++) {
    world.setInput(1, hold(seq, { right: true }));
    steps(world, STALE_AFTER_TICKS - 1);
  }
  expect(player(world, 1).x).toBeGreaterThan(100 + 10 * STALE_AFTER_TICKS);
});

test("re-adding a player keeps the position and restarts the input sequence", () => {
  const world = createWorld(room);
  world.add(aria);
  world.setInput(1, hold(7, { right: true }));
  steps(world, 4);

  world.add(aria);

  expect(player(world, 1)).toMatchObject({ x: 140, ack: 0 });
  steps(world, 2);
  expect(player(world, 1).x).toBeCloseTo(140); // input released
  expect(world.setInput(1, hold(1, { right: true }))).toBe(true); // seq 1 is valid again
});

test("players move independently, and removing one leaves the other", () => {
  const world = createWorld(room);
  world.add(aria);
  world.add(borin);
  world.setInput(1, hold(1, { right: true }));
  steps(world, 2);
  expect(player(world, 1).x).toBeCloseTo(120);
  expect(player(world, 2)).toMatchObject({ x: 60, y: 60, hp: 80 });

  world.remove(1);
  expect(world.has(1)).toBe(false);
  expect(world.size).toBe(1);
  expect(world.snapshot().players.map((p) => p.id)).toEqual([2]);
});

test("a snapshot is compact, rounded, and carries the tick", () => {
  const world = createWorld(room);
  world.add(aria);
  world.setInput(1, hold(1, { up: true, right: true }));
  steps(world, 3);
  const snap = world.snapshot();
  expect(snap.tick).toBe(3);
  const p = snap.players[0];
  expect(Object.keys(p)).toEqual([
    "id",
    "name",
    "x",
    "y",
    "hp",
    "maxHp",
    "ack",
  ]);
  expect(Number(p.x.toFixed(2))).toBe(p.x);
  expect(Number(p.y.toFixed(2))).toBe(p.y);
});

test("get returns the exact saved fields, and nothing for an unknown player", () => {
  const world = createWorld(room);
  world.add(aria);
  world.setInput(1, hold(1, { up: true, right: true }));
  world.step();

  const saved = world.get(1);
  expect(saved.hp).toBe(100);
  expect(saved.x).toBeCloseTo(107.0710678, 6);
  expect(saved.x).not.toBe(107.07); // not rounded like the snapshot is
  expect(world.get(99)).toBeUndefined();
});

test("ids lists everyone in the world", () => {
  const world = createWorld(room);
  world.add(aria);
  world.add(borin);
  expect(world.ids().sort()).toEqual([1, 2]);
  world.remove(1);
  expect(world.ids()).toEqual([2]);
});

test("a character's score starts from what was saved", () => {
  const world = createWorld(room);
  world.add({ ...aria, score: 7 });
  expect(world.get(1).score).toBe(7);
});

test("every tile walked earns a point, measured on the server", () => {
  const world = createWorld(hall);
  world.add(aria);
  world.setInput(1, hold(1, { right: true }));

  steps(world, 3);
  expect(world.get(1).score).toBe(0); // 30 px
  steps(world, 1);
  expect(world.get(1).score).toBe(1); // 40 px is one tile
  steps(world, 8);
  expect(world.get(1).score).toBe(3);
});

test("walking into a wall earns nothing", () => {
  const world = createWorld(room);
  world.add(aria);
  world.setInput(1, hold(1, { right: true }));
  steps(world, 18); // reaches the right wall, about three tiles away
  const atTheWall = world.get(1).score;
  expect(atTheWall).toBe(3);

  for (let seq = 2; seq <= 6; seq++) {
    world.setInput(1, hold(seq, { right: true }));
    steps(world, 5); // keep pushing
  }

  expect(world.get(1).score).toBe(atTheWall);
});

test("re-adding a player keeps the score earned so far", () => {
  const world = createWorld(hall);
  world.add(aria);
  world.setInput(1, hold(1, { right: true }));
  steps(world, 4);

  world.add({ ...aria, score: 0 }); // a new connection, with the character as it was saved

  expect(world.get(1).score).toBe(1);
});

test("the score is not part of the snapshot", () => {
  const world = createWorld(room);
  world.add({ ...aria, score: 7 });
  expect(Object.keys(world.snapshot().players[0])).not.toContain("score");
});

const loot = [
  { item: "gold_coin", col: 2, row: 2 }, // center (100, 100), where Aria stands
  { item: "wood", col: 5, row: 2 }, // center (220, 100), 120 px away
];

test("items lie at the center of their tiles and appear in the snapshot", () => {
  const world = createWorld(room, { spawns: loot });
  expect(world.snapshot().items).toEqual([
    { id: 1, item: "gold_coin", x: 100, y: 100 },
    { id: 2, item: "wood", x: 220, y: 100 },
  ]);
});

test("an item within reach may be picked up, and one too far may not", () => {
  const world = createWorld(room, { spawns: loot });
  world.add(aria);
  expect(world.checkPickup(1, 1, 48)).toEqual({ ok: true, item: "gold_coin" });
  expect(world.checkPickup(1, 2, 48)).toEqual({ ok: false, reason: "too_far" });
});

test("a taken item is gone for everyone until it comes back", () => {
  const world = createWorld(room, { spawns: loot, respawnTicks: 3 });
  world.add(aria);
  world.add(borin);

  world.take(1);
  expect(world.snapshot().items.map((i) => i.id)).toEqual([2]);
  expect(world.checkPickup(2, 1, 1000)).toEqual({ ok: false, reason: "gone" });

  steps(world, 2);
  expect(world.snapshot().items.map((i) => i.id)).toEqual([2]);
  steps(world, 1);
  expect(world.snapshot().items.map((i) => i.id)).toEqual([1, 2]);
});

test("an unknown item, or a player not in the world, gets 'gone'", () => {
  const world = createWorld(room, { spawns: loot });
  world.add(aria);
  expect(world.checkPickup(1, 99, 48)).toEqual({ ok: false, reason: "gone" });
  expect(world.checkPickup(42, 1, 48)).toEqual({ ok: false, reason: "gone" });
});

test("a world without loot has no items", () => {
  expect(createWorld(room).snapshot().items).toEqual([]);
});
