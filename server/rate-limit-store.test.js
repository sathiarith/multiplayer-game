import { test, describe, expect, afterAll, afterEach } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import { RedisStore as RateLimitRedisStore } from "rate-limit-redis";
import { openTestDb } from "./pg/test-db.js";
import { createApp } from "./app.js";
import { connectRedis } from "./redis.js";
import { probeRedis, REDIS_URL } from "./redis-test-helpers.js";
import { ALICE } from "./test-helpers.js";

const SECRET = "test-secret";
const WRONG = { ...ALICE, password: "definitely-not-it" };
const login = (app, body) => request(app).post("/api/login").send(body);

const redis = await probeRedis();
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

// A small store for express-rate-limit that stands in for Redis: it can be
// shared between app instances, which is what a real shared store allows.
class MapStore {
  localKeys = false;
  constructor(hits = new Map()) {
    this.hits = hits; // pass a shared Map to imitate storage shared between servers, like Redis
  }
  windowMs = 0;
  init(options) {
    this.windowMs = options.windowMs;
  }
  async increment(key) {
    const now = Date.now();
    let entry = this.hits.get(key);
    if (!entry || entry.resetTime <= now) {
      entry = { totalHits: 0, resetTime: now + this.windowMs };
    }
    entry.totalHits += 1;
    this.hits.set(key, entry);
    return { totalHits: entry.totalHits, resetTime: new Date(entry.resetTime) };
  }
  async decrement(key) {
    const entry = this.hits.get(key);
    if (entry && entry.totalHits > 0) entry.totalHits -= 1;
  }
  async resetKey(key) {
    this.hits.delete(key);
  }
}

class BrokenStore extends MapStore {
  async increment() {
    throw new Error("the store is down");
  }
}

const base = { bcryptCost: 4, sessionSecret: SECRET };
const twoFailures = { login: { limit: 2, windowMs: 60_000 } };

// Registers Alice, uses up the allowance, and checks the next attempt is blocked.
async function useUpTheLimit(app) {
  await request(app).post("/api/register").send(ALICE);
  for (let i = 0; i < 2; i++)
    expect((await login(app, WRONG)).status).toBe(401);
  expect((await login(app, WRONG)).status).toBe(429);
}

// ---- these always run ----

test("each limiter is given its own store, by name", async () => {
  const names = [];
  createApp(await newDb(), {
    ...base,
    rateLimitStore: (name) => {
      names.push(name);
      return new MapStore();
    },
  });
  expect(names.sort()).toEqual(["login", "register"]);
});

test("a store that is shared keeps the count across a restart, even for the right password", async () => {
  const db = await newDb();
  // Each app gets its own store objects, sharing the data underneath, as with Redis.
  const shared = { login: new Map(), register: new Map() };
  const options = {
    ...base,
    rateLimits: twoFailures,
    rateLimitStore: (name) => new MapStore(shared[name]),
  };

  await useUpTheLimit(createApp(db, options));

  const restarted = createApp(db, options); // a new app: nothing is left in its memory
  const res = await login(restarted, ALICE);
  expect(res.status).toBe(429);
  expect(res.headers["retry-after"]).toBeDefined();
});

test("the default in-memory limiter forgets everything on a restart", async () => {
  const db = await newDb();
  await useUpTheLimit(createApp(db, { ...base, rateLimits: twoFailures }));

  const restarted = createApp(db, { ...base, rateLimits: twoFailures });
  expect((await login(restarted, WRONG)).status).toBe(401); // not blocked any more
});

test("successful logins are taken back out of the count, in any store", async () => {
  const db = await newDb();
  const app = createApp(db, {
    ...base,
    rateLimits: { login: { limit: 2, windowMs: 60_000 } },
    rateLimitStore: () => new MapStore(),
  });
  await request(app).post("/api/register").send(ALICE);
  for (let i = 0; i < 5; i++)
    expect((await login(app, ALICE)).status).toBe(200);
});

