import { test, expect } from "vitest";
import { loadConfig } from "./config.js";

const GOOD_SECRET = "a".repeat(40);

test("defaults suit local development", () => {
  const c = loadConfig({});
  expect(c).toMatchObject({
    port: 3001,
    host: "127.0.0.1",
    production: false,
    secureCookies: false,
  });
  expect(c.sessionSecret).toBeUndefined();
});

test("settings come from the environment", () => {
  const c = loadConfig({ PORT: "4000", HOST: "0.0.0.0", DB_PATH: "/tmp/x.db" });
  expect(c).toMatchObject({ port: 4000, host: "0.0.0.0", dbPath: "/tmp/x.db" });
});

test("an invalid port is rejected", () => {
  for (const PORT of ["abc", "0", "70000", "3.5"]) {
    expect(() => loadConfig({ PORT })).toThrow(/PORT/);
  }
});

test("production demands a real session secret", () => {
  const prod = { NODE_ENV: "production" };
  expect(() => loadConfig(prod)).toThrow(/SESSION_SECRET/);
  expect(() => loadConfig({ ...prod, SESSION_SECRET: "short" })).toThrow(
    /SESSION_SECRET/,
  );
  expect(() =>
    loadConfig({ ...prod, SESSION_SECRET: "change-me" + "x".repeat(30) }),
  ).toThrow(/placeholder/);
});

test("production with a good secret uses secure cookies", () => {
  const c = loadConfig({
    NODE_ENV: "production",
    SESSION_SECRET: GOOD_SECRET,
    ALLOWED_ORIGINS: "https://game.example.com",
    REDIS_URL: "redis://cache:6379",
  });
  expect(c).toMatchObject({ production: true, secureCookies: true });
});

test("allowed origins default to the local dev pages", () => {
  expect(loadConfig({}).allowedOrigins).toEqual([
    "http://127.0.0.1:3000",
    "http://localhost:3000",
  ]);
});

test("allowed origins are parsed from a comma-separated list", () => {
  const c = loadConfig({
    ALLOWED_ORIGINS: " http://localhost:5173 , https://game.example.com ",
  });
  expect(c.allowedOrigins).toEqual([
    "http://localhost:5173",
    "https://game.example.com",
  ]);
});

test("malformed or wildcard origins are rejected", () => {
  const bad = [
    "*",
    "game.example.com",
    "http://localhost:3000/",
    "http://x.com/path",
    "ftp://x.com",
    "null",
  ];
  for (const ALLOWED_ORIGINS of bad) {
    expect(() => loadConfig({ ALLOWED_ORIGINS })).toThrow(/ALLOWED_ORIGINS/);
  }
});

test("production requires explicit https origins", () => {
  const prod = { NODE_ENV: "production", SESSION_SECRET: GOOD_SECRET };
  expect(() => loadConfig(prod)).toThrow(/ALLOWED_ORIGINS/);
  expect(() =>
    loadConfig({ ...prod, ALLOWED_ORIGINS: "http://game.example.com" }),
  ).toThrow(/https/);
  const ok = loadConfig({
    ...prod,
    ALLOWED_ORIGINS: "https://game.example.com",
    REDIS_URL: "redis://cache:6379",
  });
  expect(ok.allowedOrigins).toEqual(["https://game.example.com"]);
});

test("log level defaults by environment and rejects unknown values", () => {
  expect(loadConfig({}).logLevel).toBe("debug");
  expect(
    loadConfig({
      NODE_ENV: "production",
      SESSION_SECRET: GOOD_SECRET,
      ALLOWED_ORIGINS: "https://game.example.com",
      REDIS_URL: "redis://cache:6379",
    }).logLevel,
  ).toBe("info");
  expect(loadConfig({ LOG_LEVEL: "warn" }).logLevel).toBe("warn");
  expect(() => loadConfig({ LOG_LEVEL: "loud" })).toThrow(/LOG_LEVEL/);
});

test("Redis is optional in development and read from REDIS_URL", () => {
  expect(loadConfig({}).redisUrl).toBeUndefined();
  expect(loadConfig({ REDIS_URL: "" }).redisUrl).toBeUndefined();
  expect(loadConfig({ REDIS_URL: "redis://127.0.0.1:6379" }).redisUrl).toBe(
    "redis://127.0.0.1:6379",
  );
  expect(
    loadConfig({ REDIS_URL: "rediss://cache.example.com:6380" }).redisUrl,
  ).toBe("rediss://cache.example.com:6380");
});

test("a malformed REDIS_URL is rejected, and the message never repeats it", () => {
  for (const REDIS_URL of [
    "http://secret-host:6379",
    "localhost:6379",
    "ftp://user:hunter2@host",
  ]) {
    const error = (() => {
      try {
        loadConfig({ REDIS_URL });
      } catch (err) {
        return err;
      }
    })();
    expect(error.message).toMatch(/REDIS_URL/);
    expect(error.message).not.toContain(REDIS_URL);
  }
});

test("production requires REDIS_URL", () => {
  const prod = {
    NODE_ENV: "production",
    SESSION_SECRET: GOOD_SECRET,
    ALLOWED_ORIGINS: "https://game.example.com",
  };
  expect(() => loadConfig(prod)).toThrow(/REDIS_URL/);
  expect(
    loadConfig({ ...prod, REDIS_URL: "redis://cache:6379" }).redisUrl,
  ).toBe("redis://cache:6379");
});
