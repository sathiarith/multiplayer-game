import { getDirection, moveWithCollision } from "./movement.js";
import { clamp } from "./clamp.js";

export const PLAYER_MAX_HP = 100;
export const PLAYER_SPEED = 200; // pixels per second
export const PLAYER_SIZE = 24;

// A new player standing at the center of the spawn tile.
export function createPlayer(level) {
  return {
    name: "Hero",
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    x: (level.spawn.col + 0.5) * level.tileSize,
    y: (level.spawn.row + 0.5) * level.tileSize,
    size: PLAYER_SIZE,
  };
}

// One tick of game logic: held keys + elapsed time in, new player out.
export function updatePlayer(player, keys, dt, level) {
  return moveWithCollision(
    player,
    getDirection(keys),
    PLAYER_SPEED,
    dt,
    level.tiles,
    level.tileSize,
  );
}

// Which tile the player's center is standing on.
export function tileOf(player, level) {
  return {
    col: Math.floor(player.x / level.tileSize),
    row: Math.floor(player.y / level.tileSize),
  };
}

// HP as a whole percentage from 0 to 100, safe for bad input.
export function hpPercent(hp, maxHp) {
  if (maxHp <= 0) return 0;
  return Math.round(clamp(hp / maxHp, 0, 1) * 100);
}
