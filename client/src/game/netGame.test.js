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
    sendPickup: vi.fn(),
    push: (snapshot) => listener?.(snapshot),
    get listening() {
      return listener !== null;
    },
    sendAttack: vi.fn(),
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

const coin = (id, x) => ({ id, item: "gold_coin", x, y: 100 });

test("an item with no picture is drawn as a dot", () => {
  const { browser, connection, ctx, game } = setup();
  game.start();
  connection.push({ tick: 1, players: [mine()], items: [coin(1, 300)] });
  browser.frame(16);
  expect(ctx.arc).toHaveBeenCalledWith(300, 100, 7, 0, Math.PI * 2);
});

test("an item with a picture is drawn from it, at its own size", () => {
  const browser = fakeEnv();
  const connection = fakeConnection();
  const canvas = fakeCanvas();
  const strip = { width: 896, height: 128 }; // seven square frames side by side
  const game = createNetworkGame({
    canvas,
    level,
    sheets: { ...sheets, items: { gold_coin: { image: strip, size: 64 } } },
    connection,
    you: 1,
    env: browser.env,
  });
  game.start();
  connection.push({
    tick: 1,
    players: [mine()],
    items: [coin(1, 300), { id: 2, item: "wood", x: 400, y: 100 }],
  });

  browser.frame(16);

  // The first 128 x 128 frame, drawn 64 x 64 and centered on the item.
  expect(canvas.ctx.drawImage).toHaveBeenCalledWith(
    strip,
    0,
    0,
    128,
    128,
    268,
    68,
    64,
    64,
  );
  expect(canvas.ctx.arc).toHaveBeenCalledWith(400, 100, 7, 0, Math.PI * 2); // wood has no picture
  expect(canvas.ctx.arc).not.toHaveBeenCalledWith(300, 100, 7, 0, Math.PI * 2);
});

test("E asks to pick up the nearest item within reach", () => {
  const { browser, connection, game } = setup();
  game.start();
  connection.push({
    tick: 1,
    players: [mine(100)],
    items: [coin(1, 140), coin(2, 120), coin(3, 400)],
  });

  browser.press("KeyE");

  expect(connection.sendPickup).toHaveBeenCalledTimes(1);
  expect(connection.sendPickup).toHaveBeenCalledWith(2); // 20 px away beats 40 px away
});

test("E with nothing within reach sends nothing, and neither does E typed into a text box", () => {
  const { browser, connection, game } = setup();
  game.start();
  connection.push({ tick: 1, players: [mine(100)], items: [coin(3, 400)] });
  browser.press("KeyE");

  connection.push({ tick: 2, players: [mine(100)], items: [coin(1, 110)] });
  browser.typeIn("KeyE");

  expect(connection.sendPickup).not.toHaveBeenCalled();
});

const goblin = (extra = {}) => ({
  id: 1,
  type: "goblin",
  x: 140,
  y: 100,
  hp: 20,
  maxHp: 40,
  facing: -1,
  attacking: false,
  ...extra,
});

test("Space asks to attack, once per press, and never from a text box", () => {
  const { browser, connection, game } = setup();
  game.start();
  connection.push({ tick: 1, players: [mine()], items: [], monsters: [] });

  const press = browser.press("Space");
  browser.typeIn("Space");

  expect(connection.sendAttack).toHaveBeenCalledTimes(1);
  expect(press.defaultPrevented).toBe(true); // the page does not scroll
});

test("a monster without pictures is a circle, with a health bar to scale", () => {
  const { browser, connection, ctx, game } = setup();
  game.start();
  connection.push({
    tick: 1,
    players: [mine()],
    items: [],
    monsters: [goblin()],
  });

  browser.frame(16);

  expect(ctx.arc).toHaveBeenCalledWith(140, 100, 12, 0, Math.PI * 2);
  expect(ctx.fillRect).toHaveBeenCalledWith(124, 60, 16, 4); // half of a 32 px bar, 40 px above
});

