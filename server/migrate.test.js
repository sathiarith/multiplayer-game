import { test, expect } from "vitest";
import fs from "node:fs";
import { openDb } from "./db.js";
import { migrate } from "./migrate.js";

const version = (db) => db.pragma("user_version", { simple: true });

test("migrations run once and record the schema version", () => {
  const db = openDb(":memory:");
  const files = fs
    .readdirSync(new URL("./migrations/", import.meta.url))
    .filter((f) => f.endsWith(".sql"));
  expect(version(db)).toBe(files.length);

  migrate(db); // running again changes nothing and does not throw
  expect(version(db)).toBe(files.length);

  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((r) => r.name);
  expect(tables).toEqual(["characters", "inventory", "items", "users"]);
});
