// Starts the real API server for the end-to-end tests, with an empty database.
import pg from "pg";

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) throw new Error("DATABASE_URL must be set");
const url = new URL(DATABASE_URL);
const name = url.pathname.slice(1);
// This script deletes the database it is given, so it refuses any other name.
if (name !== "game_e2e")
  throw new Error("The end-to-end database must be called game_e2e");

url.pathname = "/postgres";
const admin = new pg.Client({ connectionString: url.toString() });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
await admin.query(`CREATE DATABASE ${name}`);
await admin.end();

await import("../server/index.js"); // migrates the new database as it starts
