import { test, expect, vi } from "vitest";
import { createNetworkGame } from "./netGame.js";
import { buildLevel } from "../../../shared/map.js";
import { fakeEnv, fakeCanvas } from "./fakeEnv.js";

const level = buildLevel({
  tileSize: 40,
  spawn: { col: 1, row: 1 },
  rows: [
    "#".repeat(20),
    `#${".".repeat(18)}#`,
    `#${".".repeat(18)}#`,
    `#${".".repeat(18)}#`,
    "#".repeat(20),
  ],
});
const sheets = { idle: { name: "idle" }, run: { name: "run" } };
const idle = { up: false, down: false, left: false, right: false };

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
const mine = (x = 100, ack = 0, hp = 100) => ({
  id: 1,
  name: "Aria",
  x,
  y: 100,
  hp,
  maxHp: 100,
  ack,
});
const other = (x) => ({
  id: 2,
  name: "Borin",
  x,
  y: 100,
  hp: 80,
  maxHp: 100,
  ack: 0,
});
const drawnX = (ctx, name) =>
  ctx.fillText.mock.calls.filter(([text]) => text === name).at(-1)[1];
const sent = (connection) =>
  connection.sendInput.mock.calls.map(([input]) => input);

function setup() {
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
  });
  return { browser, connection, canvas, ctx: canvas.ctx, onHud, game };
}

test("start runs one frame loop and one subscription, and stop undoes all of it", () => {
  const { browser, connection, game } = setup();
  game.start();
  game.start(); // a second start does nothing
  expect(browser.pendingFrames()).toBe(1);
  expect(connection.listening).toBe(true);
  expect(browser.press("ArrowDown").defaultPrevented).toBe(true); // listening for keys

  game.stop();
  expect(browser.pendingFrames()).toBe(0);
  expect(connection.listening).toBe(false);
  expect(browser.press("ArrowDown").defaultPrevented).toBe(false); // no longer listening
});

test("a stopped game can be started again", () => {
  const { browser, connection, game } = setup();
  game.start();
  game.stop();
  game.start();
  expect(browser.pendingFrames()).toBe(1);
  expect(connection.listening).toBe(true);
});

test("the canvas is sized to the map", () => {
  const { canvas, game } = setup();
  game.start();
  expect(canvas.width).toBe(800);
  expect(canvas.height).toBe(200);
});

test("nothing is drawn for me, and nothing is sent, until the server says where I am", () => {
  const { browser, connection, ctx, game } = setup();
  game.start();
  browser.press("KeyD");
  browser.frame(50);
  expect(connection.sendInput).not.toHaveBeenCalled();
  expect(ctx.fillText).not.toHaveBeenCalled();
});

test("my character appears where the server put it", () => {
  const { browser, connection, ctx, game } = setup();
  game.start();
  connection.push(snap(1, [mine(100)]));
  browser.frame(0);
  expect(drawnX(ctx, "Aria")).toBeCloseTo(100);
});

test("my character moves as soon as I press a key, without waiting for the server", () => {
  const { browser, connection, ctx, game } = setup();
  game.start();
  connection.push(snap(1, [mine(100)]));
  browser.press("KeyD");

  browser.frame(50); // one fixed step: the prediction goes from 100 to 110
  browser.frame(25); // halfway through the next step
  expect(drawnX(ctx, "Aria")).toBeCloseTo(105);
  expect(sent(connection)).toEqual([{ seq: 1, ...idle, right: true }]);
});

test("a held key is sent on every step with a rising sequence number, then released once", () => {
  const { browser, connection, game } = setup();
  game.start();
  connection.push(snap(1, [mine()]));

  browser.press("KeyD");
  browser.frame(50);
  browser.frame(50);
  expect(sent(connection)).toEqual([
    { seq: 1, ...idle, right: true },
    { seq: 2, ...idle, right: true },
  ]);

  browser.release("KeyD");
  browser.frame(50);
  expect(sent(connection).at(-1)).toEqual({ seq: 3, ...idle });

  browser.frame(50); // idle and unchanged: nothing more to say
  expect(connection.sendInput).toHaveBeenCalledTimes(3);
});

test("arrows and WASD are both understood", () => {
  const { browser, connection, game } = setup();
  game.start();
  connection.push(snap(1, [mine()]));
  browser.press("ArrowUp");
  browser.press("KeyA");
  browser.frame(50);
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
  connection.push(snap(1, [mine()]));
  browser.press("ArrowLeft");
  browser.frame(50);

  browser.blur();
  browser.frame(50);

  expect(sent(connection).at(-1)).toEqual({ seq: 2, ...idle });
});

