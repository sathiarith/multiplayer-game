import { getDirection, moveWithCollision } from "../shared/movement.js";
import { parseMap } from "../shared/map.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const SPEED = 200; // pixels per second
const keys = new Set();

window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code.startsWith("Arrow")) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());

async function loadMap(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load map: HTTP ${res.status}`);
  const data = await res.json();
  return {
    tileSize: data.tileSize,
    tiles: parseMap(data.rows),
    spawn: data.spawn,
  };
}

function drawMap(map) {
  const { tiles, tileSize } = map;
  for (let row = 0; row < tiles.length; row++) {
    for (let col = 0; col < tiles[row].length; col++) {
      ctx.fillStyle = tiles[row][col] === 1 ? "#475569" : "#1e293b";
      ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);
    }
  }
}

async function main() {
  const map = await loadMap("./maps/level1.json");
  canvas.width = map.tiles[0].length * map.tileSize;
  canvas.height = map.tiles.length * map.tileSize;

  let player = {
    x: (map.spawn.col + 0.5) * map.tileSize,
    y: (map.spawn.row + 0.5) * map.tileSize,
    size: 24,
  };

  function update(dt) {
    player = moveWithCollision(
      player,
      getDirection(keys),
      SPEED,
      dt,
      map.tiles,
      map.tileSize,
    );
  }

  function render() {
    drawMap(map);
    ctx.fillStyle = "#4ade80";
    ctx.fillRect(
      player.x - player.size / 2,
      player.y - player.size / 2,
      player.size,
      player.size,
    );
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => console.error(err));
