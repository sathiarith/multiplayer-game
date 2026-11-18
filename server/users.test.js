import { test, expect, beforeEach } from "vitest";
import { openDb } from "./db.js";
import { createUser, findUserByUsername, UsernameTakenError } from "./users.js";
import { findUserById } from "./users.js";

let db;
beforeEach(() => {
  db = openDb(":memory:"); // a fresh empty database for every test
});

test("creates and finds a user", async () => {
  const user = await createUser(db, "alice", "hash");
  expect((await findUserByUsername(db, "alice")).id).toBe(user.id);
});

test("duplicate usernames are rejected regardless of case", async () => {
  await createUser(db, "alice", "hash");
  await expect(createUser(db, "ALICE", "hash")).rejects.toBeInstanceOf(
    UsernameTakenError,
  );
});

test("SQL in a username is stored as data, never executed", async () => {
  const evil = "x'); DROP TABLE users;--";
  await createUser(db, evil, "hash");
  expect((await findUserByUsername(db, evil)).username).toBe(evil);
  await createUser(db, "bob", "hash"); // the table still exists
});

test("findUserById returns id and username but not the hash", async () => {
  const user = await createUser(db, "alice", "hash");
  expect(await findUserById(db, user.id)).toEqual({
    id: user.id,
    username: "alice",
  });
  expect(await findUserById(db, 9999)).toBeUndefined();
});
