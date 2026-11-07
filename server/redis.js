import { createClient } from "redis";

// Connects to Redis and returns the client, or throws if it does not answer in time.
export async function connectRedis(url, { logger, timeoutMs = 5000 } = {}) {
  const client = createClient({
    url,
    // When Redis is down, commands fail at once. Without this they wait in a
    // queue, and every request that needs a session would hang.
    disableOfflineQueue: true,
    socket: { connectTimeout: timeoutMs },
  });

  // Without an error listener, a lost connection would crash the process.
  // Only the message is logged, never the connection URL.
  client.on("error", (err) =>
    logger?.error({ message: err.message }, "redis error"),
  );
  client.on("reconnecting", () => logger?.warn("redis reconnecting"));
  client.on("ready", () => logger?.info("redis ready"));

  let timer;
  const timedOut = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Redis did not answer within ${timeoutMs} ms`)),
      timeoutMs,
    );
  });
  try {
    await Promise.race([client.connect(), timedOut]);
  } catch (err) {
    client.destroy(); // stop retrying
    throw err;
  } finally {
    clearTimeout(timer);
  }
  return client;
}
