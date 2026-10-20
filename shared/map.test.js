import { test, expect } from "vitest";
import { parseMap, isWall, canMoveTo } from "./map.js";
import { moveWithCollision } from "./movement.js";
import { buildLevel } from "./map.js";

const T = 40;
const tiles = parseMap(["####", "#..#", "#..#", "####"]);

test("parseMap converts text to a grid", () => {
  expect(tiles[0]).toEqual([1, 1, 1, 1]);
  expect(tiles[1]).toEqual([1, 0, 0, 1]);
});

test("outside the map counts as wall", () => {
  expect(isWall(tiles, -1, 1)).toBe(true);
  expect(isWall(tiles, 1, 99)).toBe(true);
});

test("open floor is walkable", () => {
  expect(canMoveTo(tiles, T, 80, 80, 24)).toBe(true);
});

test("overlapping a wall is blocked", () => {
  expect(canMoveTo(tiles, T, 50, 80, 24)).toBe(false);
});

test("touching a wall edge without overlapping is allowed", () => {
  expect(canMoveTo(tiles, T, 52, 80, 24)).toBe(true);
});

test("off the map is blocked", () => {
  expect(canMoveTo(tiles, T, -10, 80, 24)).toBe(false);
});

test("player stops at a wall", () => {
  let p = { x: 80, y: 80, size: 24 };
  for (let i = 0; i < 100; i++) {
    p = moveWithCollision(p, { x: 1, y: 0 }, 200, 0.05, tiles, T);
  }
  expect(p.x).toBeLessThanOrEqual(108); // right wall starts at 120, half-size is 12
});

test("player slides along a wall when moving diagonally", () => {
  const p = moveWithCollision(
    { x: 108, y: 60, size: 24 },
    { x: 0.7071, y: 0.7071 },
    200,
    0.05,
    tiles,
    T,
  );
  expect(p.x).toBe(108); // blocked horizontally
  expect(p.y).toBeGreaterThan(60); // still moved vertically
});

test("buildLevel converts raw data into a game map", () => {
  const level = buildLevel({
    tileSize: 40,
    spawn: { col: 1, row: 1 },
    rows: ["###", "#.#", "###"],
  });
  expect(level.tiles[1]).toEqual([1, 0, 1]);
  expect(level.tileSize).toBe(40);
});
