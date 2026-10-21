import { test, expect } from "vitest";
import { validateCredentials } from "./validation.js";

const ok = { username: "alice_01", password: "correct-horse-battery" };

test("valid credentials produce no errors", () => {
  expect(validateCredentials(ok)).toEqual({});
});

test("rejects short, long, or oddly-shaped usernames", () => {
  for (const username of [
    "ab",
    "a".repeat(21),
    "has space",
    "emoji😀",
    undefined,
  ]) {
    expect(validateCredentials({ ...ok, username }).username).toBeDefined();
  }
});

test("rejects short passwords and non-strings", () => {
  expect(
    validateCredentials({ ...ok, password: "short" }).password,
  ).toBeDefined();
  expect(
    validateCredentials({ ...ok, password: 12345678901 }).password,
  ).toBeDefined();
});

test("rejects passwords over bcrypt's 72-byte limit", () => {
  expect(
    validateCredentials({ ...ok, password: "x".repeat(73) }).password,
  ).toBeDefined();
});
