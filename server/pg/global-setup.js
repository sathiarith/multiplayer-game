import pg from "pg";
import { migrateUp } from "./migrate.js";
import { ADMIN_URL, TEMPLATE, urlFor } from "./test-db.js";

export async function setup() {
  const admin = new pg.Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try {
    await admin.connect();
  } catch {
    throw new Error(
      "PostgreSQL is not reachable for the tests. Is Docker running? Try: docker start game-postgres",
    );
  }
  try {
    // Databases left behind by a run that crashed, and last run's template.
    const { rows } = await admin.query(
      "SELECT datname FROM pg_database WHERE datname LIKE 'test\\_%' OR datname = $1",
      [TEMPLATE],
    );
    for (const { datname } of rows) {
      await admin.query(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
    }
    await admin.query(`CREATE DATABASE ${TEMPLATE}`);
  } finally {
    await admin.end();
  }

  const template = new pg.Client({ connectionString: urlFor(TEMPLATE) });
  await template.connect();
  try {
    await migrateUp(template);
  } finally {
    await template.end(); // a template can only be copied while nobody is connected to it
  }
}

export async function teardown() {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${TEMPLATE} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}