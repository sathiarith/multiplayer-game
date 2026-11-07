import crypto from "node:crypto";
import { createServer } from "node:http";
import { RedisStore } from "connect-redis";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { openDb } from "./db.js";
import { connectRedis } from "./redis.js";
import { createApp } from "./app.js";
import { attachRealtime } from "./realtime.js";

const config = loadConfig(); // throws with a clear message if settings are wrong
const logger = createLogger({ level: config.logLevel });

let sessionSecret = config.sessionSecret;
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString("hex");
  logger.warn("SESSION_SECRET is not set: using a random one for this run");
}

const db = openDb(config.dbPath);

// With REDIS_URL set, sessions live in Redis and survive a restart.
// Without it, express-session keeps them in memory.
let redis = null;
let sessionStore;
if (config.redisUrl) {
  try {
    redis = await connectRedis(config.redisUrl, { logger });
  } catch (err) {
    logger.fatal({ message: err.message }, "cannot start without Redis");
    process.exit(1);
  }
  sessionStore = new RedisStore({ client: redis, prefix: "game:sess:" });
} else {
  logger.warn(
    "REDIS_URL is not set: sessions are kept in memory and are lost on every restart",
  );
}

const app = createApp(db, {
  sessionSecret,
  sessionStore,
  healthChecks: redis ? [() => redis.ping()] : [],
  secureCookies: config.secureCookies,
  allowedOrigins: config.allowedOrigins,
  docs: !config.production,
  logger,
});

const httpServer = createServer(app);
const io = attachRealtime(httpServer, {
  app,
  db,
  allowedOrigins: config.allowedOrigins,
  logger,
});

httpServer.listen(config.port, config.host, () => {
  logger.info({ host: config.host, port: config.port }, "API listening");
});

// Ctrl+C or a stop request: closing Socket.IO disconnects every player, and
// each disconnect saves that player, so a clean stop loses no progress.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    logger.info({ signal }, "shutting down");
    setTimeout(() => process.exit(1), 5000).unref(); // do not hang forever
    io.close(async () => {
      await redis?.close();
      process.exit(0);
    });
  });
}
