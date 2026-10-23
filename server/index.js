import crypto from "node:crypto";
import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { createApp } from "./app.js";

const config = loadConfig(); // throws with a clear message if settings are wrong

let sessionSecret = config.sessionSecret;
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString("hex");
  console.warn("SESSION_SECRET is not set: using a random one for this run.");
}

const app = createApp(openDb(config.dbPath), {
  sessionSecret,
  secureCookies: config.secureCookies,
});

app.listen(config.port, config.host, () => {
  console.log(`API listening on http://${config.host}:${config.port}`);
});
