import { test, expect } from "vitest";
import { buildLevel } from "../../../shared/map.js";
import { createStartingPlayer } from "./startingPlayer.js";

const level = buildLevel({
  tileSize: 40,
  spawn: { col: 1, row: 1 },
  rows: ["#######", "#.....#", "#.....#", "#.....#", "#######"],
});
const saved = { name: "Aria", hp: 60, x: 100, y: 100 };

test("starts from the saved name, health and position", () => {
  const p = createStartingPlayer(saved, level);
  expect(p).toMatchObject({
    name: "Aria",
    hp: 60,
    maxHp: 100,
    size: 24,
    x: 100,
    y: 100,
  });
});

test("a saved position inside a wall falls back to the spawn point", () => {
  const p = createStartingPlayer({ ...saved, x: 5, y: 5 }, level);
  expect(p).toMatchObject({ x: 60, y: 60 });
});

test("a missing or non-numeric position falls back to the spawn point", () => {
  for (const bad of [
    { x: null, y: undefined },
    { x: "100", y: 100 },
    { x: NaN, y: 100 },
  ]) {
    const p = createStartingPlayer({ ...saved, ...bad }, level);
    expect(p).toMatchObject({ x: 60, y: 60 });
  }
});
