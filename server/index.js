import crypto from "node:crypto";
import { createServer } from "node:http";
import { RedisStore } from "connect-redis";
import { RedisStore as RateLimitStore } from "rate-limit-redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { openDatabase } from "./db.js";
import { connectRedis } from "./redis.js";
import { createLeaderboard } from "./leaderboard.js";
import { createApp } from "./app.js";
import { attachRealtime } from "./realtime.js";

const config = loadConfig(); // throws with a clear message if settings are wrong
const logger = createLogger({ level: config.logLevel });

let sessionSecret = config.sessionSecret;
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString("hex");
  logger.warn("SESSION_SECRET is not set: using a random one for this run");
}

let db;
try {
  db = await openDatabase(config.databaseUrl, { logger });
} catch (err) {
  logger.fatal({ message: err.message }, "cannot start without the database");
  process.exit(1);
}

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

// The database holds the scores. With Redis, an index of them is kept up to date.
const leaderboard = createLeaderboard({ db, redis, logger });
await leaderboard.rebuild().catch((err) => {
  logger.warn(
    { message: err.message },
    "could not build the leaderboard in Redis",
  );
});

// Experiment from Story 6.4. With SOCKET_ADAPTER=redis, every broadcast reaches
// the clients of every server, but each server still runs its own world.
let adapter;
let adapterClients = [];
if (config.socketAdapter === "redis") {
  const publisher = redis.duplicate();
  const subscriber = redis.duplicate();
  for (const client of [publisher, subscriber]) {
    client.on("error", (err) =>
      logger.error({ message: err.message }, "redis adapter error"),
    );
  }
  await Promise.all([publisher.connect(), subscriber.connect()]);
  adapter = createAdapter(publisher, subscriber, { key: "game:io" });
  adapterClients = [publisher, subscriber];
  logger.warn(
    "Socket.IO Redis adapter is on: broadcasts reach every server, but each runs its own world",
  );
}

const app = createApp(db, {
  sessionSecret,
  sessionStore,
  healthChecks: redis ? [() => redis.ping()] : [],
  rateLimitStore: redis
    ? (name) =>
        new RateLimitStore({
          prefix: `game:rl:${name}:`,
          sendCommand: (...args) => redis.sendCommand(args),
        })
    : undefined,
  leaderboard,
  secureCookies: config.secureCookies,
  allowedOrigins: config.allowedOrigins,
  docs: !config.production,
  logger,
});

const httpServer = createServer(app);
const io = await attachRealtime(httpServer, {
  app,
  db,
  allowedOrigins: config.allowedOrigins,
  logger,
  leaderboard,
  adapter,
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
      await app.locals.flushSaves?.(); // the saves each disconnect just started
      await db.close();
      await Promise.all([redis, ...adapterClients].map((client) => client?.close()));
      process.exit(0);
    });
  });
}
