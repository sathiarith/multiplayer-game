import request from "supertest";
import { openDb } from "./db.js";
import { createApp } from "./app.js";
import { createLogger } from "./logger.js";

export const TEST_ORIGIN = "http://localhost:3000";

// A logger that collects each log line (parsed) in an array instead of printing it.
export function createLogCapture() {
  const lines = [];
  const destination = {
    write(chunk) {
      lines.push(JSON.parse(chunk));
    },
  };
  return { lines, logger: createLogger({ level: "info", destination }) };
}

export const ALICE = { username: "alice", password: "correct-horse-battery" };

// A fresh app with its own empty in-memory database. `makeLeaderboard` is an
// optional (db) => leaderboard function, for tests that use Redis.
export function createTestApp({ logger, makeLeaderboard, ...options } = {}) {
  const db = openDb(":memory:");
  const leaderboard = makeLeaderboard?.(db);
  const app = createApp(db, {
    bcryptCost: 4,
    sessionSecret: "test-secret",
    logger,
    allowedOrigins: [TEST_ORIGIN],
    ...(leaderboard ? { leaderboard } : {}),
    ...options,
  });
  return { app, db, leaderboard };
}

// Registers a user and returns an agent (a "browser" that keeps cookies)
// that is already logged in as them.
export async function loggedInAgent(app, username) {
  const agent = request.agent(app);
  const creds = { username, password: "correct-horse-battery" };
  await agent.post("/api/register").send(creds);
  await agent.post("/api/login").send(creds);
  return agent;
}
