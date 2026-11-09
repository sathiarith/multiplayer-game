// Starts the real API server for the end-to-end tests, with an empty database.
import fs from "node:fs";

const { DB_PATH } = process.env;
if (!DB_PATH) throw new Error("DB_PATH must be set");
fs.rmSync(DB_PATH, { force: true });

await import("../server/index.js");
