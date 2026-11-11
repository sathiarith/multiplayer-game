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

export function createWorld(
  level,
  { spawns = [], respawnTicks = 30 * TICK_RATE } = {},
) {
  const players = new Map(); // character id -> { id, state, input, ack, inputTick, score, walked }
  let tick = 0;
  // Items lying on the map. A taken item comes back after `respawnTicks`.
  const ground = spawns.map((spawn, i) => ({
    id: i + 1,
    item: spawn.item,
    x: (spawn.col + 0.5) * level.tileSize,
    y: (spawn.row + 0.5) * level.tileSize,
    takenAt: null, // the tick it was picked up, or null while it lies there
  }));
  const available = () => ground.filter((spot) => spot.takenAt === null);
  return {
    // Adds a player, or re-attaches one already in the world: the position and
    // score are kept, but the input sequence starts again.
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
        score: existing ? existing.score : (character.score ?? 0),
        walked: existing ? existing.walked : 0, // pixels walked towards the next point
      });
    },

    remove(id) {
      players.delete(id);
    },

    has: (id) => players.has(id),

    ids: () => [...players.keys()],

    // May this character pick up this item now? { ok: true, item } or { ok: false, reason }.
    checkPickup(characterId, groundId, range) {
      const player = players.get(characterId);
      const spot = ground.find((s) => s.id === groundId);
      if (!player || !spot || spot.takenAt !== null)
        return { ok: false, reason: "gone" };
      const distance = Math.hypot(
        player.state.x - spot.x,
        player.state.y - spot.y,
      );
      if (distance > range) return { ok: false, reason: "too_far" };
      return { ok: true, item: spot.item };
    },

    take(groundId) {
      const spot = ground.find((s) => s.id === groundId);
      if (spot) spot.takenAt = tick;
    },

    // The parts of a player that are saved. Exact, unlike the rounded snapshot.
    get(id) {
      const player = players.get(id);
      return player
        ? {
            x: player.state.x,
            y: player.state.y,
            hp: player.state.hp,
            score: player.score,
          }
        : undefined;
    },

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
      for (const spot of ground) {
        if (spot.takenAt !== null && tick - spot.takenAt >= respawnTicks)
          spot.takenAt = null;
      }
      for (const player of players.values()) {
        const stale = tick - player.inputTick > STALE_AFTER_TICKS;
        const held = stale ? NO_INPUT : player.input;
        const before = player.state;
        player.state = stepInput(before, held, level, TICK_RATE);

        // Score: one point for every tile walked, measured here on the server.
        // Walking into a wall moves nothing, so it earns nothing. The small
        // allowance absorbs floating-point error.
        player.walked += Math.hypot(
          player.state.x - before.x,
          player.state.y - before.y,
        );
        while (player.walked >= level.tileSize - 1e-6) {
          player.walked -= level.tileSize;
          player.score += 1;
        }
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
        items: available().map(({ id, item, x, y }) => ({ id, item, x, y })),
      };
    },
  };
}
