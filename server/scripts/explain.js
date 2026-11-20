// Shows how PostgreSQL runs the game's busiest queries, on a scratch database
// filled with 20,000 players. Usage, from server/:
//   node scripts/explain.js            (with every migration)
//   node scripts/explain.js --before   (without migration 006)
import pg from "pg";
import { migrateUp } from "../pg/migrate.js";
import { createTestDatabase } from "../pg/test-db.js";

const QUERIES = {
  "log in: find a user by name": [
    "SELECT id, username, password_hash FROM users WHERE lower(username) = lower($1)",
    ["user12345"],
  ],
  "list a player's characters": [
    "SELECT id, name FROM characters WHERE user_id = $1 ORDER BY id",
    [12345],
  ],
  "the leaderboard, from the database": [
    "SELECT id, name, level, score FROM characters WHERE score > 0 ORDER BY score DESC, id ASC LIMIT $1",
    [10],
  ],
  "a character's inventory": [
    `SELECT items.code, inventory.quantity FROM inventory
       JOIN items ON items.id = inventory.item_id
      WHERE inventory.character_id = $1 ORDER BY items.name`,
    [12345],
  ],
};

const before = process.argv.includes("--before");
const database = await createTestDatabase(); // empty, with a random name; dropped at the end
const client = new pg.Client({ connectionString: database.url });
await client.connect();
try {
  await migrateUp(client, { to: before ? 5 : Infinity });
  console.log(before ? "Schema: migrations 1 to 5" : "Schema: every migration");

  // 20,000 players with one character each. Most have not scored yet.
  await client.query(
    "INSERT INTO users (username, password_hash) SELECT 'user' || g, 'x' FROM generate_series(1, 20000) g",
  );
  await client.query(
    `INSERT INTO characters (user_id, name, score)
     SELECT id, 'hero' || id, CASE WHEN random() < 0.6 THEN 0 ELSE (random() * 5000)::int END
       FROM users`,
  );
  await client.query(
    `INSERT INTO inventory (character_id, item_id, quantity)
     SELECT c.id, i.id, 1 + (random() * 20)::int FROM characters c CROSS JOIN items i`,
  );
  await client.query("ANALYZE"); // fresh statistics, as the planner would have in production

  for (const [label, [sql, params]] of Object.entries(QUERIES)) {
    const { rows } = await client.query(`EXPLAIN (ANALYZE, COSTS OFF) ${sql}`, params);
    console.log(`\n== ${label}`);
    for (const row of rows) console.log(row["QUERY PLAN"]);
  }
} finally {
  await client.end();
  await database.drop();
}