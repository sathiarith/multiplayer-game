import { getDirection, moveWithCollision } from "./movement.js";

export const PLAYER_SPEED = 200; // pixels per second
export const PLAYER_SIZE = 24;

// A new player standing at the center of the spawn tile.
export function createPlayer(level) {
  return {
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
