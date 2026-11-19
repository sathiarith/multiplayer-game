import { test, expect, beforeEach, afterEach } from "vitest";
import { openTestDb } from "./pg/test-db.js";
import { loadLevels } from "./levels.js";
import { levelFor } from "./rules/combat.js";

let db;
beforeEach(async () => {
  db = await openTestDb();
});
afterEach(() => db.close());

test("the XP table comes from the database, from level 1 up", async () => {
  const levels = await loadLevels(db);
  expect(levels).toHaveLength(10);
  expect(levels[0]).toEqual({ level: 1, xpRequired: 0, maxHp: 100 });
  expect(levels.at(-1)).toEqual({ level: 10, xpRequired: 2250, maxHp: 280 });
});

test("balancing the game is a change of data, not of code", async () => {
  expect(levelFor(55, await loadLevels(db))).toBe(2);

  await db.run("UPDATE levels SET xp_required = 60 WHERE level = 2");

  expect(levelFor(55, await loadLevels(db))).toBe(1);
});

test("a table that does not start at level 1 with 0 XP is refused", async () => {
  await db.run("DELETE FROM levels WHERE level = 1");
  await expect(loadLevels(db)).rejects.toThrow(/start at level 1/);
});

test("a table whose XP does not keep rising is refused", async () => {
  await db.run("UPDATE levels SET xp_required = 9000 WHERE level = 3");
  await expect(loadLevels(db)).rejects.toThrow(/more XP than the last/);
});

test("a new character starts with no XP", async () => {
  const columns = await db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'characters'",
  );
  expect(columns.map((c) => c.column_name)).toContain("xp");
});
