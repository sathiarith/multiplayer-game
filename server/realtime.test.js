import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { startRealtime } from "./realtime-test-helpers.js";
import { TEST_ORIGIN, createLogCapture } from "./test-helpers.js";
import { addItem } from "./inventory.js";
import { MONSTERS } from "./monsters.js";

let rt;
beforeEach(async () => {
  rt = await startRealtime();
});
afterEach(async () => rt.close());

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const asPlayer = (p) => ({
  cookie: p.cookie,
  auth: { characterId: p.characterId },
});

const hold = (seq, keys = {}) => ({
  seq,
  up: false,
  down: false,
  left: false,
  right: false,
  ...keys,
});
const me = (snapshot, id) => snapshot.players.find((p) => p.id === id);

// Resolves with the first snapshot that satisfies `predicate`.
const snapshotWhere = (socket, predicate, ms = 2000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("snapshot", onSnapshot);
      reject(new Error("no matching snapshot arrived"));
    }, ms);
    function onSnapshot(snapshot) {
      if (!predicate(snapshot)) return;
      clearTimeout(timer);
      socket.off("snapshot", onSnapshot);
      resolve(snapshot);
    }
    socket.on("snapshot", onSnapshot);
  });

test("a logged-in user can connect with their own character", async () => {
  const alice = await rt.player("alice", "Aria");
  const { socket, welcome, error } = await rt.open(asPlayer(alice));

  expect(error).toBeUndefined();
  expect(socket.connected).toBe(true);
  expect(welcome.character).toMatchObject({
    id: alice.characterId,
    name: "Aria",
    level: 1,
    hp: 100,
    x: 100,
    y: 60,
  });
});

test("without a session the connection is refused", async () => {
  const alice = await rt.player("alice", "Aria");
  const { error } = await rt.open({ auth: { characterId: alice.characterId } });
  expect(error.data.code).toBe("not_authenticated");
});

test("a made-up session cookie is refused", async () => {
  const alice = await rt.player("alice", "Aria");
  const { error } = await rt.open({
    cookie: "sid=s%3Aforged.notarealsignature",
    auth: { characterId: alice.characterId },
  });
  expect(error.data.code).toBe("not_authenticated");
});

test("another user's character looks the same as one that does not exist", async () => {
  const alice = await rt.player("alice", "Aria");
  const bob = await rt.player("bobby", "Borin");

  const theirs = await rt.open({
    cookie: bob.cookie,
    auth: { characterId: alice.characterId },
  });
  const missing = await rt.open({
    cookie: bob.cookie,
    auth: { characterId: 99999 },
  });

  expect(theirs.error.data.code).toBe("not_found");
  expect(missing.error.data).toEqual(theirs.error.data);
  expect(missing.error.message).toBe(theirs.error.message);
});

test("a missing or oddly written character id is refused", async () => {
  const alice = await rt.player("alice", "Aria");
  const bad = [undefined, null, "abc", "1e2", "0x10", -1, 1.5, {}, []];
  for (const characterId of bad) {
    const { error } = await rt.open({
      cookie: alice.cookie,
      auth: { characterId },
    });
    expect(error?.data.code, `characterId ${JSON.stringify(characterId)}`).toBe(
      "not_found",
    );
  }
  const noAuth = await rt.open({ cookie: alice.cookie });
  expect(noAuth.error.data.code).toBe("not_found");
});

test("a page from an unknown origin cannot connect, even with a valid session", async () => {
  const alice = await rt.player("alice", "Aria");
  const hostile = await rt.open({
    ...asPlayer(alice),
    origin: "http://evil.example",
  });
  expect(hostile.error).toBeDefined();
  expect(hostile.socket.connected).toBe(false);

  const allowed = await rt.open({ ...asPlayer(alice), origin: TEST_ORIGIN });
  expect(allowed.welcome).toBeDefined();
});

test("a client that sends no Origin (not a browser) can connect", async () => {
  const alice = await rt.player("alice", "Aria");
  const { welcome } = await rt.open({ ...asPlayer(alice), origin: null });
  expect(welcome).toBeDefined();
});

test("a second connection for the same character replaces the first", async () => {
  const alice = await rt.player("alice", "Aria");
  const first = await rt.open(asPlayer(alice));
  const replaced = new Promise((resolve) =>
    first.socket.once("replaced", resolve),
  );
  const closed = new Promise((resolve) =>
    first.socket.once("disconnect", resolve),
  );

  const second = await rt.open(asPlayer(alice));

  await replaced;
  expect(await closed).toBe("io server disconnect");
  expect(first.socket.connected).toBe(false);
  expect(second.socket.connected).toBe(true);
});

test("a refused attempt does not disturb the connection that is already there", async () => {
  const alice = await rt.player("alice", "Aria");
  const mallory = await rt.player("mallory", "Evil");
  const real = await rt.open(asPlayer(alice));

  const attack = await rt.open({
    cookie: mallory.cookie,
    auth: { characterId: alice.characterId },
  });
  expect(attack.error.data.code).toBe("not_found");

  await wait(50); // give a wrongful disconnect time to arrive
  expect(real.socket.connected).toBe(true);
});

test("different characters can be online at the same time", async () => {
  const alice = await rt.player("alice", "Aria");
  const bob = await rt.player("bobby", "Borin");
  const a = await rt.open(asPlayer(alice));
  const b = await rt.open(asPlayer(bob));
  await wait(50);
  expect(a.socket.connected && b.socket.connected).toBe(true);
});

