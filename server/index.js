import crypto from "node:crypto";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { openDb } from "./db.js";
import { createApp } from "./app.js";

const config = loadConfig(); // throws with a clear message if settings are wrong
const logger = createLogger({ level: config.logLevel });

let sessionSecret = config.sessionSecret;
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString("hex");
  logger.warn("SESSION_SECRET is not set: using a random one for this run");
}

const app = createApp(openDb(config.dbPath), {
  sessionSecret,
  secureCookies: config.secureCookies,
  logger,
});

app.listen(config.port, config.host, () => {
  logger.info({ host: config.host, port: config.port }, "API listening");
});
