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
  const c = loadConfig({ NODE_ENV: "production", SESSION_SECRET: GOOD_SECRET });
  expect(c).toMatchObject({ production: true, secureCookies: true });
});

test("log level defaults by environment and rejects unknown values", () => {
  expect(loadConfig({}).logLevel).toBe("debug");
  expect(
    loadConfig({ NODE_ENV: "production", SESSION_SECRET: GOOD_SECRET })
      .logLevel,
  ).toBe("info");
  expect(loadConfig({ LOG_LEVEL: "warn" }).logLevel).toBe("warn");
  expect(() => loadConfig({ LOG_LEVEL: "loud" })).toThrow(/LOG_LEVEL/);
});
