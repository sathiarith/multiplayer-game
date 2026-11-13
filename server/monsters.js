import { readFileSync } from "node:fs";

// Monster types and where they appear on the map. Data, not code: a test checks it.
export const MONSTERS = JSON.parse(
  readFileSync(new URL("./data/monsters.json", import.meta.url), "utf8"),
);

// An attack names no target: it is exactly no payload, or {}.
export function parseAttack(raw) {
  if (raw === undefined) return true;
  return (
    raw !== null &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    Object.keys(raw).length === 0
  );
}
