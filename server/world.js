import { createStartingPlayer } from "../shared/startingPlayer.js";
import { TICK_RATE, stepInput } from "../shared/prediction.js";

export { TICK_RATE }; // realtime.js and the tests import it from here
export const STALE_AFTER_TICKS = TICK_RATE; // no input for one second releases every key

const NO_INPUT = { up: false, down: false, left: false, right: false };

const INPUT_FIELDS = ["seq", "up", "down", "left", "right"];

// A valid input is exactly { seq, up, down, left, right }. Anything else is null.
export function parseInput(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    return null;
  const keys = Object.keys(raw);
  if (
    keys.length !== INPUT_FIELDS.length ||
    !INPUT_FIELDS.every((k) => keys.includes(k))
  ) {
    return null;
  }
  const { seq, up, down, left, right } = raw;
  if (!Number.isInteger(seq) || seq < 1 || seq > 2_147_483_647) return null;
  if (![up, down, left, right].every((v) => typeof v === "boolean"))
    return null;
  return { seq, up, down, left, right };
}

const round2 = (n) => Math.round(n * 100) / 100;

export function createWorld(level) {
  const players = new Map(); // character id -> { id, state, input, ack, inputTick }
  let tick = 0;

  return {
    // Adds a player, or re-attaches one already in the world: the position is
    // kept, but the input sequence starts again.
    add(character) {
      const existing = players.get(character.id);
      players.set(character.id, {
        id: character.id,
        state: existing
          ? existing.state
          : createStartingPlayer(character, level),
        input: NO_INPUT,
        ack: 0,
        inputTick: tick,
      });
    },

    remove(id) {
      players.delete(id);
    },

    has: (id) => players.has(id),

    get size() {
      return players.size;
    },

    // Records the newest input. Returns false when it is ignored: unknown
    // player, malformed, or not newer than the last one applied.
    setInput(id, raw) {
      const player = players.get(id);
      const input = parseInput(raw);
      if (!player || !input || input.seq <= player.ack) return false;
      player.input = {
        up: input.up,
        down: input.down,
        left: input.left,
        right: input.right,
      };
      player.ack = input.seq;
      player.inputTick = tick;
      return true;
    },

    // One fixed step of the simulation for every player.
    step() {
      tick += 1;
      for (const player of players.values()) {
        const stale = tick - player.inputTick > STALE_AFTER_TICKS;
        const held = stale ? NO_INPUT : player.input;
        player.state = stepInput(player.state, held, level, TICK_RATE);
      }
    },

    // Everything a client needs to draw the world, kept small.
    snapshot() {
      return {
        tick,
        players: [...players.values()].map((p) => ({
          id: p.id,
          name: p.state.name,
          x: round2(p.state.x),
          y: round2(p.state.y),
          hp: p.state.hp,
          maxHp: p.state.maxHp,
          ack: p.ack,
        })),
      };
    },
  };
}
