import { test, expect } from "vitest";
import { createGuard } from "./abuse.js";

function make(options = {}) {
  let time = 0;
  const guard = createGuard({
    ratePerSecond: 10,
    burst: 3,
    maxViolations: 3,
    violationWindowMs: 1000,
    now: () => time,
    ...options,
  });
  return { guard, advance: (ms) => (time += ms) };
}

const hits = (guard, n) => Array.from({ length: n }, () => guard.hit());

test("a burst up to the limit is allowed, and then messages are dropped", () => {
  const { guard } = make();
  expect(hits(guard, 4)).toEqual(["ok", "ok", "ok", "drop"]);
});

test("tokens come back over time", () => {
  const { guard, advance } = make();
  hits(guard, 3);
  advance(100); // 10 tokens a second: one token after 100 ms
  expect(hits(guard, 2)).toEqual(["ok", "drop"]);
});

test("the bucket never holds more than the burst", () => {
  const { guard, advance } = make();
  advance(60_000);
  expect(hits(guard, 4)).toEqual(["ok", "ok", "ok", "drop"]);
});

test("enough rejected messages in a short time mean a kick", () => {
  const { guard } = make();
  hits(guard, 3); // empties the bucket
  expect(hits(guard, 3)).toEqual(["drop", "drop", "kick"]);
});

test("a strike counts as a violation without using any tokens", () => {
  const { guard } = make();
  expect([guard.strike(), guard.strike(), guard.strike()]).toEqual([
    "drop",
    "drop",
    "kick",
  ]);
  expect(hits(guard, 3)).toEqual(["ok", "ok", "ok"]); // the bucket is still full
});

test("rate violations and strikes are counted together", () => {
  const { guard } = make();
  hits(guard, 3);
  expect(guard.hit()).toBe("drop"); // violation 1
  expect(guard.strike()).toBe("drop"); // violation 2
  expect(guard.hit()).toBe("kick"); // violation 3
});

test("violations expire after the window", () => {
  const { guard, advance } = make();
  guard.strike();
  guard.strike();
  advance(1001);
  expect(guard.strike()).toBe("drop"); // the count started again
});

test("once the limit is reached further violations still say kick", () => {
  const { guard } = make();
  guard.strike();
  guard.strike();
  expect(guard.strike()).toBe("kick");
  expect(guard.strike()).toBe("kick");
});
