import { tileOf, hpPercent } from "../../../shared/game.js";

// Everything the HUD shows, as plain data.
export function hudSnapshot(player, level) {
  const { col, row } = tileOf(player, level);
  return {
    name: player.name,
    hp: player.hp,
    maxHp: player.maxHp,
    hpPercent: hpPercent(player.hp, player.maxHp),
    col,
    row,
  };
}

export function sameHud(a, b) {
  return (
    a.name === b.name &&
    a.hp === b.hp &&
    a.maxHp === b.maxHp &&
    a.col === b.col &&
    a.row === b.row
  );
}
