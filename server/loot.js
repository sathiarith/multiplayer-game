import { readFileSync } from "node:fs";

// Where items lie on the map, by tile. Data, not code: a test checks every spot.
export const LOOT = JSON.parse(
  readFileSync(new URL("./data/loot.json", import.meta.url), "utf8"),
);

// A pickup request is exactly { id }, with a positive whole number. Anything else is null.
export function parsePickup(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    return null;
  const keys = Object.keys(raw);
  if (keys.length !== 1 || keys[0] !== "id") return null;
  return Number.isInteger(raw.id) && raw.id >= 1 && raw.id <= 1_000_000
    ? raw.id
    : null;
}
