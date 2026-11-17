// Usage: node scripts/migrate.js up | down [steps] | status
import pg from "pg";
import { migrateUp, migrateDown, status } from "../pg/migrate.js";

const [command = "up", arg] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (see server/.env.example)"); // never print the URL: it holds a password
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  if (command === "up") {
    const ran = await migrateUp(client);
    console.log(
      ran.length ? `Applied: ${ran.join(", ")}` : "Already up to date.",
    );
  } else if (command === "down") {
    const undone = await migrateDown(client, { steps: Number(arg ?? 1) });
    console.log(
      undone.length ? `Undone: ${undone.join(", ")}` : "Nothing to undo.",
    );
  } else if (command === "status") {
    for (const m of await status(client)) {
      const file = `${String(m.version).padStart(3, "0")}_${m.name}`;
      console.log(`${m.applied ? "applied" : "pending"}  ${file}`);
    }
  } else {
    console.error("Usage: node scripts/migrate.js up | down [steps] | status");
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
