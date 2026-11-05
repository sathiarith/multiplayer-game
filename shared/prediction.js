import { updatePlayer } from "./game.js";

export const TICK_RATE = 20; // simulation steps per second, on the server and the client

const KEY_CODES = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
};

// The four booleans a client sends, as the key codes the movement code understands.
export function keysFromInput(input) {
  return new Set(
    Object.entries(KEY_CODES)
      .filter(([name]) => input[name])
      .map(([, code]) => code),
  );
}

// One fixed step of movement. The server and the client both call this, so
// they cannot disagree about how a step works.
export function stepInput(state, input, level, tickRate = TICK_RATE) {
  return updatePlayer(state, keysFromInput(input), 1 / tickRate, level);
}

// Starts from the state the server reported, then replays every input the
// server has not seen yet (seq > ack).
export function reconcile(
  serverState,
  pending,
  ack,
  level,
  tickRate = TICK_RATE,
) {
  const unacked = pending.filter((p) => p.seq > ack);
  let state = serverState;
  for (const { input } of unacked)
    state = stepInput(state, input, level, tickRate);
  return { state, pending: unacked };
}
