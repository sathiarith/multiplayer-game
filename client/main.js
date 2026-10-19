import { getDirection, step } from "../shared/movement.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const SPEED = 200; // pixels per second
const keys = new Set();
let player = { x: 400, y: 300, size: 24 };

// Input: only record what is held. No movement here.
window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code.startsWith("Arrow")) e.preventDefault(); // stop page scrolling
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear()); // avoid "stuck" keys

function update(dt) {
  player = step(player, getDirection(keys), SPEED, dt);
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
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
  const dt = Math.min((now - last) / 1000, 0.1); // seconds, capped
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
