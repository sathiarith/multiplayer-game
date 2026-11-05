import { test, expect } from "vitest";
import { buildLevel } from "../../../shared/map.js";
import { createPredictor } from "./predictor.js";

const hall = buildLevel({
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
const none = { up: false, down: false, left: false, right: false };
const right = { ...none, right: true };
const serverAt = (x, ack = 0) => ({
  name: "Aria",
  hp: 100,
  maxHp: 100,
  x,
  y: 100,
  ack,
});

function setup() {
  const predictor = createPredictor({ level: hall, tickRate: 20 });
  predictor.reconcile(serverAt(100));
  return predictor;
}

test("it is not ready, and ignores steps, until the server says where the player is", () => {
  const predictor = createPredictor({ level: hall, tickRate: 20 });
  expect(predictor.ready).toBe(false);
  predictor.step(right, 1);
  expect(predictor.state()).toBeNull();
  expect(predictor.position(0.5)).toBeNull();

  predictor.reconcile(serverAt(100));
  expect(predictor.ready).toBe(true);
  expect(predictor.state()).toMatchObject({
    name: "Aria",
    x: 100,
    y: 100,
    hp: 100,
  });
  expect(predictor.pendingCount()).toBe(0);
});

test("a step moves at the shared speed and remembers the input until it is acknowledged", () => {
  const predictor = setup();
  predictor.step(right, 1);
  predictor.step(right, 2);
  expect(predictor.state().x).toBeCloseTo(120);
  expect(predictor.pendingCount()).toBe(2);

  predictor.step(none); // idle and unchanged: nothing was sent, so nothing to replay
  expect(predictor.pendingCount()).toBe(2);
});

test("the drawn position runs between the previous step and the current one", () => {
  const predictor = setup();
  predictor.step(right, 1);
  expect(predictor.position(0).x).toBeCloseTo(100);
  expect(predictor.position(0.5).x).toBeCloseTo(105);
  expect(predictor.position(1).x).toBeCloseTo(110);
});

test("a server that agrees changes nothing and drops the acknowledged inputs", () => {
  const predictor = setup();
  predictor.step(right, 1);
  predictor.step(right, 2);

  const error = predictor.reconcile(serverAt(110, 1)); // it has seen input 1 only

  expect(error).toBeCloseTo(0);
  expect(predictor.state().x).toBeCloseTo(120);
  expect(predictor.pendingCount()).toBe(1);
  expect(predictor.position(1).x).toBeCloseTo(120);
});

test("when the server disagrees the state follows it, but the drawn position does not jump", () => {
  const predictor = setup();
  for (let seq = 1; seq <= 3; seq++) predictor.step(right, seq);
  const before = predictor.position(1).x; // 130

  const error = predictor.reconcile(serverAt(100, 3)); // it never moved me

  expect(error).toBeCloseTo(30);
  expect(predictor.state().x).toBeCloseTo(100);
  expect(predictor.position(1).x).toBeCloseTo(before);
});

test("the correction fades, so the drawn position settles on the server's", () => {
  const predictor = setup();
  for (let seq = 1; seq <= 3; seq++) predictor.step(right, seq);
  predictor.reconcile(serverAt(100, 3));

  predictor.decay(0.1);
  const partway = predictor.position(1).x;
  expect(partway).toBeGreaterThan(100);
  expect(partway).toBeLessThan(130);

  predictor.decay(2);
  expect(predictor.position(1).x).toBeCloseTo(100, 1);
});

test("a very large disagreement snaps at once", () => {
  const predictor = setup();
  for (let seq = 1; seq <= 20; seq++) predictor.step(right, seq); // x = 300

  const error = predictor.reconcile(serverAt(100, 20));

  expect(error).toBeCloseTo(200);
  expect(predictor.position(0).x).toBeCloseTo(100);
  expect(predictor.position(1).x).toBeCloseTo(100);
});

test("only the newest inputs are remembered", () => {
  const predictor = setup();
  for (let seq = 1; seq <= 150; seq++) predictor.step(right, seq);
  expect(predictor.pendingCount()).toBe(100);
});

test("the last step's movement is available for the animation", () => {
  const predictor = setup();
  predictor.step(right, 1);
  expect(predictor.lastMove()).toEqual({ x: expect.closeTo(10), y: 0 });
  predictor.step(none);
  expect(predictor.lastMove()).toEqual({ x: 0, y: 0 });
});
