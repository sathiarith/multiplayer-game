import { test, expect } from "vitest";
import {
  parseCredentials,
  parseLogin,
  parseNewCharacter,
  parseId,
} from "./validation.js";

const ok = { username: "alice_01", password: "correct-horse-battery" };

test("valid credentials parse unchanged", async () => {
  expect(parseCredentials(ok)).toEqual({ data: ok });
});

test("rejects short, long, or oddly-shaped usernames", async () => {
  for (const username of [
    "ab",
    "a".repeat(21),
    "has space",
    "emoji😀",
    undefined,
  ]) {
    expect(parseCredentials({ ...ok, username }).fields.username).toBeDefined();
  }
});

test("rejects short passwords and non-strings", async () => {
  expect(
    parseCredentials({ ...ok, password: "short" }).fields.password,
  ).toBeDefined();
  expect(
    parseCredentials({ ...ok, password: 12345678901 }).fields.password,
  ).toBeDefined();
});

test("rejects passwords over bcrypt's 72-byte limit", async () => {
  expect(
    parseCredentials({ ...ok, password: "x".repeat(73) }).fields.password,
  ).toBeDefined();
  expect(
    parseCredentials({ ...ok, password: "x".repeat(72) }).fields,
  ).toBeUndefined();
});

test("unknown fields are rejected, not silently dropped", async () => {
  const r = parseCredentials({ ...ok, isAdmin: true, role: "admin" });
  expect(r.fields.isAdmin).toBe("not allowed");
  expect(r.fields.role).toBe("not allowed");
});

test("anything that is not a JSON object fails with a body error", async () => {
  for (const input of [undefined, null, "text", 42, [], [ok]]) {
    expect(parseCredentials(input).fields.body).toBeDefined();
  }
});

test("login checks shape only, so older weak passwords can still be tried", async () => {
  expect(
    parseLogin({ username: "alice", password: "short" }).data,
  ).toBeDefined();
  expect(
    parseLogin({ username: "", password: "x" }).fields.username,
  ).toBeDefined();
  expect(
    parseLogin({ username: "a", password: "" }).fields.password,
  ).toBeDefined();
  expect(
    parseLogin({ username: "a".repeat(51), password: "x" }).fields.username,
  ).toBeDefined();
  expect(
    parseLogin({ username: "a", password: "x".repeat(201) }).fields.password,
  ).toBeDefined();
  expect(
    parseLogin({ username: "a", password: 123 }).fields.password,
  ).toBeDefined();
  expect(
    parseLogin({ username: "a", password: "x", extra: 1 }).fields.extra,
  ).toBe("not allowed");
});

test("a new character defaults to the warrior class", async () => {
  expect(parseNewCharacter({ name: "Aria" }).data).toEqual({
    name: "Aria",
    class: "warrior",
  });
});

test("new characters cannot set their own stats", async () => {
  const r = parseNewCharacter({ name: "Aria", level: 99, hp: 9999, x: 5 });
  expect(r.fields.level).toBe("not allowed");
  expect(r.fields.hp).toBe("not allowed");
  expect(r.fields.x).toBe("not allowed");
});

test("bad names and classes are rejected", async () => {
  for (const name of ["", "ab", "x".repeat(17), "bad name", 42, undefined]) {
    expect(parseNewCharacter({ name }).fields.name).toBeDefined();
  }
  expect(
    parseNewCharacter({ name: "Aria", class: "wizard" }).fields.class,
  ).toBeDefined();
});

test("ids accept plain positive integers only", async () => {
  expect(parseId("1")).toBe(1);
  expect(parseId("42")).toBe(42);
  for (const raw of [
    "0",
    "-1",
    "1.5",
    "1e2",
    "0x10",
    " 5",
    "007",
    "",
    "abc",
    "99999999999",
    undefined,
    5,
  ]) {
    expect(parseId(raw)).toBeNull();
  }
});
