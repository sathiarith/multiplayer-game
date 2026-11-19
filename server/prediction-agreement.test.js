import { test, expect } from "vitest";
import { buildLevel } from "../shared/map.js";
import { createWorld, TICK_RATE } from "./world.js";
import { createPredictor } from "../client/src/game/predictor.js";

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
const character = { id: 1, name: "Aria", hp: 100, x: 100, y: 100 };
const keys = (...held) => ({
  up: held.includes("up"),
  down: held.includes("down"),
  left: held.includes("left"),
  right: held.includes("right"),
});
const repeat = (n, input) => Array(n).fill(input);
const plan = [
  ...repeat(6, keys("right")),
  ...repeat(6, keys("up", "right")),
  ...repeat(4, keys()),
  ...repeat(4, keys("left")),
  ...repeat(4, keys()),
];

// The client acts at once. The server hears each input in the same tick and
// steps. Each snapshot takes two more ticks to get back to the client.
function simulate({ dropSeqs = [] } = {}) {
  const world = createWorld(level);
  world.add(character);
  const predictor = createPredictor({ level, tickRate: TICK_RATE });
  predictor.reconcile(world.snapshot().players[0]);

  const snapshots = [];
  const errors = [];
  plan.forEach((input, i) => {
    const seq = i + 1;
    predictor.step(input, seq);
    if (!dropSeqs.includes(seq))
      world.setInput(character.id, { seq, ...input });
    world.step();
    snapshots.push(world.snapshot().players[0]);

    const arriving = snapshots[i - 2];
    if (arriving) errors.push(predictor.reconcile(arriving));
  });
  return { errors };
}

test("with a perfect network the client's prediction matches the server", async () => {
  const { errors } = simulate();
  expect(errors).toHaveLength(plan.length - 2);
  // The server rounds positions to two decimals, and each comparison involves
  // two such roundings, so the largest possible difference is about 0.014 px.
  for (const error of errors) expect(error).toBeLessThan(0.02);
});

test("a lost input causes two corrections of one step each, then the prediction agrees again", async () => {
  // Input 7 is the first "up and right". The server never hears it, so for
  // that tick it repeats input 6 ("right"). The client replays input 7 on top
  // of that, which is wrong by one step. When input 8 arrives, the server's
  // acknowledgement jumps from 6 to 8 and the client removes the replayed step
  // again. Each correction is one step: 200 px/s * 0.05 s = 10 px.
  const { errors } = simulate({ dropSeqs: [7] });

  const big = errors.filter((e) => e > 1);
  expect(big).toHaveLength(2);
  for (const error of big) expect(error).toBeCloseTo(10, 1);
  for (const error of errors.slice(-6)) expect(error).toBeLessThan(0.02);
});
