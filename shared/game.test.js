import { test, expect } from "vitest";
import { buildLevel } from "./map.js";
import { createPlayer, updatePlayer } from "./game.js";

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
