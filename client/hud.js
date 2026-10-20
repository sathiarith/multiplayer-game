import { tileOf, hpPercent } from "../shared/game.js";

export function createHud() {
  const name = document.getElementById("hud-name");
  const fill = document.getElementById("hud-fill");
  const hp = document.getElementById("hud-hp");
  const pos = document.getElementById("hud-pos");

  const last = {}; // what is currently on screen

  // Run `apply` only if the value differs from what is already shown.
  function set(key, value, apply) {
    if (last[key] === value) return;
    last[key] = value;
    apply(value);
  }

  return {
    update(player, level) {
      const { col, row } = tileOf(player, level);
      set("name", player.name, (v) => (name.textContent = v));
      set("hp", `${player.hp} / ${player.maxHp}`, (v) => (hp.textContent = v));
      set(
        "fill",
        hpPercent(player.hp, player.maxHp),
        (v) => (fill.style.width = `${v}%`),
      );
      set("pos", `Tile ${col}, ${row}`, (v) => (pos.textContent = v));
    },
  };
}