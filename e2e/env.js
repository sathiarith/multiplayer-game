import path from "node:path";
import { fileURLToPath } from "node:url";

export const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
export const API_PORT = 3101;
export const CLIENT_PORT = 5273;
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const CLIENT_URL = `http://127.0.0.1:${CLIENT_PORT}`;
// Database 15, so the tests never touch the development data in database 0.
export const REDIS_URL = "redis://127.0.0.1:6379/15";
export const DB_PATH = path.join(E2E_DIR, ".data", "game.db");
