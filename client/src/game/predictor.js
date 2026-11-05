import { PLAYER_SIZE } from "../../../shared/game.js";
import {
  reconcile as replayPending,
  stepInput,
} from "../../../shared/prediction.js";

const MAX_PENDING = 100; // five seconds of inputs; more means the server stopped answering

// Predicts my own character. It knows nothing about sockets or the DOM.
export function createPredictor({
  level,
  tickRate,
  snapDistance = 96,
  smoothingSeconds = 0.1,
}) {
  let state = null; // where I think I am after the latest fixed step
  let prev = null; // where I was one step earlier, for drawing between the two
  let pending = []; // inputs sent but not yet acknowledged: { seq, input }
  let correction = { x: 0, y: 0 }; // a visual offset that fades out

  return {
    get ready() {
      return state !== null;
    },
    state: () => state,
    pendingCount: () => pending.length,

    // How far I moved in the last step, for choosing the animation.
    lastMove: () =>
      state && prev
        ? { x: state.x - prev.x, y: state.y - prev.y }
        : { x: 0, y: 0 },

    // One fixed step. `seq` is given when the input was sent to the server,
    // so it can be replayed if the server has not seen it yet.
    step(input, seq) {
      if (!state) return;
      prev = state;
      state = stepInput(state, input, level, tickRate);
      if (seq !== undefined) {
        pending.push({ seq, input });
        if (pending.length > MAX_PENDING) pending.shift();
      }
    },

    // A snapshot arrived: the server's version of me. Returns how far my
    // prediction was off, in pixels.
    reconcile(server) {
      const base = {
        name: server.name,
        hp: server.hp,
        maxHp: server.maxHp,
        x: server.x,
        y: server.y,
        size: PLAYER_SIZE,
      };
      if (!state) {
        state = base;
        prev = base;
        pending = [];
        return 0;
      }

      const result = replayPending(base, pending, server.ack, level, tickRate);
      const jump = { x: state.x - result.state.x, y: state.y - result.state.y };
      const error = Math.hypot(jump.x, jump.y);
      pending = result.pending;

      if (error > snapDistance) {
        correction = { x: 0, y: 0 }; // too far to smooth over: show the truth
        prev = result.state;
      } else {
        // Keep what is on screen where it is, and let the offset fade out.
        correction = { x: correction.x + jump.x, y: correction.y + jump.y };
        prev = { ...prev, x: prev.x - jump.x, y: prev.y - jump.y };
      }
      state = result.state;
      return error;
    },

    // Where to draw me: between the previous and the current step (alpha 0..1),
    // plus whatever is left of the correction.
    position(alpha) {
      if (!state) return null;
      return {
        x: prev.x + (state.x - prev.x) * alpha + correction.x,
        y: prev.y + (state.y - prev.y) * alpha + correction.y,
      };
    },

    // Fade the correction out over time.
    decay(dt) {
      const k = Math.exp(-dt / smoothingSeconds);
      correction = { x: correction.x * k, y: correction.y * k };
      if (Math.hypot(correction.x, correction.y) < 0.05)
        correction = { x: 0, y: 0 };
    },
  };
}
