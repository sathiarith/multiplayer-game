import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import {
  API_PORT,
  API_URL,
  CLIENT_PORT,
  CLIENT_URL,
  DB_PATH,
  E2E_DIR,
  REDIS_URL,
} from "./env.js";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.js",
  fullyParallel: false,
  workers: 1, // the tests share one server and one Redis database
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: CLIENT_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      name: "API",
      command: "node start-api.js",
      cwd: E2E_DIR,
      url: `${API_URL}/health`, // answers 200 only when the database and Redis work
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        ...process.env,
        PORT: String(API_PORT),
        HOST: "127.0.0.1",
        DB_PATH,
        REDIS_URL,
        SESSION_SECRET: "e2e-only-secret-not-used-anywhere-else",
        ALLOWED_ORIGINS: CLIENT_URL,
        LOG_LEVEL: "warn",
        NODE_ENV: "development",
      },
    },
    {
      name: "Client",
      command: "npm run dev",
      cwd: path.resolve(E2E_DIR, "../client"),
      url: CLIENT_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { ...process.env, API_URL, CLIENT_PORT: String(CLIENT_PORT) },
    },
  ],
});
