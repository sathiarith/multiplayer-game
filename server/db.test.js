import { test, expect } from "vitest";
import { openDatabase } from "./db.js";
import { createTestDatabase } from "./pg/test-db.js";

test("openDatabase migrates an empty database and answers queries", async () => {
  const database = await createTestDatabase(); // empty: not a copy of the template
  const db = await openDatabase(database.url);
  try {
    const versions = await db.query(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    expect(versions.map((r) => r.version)).toEqual([1, 2, 3, 4, 5]);
    expect(
      await db.one("SELECT CAST(COUNT(*) AS integer) AS n FROM items"),
    ).toEqual({ n: 3 });
  } finally {
    await db.close();
    await database.drop();
  }
});
