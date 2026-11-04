import { test, expect, vi } from "vitest";
import { createNetworkGame } from "./netGame.js";
import { buildLevel } from "../../../shared/map.js";
import { fakeEnv, fakeCanvas } from "./fakeEnv.js";

const level = buildLevel({
  tileSize: 40,
  spawn: { col: 1, row: 1 },
  rows: ["#######", "#.....#", "#.....#", "#.....#", "#######"],
});
const sheets = { idle: { name: "idle" }, run: { name: "run" } };

// Plays the part of connectToGame: tests call push() to play the server.
function fakeConnection() {
  let listener = null;
  return {
    sendInput: vi.fn(),
    onSnapshot: vi.fn((l) => {
      listener = l;
      return () => {
        listener = null;
      };
    }),
    push: (snapshot) => listener?.(snapshot),
    get listening() {
      return listener !== null;
    },
  };
}

const snap = (tick, players) => ({ tick, players });
const aria = (x = 100, y = 60, hp = 100) => ({
  id: 1,
  name: "Aria",
  x,
  y,
  hp,
  maxHp: 100,
  ack: 0,
});
const borin = (x = 140) => ({
  id: 2,
  name: "Borin",
  x,
  y: 60,
  hp: 80,
  maxHp: 100,
  ack: 0,
});
const idle = { up: false, down: false, left: false, right: false };

function setup(options = {}) {
  const browser = fakeEnv();
  const connection = fakeConnection();
  const canvas = fakeCanvas();
  const onHud = vi.fn();
  const game = createNetworkGame({
    canvas,
    level,
    sheets,
    connection,
    you: 1,
    onHud,
    env: browser.env,
    ...options,
  });
  return { browser, connection, canvas, ctx: canvas.ctx, onHud, game };
}

const sent = (connection) =>
  connection.sendInput.mock.calls.map(([input]) => input);

test("start runs one input timer and one frame loop, and stop undoes all of it", () => {
  const { browser, connection, game } = setup();
  game.start();
  game.start(); // a second start does nothing
  expect(browser.env.setInterval).toHaveBeenCalledTimes(1);
  expect(browser.pendingFrames()).toBe(1);
  expect(connection.listening).toBe(true);
  expect(browser.press("ArrowDown").defaultPrevented).toBe(true); // listening for keys

  game.stop();
  expect(browser.pendingIntervals()).toBe(0);
  expect(browser.pendingFrames()).toBe(0);
  expect(connection.listening).toBe(false);
  expect(browser.press("ArrowDown").defaultPrevented).toBe(false); // no longer listening
});

test("a stopped game can be started again", () => {
  const { browser, connection, game } = setup();
  game.start();
  game.stop();
  game.start();
  expect(browser.pendingIntervals()).toBe(1);
  expect(browser.pendingFrames()).toBe(1);
  expect(connection.listening).toBe(true);
});

test("the canvas is sized to the map", () => {
  const { canvas, game } = setup();
  game.start();
  expect(canvas.width).toBe(280);
  expect(canvas.height).toBe(200);
});

test("with no keys held nothing is sent", () => {
  const { browser, connection, game } = setup();
  game.start();
  browser.tick();
  browser.tick();
  expect(connection.sendInput).not.toHaveBeenCalled();
});

test("a held key is sent on every tick with a rising sequence number, then released once", () => {
  const { browser, connection, game } = setup();
  game.start();

  browser.press("KeyD");
  browser.tick();
  browser.tick();
  expect(sent(connection)).toEqual([
    { seq: 1, ...idle, right: true },
    { seq: 2, ...idle, right: true },
  ]);

  browser.release("KeyD");
  browser.tick();
  expect(sent(connection).at(-1)).toEqual({ seq: 3, ...idle });

  browser.tick(); // idle and unchanged: nothing more to say
  expect(connection.sendInput).toHaveBeenCalledTimes(3);
});

