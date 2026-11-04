import { buildLevel } from "../../../shared/map.js";
import data from "../../../shared/maps/level1.json";

// The same file the server loads, so both sides agree about every wall.
export const level = buildLevel(data);
