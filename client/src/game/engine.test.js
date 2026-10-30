import { test, expect, vi } from "vitest";
import { createGame } from "./engine.js";
import { buildLevel } from "../../../shared/map.js";
import { createPlayer } from "../../../shared/game.js";

const level = buildLevel({
  tileSize: 40,
  spawn: { col: 1, row: 1 },
  rows: ["#######", "#.....#", "#.....#", "#.....#", "#######"],
});
const sheets = { idle: null, run: null }; // no art: the placeholder is drawn

// A canvas whose drawing context records every call and does nothing.
function fakeCanvas() {
  const ctx = new Proxy(
    {},
    {
      get: (t, p) => (p in t ? t[p] : (t[p] = vi.fn())),
      set: (t, p, v) => ((t[p] = v), true),
    },
  );
  return { width: 0, height: 0, getContext: () => ctx };
}

// A pretend browser: we decide when frames run and when keys are pressed.
function fakeBrowser() {
  const frames = new Map();
  const target = new EventTarget();
  let nextId = 1;
  let time = 0;

  const key = (type, code) => {
    const e = Object.assign(new Event(type, { cancelable: true }), { code });
    target.dispatchEvent(e);
    return e;
  };

  return {
    env: {
      raf: vi.fn((cb) => {
        const id = nextId++;
        frames.set(id, cb);
        return id;
      }),
      caf: vi.fn((id) => frames.delete(id)),
      now: () => time,
      target,
    },
    pending: () => frames.size,
    // Runs the scheduled frame, `ms` later.
    tick(ms = 16) {
      time += ms;
      const due = [...frames.values()];
      frames.clear();
      due.forEach((cb) => cb(time));
    },
    press: (code) => key("keydown", code),
    release: (code) => key("keyup", code),
    blur: () => target.dispatchEvent(new Event("blur")),
  };
}

function setup(options = {}) {
  const browser = fakeBrowser();
  const game = createGame({
    canvas: fakeCanvas(),
    level,
    sheets,
    player: createPlayer(level),
    env: browser.env,
    ...options,
  });
  return { browser, game };
}

test("start runs one loop, even if called twice", () => {
  const { browser, game } = setup();
  game.start();
  game.start();
  expect(browser.env.raf).toHaveBeenCalledTimes(1);
  browser.tick();
  expect(browser.pending()).toBe(1); // each frame schedules the next
});

test("stop cancels the pending frame and removes the key listeners", () => {
  const { browser, game } = setup();
  game.start();
  browser.tick();
  expect(browser.press("ArrowDown").defaultPrevented).toBe(true); // listening

  game.stop();
  expect(browser.env.caf).toHaveBeenCalled();
  expect(browser.pending()).toBe(0);
  expect(browser.press("ArrowDown").defaultPrevented).toBe(false); // no longer listening
});

test("a game can be stopped and started again", () => {
  const { browser, game } = setup();
  game.start();
  game.stop();
  game.start();
  expect(browser.pending()).toBe(1);
});

test("a held key moves the player, and releasing it stops the movement", () => {
  const { browser, game } = setup();
  game.start();
  const startX = game.getPlayer().x;

  browser.press("KeyD");
  for (let i = 0; i < 10; i++) browser.tick();
  const moved = game.getPlayer().x;
  expect(moved).toBeGreaterThan(startX);

  browser.release("KeyD");
  browser.tick();
  browser.tick();
  expect(game.getPlayer().x).toBe(moved);
});

test("losing window focus releases every held key", () => {
  const { browser, game } = setup();
  game.start();
  browser.press("KeyD");
  browser.tick();
  const x = game.getPlayer().x;

  browser.blur();
  browser.tick();
  expect(game.getPlayer().x).toBe(x);
});

test("the HUD is told once at the start, then only when its values change", () => {
  const onHud = vi.fn();
  const { browser, game } = setup({ onHud });
  game.start();
  expect(onHud).toHaveBeenCalledTimes(1);

  for (let i = 0; i < 5; i++) browser.tick(); // standing still
  expect(onHud).toHaveBeenCalledTimes(1);

  browser.press("ArrowRight");
  for (let i = 0; i < 20; i++) browser.tick(); // walks about 64 px, across two tiles
  const columns = onHud.mock.calls.map(([hud]) => hud.col);
  expect(columns).toEqual([1, 2, 3]); // not once per frame
});
