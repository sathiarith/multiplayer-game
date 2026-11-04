import { PLAYER_SIZE } from "../../../shared/game.js";
import { advanceAnim, createAnim } from "./animation.js";
import { renderWorld } from "./renderer.js";
import { hudSnapshot, sameHud } from "./hudState.js";
import { inputFromKeys, sameInput, anyHeld } from "./input.js";
import { browserEnv } from "./env.js";

const IDLE = { up: false, down: false, left: false, right: false };
const ORIGIN = { x: 0, y: 0 };

// The page does not simulate anything. It tells the server which keys are
// held, remembers the latest snapshot, and draws it.
export function createNetworkGame({
  canvas,
  level,
  sheets,
  connection, // from connectToGame: sendInput(), onSnapshot()
  you, // this player's character id
  onHud,
  showHitbox = false,
  tickRate = 20,
  env = browserEnv(),
}) {
  const ctx = canvas.getContext("2d");
  const keys = new Set();
  const view = new Map(); // player id -> { player, anim, move }
  let running = false;
  let frameId = null;
  let intervalId = null;
  let unsubscribe = null;
  let lastFrame = 0;
  let seq = 0;
  let lastSent = IDLE;
  let lastHud = null;

  // Input: only record what is held. Nothing moves here.
  const onKeyDown = (e) => {
    keys.add(e.code);
    if (e.code.startsWith("Arrow")) e.preventDefault(); // stop the page scrolling
  };
  const onKeyUp = (e) => keys.delete(e.code);
  const onBlur = () => keys.clear(); // avoid "stuck" keys

  // Runs at the tick rate. Send when the held keys change, and keep sending
  // while any key is held, because the server releases keys it stops hearing about.
  function sendInput() {
    const input = inputFromKeys(keys);
    if (sameInput(lastSent, input) && !anyHeld(input)) return;
    lastSent = input;
    connection.sendInput({ seq: ++seq, ...input });
  }

  function onSnapshot({ players }) {
    const seen = new Set();
    for (const p of players) {
      seen.add(p.id);
      const before = view.get(p.id);
      view.set(p.id, {
        player: { ...p, size: PLAYER_SIZE },
        anim: before ? before.anim : createAnim(),
        // How far they moved since the previous snapshot. The animation uses
        // this until the next snapshot, so it does not flicker between frames.
        move: before
          ? { x: p.x - before.player.x, y: p.y - before.player.y }
          : ORIGIN,
      });
    }
    for (const id of view.keys()) if (!seen.has(id)) view.delete(id);

    const mine = players.find((p) => p.id === you);
    if (mine) {
      const next = hudSnapshot(mine, level);
      if (!lastHud || !sameHud(lastHud, next)) {
        lastHud = next;
        onHud?.(next);
      }
    }
  }

  function frame(now) {
    if (!running) return; // a frame that was already scheduled when we stopped
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;

    for (const entry of view.values()) {
      entry.anim = advanceAnim(entry.anim, ORIGIN, entry.move, dt);
    }
    renderWorld(ctx, level, [...view.values()], sheets, {
      youId: you,
      showHitbox,
    });

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
      unsubscribe = connection.onSnapshot(onSnapshot);
      intervalId = env.setInterval(sendInput, 1000 / tickRate);
      lastFrame = env.now();
      frameId = env.raf(frame);
    },

    // Undoes everything start() did.
    stop() {
      if (!running) return;
      running = false;
      unsubscribe?.();
      unsubscribe = null;
      env.clearInterval(intervalId);
      if (frameId !== null) env.caf(frameId);
      frameId = null;
      env.target.removeEventListener("keydown", onKeyDown);
      env.target.removeEventListener("keyup", onKeyUp);
      env.target.removeEventListener("blur", onBlur);
      keys.clear();
    },
  };
}
