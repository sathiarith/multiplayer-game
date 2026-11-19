import { test, describe, expect, afterAll, afterEach } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import { createClient } from "redis";
import { RedisStore } from "connect-redis";
import { openTestDb } from "./pg/test-db.js";
import { createApp } from "./app.js";
import { connectRedis } from "./redis.js";
import { startRealtime } from "./realtime-test-helpers.js";
import { ALICE } from "./test-helpers.js";

const SECRET = "test-secret";
const REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379";
const BOB = { username: "bobby", password: "correct-horse-battery" };
const DAY = 24 * 60 * 60;

const cookieOf = (res) => res.headers["set-cookie"][0].split(";")[0];

// Is a Redis server reachable? The Redis tests are skipped when it is not.
async function probe() {
  const client = createClient({
    url: REDIS_URL,
    socket: { connectTimeout: 500, reconnectStrategy: false },
  });
  client.on("error", () => {});
  try {
    await client.connect();
    return client;
  } catch {
    return null;
  }
}
const redis = await probe();
afterAll(async () => {
  await redis?.close();
});

const open = [];
afterEach(async () => {
  while (open.length) await open.pop().close();
});
const newDb = async () => {
  const db = await openTestDb();
  open.push(db);
  return db;
};

// ---- these always run ----

test("without Redis a restart logs everyone out (the in-memory store)", async () => {
  const db = await newDb();
  const first = request.agent(
    createApp(db, { bcryptCost: 4, sessionSecret: SECRET }),
  );
  await first.post("/api/register").send(ALICE);
  const login = await first.post("/api/login").send(ALICE);
  expect((await first.get("/api/me")).status).toBe(200);

  const restarted = createApp(db, { bcryptCost: 4, sessionSecret: SECRET });
  const me = await request(restarted)
    .get("/api/me")
    .set("Cookie", cookieOf(login));
  expect(me.status).toBe(401);
});

test("/health fails when a dependency check fails, and passes when they all pass", async () => {
  const pass = async () => {};
  const fail = async () => {
    throw new Error("down");
  };
  const options = { bcryptCost: 4, sessionSecret: SECRET };

  const ok = await request(
    createApp(await newDb(), { ...options, healthChecks: [pass, pass] }),
  ).get("/health");
  expect(ok.status).toBe(200);

  const down = await request(
    createApp(await newDb(), { ...options, healthChecks: [pass, fail] }),
  ).get("/health");
  expect(down.status).toBe(503);
  expect(down.body).toEqual({ status: "unavailable" });
});

test("connecting to a Redis that does not answer fails within the timeout", async () => {
  await expect(
    connectRedis("redis://127.0.0.1:1", { timeoutMs: 300 }),
  ).rejects.toThrow();
});

// ---- these run only when Redis is reachable ----

describe.skipIf(!redis)("sessions in Redis", () => {
  const prefix = `test:${crypto.randomUUID()}:`; // keeps these tests away from real data
  const keys = () => redis.keys(`${prefix}*`);
  const makeApp = (db, client = redis) =>
    createApp(db, {
      bcryptCost: 4,
      sessionSecret: SECRET,
      sessionStore: new RedisStore({ client, prefix }),
      healthChecks: [() => client.ping()],
    });

  afterEach(async () => {
    const found = await keys();
    if (found.length) await redis.del(found);
  });

  test("a login is stored in Redis with its data and an expiry of about a week", async () => {
    const agent = request.agent(makeApp(await newDb()));
    await agent.post("/api/register").send(ALICE);
    expect(await keys()).toHaveLength(0); // registering does not start a session

    await agent.post("/api/login").send(ALICE);

    const found = await keys();
    expect(found).toHaveLength(1);
    expect(JSON.parse(await redis.get(found[0])).userId).toBe(1);
    const ttl = await redis.ttl(found[0]);
    expect(ttl).toBeGreaterThan(6 * DAY);
    expect(ttl).toBeLessThanOrEqual(7 * DAY);
  });

  test("a new server process using the same Redis still knows the user", async () => {
    const db = await newDb();
    const first = request.agent(makeApp(db));
    await first.post("/api/register").send(ALICE);
    const login = await first.post("/api/login").send(ALICE);

    const restarted = makeApp(db); // a new app and a new store: nothing is left in memory
    const me = await request(restarted)
      .get("/api/me")
      .set("Cookie", cookieOf(login));

    expect(me.status).toBe(200);
    expect(me.body.username).toBe("alice");
  });

  test("logging out deletes the session from Redis", async () => {
    const app = makeApp(await newDb());
    const agent = request.agent(app);
    await agent.post("/api/register").send(ALICE);
    const login = await agent.post("/api/login").send(ALICE);
    expect(await keys()).toHaveLength(1);

    await agent.post("/api/logout");

    expect(await keys()).toHaveLength(0);
    const me = await request(app).get("/api/me").set("Cookie", cookieOf(login));
    expect(me.status).toBe(401);
  });

  test("logging in again replaces the old session instead of adding one", async () => {
    const app = makeApp(await newDb());
    const agent = request.agent(app);
    await agent.post("/api/register").send(ALICE);
    const first = await agent.post("/api/login").send(ALICE);

    await agent.post("/api/login").send(ALICE); // sends the first cookie and replaces it

    expect(await keys()).toHaveLength(1);
    const old = await request(app)
      .get("/api/me")
      .set("Cookie", cookieOf(first));
    expect(old.status).toBe(401);
  });

  test("a session that is gone from Redis is no longer logged in", async () => {
    const agent = request.agent(makeApp(await newDb()));
    await agent.post("/api/register").send(ALICE);
    await agent.post("/api/login").send(ALICE);
    expect((await agent.get("/api/me")).status).toBe(200);

    await redis.del(await keys()); // as if it had expired

    expect((await agent.get("/api/me")).status).toBe(401);
  });

  test("two users have separate sessions, and ending one leaves the other", async () => {
    const app = makeApp(await newDb());
    const alice = request.agent(app);
    const bob = request.agent(app);
    for (const [agent, user] of [
      [alice, ALICE],
      [bob, BOB],
    ]) {
      await agent.post("/api/register").send(user);
      await agent.post("/api/login").send(user);
    }
    expect(await keys()).toHaveLength(2);

    await alice.post("/api/logout");

    expect((await alice.get("/api/me")).status).toBe(401);
    expect((await bob.get("/api/me")).status).toBe(200);
    expect(await keys()).toHaveLength(1);
  });

  test("a game connection is accepted using a session that lives only in Redis", async () => {
    const rt = await startRealtime({
      appOptions: { sessionStore: new RedisStore({ client: redis, prefix }) },
    });
    try {
      const alice = await rt.player("alice", "Aria");
      const { welcome, error } = await rt.open({
        cookie: alice.cookie,
        auth: { characterId: alice.characterId },
      });
      expect(error).toBeUndefined();
      expect(welcome.character.name).toBe("Aria");
    } finally {
      await rt.close();
    }
  });

  test("when the Redis connection is lost, requests fail fast and /health says 503", async () => {
    const db = await newDb();
    const own = await connectRedis(REDIS_URL, { timeoutMs: 1000 });
    const app = makeApp(db, own);
    const agent = request.agent(app);
    await agent.post("/api/register").send(ALICE);
    const login = await agent.post("/api/login").send(ALICE);
    expect((await request(app).get("/health")).status).toBe(200);

    await own.close();

    const me = await request(app).get("/api/me").set("Cookie", cookieOf(login));
    expect(me.status).toBe(500);
    expect(me.body.error.code).toBe("internal_error");
    expect((await request(app).get("/health")).status).toBe(503);
  });
});
