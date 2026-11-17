import {
  test,
  describe,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import pg from "pg";
import { readMigrations, migrateUp, migrateDown, status } from "./migrate.js";
import { seed } from "./seed.js";
import { probePostgres, createTestDatabase } from "./test-db.js";

const MIGRATIONS = readMigrations();

test("every migration has an up and a down, numbered 1, 2, 3... without gaps", () => {
  expect(MIGRATIONS.map((m) => m.version)).toEqual([1, 2, 3, 4, 5]);
  expect(MIGRATIONS.map((m) => m.name)).toEqual([
    "users",
    "characters",
    "score",
    "inventory",
    "combat",
  ]);
  for (const m of MIGRATIONS) {
    expect(m.up.trim(), `${m.version} up`).not.toBe("");
    expect(m.down.trim(), `${m.version} down`).not.toBe("");
  }
});

const available = await probePostgres();

describe.skipIf(!available)("PostgreSQL migrations", () => {
  let database;
  let client;
  const one = async (sql, params) => (await client.query(sql, params)).rows[0];
  const tables = async () =>
    (
      await client.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
      )
    ).rows.map((r) => r.tablename);

  // Everything that makes up the schema, except the record of what has run.
  async function schema() {
    const columns = await client.query(
      `SELECT table_name, column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name <> 'schema_migrations'
        ORDER BY table_name, ordinal_position`,
    );
    const indexes = await client.query(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND tablename <> 'schema_migrations'
        ORDER BY indexname`,
    );
    const constraints = await client.query(
      `SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace AND conname <> 'schema_migrations_pkey'
        ORDER BY conname`,
    );
    return {
      columns: columns.rows,
      indexes: indexes.rows,
      constraints: constraints.rows,
    };
  }

  beforeAll(async () => {
    database = await createTestDatabase();
    client = new pg.Client({ connectionString: database.url });
    await client.connect();
  });
  afterAll(async () => {
    await client?.end();
    await database?.drop();
  });
  beforeEach(async () => {
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); // an empty database
  });

  test("up applies every migration once, records it, and a second run does nothing", async () => {
    expect(await migrateUp(client)).toEqual([1, 2, 3, 4, 5]);
    expect(await tables()).toEqual([
      "characters",
      "inventory",
      "items",
      "levels",
      "schema_migrations",
      "users",
    ]);
    expect(await migrateUp(client)).toEqual([]);
    expect((await status(client)).every((m) => m.applied)).toBe(true);
  });

  test("the seed rows of migrations 004 and 005 are there", async () => {
    await migrateUp(client);
    expect((await one("SELECT count(*)::int AS n FROM items")).n).toBe(3);
    expect(await one("SELECT * FROM levels WHERE level = 10")).toEqual({
      level: 10,
      xp_required: 2250,
      max_hp: 280,
    });
  });

  test("names are unique whatever their case, but keep the case they were typed in", async () => {
    await migrateUp(client);
    await client.query(
      "INSERT INTO users (username, password_hash) VALUES ('Alice', 'x')",
    );
    await expect(
      client.query(
        "INSERT INTO users (username, password_hash) VALUES ('alice', 'x')",
      ),
    ).rejects.toMatchObject({ code: "23505" }); // unique violation
    expect((await one("SELECT username FROM users")).username).toBe("Alice");
  });

  test("foreign keys, CHECK constraints and cascades are enforced", async () => {
    await migrateUp(client);
    const user = await one(
      "INSERT INTO users (username, password_hash) VALUES ('bob', 'x') RETURNING id",
    );
    const character = await one(
      "INSERT INTO characters (user_id, name) VALUES ($1, 'Borin') RETURNING id",
      [user.id],
    );
    const wood = await one("SELECT id FROM items WHERE code = 'wood'");

    await expect(
      client.query(
        "INSERT INTO inventory (character_id, item_id, quantity) VALUES (99999, $1, 1)",
        [wood.id],
      ),
    ).rejects.toMatchObject({ code: "23503" }); // foreign key violation
    await expect(
      client.query(
        "INSERT INTO inventory (character_id, item_id, quantity) VALUES ($1, $2, 0)",
        [character.id, wood.id],
      ),
    ).rejects.toMatchObject({ code: "23514" }); // check violation

    await client.query(
      "INSERT INTO inventory (character_id, item_id, quantity) VALUES ($1, $2, 2)",
      [character.id, wood.id],
    );
    await client.query("DELETE FROM users WHERE id = $1", [user.id]);
    expect((await one("SELECT count(*)::int AS n FROM inventory")).n).toBe(0); // gone with its owner
  });

  test("positions keep full precision", async () => {
    await migrateUp(client);
    const user = await one(
      "INSERT INTO users (username, password_hash) VALUES ('cara', 'x') RETURNING id",
    );
    await client.query(
      "INSERT INTO characters (user_id, name, pos_x) VALUES ($1, 'Cara', 107.0710678118)",
      [user.id],
    );
    expect((await one("SELECT pos_x FROM characters")).pos_x).toBe(
      107.0710678118,
    );
  });

  test("every down undoes its up exactly", async () => {
    for (const m of MIGRATIONS) {
      await migrateUp(client, { to: m.version - 1 });
      const before = await schema();
      await migrateUp(client, { to: m.version });
      await migrateDown(client, { steps: 1 });
      expect(await schema(), `migration ${m.version}`).toEqual(before);
      await migrateUp(client, { to: m.version });
    }
  });

  test("a migration that fails leaves nothing behind, and the connection still works", async () => {
    const broken = [
      {
        version: 1,
        name: "half",
        up: "CREATE TABLE first_half (x int); CREATE TABLE second_half (y int); SELECT 1 / 0;",
        down: "",
      },
    ];

    await expect(migrateUp(client, { migrations: broken })).rejects.toThrow(
      /division by zero/,
    );

    expect((await one("SELECT to_regclass('first_half') AS t")).t).toBeNull();
    expect(
      (await one("SELECT count(*)::int AS n FROM schema_migrations")).n,
    ).toBe(0);
  });

  test("two runners starting at once apply each migration exactly once", async () => {
    const other = new pg.Client({ connectionString: database.url });
    await other.connect();
    try {
      const [a, b] = await Promise.all([migrateUp(client), migrateUp(other)]);
      expect([...a, ...b].sort()).toEqual([1, 2, 3, 4, 5]);
    } finally {
      await other.end();
    }
  });

  test("the seed creates the demo accounts once, however often it runs", async () => {
    await migrateUp(client);
    await seed(client, { cost: 4 });
    await seed(client, { cost: 4 });

    expect((await one("SELECT count(*)::int AS n FROM users")).n).toBe(2);
    expect((await one("SELECT count(*)::int AS n FROM characters")).n).toBe(2);
    const gold = await one(
      `SELECT inv.quantity FROM inventory inv
         JOIN characters c ON c.id = inv.character_id
         JOIN items i ON i.id = inv.item_id
        WHERE c.name = 'DemoAria' AND i.code = 'gold_coin'`,
    );
    expect(gold.quantity).toBe(3);
  });
});