test("login and register are counted separately", async () => {
  const db = await newDb();
  const app = createApp(db, {
    ...base,
    rateLimits: {
      login: { limit: 1, windowMs: 60_000 },
      register: { limit: 5, windowMs: 60_000 },
    },
    rateLimitStore: () => new MapStore(),
  });
  await request(app).post("/api/register").send(ALICE);
  await login(app, WRONG);
  expect((await login(app, WRONG)).status).toBe(429);

  const res = await request(app)
    .post("/api/register")
    .send({ ...ALICE, username: "bobby" });
  expect(res.status).toBe(201);
});

test("when the store fails the request is refused, never let through unlimited", async () => {
  const app = createApp(await newDb(), {
    ...base,
    rateLimitStore: () => new BrokenStore(),
  });
  const res = await login(app, ALICE);
  expect(res.status).toBe(500);
  expect(res.body.error.code).toBe("internal_error");
  expect(JSON.stringify(res.body)).not.toMatch(/store is down/);
});

// ---- these run only when Redis is reachable ----

describe.skipIf(!redis)("rate limits in Redis", () => {
  const prefix = `test:${crypto.randomUUID()}:rl:`; // keeps these tests away from real data
  const keys = (name = "") => redis.keys(`${prefix}${name}*`);
  const storeFactory =
    (client = redis) =>
    (name) =>
      new RateLimitRedisStore({
        prefix: `${prefix}${name}:`,
        sendCommand: (...args) => client.sendCommand(args),
      });
  const makeApp = (db, rateLimits, client) =>
    createApp(db, {
      ...base,
      rateLimits,
      rateLimitStore: storeFactory(client),
    });

  afterEach(async () => {
    const found = await keys();
    if (found.length) await redis.del(found);
  });

  test("failed logins are counted in Redis, and the key expires with the window", async () => {
    const app = makeApp(await newDb(), {
      login: { limit: 3, windowMs: 60_000 },
    });
    await request(app).post("/api/register").send(ALICE);
    for (let i = 0; i < 3; i++) await login(app, WRONG);

    const found = await keys("login:");
    expect(found).toHaveLength(1);
    expect(Number(await redis.get(found[0]))).toBe(3);
    const ttl = await redis.pTTL(found[0]);
    expect(ttl).toBeGreaterThan(55_000);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });

  test("a block survives a server restart", async () => {
    const db = await newDb();
    await useUpTheLimit(makeApp(db, twoFailures));

    const restarted = makeApp(db, twoFailures);
    expect((await login(restarted, ALICE)).status).toBe(429);
  });

  test("the count starts again after the window", async () => {
    const app = makeApp(await newDb(), { login: { limit: 2, windowMs: 1000 } });
    await request(app).post("/api/register").send(ALICE);
    await login(app, WRONG);
    await login(app, WRONG);
    expect((await login(app, WRONG)).status).toBe(429);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect((await login(app, WRONG)).status).toBe(401);
  });

  test("login and register use separate keys", async () => {
    const app = makeApp(await newDb(), {
      login: { limit: 5, windowMs: 60_000 },
      register: { limit: 5, windowMs: 60_000 },
    });
    await request(app).post("/api/register").send(ALICE);
    await login(app, WRONG);

    expect(await keys("login:")).toHaveLength(1);
    expect(await keys("register:")).toHaveLength(1);
  });

  test("successful logins do not use up the allowance", async () => {
    const app = makeApp(await newDb(), {
      login: { limit: 2, windowMs: 60_000 },
    });
    await request(app).post("/api/register").send(ALICE);
    for (let i = 0; i < 5; i++)
      expect((await login(app, ALICE)).status).toBe(200);
  });

  test("when Redis is lost, limited routes fail fast instead of being let through", async () => {
    const own = await connectRedis(REDIS_URL, { timeoutMs: 1000 });
    const app = makeApp(await newDb(), undefined, own);
    await request(app).post("/api/register").send(ALICE);

    await own.close();

    const res = await login(app, ALICE);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("internal_error");
  });
});
