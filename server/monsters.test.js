import { test, expect } from "vitest";
import { level } from "./level.js";
import { createStartingPlayer } from "../shared/startingPlayer.js";
import { MONSTERS } from "./monsters.js";

const POSITIVE_WHOLE = [
  "maxHp",
  "damage",
  "xp",
  "attackRange",
  "cooldownMs",
  "respawnSeconds",
];

test("every monster type has a name and positive whole numbers", () => {
  for (const [code, type] of Object.entries(MONSTERS.types)) {
    expect(typeof type.name, code).toBe("string");
    for (const field of POSITIVE_WHOLE) {
      expect(
        Number.isInteger(type[field]) && type[field] > 0,
        `${code}.${field}`,
      ).toBe(true);
    }
  }
});

test("every monster on the map is a known type, standing on a floor tile", () => {
  for (const spawn of MONSTERS.spawns) {
    expect(MONSTERS.types[spawn.type], spawn.type).toBeDefined();
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
