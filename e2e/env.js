import path from "node:path";
import { fileURLToPath } from "node:url";

export const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
export const API_PORT = 3101;
export const CLIENT_PORT = 5273;
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const CLIENT_URL = `http://127.0.0.1:${CLIENT_PORT}`;
// Database 15, so the tests never touch the development data in database 0.
export const REDIS_URL = "redis://127.0.0.1:6379/15";
// Its own database, recreated at the start of every run, so tests never touch development data.
export const DATABASE_URL =
  "postgres://game:game-dev-only@127.0.0.1:5432/game_e2e";
