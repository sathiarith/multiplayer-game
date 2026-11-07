const DEV_ORIGINS = "http://127.0.0.1:3000,http://localhost:3000";

// Parses a comma-separated list of origins: scheme://host[:port], nothing else.
function parseOrigins(raw) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      let url;
      try {
        url = new URL(entry);
      } catch {
        throw new Error(`Invalid ALLOWED_ORIGINS entry: ${entry}`);
      }
      if (!["http:", "https:"].includes(url.protocol) || url.origin !== entry) {
        throw new Error(
          `Invalid ALLOWED_ORIGINS entry (use scheme://host[:port], no path or trailing slash): ${entry}`,
        );
      }
      return entry;
    });
}

// Reads settings from environment variables and checks them.
// Takes `env` as a parameter so tests can pass fake ones.
export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? "development";
  const production = nodeEnv === "production";

  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }

  const sessionSecret = env.SESSION_SECRET || undefined;
  if (production) {
    if (!sessionSecret || sessionSecret.length < 32) {
      throw new Error(
        "SESSION_SECRET must be set (32+ characters) in production",
      );
    }
    if (sessionSecret.startsWith("change-me")) {
      throw new Error(
        "SESSION_SECRET is still the placeholder from .env.example",
      );
    }
  }

  const LOG_LEVELS = [
    "fatal",
    "error",
    "warn",
    "info",
    "debug",
    "trace",
    "silent",
  ];
  const logLevel = env.LOG_LEVEL ?? (production ? "info" : "debug");

  if (!LOG_LEVELS.includes(logLevel)) {
    throw new Error(`Invalid LOG_LEVEL: ${env.LOG_LEVEL}`);
  }
  if (production && !env.ALLOWED_ORIGINS) {
    throw new Error("ALLOWED_ORIGINS must be set in production");
  }
  const allowedOrigins = parseOrigins(env.ALLOWED_ORIGINS ?? DEV_ORIGINS);
  if (production && allowedOrigins.some((o) => !o.startsWith("https://"))) {
    throw new Error("ALLOWED_ORIGINS must use https:// in production");
  }

  const redisUrl = env.REDIS_URL || undefined;
  if (redisUrl && !/^rediss?:\/\//.test(redisUrl)) {
    // The URL can contain a password, so the message never repeats it.
    throw new Error(
      "Invalid REDIS_URL: it must start with redis:// or rediss://",
    );
  }
  if (production && !redisUrl) {
    throw new Error("REDIS_URL must be set in production");
  }

  return {
    nodeEnv,
    production,
    port,
    host: env.HOST ?? "127.0.0.1",
    dbPath: env.DB_PATH ?? "./data/game.db",
    logLevel,
    sessionSecret, // may be undefined in development; index.js generates one
    secureCookies: production, // only send cookies over HTTPS in production
    allowedOrigins,
    redisUrl,
  };
}