test("arrows and WASD are both understood", () => {
  const { browser, connection, game } = setup();
  game.start();
  browser.press("ArrowUp");
  browser.press("KeyA");
  browser.tick();
  expect(sent(connection)[0]).toEqual({
    seq: 1,
    ...idle,
    up: true,
    left: true,
  });
});

test("losing window focus releases every key", () => {
  const { browser, connection, game } = setup();
  game.start();
  browser.press("ArrowLeft");
  browser.tick();

  browser.blur();
  browser.tick();

  expect(sent(connection).at(-1)).toEqual({ seq: 2, ...idle });
});

test("before the first snapshot only the map is drawn", () => {
  const { browser, ctx, game } = setup();
  game.start();
  browser.frame();
  expect(ctx.fillRect).toHaveBeenCalled(); // the tiles
  expect(ctx.fillText).not.toHaveBeenCalled(); // no names, no players
});

test("every player in the snapshot is drawn with a name above them", () => {
  const { browser, connection, ctx, game } = setup();
  game.start();

  connection.push(snap(1, [aria(), borin()]));
  browser.frame();

  const names = ctx.fillText.mock.calls.map(([text]) => text).sort();
  expect(names).toEqual(["Aria", "Borin"]);
  expect(ctx.fillText).toHaveBeenCalledWith("Aria", 100, expect.any(Number));
});

test("a player who leaves the snapshot disappears", () => {
  const { browser, connection, ctx, game } = setup();
  game.start();
  connection.push(snap(1, [aria(), borin()]));
  browser.frame();
  ctx.fillText.mockClear();

  connection.push(snap(2, [aria()]));
  browser.frame();

  expect(ctx.fillText.mock.calls.map(([text]) => text)).toEqual(["Aria"]);
});

test("the running animation shows while a player moves, and idle when they stop", () => {
  const { browser, connection, ctx, game } = setup();
  game.start();

  connection.push(snap(1, [aria(100)]));
  browser.frame();
  expect(ctx.drawImage.mock.lastCall[0]).toBe(sheets.idle);

  connection.push(snap(2, [aria(110)]));
  browser.frame();
  expect(ctx.drawImage.mock.lastCall[0]).toBe(sheets.run);
  browser.frame(); // frames between snapshots keep running, no flicker
  expect(ctx.drawImage.mock.lastCall[0]).toBe(sheets.run);

  connection.push(snap(3, [aria(110)]));
  browser.frame();
  expect(ctx.drawImage.mock.lastCall[0]).toBe(sheets.idle);
});

test("a character moving left is drawn mirrored", () => {
  const { browser, connection, ctx, game } = setup();
  game.start();
  connection.push(snap(1, [aria(100)]));
  browser.frame();
  connection.push(snap(2, [aria(90)]));
  browser.frame();
  expect(ctx.scale).toHaveBeenLastCalledWith(-1, 1);
});

test("the HUD follows the player's own character, and only when its values change", () => {
  const { connection, onHud, game } = setup();
  game.start();

  connection.push(snap(1, [aria(100, 60), borin()]));
  expect(onHud).toHaveBeenCalledTimes(1);
  expect(onHud.mock.lastCall[0]).toMatchObject({
    name: "Aria",
    hp: 100,
    col: 2,
    row: 1,
  });

  connection.push(snap(2, [aria(105, 60), borin(160)])); // same tile, someone else moved
  expect(onHud).toHaveBeenCalledTimes(1);

  connection.push(snap(3, [aria(130, 60), borin(160)])); // crossed into the next tile
  expect(onHud).toHaveBeenCalledTimes(2);
  expect(onHud.mock.lastCall[0].col).toBe(3);

  connection.push(snap(4, [aria(130, 60, 70), borin(160)])); // health changed
  expect(onHud).toHaveBeenCalledTimes(3);
  expect(onHud.mock.lastCall[0].hp).toBe(70);
});

test("a snapshot that does not include this player leaves the HUD alone", () => {
  const { connection, onHud, game } = setup();
  game.start();
  connection.push(snap(1, [borin()]));
  expect(onHud).not.toHaveBeenCalled();
});
