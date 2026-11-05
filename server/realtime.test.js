import { test, expect, beforeEach, afterEach } from "vitest";
import { startRealtime } from "./realtime-test-helpers.js";
import { TEST_ORIGIN } from "./test-helpers.js";

let rt;
beforeEach(async () => {
  rt = await startRealtime();
});
afterEach(() => rt.close());

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
  rt.db.exec("DROP TABLE characters"); // the user and session still work
  const { error } = await rt.open(asPlayer(alice));
  expect(error.data.code).toBe("internal_error");
  expect(error.message).not.toMatch(/no such table/);
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

  for (let seq = 1; seq <= 50; seq++) socket.emit("input", hold(seq, { right: seq % 2 === 0 }));

  await snapshotWhere(socket, (s) => me(s, alice.characterId).ack === 50);
  expect(socket.connected).toBe(true);
});

test("a client that floods the server is disconnected, and told why", async () => {
  await withServer({ guard: STRICT }, async (srv) => {
    const alice = await srv.player("alice", "Aria");
    const { socket } = await srv.open(asPlayer(alice));
    const { kicked, closed } = watch(socket);

    for (let seq = 1; seq <= 50; seq++) socket.emit("input", hold(seq, { right: true }));

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

    for (let seq = 1; seq <= 50; seq++) a.socket.emit("input", hold(seq, { right: true }));
    await kicked;

    const snap = await snapshotWhere(b.socket, (s) => s.players.length === 1);
    expect(snap.players[0].name).toBe("Borin"); // the flooder left the world
    expect(b.socket.connected).toBe(true);

    const again = await srv.open(asPlayer(alice)); // a kick is not a ban
    expect(again.welcome).toBeDefined();
  });
});