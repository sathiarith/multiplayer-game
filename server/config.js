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

  return {
    nodeEnv,
    production,
    port,
    host: env.HOST ?? "127.0.0.1",
    dbPath: env.DB_PATH ?? "./data/game.db",
    sessionSecret, // may be undefined in development; index.js generates one
    secureCookies: production, // only send cookies over HTTPS in production
  };
}
