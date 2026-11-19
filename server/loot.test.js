import { test, expect } from "vitest";
import { openTestDb } from "./pg/test-db.js";
import { level } from "./level.js";
import { createStartingPlayer } from "../shared/startingPlayer.js";
import { LOOT, parsePickup } from "./loot.js";

test("every item lies on a floor tile of the shared map", async () => {
  for (const spawn of LOOT.spawns) {
    const x = (spawn.col + 0.5) * level.tileSize;
    const y = (spawn.row + 0.5) * level.tileSize;
    // A position inside a wall would be moved to the spawn point.
    const placed = createStartingPlayer(
      { id: 0, name: "probe", hp: 100, x, y },
      level,
    );
    expect([placed.x, placed.y], JSON.stringify(spawn)).toEqual([x, y]);
  }
});

test("every item on the map is defined in the items table", async () => {
  const db = await openTestDb();
  const codes = (await db.query("SELECT code FROM items")).map((r) => r.code);
  await db.close();
  for (const spawn of LOOT.spawns) expect(codes).toContain(spawn.item);
});

test("a pickup request is exactly { id } with a positive whole number", async () => {
  expect(parsePickup({ id: 3 })).toBe(3);
  for (const raw of [
    null,
    "3",
    3,
    [],
    {},
    { id: 0 },
    { id: -1 },
    { id: 1.5 },
    { id: "3" },
    { id: 3, x: 1 },
  ]) {
    expect(parsePickup(raw), JSON.stringify(raw)).toBeNull();
  }
});
