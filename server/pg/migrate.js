import fs from "node:fs";

const DIR = new URL("./migrations/", import.meta.url);
const LOCK_KEY = 8_000_001; // any fixed number: the advisory lock the runner holds while it works

// [{ version, name, up, down }] from pairs of files: 001_users.up.sql and 001_users.down.sql.
export function readMigrations(dir = DIR) {
  const files = fs.readdirSync(dir);
  const ups = files.filter((f) => /^\d{3}_[a-z0-9_]+\.up\.sql$/.test(f)).sort();
  const read = (file) => fs.readFileSync(new URL(file, dir), "utf8");

  const migrations = ups.map((file) => {
    const downFile = file.replace(/\.up\.sql$/, ".down.sql");
    if (!files.includes(downFile))
      throw new Error(`${file} has no matching ${downFile}`);
    return {
      version: parseInt(file, 10),
      name: file.slice(4, -".up.sql".length),
      up: read(file),
      down: read(downFile),
    };
  });
  migrations.forEach((m, i) => {
    if (m.version !== i + 1)
      throw new Error(
        `Migrations must be numbered 1, 2, 3...: found ${m.version}`,
      );
  });
  return migrations;
}

const ENSURE_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version integer PRIMARY KEY,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

async function applied(client) {
  const { rows } = await client.query("SELECT version FROM schema_migrations");
  return new Set(rows.map((r) => r.version));
}

// BEGIN, the work, COMMIT, all on this one connection. Any error rolls everything back.
async function inTransaction(client, work) {
  await client.query("BEGIN");
  try {
    await work();
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

// Only one runner at a time, across every process using this database.
async function locked(client, work) {
  await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
  try {
    await client.query(ENSURE_TABLE);
    return await work();
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
  }
}

// Applies every migration not yet applied, up to `to`. Returns the versions it ran.
export function migrateUp(
  client,
  { to = Infinity, migrations = readMigrations() } = {},
) {
  return locked(client, async () => {
    const done = await applied(client);
    const ran = [];
    for (const m of migrations) {
      if (m.version > to || done.has(m.version)) continue;
      await inTransaction(client, async () => {
        await client.query(m.up);
        await client.query(
          "INSERT INTO schema_migrations (version, name) VALUES ($1, $2)",
          [m.version, m.name],
        );
      });
      ran.push(m.version);
    }
    return ran;
  });
}

// Undoes the newest `steps` migrations, newest first. Returns the versions it undid.
export function migrateDown(
  client,
  { steps = 1, migrations = readMigrations() } = {},
) {
  return locked(client, async () => {
    const newest = [...(await applied(client))]
      .sort((a, b) => b - a)
      .slice(0, steps);
    for (const version of newest) {
      const m = migrations.find((x) => x.version === version);
      if (!m)
        throw new Error(
          `Migration ${version} is applied but its files are missing`,
        );
      await inTransaction(client, async () => {
        await client.query(m.down);
        await client.query("DELETE FROM schema_migrations WHERE version = $1", [
          version,
        ]);
      });
    }
    return newest;
  });
}

// Every migration, and whether it has run: [{ version, name, applied }].
export async function status(client, { migrations = readMigrations() } = {}) {
  await client.query(ENSURE_TABLE);
  const done = await applied(client);
  return migrations.map((m) => ({
    version: m.version,
    name: m.name,
    applied: done.has(m.version),
  }));
}
