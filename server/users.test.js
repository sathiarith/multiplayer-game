import { test, expect, beforeEach } from "vitest";
import { openDb } from "./db.js";
import { createUser, findUserByUsername } from "./users.js";

let db;
beforeEach(() => {
  db = openDb(":memory:"); // a fresh empty database for every test
});

test("creates and finds a user", () => {
  const user = createUser(db, "alice", "hash");
  expect(findUserByUsername(db, "alice").id).toBe(user.id);
});

test("duplicate usernames are rejected regardless of case", () => {
  createUser(db, "alice", "hash");
  expect(() => createUser(db, "ALICE", "hash")).toThrow(/UNIQUE/);
});

test("SQL in a username is stored as data, never executed", () => {
  const evil = "x'); DROP TABLE users;--";
  createUser(db, evil, "hash");
  expect(findUserByUsername(db, evil).username).toBe(evil);
  createUser(db, "bob", "hash"); // the table still exists
});
