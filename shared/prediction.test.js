import { test, expect } from "vitest";
import { buildLevel } from "./map.js";
import { createPlayer } from "./game.js";
import {
  TICK_RATE,
  keysFromInput,
  stepInput,
  reconcile,
} from "./prediction.js";

const level = buildLevel({
  tileSize: 40,
  spawn: { col: 1, row: 1 },
  rows: [
    "#".repeat(20),
    `#${".".repeat(18)}#`,
    `#${".".repeat(18)}#`,
    `#${".".repeat(18)}#`,
    "#".repeat(20),
  ],
});
const start = { ...createPlayer(level), x: 100, y: 100 };
const none = { up: false, down: false, left: false, right: false };
const right = { ...none, right: true };

test("both sides step 20 times a second", () => {
  expect(TICK_RATE).toBe(20);
});

test("booleans become key codes", () => {
  expect(keysFromInput(none).size).toBe(0);
  expect(keysFromInput(right)).toEqual(new Set(["ArrowRight"]));
  expect(keysFromInput({ ...none, up: true, left: true })).toEqual(
    new Set(["ArrowUp", "ArrowLeft"]),
  );
});

test("a step moves at the shared speed and does not change its input", () => {
  const frozen = Object.freeze({ ...start });
  const next = stepInput(frozen, right, level, TICK_RATE);
  expect(next.x).toBeCloseTo(110); // 200 px/s over 1/20 s
  expect(next.y).toBe(100);
  expect(frozen.x).toBe(100);
});

test("walls stop a step", () => {
  let state = start;
  for (let i = 0; i < 100; i++)
    state = stepInput(state, right, level, TICK_RATE);
  expect(state.x).toBeLessThanOrEqual(748); // the right wall starts at 760
});

test("with nothing pending, reconciling returns the server's state", () => {
  const server = { ...start, x: 123 };
  const result = reconcile(server, [], 0, level, TICK_RATE);
  expect(result.state.x).toBe(123);
  expect(result.pending).toEqual([]);
});

test("reconciling drops acknowledged inputs and replays the rest", () => {
  const pending = [1, 2, 3, 4].map((seq) => ({ seq, input: right }));
  const result = reconcile(start, pending, 2, level, TICK_RATE);
  expect(result.pending.map((p) => p.seq)).toEqual([3, 4]);
  expect(result.state.x).toBeCloseTo(120); // two replayed steps of 10 px
});

test("when everything is acknowledged the server's state stands", () => {
  const pending = [1, 2].map((seq) => ({ seq, input: right }));
  const result = reconcile(start, pending, 2, level, TICK_RATE);
  expect(result.pending).toEqual([]);
  expect(result.state.x).toBe(100);
});
