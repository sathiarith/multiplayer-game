import { test, expect } from "vitest";
import {
  createSnapshotBuffer,
  INTERPOLATION_DELAY_MS,
} from "./interpolation.js";

const p = (id, x, extra = {}) => ({
  id,
  name: `P${id}`,
  x,
  y: 100,
  hp: 100,
  maxHp: 100,
  ack: 0,
  ...extra,
});
const find = (players, id) => players.find((q) => q.id === id);

test("remote players are drawn two ticks in the past", () => {
  expect(INTERPOLATION_DELAY_MS).toBe(100);
});

test("an empty buffer has nobody in it", () => {
  expect(createSnapshotBuffer().sample(0)).toEqual([]);
});

test("with one snapshot everyone is where it says", () => {
  const buffer = createSnapshotBuffer();
  buffer.push(0, [p(1, 100), p(2, 300)]);
  const players = buffer.sample(500);
  expect(players.map((q) => q.x).sort((a, b) => a - b)).toEqual([100, 300]);
  expect(find(players, 1).move).toEqual({ x: 0, y: 0 });
});

test("between two snapshots positions are blended by how far along we are", () => {
  const buffer = createSnapshotBuffer();
  buffer.push(0, [p(1, 100)]);
  buffer.push(50, [p(1, 110)]);

  expect(find(buffer.sample(25), 1).x).toBeCloseTo(105);
  expect(find(buffer.sample(10), 1).x).toBeCloseTo(102);
  expect(find(buffer.sample(25), 1).move).toEqual({ x: 10, y: 0 });
});

test("with several snapshots the right pair is used", () => {
  const buffer = createSnapshotBuffer();
  buffer.push(0, [p(1, 100)]);
  buffer.push(50, [p(1, 110)]);
  buffer.push(100, [p(1, 130)]);
  expect(find(buffer.sample(75), 1).x).toBeCloseTo(120);
});

test("exactly on a snapshot's time, that snapshot is used", () => {
  const buffer = createSnapshotBuffer();
  buffer.push(0, [p(1, 100)]);
  buffer.push(50, [p(1, 110)]);
  expect(find(buffer.sample(0), 1).x).toBe(100);
  expect(find(buffer.sample(50), 1).x).toBe(110);
});

test("before the first snapshot the first one is used", () => {
  const buffer = createSnapshotBuffer();
  buffer.push(100, [p(1, 100)]);
  buffer.push(150, [p(1, 110)]);
  expect(find(buffer.sample(-500), 1).x).toBe(100);
});

test("after the last snapshot the last position is held and the last movement remembered", () => {
  const buffer = createSnapshotBuffer();
  buffer.push(0, [p(1, 100)]);
  buffer.push(50, [p(1, 110)]);
  const held = find(buffer.sample(500), 1);
  expect(held.x).toBe(110);
  expect(held.move).toEqual({ x: 10, y: 0 });
});

test("someone who is new appears in place, without sliding in", () => {
  const buffer = createSnapshotBuffer();
  buffer.push(0, [p(1, 100)]);
  buffer.push(50, [p(1, 110), p(2, 300)]);
  const newcomer = find(buffer.sample(25), 2);
  expect(newcomer.x).toBe(300);
  expect(newcomer.move).toEqual({ x: 0, y: 0 });
});

test("someone missing from the later snapshot is gone", () => {
  const buffer = createSnapshotBuffer();
  buffer.push(0, [p(1, 100), p(2, 300)]);
  buffer.push(50, [p(1, 110)]);
  expect(buffer.sample(25).map((q) => q.id)).toEqual([1]);
});

test("other details come from the later snapshot", () => {
  const buffer = createSnapshotBuffer();
  buffer.push(0, [p(1, 100)]);
  buffer.push(50, [p(1, 110, { hp: 80 })]);
  expect(find(buffer.sample(25), 1).hp).toBe(80);
});

test("it keeps a limited history", () => {
  const buffer = createSnapshotBuffer();
  for (let i = 0; i < 40; i++) buffer.push(i * 50, [p(1, i)]);
  expect(buffer.size).toBe(30);
});
