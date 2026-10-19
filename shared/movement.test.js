import { test, expect } from "vitest";
import { getDirection, step } from "./movement.js";

test("no keys means no movement", () => {
  expect(getDirection(new Set())).toEqual({ x: 0, y: 0 });
});

test("single key moves one unit", () => {
  expect(getDirection(new Set(["ArrowRight"]))).toEqual({ x: 1, y: 0 });
});

test("diagonal movement is normalized", () => {
  const d = getDirection(new Set(["KeyD", "KeyS"]));
  expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
});

test("opposite keys cancel out", () => {
  expect(getDirection(new Set(["KeyA", "KeyD"]))).toEqual({ x: 0, y: 0 });
});

test("step scales distance by speed and dt", () => {
  const p = step({ x: 0, y: 0 }, { x: 1, y: 0 }, 200, 0.5);
  expect(p.x).toBe(100);
});