test("logging out disconnects that session's game connection only", async () => {
  const alice = await rt.player("alice", "Aria");
  const bob = await rt.player("bobby", "Borin");
  const a = await rt.open(asPlayer(alice));
  const b = await rt.open(asPlayer(bob));
  const closed = new Promise((resolve) => a.socket.once("disconnect", resolve));

  const res = await fetch(`${rt.url}/api/logout`, {
    method: "POST",
    headers: { Cookie: alice.cookie },
  });
  expect(res.status).toBe(204);

  expect(await closed).toBe("io server disconnect");
  await wait(50);
  expect(b.socket.connected).toBe(true);
});

test("a database failure during the handshake is refused with a generic error", async () => {
  const alice = await rt.player("alice", "Aria");
  await rt.db.run("DROP TABLE characters CASCADE");
  const { error } = await rt.open(asPlayer(alice));
  expect(error.data.code).toBe("internal_error");
  expect(error.message).not.toMatch(/no such table|does not exist/);
});

test("the welcome says who you are and how fast the server ticks", async () => {
  const alice = await rt.player("alice", "Aria");
  const { welcome } = await rt.open(asPlayer(alice));
  expect(welcome.you).toBe(alice.characterId);
  expect(welcome.tickRate).toBe(20);
});

test("snapshots list every connected player with their position", async () => {
  const alice = await rt.player("alice", "Aria");
  const bob = await rt.player("bobby", "Borin");
  const a = await rt.open(asPlayer(alice));
  await rt.open(asPlayer(bob));

  const snap = await snapshotWhere(a.socket, (s) => s.players.length === 2);

  expect(snap.players.map((p) => p.name).sort()).toEqual(["Aria", "Borin"]);
  expect(me(snap, alice.characterId)).toEqual({
    id: alice.characterId,
    name: "Aria",
    x: 100,
    y: 60,
    hp: 100,
    maxHp: 100,
    level: 1,
    attacking: false,
    ack: 0,
  });
});

test("holding a key moves the character, and the server reports the input it applied", async () => {
  const alice = await rt.player("alice", "Aria");
  const { socket } = await rt.open(asPlayer(alice));

  socket.emit("input", hold(1, { right: true }));
  const snap = await snapshotWhere(
    socket,
    (s) => me(s, alice.characterId).x > 100,
  );

  expect(me(snap, alice.characterId).ack).toBe(1);
});

test("a client cannot tell the server where it is", async () => {
  const alice = await rt.player("alice", "Aria");
  const { socket } = await rt.open(asPlayer(alice));

  socket.emit("input", { ...hold(1, { right: true }), x: 700, y: 500 }); // extra fields
  socket.emit("position", { x: 700, y: 500 }); // an event the server does not have
  socket.emit("input", "teleport");
  await wait(150);

  const snap = await snapshotWhere(socket, () => true);
  expect(me(snap, alice.characterId)).toMatchObject({ x: 100, y: 60, ack: 0 });
});

test("the server stops a player at a wall", async () => {
  const alice = await rt.player("alice", "Aria");
  const { socket } = await rt.open(asPlayer(alice));

  socket.emit("input", hold(1, { left: true }));
  await snapshotWhere(socket, (s) => me(s, alice.characterId).x < 100);
  await wait(150);

  const snap = await snapshotWhere(socket, () => true);
  expect(me(snap, alice.characterId).x).toBe(60); // the left wall is at x = 40
});

test("a player who disconnects leaves the world", async () => {
  const alice = await rt.player("alice", "Aria");
  const bob = await rt.player("bobby", "Borin");
  const a = await rt.open(asPlayer(alice));
  const b = await rt.open(asPlayer(bob));
  await snapshotWhere(a.socket, (s) => s.players.length === 2);

  b.socket.disconnect();

  const snap = await snapshotWhere(a.socket, (s) => s.players.length === 1);
  expect(snap.players[0].name).toBe("Aria");
});

test("a reconnecting player keeps their place but starts a fresh input sequence", async () => {
  const alice = await rt.player("alice", "Aria");
  const first = await rt.open(asPlayer(alice));
  first.socket.emit("input", hold(1, { right: true }));
  await snapshotWhere(first.socket, (s) => me(s, alice.characterId).x >= 120);

  const second = await rt.open(asPlayer(alice));
  const snap = await snapshotWhere(
    second.socket,
    (s) => me(s, alice.characterId) !== undefined,
  );

  expect(me(snap, alice.characterId).x).toBeGreaterThanOrEqual(120); // not back at 100
  expect(me(snap, alice.characterId).ack).toBe(0);
  second.socket.emit("input", hold(1, { right: true })); // seq 1 is accepted again
  await snapshotWhere(second.socket, (s) => me(s, alice.characterId).ack === 1);
});

// Runs a test against a server with its own (usually stricter) limits.
async function withServer(options, run) {
  const server = await startRealtime(options);
  try {
    await run(server);
  } finally {
    await server.close();
  }
}

// Listeners must be attached before the messages are sent.
const watch = (socket) => ({
  kicked: new Promise((resolve) => socket.once("kicked", resolve)),
  closed: new Promise((resolve) => socket.once("disconnect", resolve)),
});

const STRICT = { ratePerSecond: 1, burst: 5, maxViolations: 3 };

test("a normal burst of input is never blocked", async () => {
  const alice = await rt.player("alice", "Aria");
  const { socket } = await rt.open(asPlayer(alice));

  for (let seq = 1; seq <= 50; seq++)
    socket.emit("input", hold(seq, { right: seq % 2 === 0 }));

  await snapshotWhere(socket, (s) => me(s, alice.characterId).ack === 50);
  expect(socket.connected).toBe(true);
});

