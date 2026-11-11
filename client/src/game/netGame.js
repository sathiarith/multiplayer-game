import { PLAYER_SIZE } from "../../../shared/game.js";
import { TICK_RATE } from "../../../shared/prediction.js";
import { advanceAnim, createAnim } from "./animation.js";
import { renderWorld } from "./renderer.js";
import { hudSnapshot, sameHud } from "./hudState.js";
import { inputFromKeys, sameInput, anyHeld } from "./input.js";
import { createPredictor } from "./predictor.js";
import {
  createSnapshotBuffer,
  INTERPOLATION_DELAY_MS,
} from "./interpolation.js";
import { browserEnv } from "./env.js";

const IDLE = { up: false, down: false, left: false, right: false };
const ORIGIN = { x: 0, y: 0 };
const MAX_STEPS_PER_FRAME = 5;
// Keys typed into a text box (the chat) belong to the text box, not the game.
const isTyping = (target) =>
  target?.isContentEditable ||
  ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName);

// My own character is predicted in fixed steps (the same ones the server takes)
// and corrected by the server. Everyone else is drawn slightly in the past,
// blended between two snapshots. The server stays in charge of everything.
export function createNetworkGame({
  canvas,
  level,
  sheets,
  connection, // from connectToGame: sendInput(), onSnapshot()
  you, // this player's character id
  onHud,
  showHitbox = false,
  tickRate = TICK_RATE,
  interpolationDelayMs = INTERPOLATION_DELAY_MS,
  env = browserEnv(),
}) {
  const ctx = canvas.getContext("2d");
  const keys = new Set();
  const stepSeconds = 1 / tickRate;
  const buffer = createSnapshotBuffer();
  const predictor = createPredictor({ level, tickRate });
  const anims = new Map(); // player id -> animation state, for me and for the others
  let running = false;
  let frameId = null;
  let unsubscribe = null;
  let lastFrame = 0;
  let accumulator = 0; // time that has passed but not yet been simulated
  let seq = 0;
  let lastSent = IDLE;
  let lastHud = null;
  let latest = []; // the newest snapshot's players, for debugging and the end-to-end tests

  // Input: only record what is held. Nothing moves here.
  const onKeyDown = (e) => {
    if (isTyping(e.target)) return;
    keys.add(e.code);
    if (e.code.startsWith("Arrow")) e.preventDefault(); // stop the page scrolling
  };
  const onKeyUp = (e) => keys.delete(e.code);
  const onBlur = () => keys.clear(); // avoid "stuck" keys

  // The HUD follows my predicted character, and is told only about changes.
  function publishHud() {
    const state = predictor.state();
    if (!state) return;
    const next = hudSnapshot(state, level);
    if (lastHud && sameHud(lastHud, next)) return;
    lastHud = next;
    onHud?.(next);
  }

  // One fixed step. Send the held keys when they change, and keep sending
  // while any key is held (the server releases keys it stops hearing about),
  // and predict the result at once.
  function fixedStep() {
    if (!predictor.ready) return; // wait until the server has said where I am
    const input = inputFromKeys(keys);
    if (!sameInput(lastSent, input) || anyHeld(input)) {
      lastSent = input;
      seq += 1;
      connection.sendInput({ seq, ...input });
      predictor.step(input, seq);
    } else {
      predictor.step(input); // idle and unchanged: nothing sent, nothing to replay
    }
    publishHud();
  }

  function onSnapshot({ players }) {
    latest = players;
    buffer.push(env.now(), players);
    const mine = players.find((p) => p.id === you);
    if (mine) {
      predictor.reconcile(mine);
      publishHud();
    }
  }

  function frame(now) {
    if (!running) return; // a frame that was already scheduled when we stopped
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;

    accumulator += dt;
    let steps = 0;
    while (accumulator >= stepSeconds && steps < MAX_STEPS_PER_FRAME) {
      fixedStep();
      accumulator -= stepSeconds;
      steps += 1;
    }
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0; // after a long stall, do not try to catch up
    predictor.decay(dt);

    const entries = [];
    const present = new Set();

    // Everyone else: where they were a moment ago.
    for (const p of buffer.sample(now - interpolationDelayMs)) {
      if (p.id === you) continue;
      present.add(p.id);
      const anim = advanceAnim(
        anims.get(p.id) ?? createAnim(),
        ORIGIN,
        p.move,
        dt,
      );
      anims.set(p.id, anim);
      entries.push({
        player: {
          id: p.id,
          name: p.name,
          x: p.x,
          y: p.y,
          hp: p.hp,
          size: PLAYER_SIZE,
        },
        anim,
      });
    }

    // Me: predicted, and drawn between my last two steps.
    const state = predictor.state();
    if (state) {
      const at = predictor.position(accumulator / stepSeconds);
      const anim = advanceAnim(
        anims.get(you) ?? createAnim(),
        ORIGIN,
        predictor.lastMove(),
        dt,
      );
      anims.set(you, anim);
      present.add(you);
      entries.push({
        player: {
          id: you,
          name: state.name,
          x: at.x,
          y: at.y,
          hp: state.hp,
          size: state.size,
        },
        anim,
      });
    }
    for (const id of anims.keys()) if (!present.has(id)) anims.delete(id);

    renderWorld(ctx, level, entries, sheets, { youId: you, showHitbox });
    if (running) frameId = env.raf(frame);
  }

  return {
    latestPlayers: () => latest,
    start() {
      if (running) return; // never run two loops
      running = true;
      canvas.width = level.tiles[0].length * level.tileSize;
      canvas.height = level.tiles.length * level.tileSize;
      env.target.addEventListener("keydown", onKeyDown);
      env.target.addEventListener("keyup", onKeyUp);
      env.target.addEventListener("blur", onBlur);
      unsubscribe = connection.onSnapshot(onSnapshot);
      lastFrame = env.now();
      frameId = env.raf(frame);
    },

    // Undoes everything start() did.
    stop() {
      if (!running) return;
      running = false;
      unsubscribe?.();
      unsubscribe = null;
      if (frameId !== null) env.caf(frameId);
      frameId = null;
      env.target.removeEventListener("keydown", onKeyDown);
      env.target.removeEventListener("keyup", onKeyUp);
      env.target.removeEventListener("blur", onBlur);
      keys.clear();
    },
  };
}
