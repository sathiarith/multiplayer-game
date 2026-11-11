import { test, expect, beforeEach, afterEach } from "vitest";
import { openDb } from "./db.js";
import { createUser } from "./users.js";
import { createCharacter } from "./characters.js";
import { addItem, listInventory, MAX_STACK } from "./inventory.js";
import { executeTrade } from "./trade.js";

let db;
let aria;
let borin;
let cara;

beforeEach(() => {
  db = openDb(":memory:");
  const make = (user, name) =>
    createCharacter(db, createUser(db, user, "hash").id, name);
  aria = make("alice", "Aria");
  borin = make("bobby", "Borin");
  cara = make("carol", "Cara");
});
afterEach(() => db.close());

const count = (character, code) =>
  listInventory(db, character.id).find((i) => i.code === code)?.quantity ?? 0;
const total = (code) =>
  db
    .prepare(
      `SELECT COALESCE(SUM(inventory.quantity), 0) AS n
         FROM inventory JOIN items ON items.id = inventory.item_id
        WHERE items.code = ?`,
    )
    .get(code).n;
const lines = (...pairs) =>
  pairs.map(([code, quantity]) => ({ code, quantity }));

// The sprint's guidance: write this test first, and watch it fail.
test("the same coins offered twice can only be traded once", () => {
  addItem(db, aria.id, "gold_coin", 3);
  const offerTo = (to) => ({
    from: aria.id,
    to: to.id,
    give: lines(["gold_coin", 3]),
    want: [],
  });

  const first = executeTrade(db, offerTo(borin));
  const second = executeTrade(db, offerTo(cara));

  expect(first).toEqual({ ok: true });
  expect(second).toEqual({ ok: false, reason: "missing_items" });
  expect(total("gold_coin")).toBe(3); // no coin was created
  expect([
    count(aria, "gold_coin"),
    count(borin, "gold_coin"),
    count(cara, "gold_coin"),
  ]).toEqual([0, 3, 0]);
});

test("a failure halfway through undoes everything", () => {
  addItem(db, aria.id, "gold_coin", 3);
  addItem(db, borin.id, "wood", 2);
  const woodId = db
    .prepare("SELECT id FROM items WHERE code = 'wood'")
    .get().id;
  // Fails when Aria receives the wood: the last move, after the gold has already moved.
  db.exec(`CREATE TRIGGER forced_failure BEFORE INSERT ON inventory
           WHEN NEW.character_id = ${aria.id} AND NEW.item_id = ${woodId}
           BEGIN SELECT RAISE(ABORT, 'forced failure halfway'); END`);

  expect(() =>
    executeTrade(db, {
      from: aria.id,
      to: borin.id,
      give: lines(["gold_coin", 2]),
      want: lines(["wood", 2]),
    }),
  ).toThrow(/forced failure halfway/);

  expect(count(aria, "gold_coin")).toBe(3);
  expect(count(borin, "gold_coin")).toBe(0);
  expect(count(borin, "wood")).toBe(2);
  expect(count(aria, "wood")).toBe(0);
});

test("missing items on the receiving side undo the moves already made", () => {
  addItem(db, aria.id, "gold_coin", 3);
  addItem(db, borin.id, "wood", 2);

  const result = executeTrade(db, {
    from: aria.id,
    to: borin.id,
    give: lines(["gold_coin", 2]),
    want: lines(["wood", 5]), // Borin has only 2
  });

  expect(result).toEqual({ ok: false, reason: "missing_items" });
  expect([
    count(aria, "gold_coin"),
    count(borin, "gold_coin"),
    count(borin, "wood"),
  ]).toEqual([3, 0, 2]);
});

test("a trade moves items in both directions", () => {
  addItem(db, aria.id, "gold_coin", 3);
  addItem(db, borin.id, "wood", 2);

  const result = executeTrade(db, {
    from: aria.id,
    to: borin.id,
    give: lines(["gold_coin", 2]),
    want: lines(["wood", 1]),
  });

  expect(result).toEqual({ ok: true });
  expect([count(aria, "gold_coin"), count(aria, "wood")]).toEqual([1, 1]);
  expect([count(borin, "gold_coin"), count(borin, "wood")]).toEqual([2, 1]);
});

test("a gift asks for nothing in return, and an emptied stack disappears", () => {
  addItem(db, aria.id, "meat", 1);

  expect(
    executeTrade(db, {
      from: aria.id,
      to: borin.id,
      give: lines(["meat", 1]),
      want: [],
    }),
  ).toEqual({ ok: true });

  expect(listInventory(db, aria.id)).toEqual([]);
  expect(count(borin, "meat")).toBe(1);
});

test("a receiver who cannot carry more makes the whole trade fail", () => {
  addItem(db, aria.id, "gold_coin", 2);
  addItem(db, borin.id, "gold_coin", MAX_STACK - 1);

  const result = executeTrade(db, {
    from: aria.id,
    to: borin.id,
    give: lines(["gold_coin", 2]),
    want: [],
  });

  expect(result).toEqual({ ok: false, reason: "full" });
  expect([count(aria, "gold_coin"), count(borin, "gold_coin")]).toEqual([
    2,
    MAX_STACK - 1,
  ]);
});
