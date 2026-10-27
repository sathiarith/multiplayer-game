import request from "supertest";
import { openDb } from "./db.js";
import { createApp } from "./app.js";

export const ALICE = { username: "alice", password: "correct-horse-battery" };

// A fresh app with its own empty in-memory database.
export function createTestApp() {
  const db = openDb(":memory:");
  const app = createApp(db, { bcryptCost: 4, sessionSecret: "test-secret" });
  return { app, db };
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
