import { buildLevel } from "../shared/map.js";
import { createPlayer, updatePlayer } from "../shared/game.js";
import { createHud } from "./hud.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const keys = new Set();

window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code.startsWith("Arrow")) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());

async function loadLevel(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load map: HTTP ${res.status}`);
  return buildLevel(await res.json());
}

// Rendering: these functions read state and draw. They never change it.
function drawMap(level) {
  const { tiles, tileSize } = level;
  for (let row = 0; row < tiles.length; row++) {
    for (let col = 0; col < tiles[row].length; col++) {
      ctx.fillStyle = tiles[row][col] === 1 ? "#475569" : "#1e293b";
      ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);
    }
  }
}

function drawPlayer(player) {
  ctx.fillStyle = "#4ade80";
  ctx.fillRect(
    player.x - player.size / 2,
    player.y - player.size / 2,
    player.size,
    player.size,
  );
}

function render(level, player) {
  drawMap(level);
  drawPlayer(player);
}

async function main() {
  const level = await loadLevel("./maps/level1.json");
  canvas.width = level.tiles[0].length * level.tileSize;
  canvas.height = level.tiles.length * level.tileSize;

  let player = createPlayer(level);
  const hud = createHud();
  let last = performance.now();

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    player = updatePlayer(player, keys, dt, level); // logic: shared/
    render(level, player); // drawing: client only
    hud.update(player, level);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => console.error(err));
