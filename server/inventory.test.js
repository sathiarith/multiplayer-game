import { test, expect, beforeEach, afterEach } from "vitest";
import { openTestDb } from "./pg/test-db.js";
import { createUser } from "./users.js";
import { createCharacter } from "./characters.js";
import {
  addItem,
  listInventory,
  MAX_STACK,
  removeItem,
  listItems,
} from "./inventory.js";

let db;
let aria;
let borin;

beforeEach(async () => {
  db = await openTestDb();
  aria = await createCharacter(
    db,
    (await createUser(db, "alice", "hash")).id,
    "Aria",
  );
  borin = await createCharacter(
    db,
    (await createUser(db, "bobby", "hash")).id,
    "Borin",
  );
});
afterEach(() => db.close());

const itemId = async (code) =>
  (await db.one("SELECT id FROM items WHERE code = $1", [code])).id;
const insertRow = async (characterId, code, quantity) =>
  db.run(
    "INSERT INTO inventory (character_id, item_id, quantity) VALUES ($1, $2, $3)",
    [characterId, await itemId(code), quantity],
  );

test("the item definitions are in the database", async () => {
  const codes = (await db.query("SELECT code FROM items ORDER BY code")).map(
    (r) => r.code,
  );
  expect(codes).toEqual(["gold_coin", "meat", "wood"]);
});

test("a new character carries nothing", async () => {
  expect(await listInventory(db, aria.id)).toEqual([]);
});

test("picking up the same item again grows one stack instead of adding rows", async () => {
  expect(await addItem(db, aria.id, "gold_coin")).toEqual({
    ok: true,
    quantity: 1,
  });
  expect(await addItem(db, aria.id, "gold_coin", 4)).toEqual({
    ok: true,
    quantity: 5,
  });

  const rows = await db.one(
    "SELECT CAST(COUNT(*) AS integer) AS n FROM inventory WHERE character_id = $1",
    [aria.id],
  );
  expect(rows.n).toBe(1);
});

test("the list joins in each item's name and description, sorted by name", async () => {
  await addItem(db, aria.id, "wood", 2);
  await addItem(db, aria.id, "gold_coin");

  expect(await listInventory(db, aria.id)).toEqual([
    {
      code: "gold_coin",
      name: "Gold coin",
      description: expect.any(String),
      quantity: 1,
    },
    {
      code: "wood",
      name: "Wood",
      description: expect.any(String),
      quantity: 2,
    },
  ]);
});

test("each character has their own inventory", async () => {
  await addItem(db, aria.id, "meat");
  expect(await listInventory(db, borin.id)).toEqual([]);
});

test("a stack cannot grow past the limit, and a refused add changes nothing", async () => {
  await addItem(db, aria.id, "gold_coin", MAX_STACK - 1);
  expect(await addItem(db, aria.id, "gold_coin", 2)).toEqual({
    ok: false,
    reason: "full",
  });
  expect((await listInventory(db, aria.id))[0].quantity).toBe(MAX_STACK - 1);
});

test("an unknown item is an error, and nothing is written", async () => {
  await expect(addItem(db, aria.id, "dragon_egg")).rejects.toThrow(
    /Unknown item/,
  );
  expect(await listInventory(db, aria.id)).toEqual([]);
});

test("the database refuses a second row for the same character and item", async () => {
  await insertRow(aria.id, "wood", 1);
  await expect(insertRow(aria.id, "wood", 1)).rejects.toThrow(
    /duplicate key|unique/i,
  );
});

test("the database refuses an inventory row for a character that does not exist", async () => {
  await expect(insertRow(99999, "wood", 1)).rejects.toThrow(/foreign key/i);
});

test("the database refuses a quantity of zero or below", async () => {
  await expect(insertRow(aria.id, "wood", 0)).rejects.toThrow(
    /check constraint/i,
  );
});

test("deleting a character deletes what it carried", async () => {
  await addItem(db, aria.id, "meat");
  await db.run("DELETE FROM characters WHERE id = $1", [aria.id]);
  expect(
    (await db.one("SELECT CAST(COUNT(*) AS integer) AS n FROM inventory")).n,
  ).toBe(0);
});

test("taking part of a stack leaves the rest", async () => {
  await addItem(db, aria.id, "wood", 5);
  expect(await removeItem(db, aria.id, "wood", 2)).toEqual({
    ok: true,
    quantity: 3,
  });
  expect((await listInventory(db, aria.id))[0].quantity).toBe(3);
});

test("taking a whole stack removes the row", async () => {
  await addItem(db, aria.id, "wood", 2);
  expect(await removeItem(db, aria.id, "wood", 2)).toEqual({
    ok: true,
    quantity: 0,
  });
  expect(await listInventory(db, aria.id)).toEqual([]);
});

test("taking more than there is changes nothing", async () => {
  await addItem(db, aria.id, "wood", 2);
  expect(await removeItem(db, aria.id, "wood", 3)).toEqual({
    ok: false,
    reason: "missing_items",
  });
  expect(await removeItem(db, aria.id, "meat", 1)).toEqual({
    ok: false,
    reason: "missing_items",
  });
  expect((await listInventory(db, aria.id))[0].quantity).toBe(2);
});

test("the catalog lists every item by name", async () => {
  expect(await listItems(db)).toEqual([
    { code: "gold_coin", name: "Gold coin" },
    { code: "meat", name: "Meat" },
    { code: "wood", name: "Wood" },
  ]);
});
