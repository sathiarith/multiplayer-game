import { readFileSync } from "node:fs";
import { buildLevel } from "../shared/map.js";

// The one map both the server and the client use: shared/maps/level1.json.
const FILE = new URL("../shared/maps/level1.json", import.meta.url);

export const level = buildLevel(JSON.parse(readFileSync(FILE, "utf8")));