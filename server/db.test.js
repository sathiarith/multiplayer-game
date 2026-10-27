import { test, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "./db.js";

test("openDb creates missing folders and the database file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mmo-db-"));
  const file = path.join(dir, "nested", "game.db");
  const db = openDb(file);
  try {
    expect(fs.existsSync(file)).toBe(true);
    expect(db.pragma("user_version", { simple: true })).toBeGreaterThan(0);
  } finally {
    db.close(); // Windows cannot delete a file that is still open
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
