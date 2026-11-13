import { createStartingPlayer } from "../shared/startingPlayer.js";
import { TICK_RATE, stepInput } from "../shared/prediction.js";
import { ATTACK_COOLDOWN_MS, ATTACK_RANGE } from "../shared/combat.js";
import {
  applyDamage,
  canAct,
  gainXp,
  isDead,
  maxHpFor,
  nearestWithin,
  playerDamage,
  respawn,
} from "./rules/combat.js";

export { TICK_RATE }; // realtime.js and the tests import it from here
export const STALE_AFTER_TICKS = TICK_RATE; // no input for one second releases every key

const MS_PER_TICK = 1000 / TICK_RATE;
const STRIKE_SHOWN_TICKS = Math.round(400 / MS_PER_TICK); // how long a strike shows as "attacking"
const ONE_LEVEL = [{ level: 1, xpRequired: 0, maxHp: 100 }]; // for worlds made without the XP table
const NO_MONSTERS = { types: {}, spawns: [] };
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
  {
    spawns = [],
    respawnTicks = 30 * TICK_RATE,
    monsters = NO_MONSTERS,
    levels = ONE_LEVEL,
  } = {},
) {
  // character id -> { id, state, input, ack, inputTick, score, level, xp, lastAttackAt }
  const players = new Map();
  let tick = 0;
  // World time in milliseconds. It comes from the tick count, so it is the same on
  // every machine, and runs faster in tests that tick faster.
  const now = () => tick * MS_PER_TICK;
  const tileCenter = (col, row) => ({
    x: (col + 0.5) * level.tileSize,
    y: (row + 0.5) * level.tileSize,
  });
  const spawnPoint = tileCenter(level.spawn.col, level.spawn.row);

  // Items lying on the map. A taken item comes back after `respawnTicks`.
  const ground = spawns.map((spawn, i) => ({
    id: i + 1,
    item: spawn.item,
    ...tileCenter(spawn.col, spawn.row),
    takenAt: null, // the tick it was picked up, or null while it lies there
  }));
  const available = () => ground.filter((spot) => spot.takenAt === null);

  // Monsters stand at their spot and strike the nearest player within reach.
  const foes = monsters.spawns.map((spawn, i) => {
    const stats = monsters.types[spawn.type];
    return {
      id: i + 1,
      type: spawn.type,
      stats,
      ...tileCenter(spawn.col, spawn.row),
      hp: stats.maxHp,
      deadAt: null, // the tick it died, or null while alive
      lastAttackAt: null, // world time of its last strike
      lastStrikeTick: -Infinity,
      facing: -1, // -1 left, 1 right
    };
  });
  const alive = () => foes.filter((foe) => foe.deadAt === null);

  return {
    // Adds a player, or re-attaches one already in the world: position, health
    // and progress are kept, but the input sequence starts again.
    add(character) {
      const existing = players.get(character.id);
      if (existing) {
        players.set(character.id, {
          ...existing,
          input: NO_INPUT,
          ack: 0,
          inputTick: tick,
        });
        return;
      }
      const playerLevel = character.level ?? 1;
      const maxHp = maxHpFor(playerLevel, levels);
      const start = createStartingPlayer(character, level);
      players.set(character.id, {
        id: character.id,
        state: {
          ...start,
          maxHp,
          hp: Math.min(Math.max(character.hp ?? maxHp, 1), maxHp),
        },
        input: NO_INPUT,
        ack: 0,
        inputTick: tick,
        score: character.score ?? 0,
        level: playerLevel,
        xp: character.xp ?? 0,
        lastAttackAt: null,
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

    // A player's attack on the nearest monster within reach. The server picks the
    // target and enforces the cooldown; a miss does not use the cooldown up.
    attack(characterId) {
      const player = players.get(characterId);
      if (!player) return { ok: false, reason: "no_target" };
      if (!canAct(player.lastAttackAt, ATTACK_COOLDOWN_MS, now())) {
        return { ok: false, reason: "cooldown" };
      }
      const target = nearestWithin(player.state, alive(), ATTACK_RANGE);
      if (!target) return { ok: false, reason: "no_target" };

      player.lastAttackAt = now();
      target.hp = applyDamage(target.hp, playerDamage(player.level));
      if (!isDead(target.hp))
        return { ok: true, monster: target.id, killed: false };

      target.deadAt = tick;
      const gained = gainXp(
        { xp: player.xp, level: player.level, hp: player.state.hp },
        target.stats.xp,
        levels,
      );
      player.xp = gained.xp;
      player.level = gained.level;
      player.score += target.stats.xp; // the score is the XP earned in combat
      player.state = { ...player.state, hp: gained.hp, maxHp: gained.maxHp };
      return {
        ok: true,
        monster: target.id,
        killed: true,
        xp: player.xp,
        level: player.level,
        leveledUp: gained.leveledUp,
      };
    },

    // The parts of a player that are saved. Exact, unlike the rounded snapshot.
    get(id) {
      const p = players.get(id);
      return p
        ? {
            x: p.state.x,
            y: p.state.y,
            hp: p.state.hp,
            score: p.score,
            level: p.level,
            xp: p.xp,
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

    // One fixed step of the simulation. Returns what happened that the
    // players should hear about: [{ type: "died", id, by }].
    step() {
      tick += 1;
      const events = [];

      for (const spot of ground) {
        if (spot.takenAt !== null && tick - spot.takenAt >= respawnTicks)
          spot.takenAt = null;
      }
      for (const foe of foes) {
        if (
          foe.deadAt !== null &&
          tick - foe.deadAt >= foe.stats.respawnSeconds * TICK_RATE
        ) {
          foe.deadAt = null;
          foe.hp = foe.stats.maxHp;
          foe.lastAttackAt = null;
        }
      }

      for (const player of players.values()) {
        const stale = tick - player.inputTick > STALE_AFTER_TICKS;
        const held = stale ? NO_INPUT : player.input;
        player.state = stepInput(player.state, held, level, TICK_RATE);
      }

      // Monsters strike the nearest player within reach, each on its own cooldown.
      for (const foe of alive()) {
        if (!canAct(foe.lastAttackAt, foe.stats.cooldownMs, now())) continue;
        const targets = [...players.values()].map((p) => ({
          id: p.id,
          x: p.state.x,
          y: p.state.y,
        }));
        const near = nearestWithin(foe, targets, foe.stats.attackRange);
        if (!near) continue;

        const victim = players.get(near.id);
        foe.lastAttackAt = now();
        foe.lastStrikeTick = tick;
        foe.facing = victim.state.x < foe.x ? -1 : 1;
        const hp = applyDamage(victim.state.hp, foe.stats.damage);
        if (isDead(hp)) {
          // Death: full health at the spawn point. Level, XP, score and items are kept.
          const back = respawn(
            { ...victim.state, level: victim.level },
            spawnPoint,
            levels,
          );
          victim.state = { ...victim.state, x: back.x, y: back.y, hp: back.hp };
          victim.input = NO_INPUT;
          events.push({ type: "died", id: victim.id, by: foe.stats.name });
        } else {
          victim.state = { ...victim.state, hp };
        }
      }
      return events;
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
          level: p.level,
          ack: p.ack,
        })),
        items: available().map(({ id, item, x, y }) => ({ id, item, x, y })),
        monsters: alive().map((m) => ({
          id: m.id,
          type: m.type,
          x: m.x,
          y: m.y,
          hp: m.hp,
          maxHp: m.stats.maxHp,
          facing: m.facing,
          attacking: tick - m.lastStrikeTick < STRIKE_SHOWN_TICKS,
        })),
      };
    },
  };
}
