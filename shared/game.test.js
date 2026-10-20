import { test, expect } from "vitest";
import { buildLevel } from "./map.js";
import { createPlayer, updatePlayer, tileOf, hpPercent } from "./game.js";

const level = buildLevel({
  tileSize: 40,
  spawn: { col: 1, row: 1 },
  rows: ["#####", "#...#", "#...#", "#...#", "#####"],
});

test("player spawns at the center of the spawn tile", () => {
  const p = createPlayer(level);
  expect(p.x).toBe(60);
  expect(p.y).toBe(60);
});

test("no keys, or no elapsed time, means no movement", () => {
  const p = createPlayer(level);
  expect(updatePlayer(p, new Set(), 0.016, level)).toEqual(p);
  expect(updatePlayer(p, new Set(["KeyD"]), 0, level)).toEqual(p);
});

test("update does not mutate its input", () => {
  const p = Object.freeze(createPlayer(level));
  expect(() => updatePlayer(p, new Set(["KeyD"]), 0.016, level)).not.toThrow();
});

test("player never leaves the room, whichever way they hold", () => {
  const tolerance = 0.01; // collision treats touching a wall edge as allowed
  for (const key of ["KeyW", "KeyA", "KeyS", "KeyD"]) {
    let p = createPlayer(level);
    for (let i = 0; i < 200; i++) {
      p = updatePlayer(p, new Set([key]), 0.016, level);
    }
    expect(p.x - p.size / 2).toBeGreaterThanOrEqual(40 - tolerance);
    expect(p.x + p.size / 2).toBeLessThanOrEqual(160 + tolerance);
    expect(p.y - p.size / 2).toBeGreaterThanOrEqual(40 - tolerance);
    expect(p.y + p.size / 2).toBeLessThanOrEqual(160 + tolerance);
  }
});

test("player starts with full HP and a name", () => {
  const p = createPlayer(level);
  expect(p.hp).toBe(p.maxHp);
  expect(p.name).toBe("Hero");
});

test("tileOf reports the tile under the player's center", () => {
  expect(tileOf({ x: 60, y: 60 }, level)).toEqual({ col: 1, row: 1 });
  expect(tileOf({ x: 79.9, y: 0 }, level)).toEqual({ col: 1, row: 0 });
  expect(tileOf({ x: 80, y: 0 }, level)).toEqual({ col: 2, row: 0 });
});

test("hpPercent rounds and clamps", () => {
  expect(hpPercent(50, 100)).toBe(50);
  expect(hpPercent(1, 3)).toBe(33);
  expect(hpPercent(150, 100)).toBe(100);
  expect(hpPercent(-5, 100)).toBe(0);
  expect(hpPercent(10, 0)).toBe(0);
});
