import crypto from "node:crypto";
import pg from "pg";

// The server's maintenance database, used only to create and drop test databases.
export const ADMIN_URL =
  process.env.TEST_PG_URL ??
  "postgres://game:game-dev-only@127.0.0.1:5432/postgres";

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

// A brand-new, empty database with a random name, and a way to drop it.
export async function createTestDatabase() {
  const name = `test_${crypto.randomUUID().replaceAll("-", "")}`; // letters and digits only
  await admin(`CREATE DATABASE ${name}`);
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: () => admin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`),
  };
}
