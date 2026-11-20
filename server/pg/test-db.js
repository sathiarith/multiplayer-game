import crypto from "node:crypto";
import pg from "pg";
import { pgDatabase } from "../database.js";

// The server's maintenance database, used only to create and drop test databases.
export const ADMIN_URL =
  process.env.TEST_PG_URL ??
  "postgres://game:game-dev-only@127.0.0.1:5433/postgres";
// Migrated once per run; every test database is a copy of it.
export const TEMPLATE = "game_test_template";

export function urlFor(name) {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

export async function probePostgres() {
  const client = new pg.Client({
    connectionString: ADMIN_URL,
    connectionTimeoutMillis: 500,
  });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

async function admin(sql) {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

// A new database with a random name: empty, or a copy of `template`. And a way to drop it.
export async function createTestDatabase({ template } = {}) {
  const name = `test_${crypto.randomUUID().replaceAll("-", "")}`; // letters and digits only
  await admin(
    template
      ? `CREATE DATABASE ${name} TEMPLATE ${template}`
      : `CREATE DATABASE ${name}`,
  );
  return {
    url: urlFor(name),
    drop: () => admin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`),
  };
}

// A fresh, migrated database for one test. Closing it also drops it.
export async function openTestDb({ max = 4 } = {}) {
  const database = await createTestDatabase({ template: TEMPLATE });
  const pool = new pg.Pool({ connectionString: database.url, max });
  pool.on("error", () => {});
  const db = pgDatabase(pool);
  const closePool = db.close;
  db.close = async () => {
    await closePool();
    await database.drop();
  };
  return db;
}
