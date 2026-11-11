import { test, expect, beforeEach, afterEach } from "vitest";
import { openDb } from "./db.js";
import { createUser } from "./users.js";
import { createCharacter } from "./characters.js";
import { addItem, listInventory, MAX_STACK } from "./inventory.js";

let db;
let aria;
let borin;

beforeEach(() => {
  db = openDb(":memory:");
  aria = createCharacter(db, createUser(db, "alice", "hash").id, "Aria");
  borin = createCharacter(db, createUser(db, "bobby", "hash").id, "Borin");
});
afterEach(() => db.close());

const itemId = (code) =>
  db.prepare("SELECT id FROM items WHERE code = ?").get(code).id;

test("the item definitions are in the database", () => {
  const codes = db
    .prepare("SELECT code FROM items ORDER BY code")
    .all()
    .map((r) => r.code);
  expect(codes).toEqual(["gold_coin", "meat", "wood"]);
});

test("a new character carries nothing", () => {
  expect(listInventory(db, aria.id)).toEqual([]);
});

test("picking up the same item again grows one stack instead of adding rows", () => {
  expect(addItem(db, aria.id, "gold_coin")).toEqual({ ok: true, quantity: 1 });
  expect(addItem(db, aria.id, "gold_coin", 4)).toEqual({
    ok: true,
    quantity: 5,
  });

  const rows = db
    .prepare("SELECT COUNT(*) AS n FROM inventory WHERE character_id = ?")
    .get(aria.id);
  expect(rows.n).toBe(1);
});

test("the list joins in each item's name and description, sorted by name", () => {
  addItem(db, aria.id, "wood", 2);
  addItem(db, aria.id, "gold_coin");

  expect(listInventory(db, aria.id)).toEqual([
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

test("each character has their own inventory", () => {
  addItem(db, aria.id, "meat");
  expect(listInventory(db, borin.id)).toEqual([]);
});

test("a stack cannot grow past the limit, and a refused add changes nothing", () => {
  addItem(db, aria.id, "gold_coin", MAX_STACK - 1);
  expect(addItem(db, aria.id, "gold_coin", 2)).toEqual({
    ok: false,
    reason: "full",
  });
  expect(listInventory(db, aria.id)[0].quantity).toBe(MAX_STACK - 1);
});

test("an unknown item is an error, and nothing is written", () => {
  expect(() => addItem(db, aria.id, "dragon_egg")).toThrow(/Unknown item/);
  expect(listInventory(db, aria.id)).toEqual([]);
});

test("the database refuses a second row for the same character and item", () => {
  const insert = db.prepare(
    "INSERT INTO inventory (character_id, item_id, quantity) VALUES (?, ?, 1)",
  );
  insert.run(aria.id, itemId("wood"));
  expect(() => insert.run(aria.id, itemId("wood"))).toThrow(
    /UNIQUE|PRIMARY KEY/i,
  );
});

test("the database refuses an inventory row for a character that does not exist", () => {
  expect(() =>
    db
      .prepare(
        "INSERT INTO inventory (character_id, item_id, quantity) VALUES (?, ?, 1)",
      )
      .run(99999, itemId("wood")),
  ).toThrow(/FOREIGN KEY/i);
});

test("the database refuses a quantity of zero or below", () => {
  expect(() =>
    db
      .prepare(
        "INSERT INTO inventory (character_id, item_id, quantity) VALUES (?, ?, 0)",
      )
      .run(aria.id, itemId("wood")),
  ).toThrow(/CHECK/i);
});

test("deleting a character deletes what it carried", () => {
  addItem(db, aria.id, "meat");
  db.prepare("DELETE FROM characters WHERE id = ?").run(aria.id);
  expect(db.prepare("SELECT COUNT(*) AS n FROM inventory").get().n).toBe(0);
});
