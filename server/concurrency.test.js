import { test, expect, beforeEach, afterEach } from "vitest";
import { openTestDb } from "./pg/test-db.js";
import { createUser } from "./users.js";
import {
  createCharacter,
  listCharacters,
  CharacterLimitError,
  NameTakenError,
  MAX_CHARACTERS,
} from "./characters.js";
import { addItem, listInventory, MAX_STACK } from "./inventory.js";
import { executeTrade } from "./trade.js";

// Many requests at the same moment, each on its own connection: the way messages
// from several players arrive at a busy server.
let db;
beforeEach(async () => {
  db = await openTestDb({ max: 20 });
});
afterEach(() => db.close());

const many = (n, work) => Promise.allSettled(Array.from({ length: n }, (_, i) => work(i)));
const ok = (results) => results.filter((r) => r.status === "fulfilled");
const failed = (results) => results.filter((r) => r.status === "rejected");
const quantity = async (character, code) =>
  (await listInventory(db, character.id)).find((i) => i.code === code)?.quantity ?? 0;
const newCharacter = async (username, name) =>
  createCharacter(db, (await createUser(db, username, "hash")).id, name);

test("the same coins traded to twenty players at once: exactly one trade happens", async () => {
  const aria = await newCharacter("alice", "Aria");
  const others = [];
  for (let i = 0; i < 20; i++) others.push(await newCharacter(`user${i}`, `Hero${i}`));
  await addItem(db, aria.id, "gold_coin", 3);

  const results = await Promise.all(
    others.map((other) =>
      executeTrade(db, {
        from: aria.id,
        to: other.id,
        give: [{ code: "gold_coin", quantity: 3 }],
        want: [],
      }),
    ),
  );

  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.filter((r) => !r.ok).every((r) => r.reason === "missing_items")).toBe(true);
  const total = await db.one("SELECT CAST(COALESCE(SUM(quantity), 0) AS integer) AS n FROM inventory");
  expect(total.n).toBe(3); // not one coin created or lost
});

test("fifty pickups of the same item at once all count", async () => {
  const aria = await newCharacter("alice", "Aria");

  const results = await many(50, () => addItem(db, aria.id, "gold_coin", 1));

  expect(ok(results).every((r) => r.value.ok)).toBe(true);
  expect(await quantity(aria, "gold_coin")).toBe(50);
});

test("a stack near the limit never goes past it, however many adds arrive at once", async () => {
  const aria = await newCharacter("alice", "Aria");
  await addItem(db, aria.id, "gold_coin", MAX_STACK - 5);

  const results = await many(20, () => addItem(db, aria.id, "gold_coin", 1));

  expect(ok(results).filter((r) => r.value.ok)).toHaveLength(5);
  expect(await quantity(aria, "gold_coin")).toBe(MAX_STACK);
});

test("ten characters created at once for one player: only the limit's worth exist", async () => {
  const alice = await createUser(db, "alice", "hash");

  const results = await many(10, (i) => createCharacter(db, alice.id, `Hero${i}`));

  expect(ok(results)).toHaveLength(MAX_CHARACTERS);
  expect(failed(results).every((r) => r.reason instanceof CharacterLimitError)).toBe(true);
  expect(await listCharacters(db, alice.id)).toHaveLength(MAX_CHARACTERS);
});

test("the same name chosen by two players at once goes to exactly one of them", async () => {
  const alice = await createUser(db, "alice", "hash");
  const bob = await createUser(db, "bobby", "hash");

  const results = await Promise.allSettled([
    createCharacter(db, alice.id, "Aria"),
    createCharacter(db, bob.id, "ARIA"),
  ]);

  expect(ok(results)).toHaveLength(1);
  expect(failed(results)[0].reason).toBeInstanceOf(NameTakenError);
});