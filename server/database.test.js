import { test, expect, beforeEach, afterEach } from "vitest";
import { openTestDb } from "./pg/test-db.js";

let db;
beforeEach(async () => {
  db = await openTestDb();
});
afterEach(() => db.close());

const addUser = (name) =>
  db.one(
    "INSERT INTO users (username, password_hash) VALUES ($1, 'x') RETURNING id, username",
    [name],
  );
const count = async () =>
  (await db.one("SELECT CAST(COUNT(*) AS integer) AS n FROM users")).n;

test("query returns every row, and one the first row or undefined", async () => {
  await addUser("alice");
  await addUser("bobby");
  expect(
    await db.query("SELECT username FROM users ORDER BY username"),
  ).toHaveLength(2);
  expect(
    await db.one("SELECT username FROM users WHERE username = $1", ["nobody"]),
  ).toBeUndefined();
});

test("INSERT ... RETURNING hands back the new row, and run says how many rows changed", async () => {
  expect(await addUser("alice")).toEqual({ id: 1, username: "alice" });
  expect(
    await db.run("UPDATE users SET password_hash = 'y' WHERE id = $1", [1]),
  ).toEqual({ changes: 1 });
  expect(
    await db.run("UPDATE users SET password_hash = 'y' WHERE id = $1", [99]),
  ).toEqual({ changes: 0 });
});

test("a transaction keeps its work when it succeeds", async () => {
  const result = await db.transaction(async (tx) => {
    await tx.run(
      "INSERT INTO users (username, password_hash) VALUES ($1, 'x')",
      ["alice"],
    );
    return "done";
  });
  expect(result).toBe("done");
  expect(await count()).toBe(1);
});

test("a transaction undoes everything when its work throws", async () => {
  await expect(
    db.transaction(async (tx) => {
      await tx.run(
        "INSERT INTO users (username, password_hash) VALUES ($1, 'x')",
        ["alice"],
      );
      throw new Error("halfway");
    }),
  ).rejects.toThrow("halfway");
  expect(await count()).toBe(0);
});

test("a transaction inside a transaction joins it, so a failure undoes both", async () => {
  await expect(
    db.transaction(async (tx) => {
      await tx.transaction((inner) =>
        inner.run(
          "INSERT INTO users (username, password_hash) VALUES ($1, 'x')",
          ["alice"],
        ),
      );
      throw new Error("after the inner one");
    }),
  ).rejects.toThrow();
  expect(await count()).toBe(0);
});

test("a transaction has its own connection: others see its work only after the commit", async () => {
  let seenFromOutside;
  await db.transaction(async (tx) => {
    await tx.run(
      "INSERT INTO users (username, password_hash) VALUES ($1, 'x')",
      ["alice"],
    );
    seenFromOutside = await count(); // through the pool: a different connection
  });
  expect(seenFromOutside).toBe(0);
  expect(await count()).toBe(1);
});

test("a unique violation is recognised as one", async () => {
  await addUser("alice");
  const err = await addUser("ALICE").catch((e) => e); // the index ignores case
  expect(db.isUniqueViolation(err)).toBe(true);
  expect(db.isUniqueViolation(new Error("something else"))).toBe(false);
});

test("closing twice is harmless", async () => {
  await db.close();
  await db.close();
  expect(db.open).toBe(false);
});
