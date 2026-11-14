import { test, expect } from "vitest";
import {
  createAnim,
  advanceAnim,
  frameIndex,
  startAttack,
} from "./animation.js";

const at = (x, y) => ({ x, y });

test("standing still is idle and keeps the current facing", () => {
  const a = advanceAnim(
    { action: "run", facing: -1, time: 1 },
    at(5, 5),
    at(5, 5),
    0.016,
  );
  expect(a.action).toBe("idle");
  expect(a.facing).toBe(-1);
});

test("moving right runs and faces right", () => {
  const a = advanceAnim(createAnim(), at(0, 0), at(3, 0), 0.016);
  expect(a.action).toBe("run");
  expect(a.facing).toBe(1);
});

test("moving left runs and faces left", () => {
  const a = advanceAnim(createAnim(), at(3, 0), at(0, 0), 0.016);
  expect(a.action).toBe("run");
  expect(a.facing).toBe(-1);
});

test("moving only vertically keeps the current facing", () => {
  const a = advanceAnim(
    { action: "idle", facing: -1, time: 0 },
    at(0, 0),
    at(0, 3),
    0.016,
  );
  expect(a.action).toBe("run");
  expect(a.facing).toBe(-1);
});

test("time accumulates while the action stays the same", () => {
  let a = createAnim();
  a = advanceAnim(a, at(0, 0), at(0, 0), 0.25);
  a = advanceAnim(a, at(0, 0), at(0, 0), 0.25);
  expect(a.time).toBeCloseTo(0.5);
});

test("time restarts when the action changes", () => {
  const a = advanceAnim(
    { action: "idle", facing: 1, time: 2 },
    at(0, 0),
    at(3, 0),
    0.016,
  );
  expect(a.time).toBe(0);
});

test("frameIndex advances with time and wraps around", () => {
  expect(frameIndex(0, 10, 6)).toBe(0);
  expect(frameIndex(0.25, 10, 6)).toBe(2);
  expect(frameIndex(0.65, 10, 6)).toBe(0); // 6 frames done, back to the start
});

test("a swing starts from its first frame, facing the given way", () => {
  const running = { action: "run", facing: 1, time: 0.7 };
  expect(startAttack(running, -1)).toEqual({
    action: "attack",
    facing: -1,
    time: 0,
  });
  expect(startAttack(running)).toEqual({
    action: "attack",
    facing: 1,
    time: 0,
  });
});

test("a swing plays to its end, even while moving, then the character runs or idles", () => {
  let anim = startAttack(createAnim(), -1);
  const moved = { x: 10, y: 0 }; // moving right

  anim = advanceAnim(anim, { x: 0, y: 0 }, moved, 0.3);
  expect(anim).toEqual({ action: "attack", facing: -1, time: 0.3 }); // still swinging, still facing left

  anim = advanceAnim(anim, { x: 0, y: 0 }, moved, 0.1); // 0.4 s: the swing is over
  expect(anim).toMatchObject({ action: "run", facing: 1, time: 0 });
});