test("a client that floods the server is disconnected, and told why", async () => {
  await withServer({ guard: STRICT }, async (srv) => {
    const alice = await srv.player("alice", "Aria");
    const { socket } = await srv.open(asPlayer(alice));
    const { kicked, closed } = watch(socket);

    for (let seq = 1; seq <= 50; seq++)
      socket.emit("input", hold(seq, { right: true }));

    expect(await kicked).toEqual({ reason: "too_many_messages" });
    expect(await closed).toBe("io server disconnect");
  });
});

test("events the server does not know are violations", async () => {
  await withServer({ guard: { burst: 100, maxViolations: 3 } }, async (srv) => {
    const alice = await srv.player("alice", "Aria");
    const { socket } = await srv.open(asPlayer(alice));
    const { kicked } = watch(socket);

    for (let i = 0; i < 5; i++) socket.emit("teleport", { x: 700, y: 500 });

    expect((await kicked).reason).toBe("too_many_messages");
  });
});

test("malformed input is a violation", async () => {
  await withServer({ guard: { burst: 100, maxViolations: 3 } }, async (srv) => {
    const alice = await srv.player("alice", "Aria");
    const { socket } = await srv.open(asPlayer(alice));
    const { kicked } = watch(socket);

    for (let i = 0; i < 5; i++) socket.emit("input", "left");

    expect((await kicked).reason).toBe("too_many_messages");
  });
});

test("one mistake is forgiven, and the next good input still works", async () => {
  await withServer({ guard: { burst: 100, maxViolations: 3 } }, async (srv) => {
    const alice = await srv.player("alice", "Aria");
    const { socket } = await srv.open(asPlayer(alice));

    socket.emit("input", { seq: 1 }); // malformed
    socket.emit("input", hold(1, { right: true }));

    await snapshotWhere(socket, (s) => me(s, alice.characterId).ack === 1);
    expect(socket.connected).toBe(true);
  });
});

test("a repeated sequence number is ignored but never punished", async () => {
  await withServer({ guard: { burst: 100, maxViolations: 3 } }, async (srv) => {
    const alice = await srv.player("alice", "Aria");
    const { socket } = await srv.open(asPlayer(alice));

    socket.emit("input", hold(5, { right: true }));
    for (let i = 0; i < 10; i++) socket.emit("input", hold(5, { left: true })); // stale

    await snapshotWhere(socket, (s) => me(s, alice.characterId).ack === 5);
    await wait(100);
    expect(socket.connected).toBe(true);
  });
});

test("a message over the size limit closes the connection", async () => {
  const alice = await rt.player("alice", "Aria");
  const { socket } = await rt.open(asPlayer(alice));
  const closed = new Promise((resolve) => socket.once("disconnect", resolve));

  socket.emit("input", { ...hold(1), junk: "x".repeat(5000) });

  expect(await closed).toMatch(/transport/);
});

test("a flooding client does not disturb the others, and may connect again afterwards", async () => {
  await withServer({ guard: STRICT }, async (srv) => {
    const alice = await srv.player("alice", "Aria");
    const bob = await srv.player("bobby", "Borin");
    const a = await srv.open(asPlayer(alice));
    const b = await srv.open(asPlayer(bob));
    const { kicked } = watch(a.socket);

    for (let seq = 1; seq <= 50; seq++)
      a.socket.emit("input", hold(seq, { right: true }));
    await kicked;

    const snap = await snapshotWhere(b.socket, (s) => s.players.length === 1);
    expect(snap.players[0].name).toBe("Borin"); // the flooder left the world
    expect(b.socket.connected).toBe(true);

    const again = await srv.open(asPlayer(alice)); // a kick is not a ban
    expect(again.welcome).toBeDefined();
  });
});

const savedState = (srv, id) =>
  srv.db.one(
    "SELECT pos_x AS x, pos_y AS y, hp, score FROM characters WHERE id = $1",
    [id],
  );

test("a player's position is saved when they leave, and they return to it", async () => {
  const alice = await rt.player("alice", "Aria");
  const first = await rt.open(asPlayer(alice));
  first.socket.emit("input", hold(1, { right: true }));
  await snapshotWhere(first.socket, (s) => me(s, alice.characterId).x >= 150);

  first.socket.disconnect();
  await vi.waitFor(async () =>
    expect((await savedState(rt, alice.characterId)).x).toBeGreaterThanOrEqual(
      150,
    ),
  );

  const saved = await savedState(rt, alice.characterId);
  const second = await rt.open(asPlayer(alice));
  expect(second.welcome.character).toMatchObject({ x: saved.x, y: saved.y });
  const snap = await snapshotWhere(
    second.socket,
    (s) => me(s, alice.characterId) !== undefined,
  );
  expect(me(snap, alice.characterId).x).toBeCloseTo(saved.x, 1);
});

test("positions are also saved while a player stays connected", async () => {
  await withServer({ saveEveryMs: 30 }, async (srv) => {
    const alice = await srv.player("alice", "Aria");
    const { socket } = await srv.open(asPlayer(alice));

    socket.emit("input", hold(1, { right: true }));

    await vi.waitFor(async () =>
      expect((await savedState(srv, alice.characterId)).x).toBeGreaterThan(100),
    );
    expect(socket.connected).toBe(true);
  });
});

test("a player who is standing still is not written again and again", async () => {
  await withServer({ saveEveryMs: 20 }, async (srv) => {
    const alice = await srv.player("alice", "Aria");
    const run = vi.spyOn(srv.db, "run");
    await srv.open(asPlayer(alice));

    await wait(300); // many save intervals

    const updates = run.mock.calls.filter(([sql]) =>
      sql.trim().startsWith("UPDATE characters"),
    );
    expect(updates).toHaveLength(1);
  });
});