test("the running animation shows while I move, and idle when I stop", () => {
  const { browser, connection, ctx, game } = setup();
  game.start();
  connection.push(snap(1, [mine()]));
  browser.frame(0);
  expect(ctx.drawImage.mock.lastCall[0]).toBe(sheets.idle);

  browser.press("KeyD");
  browser.frame(50);
  expect(ctx.drawImage.mock.lastCall[0]).toBe(sheets.run);

  browser.release("KeyD");
  browser.frame(50);
  expect(ctx.drawImage.mock.lastCall[0]).toBe(sheets.idle);
});

test("my character is drawn mirrored when I move left", () => {
  const { browser, connection, ctx, game } = setup();
  game.start();
  connection.push(snap(1, [mine()]));
  browser.press("KeyA");
  browser.frame(50);
  expect(ctx.scale).toHaveBeenLastCalledWith(-1, 1);
});

test("a snapshot that disagrees with my prediction does not make my character jump on screen", () => {
  const { browser, connection, ctx, game } = setup();
  game.start();
  connection.push(snap(1, [mine(100)]));
  browser.press("KeyD");
  browser.frame(50);
  browser.frame(50);
  browser.frame(50); // three steps: predicted x = 130
  browser.frame(25);
  const before = drawnX(ctx, "Aria"); // between 120 and 130
  expect(before).toBeCloseTo(125);

  // The server never moved me, and says it has heard all three inputs.
  connection.push(snap(2, [mine(100, 3)]));
  browser.frame(1);

  expect(Math.abs(drawnX(ctx, "Aria") - before)).toBeLessThan(3);
});

test("other players are drawn a little in the past, blended between two snapshots", () => {
  const { browser, connection, ctx, game } = setup();
  game.start();
  connection.push(snap(1, [mine(), other(140)])); // arrives at time 0
  browser.frame(50);
  connection.push(snap(2, [mine(), other(150)])); // arrives at time 50

  browser.frame(75); // time 125: drawn as of 25, halfway between the two
  expect(drawnX(ctx, "Borin")).toBeCloseTo(145);

  browser.frame(25); // time 150: drawn as of 50, exactly the second snapshot
  expect(drawnX(ctx, "Borin")).toBeCloseTo(150);
});

test("a player who leaves the snapshot disappears", () => {
  const { browser, connection, ctx, game } = setup();
  game.start();
  connection.push(snap(1, [mine(), other(140)]));
  browser.frame(50);
  connection.push(snap(2, [mine()]));
  ctx.fillText.mockClear();

  browser.frame(150);

  expect(ctx.fillText.mock.calls.map(([text]) => text)).toEqual(["Aria"]);
});

test("the HUD follows my predicted character, and only when its values change", () => {
  const { browser, connection, onHud, game } = setup();
  game.start();
  connection.push(snap(1, [mine(100)]));
  expect(onHud).toHaveBeenCalledTimes(1);
  expect(onHud.mock.lastCall[0]).toMatchObject({
    name: "Aria",
    hp: 100,
    col: 2,
    row: 2,
  });

  browser.frame(50); // standing still: nothing changed
  expect(onHud).toHaveBeenCalledTimes(1);

  browser.press("KeyD");
  browser.frame(50); // x = 110: still the same tile
  expect(onHud).toHaveBeenCalledTimes(1);
  browser.frame(50); // x = 120: the next tile, with no help from the server
  expect(onHud).toHaveBeenCalledTimes(2);
  expect(onHud.mock.lastCall[0].col).toBe(3);

  connection.push(snap(2, [mine(120, 2, 70)])); // the server says my health changed
  expect(onHud).toHaveBeenCalledTimes(3);
  expect(onHud.mock.lastCall[0].hp).toBe(70);
});

test("latestPlayers gives the newest snapshot's players", () => {
  const { connection, game } = setup();
  game.start();
  expect(game.latestPlayers()).toEqual([]);

  connection.push(snap(1, [mine(100), other(140)]));
  expect(game.latestPlayers().map((p) => p.name)).toEqual(["Aria", "Borin"]);

  connection.push(snap(2, [mine(110)]));
  expect(game.latestPlayers().map((p) => p.name)).toEqual(["Aria"]);
});

test("keys typed into a text box do not move the character", () => {
  const { browser, connection, game } = setup();
  game.start();
  connection.push(snap(1, [mine()]));

  const arrow = browser.typeIn("ArrowLeft");
  browser.typeIn("KeyD");
  browser.frame(50);

  expect(connection.sendInput).not.toHaveBeenCalled();
  expect(arrow.defaultPrevented).toBe(false); // the text box keeps its arrow keys
});
