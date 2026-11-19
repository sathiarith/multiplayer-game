import { test, describe, expect, afterAll, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import { openTestDb } from "./pg/test-db.js";
import { createUser } from "./users.js";
import { createCharacter } from "./characters.js";
import { createLeaderboard, TOP_N } from "./leaderboard.js";
import { probeRedis } from "./redis-test-helpers.js";
import { startRealtime } from "./realtime-test-helpers.js";
import { createTestApp, loggedInAgent } from "./test-helpers.js";
import { MONSTERS } from "./monsters.js";

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

// Adds a user with one character, and gives the character a score.
async function addPlayer(db, name, score, level = 1) {
  const user = await createUser(db, `user_${name}`, "hash");
  const character = await createCharacter(db, user.id, name);
  await db.run("UPDATE characters SET score = $1, level = $2 WHERE id = $3", [
    score,
    level,
    character.id,
  ]);
  return character.id;
}
const names = (entries) => entries.map((e) => e.name);

// ---- these always run (the database answers) ----

test("characters are ranked by score, highest first, with only the public fields", async () => {
  const db = await newDb();
  await addPlayer(db, "Aria", 30);
  await addPlayer(db, "Borin", 50, 2);
  await addPlayer(db, "Corin", 10);

  const top = await createLeaderboard({ db }).top();

  expect(top).toEqual([
    { rank: 1, name: "Borin", level: 2, score: 50 },
    { rank: 2, name: "Aria", level: 1, score: 30 },
    { rank: 3, name: "Corin", level: 1, score: 10 },
  ]);
});

test("characters with no points are not listed", async () => {
  const db = await newDb();
  await addPlayer(db, "Aria", 5);
  await addPlayer(db, "Dara", 0);
  expect(names(await createLeaderboard({ db }).top())).toEqual(["Aria"]);
});

test("an empty game has an empty board", async () => {
  expect(await createLeaderboard({ db: await newDb() }).top()).toEqual([]);
});

test("at most ten are returned, and a smaller limit is respected", async () => {
  const db = await newDb();
  for (let i = 1; i <= 12; i++) await addPlayer(db, `Hero${i}`, i);
  const board = createLeaderboard({ db });

  const top = await board.top();
  expect(top).toHaveLength(TOP_N);
  expect(top[0]).toMatchObject({ rank: 1, name: "Hero12", score: 12 });
  expect(top.at(-1)).toMatchObject({ rank: 10, score: 3 });

  expect(names(await board.top(3))).toEqual(["Hero12", "Hero11", "Hero10"]);
});

test("equal scores are listed lower id first", async () => {
  const db = await newDb();
  await addPlayer(db, "First", 5);
  await addPlayer(db, "Second", 5);
  await addPlayer(db, "Third", 5);
  expect(names(await createLeaderboard({ db }).top())).toEqual([
    "First",
    "Second",
    "Third",
  ]);
});

test("without Redis, update, remove and rebuild do nothing and do not fail", async () => {
  const board = createLeaderboard({ db: await newDb() });
  await expect(board.update(1, 5)).resolves.toBeUndefined();
  await expect(board.remove(1)).resolves.toBeUndefined();
  await expect(board.rebuild()).resolves.toBeUndefined();
});

test("when Redis fails the board is answered from the database, with a warning", async () => {
  const db = await newDb();
  await addPlayer(db, "Aria", 30);
  await addPlayer(db, "Borin", 50);
  const logger = { warn: vi.fn() };
  const broken = {
    exists: async () => {
      throw new Error("redis down");
    },
  };

  const top = await createLeaderboard({ db, redis: broken, logger }).top();

  expect(names(top)).toEqual(["Borin", "Aria"]);
  expect(logger.warn).toHaveBeenCalledTimes(1);
});

test("the endpoint needs a login, and lists the best scores", async () => {
  const { app, db } = await createTestApp();
  open.push(db);
  await addPlayer(db, "Aria", 30);
  await addPlayer(db, "Borin", 50);

  expect((await request(app).get("/api/leaderboard")).status).toBe(401);

  const agent = await loggedInAgent(app, "viewer");
  const res = await agent.get("/api/leaderboard");
  expect(res.status).toBe(200);
  expect(res.body).toEqual([
    { rank: 1, name: "Borin", level: 1, score: 50 },
    { rank: 2, name: "Aria", level: 1, score: 30 },
  ]);
});

// ---- these run only when Redis is reachable ----

describe.skipIf(!redis)("the leaderboard in Redis", () => {
  const prefix = `test:${crypto.randomUUID()}:lb:`; // keeps these tests away from real data
  const scores = `${prefix}scores`;
  const ready = `${prefix}ready`;
  const make = (db) =>
    createLeaderboard({ db, redis, prefix, logger: { warn: vi.fn() } });

  afterEach(async () => {
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length) await redis.del(keys);
  });

  test("rebuilding fills the sorted set from the database", async () => {
    const db = await newDb();
    const aria = await addPlayer(db, "Aria", 30);
    const borin = await addPlayer(db, "Borin", 50);
    await addPlayer(db, "Dara", 0);

    await make(db).rebuild();

    const members = await redis.zRangeWithScores(scores, 0, -1);
    expect(members).toEqual([
      { value: String(aria), score: 30 },
      { value: String(borin), score: 50 },
    ]);
    expect(await redis.exists(ready)).toBe(1);
  });

  test("the first read builds the board when Redis has nothing", async () => {
    const db = await newDb();
    await addPlayer(db, "Aria", 30);
    await addPlayer(db, "Borin", 50);
    expect(await redis.exists(ready)).toBe(0);

    const top = await make(db).top();

    expect(names(top)).toEqual(["Borin", "Aria"]);
    expect(await redis.exists(ready)).toBe(1);
  });

  test("if Redis is wiped later, the next read rebuilds the board", async () => {
    const db = await newDb();
    await addPlayer(db, "Aria", 30);
    const board = make(db);
    await board.top();

    await redis.del([scores, ready]);

    expect(names(await board.top())).toEqual(["Aria"]);
  });

  test("an update changes the order, and a zero score removes the character", async () => {
    const db = await newDb();
    const aria = await addPlayer(db, "Aria", 30);
    const borin = await addPlayer(db, "Borin", 50);
    const board = make(db);
    await board.rebuild();

    await board.update(aria, 100);
    expect(names(await board.top())).toEqual(["Aria", "Borin"]);

    await board.update(aria, 0);
    expect(names(await board.top())).toEqual(["Borin"]);

    await board.remove(borin);
    expect(await board.top()).toEqual([]);
  });

  test("reading the board does not sort the characters table", async () => {
    const db = await newDb();
    for (let i = 1; i <= 12; i++) await addPlayer(db, `Hero${i}`, i);
    const board = make(db);
    await board.rebuild();

    // The leaderboard's own reads go through the interface, so that is what to watch.
    const query = vi.spyOn(db, "query");
    const top = await board.top();

    expect(top).toHaveLength(TOP_N);
    expect(query.mock.calls.some(([sql]) => /ORDER BY/i.test(sql))).toBe(false);
  });

  test("a member that has no character any more is skipped", async () => {
    const db = await newDb();
    await addPlayer(db, "Aria", 30);
    const board = make(db);
    await board.rebuild();

    await redis.zAdd(scores, { score: 999, value: "424242" }); // no such character

    expect(names(await board.top())).toEqual(["Aria"]);
  });

  test("a score earned by the game server reaches the Redis board and the endpoint", async () => {
    const rt = await startRealtime({
      makeLeaderboard: make,
      monsters: {
        types: MONSTERS.types,
        spawns: [{ type: "goblin", col: 3, row: 1 }],
      },
    });
    try {
      const alice = await rt.player("alice", "Aria");
      const { socket } = await rt.open({
        cookie: alice.cookie,
        auth: { characterId: alice.characterId },
      });
      const progress = new Promise((resolve) =>
        socket.once("progress", resolve),
      );
      const timer = setInterval(() => socket.emit("attack"), 50);
      await progress;
      clearInterval(timer);
      socket.disconnect(); // leaving saves the character, and announces the score

      await vi.waitFor(async () => {
        expect(await redis.zScore(scores, String(alice.characterId))).toBe(25);
      });
      const res = await fetch(`${rt.url}/api/leaderboard`, {
        headers: { Cookie: alice.cookie },
      });
      expect((await res.json())[0]).toMatchObject({
        rank: 1,
        name: "Aria",
        score: 25,
      });
    } finally {
      await rt.close();
    }
  });
});
