import { updatePlayer } from "../../../shared/game.js";
import { advanceAnim, createAnim } from "./animation.js";
import { render } from "./renderer.js";
import { hudSnapshot, sameHud } from "./hudState.js";

// What the engine needs from the outside world. Tests pass fakes instead.
function browserEnv() {
  return {
    raf: (cb) => window.requestAnimationFrame(cb),
    caf: (id) => window.cancelAnimationFrame(id),
    now: () => performance.now(),
    target: window,
  };
}

export function createGame({
  canvas,
  level,
  sheets,
  player: startingPlayer,
  onHud,
  showHitbox = false,
  env = browserEnv(),
}) {
  const ctx = canvas.getContext("2d");
  const keys = new Set();
  let player = startingPlayer;
  let anim = createAnim();
  let running = false;
  let frameId = null;
  let last = 0;
  let lastHud = null;

  // Input: only record what is held. No movement here.
  const onKeyDown = (e) => {
    keys.add(e.code);
    if (e.code.startsWith("Arrow")) e.preventDefault(); // stop the page scrolling
  };
  const onKeyUp = (e) => keys.delete(e.code);
  const onBlur = () => keys.clear(); // avoid "stuck" keys

  // Tell React only when something the HUD shows has changed.
  function publishHud() {
    const next = hudSnapshot(player, level);
    if (lastHud && sameHud(lastHud, next)) return;
    lastHud = next;
    onHud?.(next);
  }

  function frame(now) {
    if (!running) return; // a frame that was already scheduled when we stopped
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    const before = player;
    player = updatePlayer(player, keys, dt, level); // game rules: shared/
    anim = advanceAnim(anim, before, player, dt); // presentation only
    render(ctx, level, player, anim, sheets, { showHitbox });
    publishHud();

    if (running) frameId = env.raf(frame);
  }

  return {
    start() {
      if (running) return; // never run two loops
      running = true;
      canvas.width = level.tiles[0].length * level.tileSize;
      canvas.height = level.tiles.length * level.tileSize;
      env.target.addEventListener("keydown", onKeyDown);
      env.target.addEventListener("keyup", onKeyUp);
      env.target.addEventListener("blur", onBlur);
      last = env.now();
      publishHud();
      frameId = env.raf(frame);
    },

    // Undoes everything start() did.
    stop() {
      if (!running) return;
      running = false;
      if (frameId !== null) env.caf(frameId);
      frameId = null;
      env.target.removeEventListener("keydown", onKeyDown);
      env.target.removeEventListener("keyup", onKeyUp);
      env.target.removeEventListener("blur", onBlur);
      keys.clear();
    },

    getPlayer: () => player, // for tests and debugging
  };
}