test("everyone who is connected is saved when the server disconnects them all", async () => {
  const alice = await rt.player("alice", "Aria");
  const bob = await rt.player("bobby", "Borin");
  const a = await rt.open(asPlayer(alice));
  const b = await rt.open(asPlayer(bob));
  a.socket.emit("input", hold(1, { right: true }));
  b.socket.emit("input", hold(1, { left: true }));
  await snapshotWhere(
    a.socket,
    (s) => me(s, alice.characterId).x >= 150 && me(s, bob.characterId).x <= 70,
  );

  rt.io.disconnectSockets(true); // what closing the server does to every player

  await vi.waitFor(async () => {
    expect((await savedState(rt, alice.characterId)).x).toBeGreaterThanOrEqual(
      150,
    );
    expect((await savedState(rt, bob.characterId)).x).toBeLessThanOrEqual(70);
  });
});

test("a player kicked for abuse is saved too", async () => {
  await withServer({ guard: STRICT }, async (srv) => {
    const alice = await srv.player("alice", "Aria");
    const { socket } = await srv.open(asPlayer(alice));

    // Walk first, so there is a position worth saving.
    socket.emit("input", hold(1, { right: true }));
    await snapshotWhere(socket, (s) => me(s, alice.characterId).x >= 120);
    expect((await savedState(srv, alice.characterId)).x).toBe(100); // nothing has been saved yet

    const { kicked } = watch(socket);
    for (let seq = 2; seq <= 50; seq++)
      socket.emit("input", hold(seq, { right: true }));
    await kicked;

    await vi.waitFor(async () =>
      expect(
        (await savedState(srv, alice.characterId)).x,
      ).toBeGreaterThanOrEqual(120),
    );
  });
});

test("a failed save is logged, and the game carries on", async () => {
  const { lines, logger } = createLogCapture();
  await withServer({ saveEveryMs: 20, logger }, async (srv) => {
    const alice = await srv.player("alice", "Aria");
    const { socket } = await srv.open(asPlayer(alice));

    await srv.db.run("DROP TABLE characters CASCADE"); // saving fails from now on
    socket.emit("input", hold(1, { right: true })); // a change, so the next save really tries to write

    await vi.waitFor(() =>
      expect(lines.some((l) => l.msg === "could not save character")).toBe(
        true,
      ),
    );
    await snapshotWhere(socket, () => true); // the world is still running
    expect(socket.connected).toBe(true);
  });
});

// One goblin a tile from the spawn point, so tests can fight without walking.
const NEAR_GOBLIN = {
  types: MONSTERS.types,
  spawns: [{ type: "goblin", col: 3, row: 1 }],
};

// Attacks every 50 ms until the goblin dies; resolves with the `progress` message.
async function killGoblin(socket) {
  const progress = new Promise((resolve) => socket.once("progress", resolve));
  const timer = setInterval(() => socket.emit("attack"), 50);
  try {
    return await progress;
  } finally {
    clearInterval(timer);
  }
}

test("the welcome carries the XP table", async () => {
  const alice = await rt.player("alice", "Aria");
  const { welcome } = await rt.open(asPlayer(alice));
  expect(welcome.levels[0]).toEqual({ level: 1, xpRequired: 0, maxHp: 100 });
});

test("goblins appear in snapshots, far from the spawn point by default", async () => {
  const alice = await rt.player("alice", "Aria");
  const { socket } = await rt.open(asPlayer(alice));
  const snap = await snapshotWhere(socket, (s) => s.monsters?.length > 0);
  expect(snap.monsters[0]).toMatchObject({ type: "goblin", hp: 40, maxHp: 40 });
  expect(snap.monsters.every((m) => m.x > 300)).toBe(true);
});

test("an attack with nothing in reach is refused without penalty", async () => {
  const alice = await rt.player("alice", "Aria");
  const { socket } = await rt.open(asPlayer(alice));
  const rejected = hear(socket, "attack_rejected");

  socket.emit("attack");

  await vi.waitFor(() => expect(rejected).toEqual([{ reason: "no_target" }]));
  expect(socket.connected).toBe(true);
});

test("killing a goblin gives XP, which is the score, saved and shown on the leaderboard", async () => {
  await withServer({ monsters: NEAR_GOBLIN }, async (srv) => {
    const alice = await srv.player("alice", "Aria");
    const { socket } = await srv.open(asPlayer(alice));

    expect(await killGoblin(socket)).toEqual({
      level: 1,
      xp: 25,
      leveledUp: false,
    });
    socket.disconnect(); // leaving saves the character

    await vi.waitFor(async () =>
      expect(await savedState(srv, alice.characterId)).toMatchObject({
        score: 25,
      }),
    );
    const row = await srv.db.one(
      "SELECT level, xp FROM characters WHERE id = $1",
      [alice.characterId],
    );
    expect(row).toEqual({ level: 1, xp: 25 });
    const res = await fetch(`${srv.url}/api/leaderboard`, {
      headers: { Cookie: alice.cookie },
    });
    expect(await res.json()).toEqual([
      { rank: 1, name: "Aria", level: 1, score: 25 },
    ]);
  });
});

test("a player who dies is told, and returns to the spawn point with full health", async () => {
  const brute = {
    name: "Brute",
    maxHp: 999,
    damage: 999,
    xp: 1,
    attackRange: 44,
    cooldownMs: 100,
    respawnSeconds: 1,
  };
  const monsters = {
    types: { brute },
    spawns: [{ type: "brute", col: 3, row: 1 }],
  };
  await withServer({ monsters }, async (srv) => {
    const alice = await srv.player("alice", "Aria");
    const { socket } = await srv.open(asPlayer(alice));
    const died = new Promise((resolve) => socket.once("died", resolve));

    expect(await died).toEqual({ by: "Brute" });
    const snap = await snapshotWhere(socket, () => true);
    expect(me(snap, alice.characterId)).toMatchObject({
      hp: 100,
      maxHp: 100,
      level: 1,
    });
  });
});

