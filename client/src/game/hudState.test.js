import { test, expect } from "vitest";
import { buildLevel } from "../../../shared/map.js";
import { createPlayer } from "../../../shared/game.js";
import { hudSnapshot, sameHud } from "./hudState.js";

const level = buildLevel({
  tileSize: 40,
  spawn: { col: 1, row: 1 },
  rows: ["#####", "#...#", "#...#", "#####"],
});

test("a snapshot reports name, health and tile", () => {
  const snap = hudSnapshot(
    { ...createPlayer(level), name: "Aria", hp: 40 },
    level,
  );
  expect(snap).toEqual({
    name: "Aria",
    hp: 40,
    maxHp: 100,
    hpPercent: 40,
    col: 1,
    row: 1,
  });
});

test("moving within a tile does not change the snapshot", () => {
  const p = createPlayer(level);
  const a = hudSnapshot(p, level);
  const b = hudSnapshot({ ...p, x: p.x + 5, y: p.y - 5 }, level);
  expect(sameHud(a, b)).toBe(true);
});

test("crossing a tile boundary or losing health changes it", () => {
  const p = createPlayer(level);
  const a = hudSnapshot(p, level);
  expect(sameHud(a, hudSnapshot({ ...p, x: 85 }, level))).toBe(false);
  expect(sameHud(a, hudSnapshot({ ...p, hp: 99 }, level))).toBe(false);
});
