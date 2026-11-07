import { createClient } from "redis";

export const REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379";

// A connected client, or null when no Redis is reachable (the Redis tests are then skipped).
export async function probeRedis() {
  const client = createClient({
    url: REDIS_URL,
    socket: { connectTimeout: 500, reconnectStrategy: false },
  });
  client.on("error", () => {});
  try {
    await client.connect();
    return client;
  } catch {
    return null;
  }
}