test("a malformed attack is a violation", async () => {
  await withServer({ guard: { burst: 100, maxViolations: 3 } }, async (srv) => {
    const alice = await srv.player("alice", "Aria");
    const { socket } = await srv.open(asPlayer(alice));
    const { kicked } = watch(socket);

    for (let i = 0; i < 5; i++) socket.emit("attack", { target: 1 });

    expect((await kicked).reason).toBe("too_many_messages");
  });
});

const PASSWORD = "correct-horse-battery";
const postJson = (url, path, body, cookie) =>
  fetch(url + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
const cookieOf = (res) => res.headers.getSetCookie()[0].split(";")[0];

test("a login that replaces a session ends that session's game connection", async () => {
  const alice = await rt.player("alice", "Aria");
  const { socket } = await rt.open(asPlayer(alice));
  const closed = new Promise((resolve) => socket.once("disconnect", resolve));

  // Someone else logs in in the same browser, which sends Alice's cookie.
  await postJson(rt.url, "/api/register", {
    username: "carol",
    password: PASSWORD,
  });
  const res = await postJson(
    rt.url,
    "/api/login",
    { username: "carol", password: PASSWORD },
    alice.cookie,
  );

  expect(res.status).toBe(200);
  expect(await closed).toBe("io server disconnect");
});

test("a login without an earlier session disconnects nobody", async () => {
  const alice = await rt.player("alice", "Aria");
  const { socket } = await rt.open(asPlayer(alice));

  await postJson(rt.url, "/api/register", {
    username: "carol",
    password: PASSWORD,
  });
  await postJson(rt.url, "/api/login", {
    username: "carol",
    password: PASSWORD,
  }); // no cookie
  await wait(200);

  expect(socket.connected).toBe(true);
});

test("a failed login does not end the game connection", async () => {
  const alice = await rt.player("alice", "Aria");
  const { socket } = await rt.open(asPlayer(alice));

  await postJson(rt.url, "/api/register", {
    username: "carol",
    password: PASSWORD,
  });
  const res = await postJson(
    rt.url,
    "/api/login",
    { username: "carol", password: "definitely-not-it" },
    alice.cookie,
  );
  await wait(200);

  expect(res.status).toBe(401);
  expect(socket.connected).toBe(true);
});

test("logging in again as the same user ends the old connection, and the new cookie plays", async () => {
  await postJson(rt.url, "/api/register", {
    username: "carol",
    password: PASSWORD,
  });
  const first = cookieOf(
    await postJson(rt.url, "/api/login", {
      username: "carol",
      password: PASSWORD,
    }),
  );
  const created = await postJson(
    rt.url,
    "/api/characters",
    { name: "Cara" },
    first,
  );
  const characterId = (await created.json()).id;
  const { socket } = await rt.open({ cookie: first, auth: { characterId } });
  const closed = new Promise((resolve) => socket.once("disconnect", resolve));

  const second = cookieOf(
    await postJson(
      rt.url,
      "/api/login",
      { username: "carol", password: PASSWORD },
      first,
    ),
  );

  expect(await closed).toBe("io server disconnect");
  const again = await rt.open({ cookie: second, auth: { characterId } });
  expect(again.welcome).toBeDefined();
});

// Everything a socket hears on `event`, collected as it arrives.
function hear(socket, event) {
  const heard = [];
  socket.on(event, (payload) => heard.push(payload));
  return heard;
}
const said = (heard) => heard.map((m) => m.text);

test("a chat message reaches nearby players and the speaker, trimmed and stamped", async () => {
  const alice = await rt.player("alice", "Aria");
  const bob = await rt.player("bobby", "Borin");
  const a = await rt.open(asPlayer(alice));
  const b = await rt.open(asPlayer(bob));
  const heardByA = hear(a.socket, "chat");
  const heardByB = hear(b.socket, "chat");

  a.socket.emit("chat", { text: "  hello there  " });

  await vi.waitFor(() => expect(heardByB).toHaveLength(1));
  await vi.waitFor(() => expect(heardByA).toHaveLength(1));
  const message = heardByB[0];
  expect(message).toMatchObject({
    from: { id: alice.characterId, name: "Aria" },
    text: "hello there",
  });
  expect(message.id).toEqual(expect.any(String));
  expect(Date.parse(message.at)).not.toBeNaN();
  expect(heardByA[0].id).toBe(message.id); // the speaker hears the same message
});

test("players out of range do not hear the message", async () => {
  const alice = await rt.player("alice", "Aria");
  const bob = await rt.player("bobby", "Borin");
  const a = await rt.open(asPlayer(alice));
  const b = await rt.open(asPlayer(bob));

  // Bob walks more than 8 tiles to the right.
  for (let seq = 1; seq <= 4; seq++) {
    b.socket.emit("input", hold(seq, { right: true }));
    await wait(150);
  }
  await snapshotWhere(b.socket, (s) => me(s, bob.characterId).x > 100 + 320);
  const heardByB = hear(b.socket, "chat");
  const heardByA = hear(a.socket, "chat");

  a.socket.emit("chat", { text: "anyone here?" });

  await vi.waitFor(() => expect(heardByA).toHaveLength(1));
  await wait(100);
  expect(heardByB).toEqual([]);
});

test("the server passes text through unchanged: escaping it is the client's job", async () => {
  const alice = await rt.player("alice", "Aria");
  const a = await rt.open(asPlayer(alice));
  const heard = hear(a.socket, "chat");

  a.socket.emit("chat", { text: "<img src=x onerror=alert(1)>" });

  await vi.waitFor(() =>
    expect(said(heard)).toEqual(["<img src=x onerror=alert(1)>"]),
  );
});

test("an invalid message is refused to the sender only, and is not a violation", async () => {
  await withServer({ guard: { burst: 100, maxViolations: 3 } }, async (srv) => {
    const alice = await srv.player("alice", "Aria");
    const bob = await srv.player("bobby", "Borin");
    const a = await srv.open(asPlayer(alice));
    const b = await srv.open(asPlayer(bob));
    const rejected = hear(a.socket, "chat_rejected");
    const heardByB = hear(b.socket, "chat");

    for (const text of [
      "   ",
      "x".repeat(201),
      "two\nlines",
      "evil\u202Eecaf",
    ]) {
      a.socket.emit("chat", { text });
    }

    await vi.waitFor(() => expect(rejected).toHaveLength(4));
    expect(rejected.every((r) => r.reason === "invalid")).toBe(true);
    expect(heardByB).toEqual([]);
    expect(a.socket.connected).toBe(true); // four mistakes, and not kicked
  });
});

test("more than five messages in a burst are refused as too fast", async () => {
  const alice = await rt.player("alice", "Aria");
  const a = await rt.open(asPlayer(alice));
  const heard = hear(a.socket, "chat");
  const rejected = hear(a.socket, "chat_rejected");

  for (let i = 1; i <= 7; i++) a.socket.emit("chat", { text: `message ${i}` });

  await vi.waitFor(() => expect(rejected).toHaveLength(2));
  expect(said(heard)).toEqual([
    "message 1",
    "message 2",
    "message 3",
    "message 4",
    "message 5",
  ]);
  expect(rejected.map((r) => r.reason)).toEqual(["too_fast", "too_fast"]);
});

test("a malformed chat event is a violation", async () => {
  await withServer({ guard: { burst: 100, maxViolations: 3 } }, async (srv) => {
    const alice = await srv.player("alice", "Aria");
    const { socket } = await srv.open(asPlayer(alice));
    const { kicked } = watch(socket);

    for (let i = 0; i < 5; i++) socket.emit("chat", "hello");

    expect((await kicked).reason).toBe("too_many_messages");
  });
});

const groundItem = async (socket, code) =>
  (
    await snapshotWhere(socket, (s) => s.items?.some((i) => i.item === code))
  ).items.find((i) => i.item === code);

test("a new character's welcome carries an empty inventory", async () => {
  const alice = await rt.player("alice", "Aria");
  const { welcome } = await rt.open(asPlayer(alice));
  expect(welcome.inventory).toEqual([]);
});

test("picking up an item within reach saves it, and it vanishes for everyone", async () => {
  const alice = await rt.player("alice", "Aria");
  const bob = await rt.player("bobby", "Borin");
  const a = await rt.open(asPlayer(alice));
  const b = await rt.open(asPlayer(bob));
  const gold = await groundItem(a.socket, "gold_coin"); // one tile from the spawn point
  const changed = new Promise((resolve) => a.socket.once("inventory", resolve));

  a.socket.emit("pickup", { id: gold.id });

  expect(await changed).toEqual({
    items: [
      {
        code: "gold_coin",
        name: "Gold coin",
        description: expect.any(String),
        quantity: 1,
      },
    ],
  });
  await snapshotWhere(b.socket, (s) => !s.items.some((i) => i.id === gold.id));
  const again = await rt.open(asPlayer(alice)); // a new connection reads what was saved
  expect(again.welcome.inventory).toEqual([
    expect.objectContaining({ code: "gold_coin", quantity: 1 }),
  ]);
});

test("two players reaching for the same item: exactly one gets it", async () => {
  const alice = await rt.player("alice", "Aria");
  const bob = await rt.player("bobby", "Borin");
  const a = await rt.open(asPlayer(alice));
  const b = await rt.open(asPlayer(bob));
  const gold = await groundItem(a.socket, "gold_coin");
  const outcomes = [];
  for (const { socket } of [a, b]) {
    socket.once("inventory", () => outcomes.push("got it"));
    socket.once("pickup_rejected", ({ reason }) => outcomes.push(reason));
  }

  a.socket.emit("pickup", { id: gold.id });
  b.socket.emit("pickup", { id: gold.id });

  await vi.waitFor(() => expect(outcomes).toHaveLength(2));
  expect(outcomes.sort()).toEqual(["gone", "got it"]);
  expect(
    (
      await rt.db.one(
        "SELECT CAST(SUM(quantity) AS integer) AS total FROM inventory",
      )
    ).total,
  ).toBe(1);
});

test("an item out of reach, or one that does not exist, is refused without penalty", async () => {
  const alice = await rt.player("alice", "Aria");
  const a = await rt.open(asPlayer(alice));
  const wood = await groundItem(a.socket, "wood"); // eight tiles away
  const rejected = hear(a.socket, "pickup_rejected");

  a.socket.emit("pickup", { id: wood.id });
  a.socket.emit("pickup", { id: 999 });

  await vi.waitFor(() =>
    expect(rejected.map((r) => r.reason)).toEqual(["too_far", "gone"]),
  );
  expect(a.socket.connected).toBe(true);
});

test("a malformed pickup is a violation", async () => {
  await withServer({ guard: { burst: 100, maxViolations: 3 } }, async (srv) => {
    const alice = await srv.player("alice", "Aria");
    const { socket } = await srv.open(asPlayer(alice));
    const { kicked } = watch(socket);

    for (let i = 0; i < 5; i++) socket.emit("pickup", { id: "1" });

    expect((await kicked).reason).toBe("too_many_messages");
  });
});

test("if the inventory cannot be saved, the item stays on the ground", async () => {
  await withServer({}, async (srv) => {
    const alice = await srv.player("alice", "Aria");
    const { socket } = await srv.open(asPlayer(alice));
    const gold = await groundItem(socket, "gold_coin");
    const rejected = new Promise((resolve) =>
      socket.once("pickup_rejected", resolve),
    );

    await srv.db.run("DROP TABLE inventory"); // saving fails from now on
    socket.emit("pickup", { id: gold.id });

    expect(await rejected).toEqual({ reason: "error" });
    const snap = await snapshotWhere(socket, () => true);
    expect(snap.items.some((i) => i.id === gold.id)).toBe(true);
  });
});

// Everything a socket hears about trading.
const tradeEvents = (socket) => ({
  offered: hear(socket, "trade_offered"),
  sent: hear(socket, "trade_sent"),
  results: hear(socket, "trade_result"),
  inventory: hear(socket, "inventory"),
});
const goldOf = async (srv, characterId) =>
  (
    await srv.db.one(
      `SELECT CAST(COALESCE(SUM(inventory.quantity), 0) AS integer) AS n
         FROM inventory JOIN items ON items.id = inventory.item_id
        WHERE items.code = 'gold_coin' AND inventory.character_id = $1`,
      [characterId],
    )
  ).n;
const carried = (events) =>
  Object.fromEntries(
    events.inventory.at(-1).items.map((i) => [i.code, i.quantity]),
  );

test("the welcome carries the catalog of every item", async () => {
  const alice = await rt.player("alice", "Aria");
  const { welcome } = await rt.open(asPlayer(alice));
  expect(welcome.catalog).toEqual(
    expect.arrayContaining([{ code: "gold_coin", name: "Gold coin" }]),
  );
});

test("an offer reaches the other player, and accepting it moves items both ways", async () => {
  const alice = await rt.player("alice", "Aria");
  const bob = await rt.player("bobby", "Borin");
  await addItem(rt.db, alice.characterId, "gold_coin", 3);
  await addItem(rt.db, bob.characterId, "wood", 2);
  const a = await rt.open(asPlayer(alice));
  const b = await rt.open(asPlayer(bob));
  const ea = tradeEvents(a.socket);
  const eb = tradeEvents(b.socket);

  a.socket.emit("trade_offer", {
    to: bob.characterId,
    give: [{ code: "gold_coin", quantity: 2 }],
    want: [{ code: "wood", quantity: 1 }],
  });

  await vi.waitFor(() => expect(eb.offered).toHaveLength(1));
  const offer = eb.offered[0];
  expect(offer).toMatchObject({
    from: { id: alice.characterId, name: "Aria" },
    give: [{ code: "gold_coin", name: "Gold coin", quantity: 2 }],
    want: [{ code: "wood", name: "Wood", quantity: 1 }],
  });
  await vi.waitFor(() => expect(ea.sent.map((s) => s.id)).toEqual([offer.id]));

  b.socket.emit("trade_accept", { id: offer.id });

  await vi.waitFor(() =>
    expect(ea.results).toEqual([{ id: offer.id, ok: true }]),
  );
  await vi.waitFor(() =>
    expect(eb.results).toEqual([{ id: offer.id, ok: true }]),
  );
  await vi.waitFor(() => expect(ea.inventory).toHaveLength(1));
  await vi.waitFor(() => expect(eb.inventory).toHaveLength(1));
  expect(carried(ea)).toEqual({ gold_coin: 1, wood: 1 });
  expect(carried(eb)).toEqual({ gold_coin: 2, wood: 1 });
});

test("the same coins offered to two players and accepted at once are traded only once", async () => {
  const alice = await rt.player("alice", "Aria");
  const bob = await rt.player("bobby", "Borin");
  const carol = await rt.player("carol", "Cara");
  await addItem(rt.db, alice.characterId, "gold_coin", 3);
  const a = await rt.open(asPlayer(alice));
  const b = await rt.open(asPlayer(bob));
  const c = await rt.open(asPlayer(carol));
  const ea = tradeEvents(a.socket);
  const eb = tradeEvents(b.socket);
  const ec = tradeEvents(c.socket);
  const allMyGold = [{ code: "gold_coin", quantity: 3 }];

  a.socket.emit("trade_offer", {
    to: bob.characterId,
    give: allMyGold,
    want: [],
  });
  a.socket.emit("trade_offer", {
    to: carol.characterId,
    give: allMyGold,
    want: [],
  });
  await vi.waitFor(() => expect(eb.offered.length + ec.offered.length).toBe(2));

  b.socket.emit("trade_accept", { id: eb.offered[0].id });
  c.socket.emit("trade_accept", { id: ec.offered[0].id });

  await vi.waitFor(() => expect(ea.results).toHaveLength(2));
  expect(ea.results.map((r) => (r.ok ? "ok" : r.reason)).sort()).toEqual([
    "missing_items",
    "ok",
  ]);
  const total =
    (await goldOf(rt, alice.characterId)) +
    (await goldOf(rt, bob.characterId)) +
    (await goldOf(rt, carol.characterId));
  expect(total).toBe(3); // no coin was created
});

test("only the receiver may accept or decline, only the sender may cancel, and an answer is final", async () => {
  const alice = await rt.player("alice", "Aria");
  const bob = await rt.player("bobby", "Borin");
  const carol = await rt.player("carol", "Cara");
  await addItem(rt.db, alice.characterId, "gold_coin", 3);
  const a = await rt.open(asPlayer(alice));
  const b = await rt.open(asPlayer(bob));
  const c = await rt.open(asPlayer(carol));
  const ea = tradeEvents(a.socket);
  const eb = tradeEvents(b.socket);
  const ec = tradeEvents(c.socket);
  const coin = [{ code: "gold_coin", quantity: 1 }];

  a.socket.emit("trade_offer", { to: bob.characterId, give: coin, want: [] });
  await vi.waitFor(() => expect(eb.offered).toHaveLength(1));
  const id = eb.offered[0].id;

  c.socket.emit("trade_accept", { id }); // not addressed to Carol
  a.socket.emit("trade_accept", { id }); // a sender cannot accept their own offer
  b.socket.emit("trade_cancel", { id }); // only the sender can cancel
  await vi.waitFor(() =>
    expect(ec.results).toEqual([{ id, ok: false, reason: "gone" }]),
  );
  await vi.waitFor(() =>
    expect(ea.results).toEqual([{ id, ok: false, reason: "gone" }]),
  );
  await vi.waitFor(() =>
    expect(eb.results).toEqual([{ id, ok: false, reason: "gone" }]),
  );

  b.socket.emit("trade_decline", { id });
  await vi.waitFor(() =>
    expect(ea.results.at(-1)).toEqual({ id, ok: false, reason: "declined" }),
  );
  b.socket.emit("trade_accept", { id }); // too late
  await vi.waitFor(() =>
    expect(eb.results.at(-1)).toEqual({ id, ok: false, reason: "gone" }),
  );

  a.socket.emit("trade_offer", { to: bob.characterId, give: coin, want: [] });
  await vi.waitFor(() => expect(eb.offered).toHaveLength(2));
  const second = eb.offered[1].id;
  a.socket.emit("trade_cancel", { id: second });
  await vi.waitFor(() =>
    expect(eb.results.at(-1)).toEqual({
      id: second,
      ok: false,
      reason: "cancelled",
    }),
  );

  expect(await goldOf(rt, alice.characterId)).toBe(3); // nothing moved
});

test("offers that cannot work are refused to the sender, without penalty", async () => {
  const alice = await rt.player("alice", "Aria");
  const bob = await rt.player("bobby", "Borin");
  const carol = await rt.player("carol", "Cara"); // registered, but not playing
  await addItem(rt.db, alice.characterId, "gold_coin", 1);
  const a = await rt.open(asPlayer(alice));
  await rt.open(asPlayer(bob));
  const results = hear(a.socket, "trade_result");
  const offer = (to, code, quantity) =>
    a.socket.emit("trade_offer", { to, give: [{ code, quantity }], want: [] });

  offer(alice.characterId, "gold_coin", 1); // to yourself
  offer(bob.characterId, "dragon_egg", 1); // no such item
  offer(carol.characterId, "gold_coin", 1); // not playing
  offer(bob.characterId, "gold_coin", 5); // more than she has

  await vi.waitFor(() =>
    expect(results.map((r) => r.reason)).toEqual([
      "invalid",
      "invalid",
      "not_here",
      "missing_items",
    ]),
  );
  expect(results.every((r) => r.id === null && r.ok === false)).toBe(true);

  for (let i = 0; i < 4; i++) offer(bob.characterId, "gold_coin", 1);
  await vi.waitFor(() =>
    expect(results.at(-1)?.reason).toBe("too_many_offers"),
  );
  expect(a.socket.connected).toBe(true);
});

test("an offer to a player who is too far away is refused", async () => {
  const alice = await rt.player("alice", "Aria");
  const bob = await rt.player("bobby", "Borin");
  await addItem(rt.db, alice.characterId, "gold_coin", 1);
  const a = await rt.open(asPlayer(alice));
  const b = await rt.open(asPlayer(bob));
  for (let seq = 1; seq <= 2; seq++) {
    b.socket.emit("input", hold(seq, { right: true }));
    await wait(150);
  }
  await snapshotWhere(
    b.socket,
    (s) => me(s, bob.characterId).x > 100 + 96 + 10,
  );
  const results = hear(a.socket, "trade_result");

  a.socket.emit("trade_offer", {
    to: bob.characterId,
    give: [{ code: "gold_coin", quantity: 1 }],
    want: [],
  });

  await vi.waitFor(() =>
    expect(results.map((r) => r.reason)).toEqual(["too_far"]),
  );
});

test("a malformed trade message is a violation", async () => {
  await withServer({ guard: { burst: 100, maxViolations: 3 } }, async (srv) => {
    const alice = await srv.player("alice", "Aria");
    const { socket } = await srv.open(asPlayer(alice));
    const { kicked } = watch(socket);

    for (let i = 0; i < 5; i++)
      socket.emit("trade_offer", { to: 2, give: "everything", want: [] });

    expect((await kicked).reason).toBe("too_many_messages");
  });
});

test("when the sender leaves, the receiver is told the offer is gone", async () => {
  const alice = await rt.player("alice", "Aria");
  const bob = await rt.player("bobby", "Borin");
  await addItem(rt.db, alice.characterId, "gold_coin", 1);
  const a = await rt.open(asPlayer(alice));
  const b = await rt.open(asPlayer(bob));
  const eb = tradeEvents(b.socket);
  a.socket.emit("trade_offer", {
    to: bob.characterId,
    give: [{ code: "gold_coin", quantity: 1 }],
    want: [],
  });
  await vi.waitFor(() => expect(eb.offered).toHaveLength(1));

  a.socket.disconnect();

  await vi.waitFor(() =>
    expect(eb.results).toEqual([
      { id: eb.offered[0].id, ok: false, reason: "gone" },
    ]),
  );
});
