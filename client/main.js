import { buildLevel } from "../shared/map.js";
import { createPlayer, updatePlayer } from "../shared/game.js";
import { createHud } from "./hud.js";
import { ANIMS, createAnim, advanceAnim, frameIndex } from "./animation.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const keys = new Set();

const FRAME = 192; // every frame in the sprite sheets is 192 x 192 px
const SPRITE_SCALE = 0.5; // shrink the sprite to fit our 40 px tiles
const FOOT_Y = 130; // y inside a frame where the feet touch the ground; tune by eye
const SHOW_HITBOX = false; // outline of the collision box, for tuning

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

// Resolves once the image has loaded (images load asynchronously).
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${src}`));
    img.src = src; // set last: loading starts as soon as src is assigned
  });
}

// Load every sheet in ANIMS in parallel: { idle: <img or null>, run: <img or null> }
// A sheet that fails to load becomes null instead of stopping the game.
async function loadSheets() {
  const entries = await Promise.all(
    Object.entries(ANIMS).map(async ([name, a]) => {
      try {
        return [name, await loadImage(`./assets/${a.file}`)];
      } catch {
        return [name, null];
      }
    }),
  );
  const sheets = Object.fromEntries(entries);

  if (Object.values(sheets).includes(null)) {
    console.warn(
      "Some sprite sheets are missing, so placeholders will be drawn. " +
        "See CREDITS.md for where to download them.",
    );
  }
  return sheets;
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

function drawSprite(player, anim, sheet) {
  const { frames, fps } = ANIMS[anim.action];
  const index = frameIndex(anim.time, fps, frames);
  const size = FRAME * SPRITE_SCALE;
  const feetY = player.y + player.size / 2; // bottom of the collision box

  ctx.save();
  ctx.translate(player.x, feetY - FOOT_Y * SPRITE_SCALE);
  ctx.scale(anim.facing, 1);
  ctx.drawImage(
    sheet,
    index * FRAME,
    0,
    FRAME,
    FRAME,
    -size / 2,
    0,
    size,
    size,
  );
  ctx.restore();
}

// Used when the art is not installed: the same square as Story 1.1.
function drawPlaceholder(player) {
  ctx.fillStyle = "#4ade80";
  ctx.fillRect(
    player.x - player.size / 2,
    player.y - player.size / 2,
    player.size,
    player.size,
  );
}

function drawPlayer(player, anim, sheets) {
  const sheet = sheets[anim.action];
  if (sheet) drawSprite(player, anim, sheet);
  else drawPlaceholder(player);

  if (SHOW_HITBOX) {
    ctx.strokeStyle = "#4ade80";
    ctx.strokeRect(
      player.x - player.size / 2,
      player.y - player.size / 2,
      player.size,
      player.size,
    );
  }
}

function render(level, player, anim, sheets) {
  drawMap(level);
  drawPlayer(player, anim, sheets);
}

async function main() {
  const [level, sheets] = await Promise.all([
    loadLevel("./maps/level1.json"),
    loadSheets(),
  ]);
  canvas.width = level.tiles[0].length * level.tileSize;
  canvas.height = level.tiles.length * level.tileSize;

  let player = createPlayer(level);
  let anim = createAnim();
  const hud = createHud();
  let last = performance.now();

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    const before = player;
    player = updatePlayer(player, keys, dt, level); // game rules: shared/
    anim = advanceAnim(anim, before, player, dt); // presentation only
    render(level, player, anim, sheets);
    hud.update(player, level);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => console.error(err));
