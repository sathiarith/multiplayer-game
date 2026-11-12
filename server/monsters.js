import { readFileSync } from "node:fs";

// Monster types and where they appear on the map. Data, not code: a test checks it.
export const MONSTERS = JSON.parse(
  readFileSync(new URL("./data/monsters.json", import.meta.url), "utf8"),
);
