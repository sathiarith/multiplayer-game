import pg from "pg";
import { migrateUp } from "./pg/migrate.js";
import { pgDatabase } from "./database.js";

// Opens a connection pool, brings the schema up to date, and returns the interface.
export async function openDatabase(url, { logger, max = 10 } = {}) {
  const pool = new pg.Pool({ connectionString: url, max });
  // An idle connection that drops is replaced by the pool; without a listener
  // the error would crash the process.
  pool.on("error", (err) =>
    logger?.error({ message: err.message }, "database connection lost"),
  );
  const client = await pool.connect();
  try {
    await migrateUp(client);
  } finally {
    client.release();
  }
  return pgDatabase(pool);
}