test("a monster with pictures idles, and plays its attack strip when it strikes", () => {
  const browser = fakeEnv();
  const connection = fakeConnection();
  const canvas = fakeCanvas();
  const idle = { name: "idle", width: 1536, height: 192 };
  const attack = { name: "attack", width: 1536, height: 192 };
  const game = createNetworkGame({
    canvas,
    level,
    sheets: { ...sheets, monsters: { goblin: { idle, attack, size: 96 } } },
    connection,
    you: 1,
    env: browser.env,
  });
  game.start();
  const drawnWith = (image) =>
    canvas.ctx.drawImage.mock.calls.some(([used]) => used === image);

  connection.push({
    tick: 1,
    players: [mine()],
    items: [],
    monsters: [goblin()],
  });
  browser.frame(16);
  expect(drawnWith(idle)).toBe(true);
  expect(drawnWith(attack)).toBe(false);

  connection.push({
    tick: 2,
    players: [mine()],
    items: [],
    monsters: [goblin({ attacking: true })],
  });
  canvas.ctx.drawImage.mockClear();
  browser.frame(16);
  const strike = canvas.ctx.drawImage.mock.calls.find(
    ([used]) => used === attack,
  );
  expect(strike).toBeDefined();
  expect(strike.slice(1, 5)).toEqual([0, 0, 192, 192]); // the strike starts at its first frame
  expect(canvas.ctx.scale).toHaveBeenCalledWith(-1, 1); // facing left
});

const withAttack = { ...sheets, attack: { name: "attack" } };

function setupWith(sheetsToUse) {
  const browser = fakeEnv();
  const connection = fakeConnection();
  const canvas = fakeCanvas();
  const game = createNetworkGame({
    canvas,
    level,
    sheets: sheetsToUse,
    connection,
    you: 1,
    env: browser.env,
  });
  return { browser, connection, ctx: canvas.ctx, game };
}
const lastSheet = (ctx) => ctx.drawImage.mock.lastCall[0];
const frames = (browser, n, ms) => {
  for (let i = 0; i < n; i++) browser.frame(ms);
};

test("Space starts my swing at once, facing the monster within reach", () => {
  const { browser, connection, ctx, game } = setupWith(withAttack);
  game.start();
  // The goblin stands 30 px to my left.
  connection.push({
    tick: 1,
    players: [mine(100)],
    items: [],
    monsters: [goblin({ x: 70 })],
  });
  browser.frame(16);
  expect(lastSheet(ctx)).toBe(sheets.idle);

  browser.press("Space");
  browser.frame(16);

  expect(connection.sendAttack).toHaveBeenCalledTimes(1);
  expect(lastSheet(ctx)).toBe(withAttack.attack);
  expect(ctx.scale).toHaveBeenLastCalledWith(-1, 1); // turned toward the goblin
});

test("my swing ends after 0.4 s, and the next waits for my cooldown", () => {
  const { browser, connection, ctx, game } = setupWith(withAttack);
  game.start();
  connection.push({ tick: 1, players: [mine(100)], items: [], monsters: [] });
  browser.frame(16);

  browser.press("Space"); // swing at 16 ms
  frames(browser, 5, 100); // 516 ms
  expect(lastSheet(ctx)).toBe(sheets.idle);

  browser.press("Space"); // 500 ms after the last swing: too soon to swing again
  browser.frame(16);
  expect(lastSheet(ctx)).toBe(sheets.idle);
  expect(connection.sendAttack).toHaveBeenCalledTimes(2); // the server still hears it, and decides

  frames(browser, 3, 100); // 832 ms: the cooldown is over
  browser.press("Space");
  browser.frame(16);
  expect(lastSheet(ctx)).toBe(withAttack.attack);
});

test("without the attack picture, a swing is drawn standing still", () => {
  const { browser, connection, ctx, game } = setupWith(sheets);
  game.start();
  connection.push({ tick: 1, players: [mine(100)], items: [], monsters: [] });
  browser.frame(16);

  browser.press("Space");
  browser.frame(16);

  expect(lastSheet(ctx)).toBe(sheets.idle);
});

test("another player's swing comes from the snapshot, once per strike", () => {
  const { browser, connection, ctx, game } = setupWith(withAttack);
  game.start();
  connection.push({
    tick: 1,
    players: [mine(100), { ...other(140), attacking: true }],
    items: [],
    monsters: [],
  });

  browser.frame(150); // other players are drawn 100 ms in the past

  const used = ctx.drawImage.mock.calls.map(([sheet]) => sheet);
  expect(used).toContain(withAttack.attack);
});
