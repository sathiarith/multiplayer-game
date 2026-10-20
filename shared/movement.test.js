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

test("all four direction keys cancel out", () => {
  const keys = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);
  expect(getDirection(keys)).toEqual({ x: 0, y: 0 });
});

test("step with dt of zero does not move", () => {
  const p = step({ x: 10, y: 20 }, { x: 1, y: 0 }, 200, 0);
  expect(p).toEqual({ x: 10, y: 20 });
});

test("step does not mutate the original player", () => {
  const original = Object.freeze({ x: 0, y: 0 });
  expect(() => step(original, { x: 1, y: 0 }, 200, 0.1)).not.toThrow();
});
