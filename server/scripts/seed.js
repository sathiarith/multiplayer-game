// Usage: node scripts/seed.js. Migrates, then adds the demo accounts. Never in production.
import pg from "pg";
import { migrateUp } from "../pg/migrate.js";
import { seed, DEMO_PASSWORD } from "../pg/seed.js";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed a production database.");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (see server/.env.example)");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await migrateUp(client);
  await seed(client);
  console.log(`Seeded demo_alice and demo_bob (password: ${DEMO_PASSWORD}).`);
} finally {
  await client.end();
}
