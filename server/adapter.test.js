import { test, describe, expect, afterAll, afterEach } from "vitest";
import crypto from "node:crypto";
import { createServer } from "node:http";
import { io as connectClient } from "socket.io-client";
import { createAdapter } from "@socket.io/redis-adapter";
import { RedisStore } from "connect-redis";
import { openTestDb } from "./pg/test-db.js";
import { createApp } from "./app.js";
import { attachRealtime } from "./realtime.js";
import { createCharacter } from "./characters.js";
import { findUserByUsername } from "./users.js";
import { probeRedis } from "./redis-test-helpers.js";
import { TEST_ORIGIN } from "./test-helpers.js";

const redis = await probeRedis();
afterAll(async () => {
  await redis?.close();
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PASSWORD = "correct-horse-battery";

describe.skipIf(!redis)("two game servers sharing Redis", () => {
  const unique = crypto.randomUUID();
  const sessionPrefix = `test:${unique}:sess:`;
  const channelKey = `test:${unique}:io`; // the adapter's channel prefix
  const cleanups = []; // run in reverse order after every test

  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()();
    const keys = await redis.keys(`${sessionPrefix}*`);
    if (keys.length) await redis.del(keys);
  });

  const newDb = async () => {
    const db = await openTestDb();
    cleanups.push(() => db.close());
    return db;
  };

  // One complete game server: its own Express app, HTTP server and Socket.IO
  // server. Sessions live in the shared Redis, so a cookie works on both.
  async function startServer(db, { withAdapter }) {
    const app = createApp(db, {
      bcryptCost: 4,
      sessionSecret: "test-secret",
      allowedOrigins: [TEST_ORIGIN],
      sessionStore: new RedisStore({ client: redis, prefix: sessionPrefix }),
    });
    const httpServer = createServer(app);

    let adapter;
    if (withAdapter) {
      const publisher = redis.duplicate();
      const subscriber = redis.duplicate();
      publisher.on("error", () => {});
      subscriber.on("error", () => {});
      await Promise.all([publisher.connect(), subscriber.connect()]);
      adapter = createAdapter(publisher, subscriber, { key: channelKey });
      cleanups.push(async () => {
        await publisher.close();
        await subscriber.close();
      });
    }

    const io = await attachRealtime(httpServer, {
      app,
      db,
      allowedOrigins: [TEST_ORIGIN],
      tickMs: 20,
      adapter,
    });
    await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    cleanups.push(() => io.close()); // also closes the HTTP server
    return { io, url: `http://127.0.0.1:${httpServer.address().port}` };
  }

  // Registers and logs in on `server`, and gives the user a character in the shared database.
  async function player(server, db, username, characterName) {
    const post = (path) =>
      fetch(server.url + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: PASSWORD }),
      });
    await post("/api/register");
    const login = await post("/api/login");
    const cookie = login.headers.getSetCookie()[0].split(";")[0];
    const user = await findUserByUsername(db, username);
    return {
      cookie,
      characterId: (await createCharacter(db, user.id, characterName)).id,
    };
  }

  // Connects a player to a server, and records every snapshot, event and disconnect.
  async function connect(server, who) {
    const socket = connectClient(server.url, {
      transports: ["websocket"],
      extraHeaders: { cookie: who.cookie, origin: TEST_ORIGIN },
      auth: { characterId: who.characterId },
      reconnection: false,
      forceNew: true,
    });
    cleanups.push(() => socket.disconnect());
    const seen = { snapshots: [], events: [], replaced: false };
    socket.on("snapshot", (s) => seen.snapshots.push(s));
    socket.on("hello", (message) => seen.events.push(message));
    socket.on("replaced", () => (seen.replaced = true));
    await new Promise((resolve, reject) => {
      socket.once("welcome", resolve);
      socket.once("connect_error", reject);
    });
    return { socket, seen };
  }

  // Which different groups of players this client has been shown (as sorted id lists).
  const worldsSeen = (snapshots) =>
    [
      ...new Set(
        snapshots.map((s) =>
          s.players
            .map((p) => p.id)
            .sort((a, b) => a - b)
            .join(","),
        ),
      ),
    ].sort();

  async function twoServers(withAdapter) {
    const db = await newDb();
    const A = await startServer(db, { withAdapter });
    const B = await startServer(db, { withAdapter });
    return { db, A, B };
  }

  test("a login on one server is accepted by the other, because sessions are in Redis", async () => {
    const { db, A, B } = await twoServers(false);
    const alice = await player(A, db, "alice", "Aria");

    const onB = await connect(B, alice); // the cookie was issued by A

    expect(onB.socket.connected).toBe(true);
  });

  test("each server runs its own world: a player on one does not appear on the other", async () => {
    const { db, A, B } = await twoServers(false);
    const alice = await player(A, db, "alice", "Aria");
    const bob = await player(B, db, "bobby", "Borin");
    const a = await connect(A, alice);
    const b = await connect(B, bob);

    await wait(300);

    expect(a.seen.snapshots.length).toBeGreaterThan(3);
    expect(worldsSeen(a.seen.snapshots)).toEqual([String(alice.characterId)]);
    expect(worldsSeen(b.seen.snapshots)).toEqual([String(bob.characterId)]);
  });

  test("with the adapter on, every client is sent both servers' worlds, mixed together", async () => {
    const { db, A, B } = await twoServers(true);
    const alice = await player(A, db, "alice", "Aria");
    const bob = await player(B, db, "bobby", "Borin");
    const a = await connect(A, alice);
    const b = await connect(B, bob);

    await wait(400);

    const both = [String(alice.characterId), String(bob.characterId)].sort();
    expect(worldsSeen(a.seen.snapshots)).toEqual(both); // Alice's client also hears Bob's world
    expect(worldsSeen(b.seen.snapshots)).toEqual(both);
  });

  // io.to("world").emit(...) is how the game sends every snapshot.
  async function broadcastReachesTheOtherServer(withAdapter) {
    const { db, A, B } = await twoServers(withAdapter);
    const bob = await player(B, db, "bobby", "Borin");
    const onB = await connect(B, bob);

    A.io.to("world").emit("hello", "from server A");
    await wait(250);

    return onB.seen.events.includes("from server A");
  }

  test("a broadcast through one server stays on that server without the adapter", async () => {
    expect(await broadcastReachesTheOtherServer(false)).toBe(false);
  });

  test("a broadcast through one server reaches the other server's clients with the adapter", async () => {
    expect(await broadcastReachesTheOtherServer(true)).toBe(true);
  });

  // Logging out on one server ends the session's game sockets. Do the ones on the other server end too?
  async function logoutEndsSocketsOnTheOtherServer(withAdapter) {
    const { db, A, B } = await twoServers(withAdapter);
    const alice = await player(A, db, "alice", "Aria");
    const onB = await connect(B, alice);
    const closed = new Promise((resolve) =>
      onB.socket.once("disconnect", () => resolve(true)),
    );

    await fetch(`${A.url}/api/logout`, {
      method: "POST",
      headers: { Cookie: alice.cookie },
    });

    return Promise.race([closed, wait(500).then(() => false)]);
  }

  test("without the adapter, a logout on one server leaves the session's socket on the other open", async () => {
    expect(await logoutEndsSocketsOnTheOtherServer(false)).toBe(false);
  });

  test("with the adapter, a logout on one server ends the session's socket on the other", async () => {
    expect(await logoutEndsSocketsOnTheOtherServer(true)).toBe(true);
  });

  test("the same character can be online on both servers at once: replacement is per process", async () => {
    const { db, A, B } = await twoServers(false);
    const alice = await player(A, db, "alice", "Aria");

    const first = await connect(A, alice);
    await connect(B, alice); // on one server this would replace the first connection
    await wait(300);

    expect(first.socket.connected).toBe(true);
    expect(first.seen.replaced).toBe(false);
  });
});
