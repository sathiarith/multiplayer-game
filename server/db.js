import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { migrate } from "./migrate.js";
import { sqliteDatabase } from "./database.js";

// Pass ":memory:" for a throwaway database (used by tests).
export function openDb(file = process.env.DB_PATH ?? "./data/game.db") {
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const raw = new Database(file);
  raw.pragma("foreign_keys = ON"); // off by default in SQLite
  migrate(raw);
  return sqliteDatabase(raw);
}
