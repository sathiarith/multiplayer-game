import { createPlayer } from "./game.js";
import { canMoveTo } from "./map.js";

// Builds the player from a saved character. If the saved position is missing
// or not walkable (the map may have changed), start at the spawn point.
export function createStartingPlayer(character, level) {
  const base = createPlayer(level);
  const { x, y } = character;
  const valid =
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    canMoveTo(level.tiles, level.tileSize, x, y, base.size);

  return {
    ...base,
    name: character.name,
    hp: character.hp,
    x: valid ? x : base.x,
    y: valid ? y : base.y,
  };
}
