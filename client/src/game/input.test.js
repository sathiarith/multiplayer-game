import { test, expect } from "vitest";
import { inputFromKeys, sameInput, anyHeld } from "./input.js";

const idle = { up: false, down: false, left: false, right: false };

test("no keys is no input", () => {
  expect(inputFromKeys(new Set())).toEqual(idle);
});

test("arrows and WASD both work", () => {
  expect(inputFromKeys(new Set(["ArrowUp"]))).toEqual({ ...idle, up: true });
  expect(inputFromKeys(new Set(["KeyW"]))).toEqual({ ...idle, up: true });
  expect(inputFromKeys(new Set(["KeyA", "ArrowDown"]))).toEqual({
    ...idle,
    left: true,
    down: true,
  });
  expect(inputFromKeys(new Set(["KeyD"]))).toEqual({ ...idle, right: true });
});

test("other keys are ignored", () => {
  expect(inputFromKeys(new Set(["KeyQ", "Space", "Enter"]))).toEqual(idle);
});

test("two inputs are the same only when every direction matches", () => {
  expect(sameInput(idle, { ...idle })).toBe(true);
  expect(sameInput(idle, { ...idle, up: true })).toBe(false);
});

test("anyHeld is true as soon as one direction is held", () => {
  expect(anyHeld(idle)).toBe(false);
  expect(anyHeld({ ...idle, left: true })).toBe(true);
});
