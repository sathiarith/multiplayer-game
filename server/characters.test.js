import { test, expect, beforeEach } from "vitest";
import { openDb } from "./db.js";
import { createUser } from "./users.js";
import {
  createCharacter,
  listCharacters,
  updatePosition,
  CharacterLimitError,
  MAX_CHARACTERS,
  SPAWN,
  findCharacter,
} from "./characters.js";

let db;
let alice;
let bob;

beforeEach(() => {
  db = openDb(":memory:");
  alice = createUser(db, "alice", "hash");
  bob = createUser(db, "bob", "hash");
});

test("a new character starts at the spawn point with default stats", () => {
  const c = createCharacter(db, alice.id, "Aria");
  expect(c).toMatchObject({
    name: "Aria",
    class: "warrior",
    level: 1,
    hp: 100,
    x: SPAWN.x,
    y: SPAWN.y,
  });
});

test("listCharacters returns only the owner's characters", () => {
  createCharacter(db, alice.id, "Aria");
  createCharacter(db, bob.id, "Borin");
  expect(listCharacters(db, alice.id).map((c) => c.name)).toEqual(["Aria"]);
});

test("the character limit is enforced per user", () => {
  for (let i = 0; i < MAX_CHARACTERS; i++)
    createCharacter(db, alice.id, `hero${i}`);
  expect(() => createCharacter(db, alice.id, "extra")).toThrow(
    CharacterLimitError,
  );
  expect(listCharacters(db, alice.id)).toHaveLength(MAX_CHARACTERS);
  expect(() => createCharacter(db, bob.id, "borin")).not.toThrow();
});

test("names are unique across users, ignoring case", () => {
  createCharacter(db, alice.id, "Aria");
  expect(() => createCharacter(db, bob.id, "ARIA")).toThrow(/UNIQUE/);
});

test("the database refuses a character for a user that does not exist", () => {
  expect(() => createCharacter(db, 9999, "ghost")).toThrow(/FOREIGN KEY/);
});

test("deleting a user deletes their characters", () => {
  createCharacter(db, alice.id, "Aria");
  db.prepare("DELETE FROM users WHERE id = ?").run(alice.id);
  expect(listCharacters(db, alice.id)).toEqual([]);
});

test("updatePosition only changes the owner's character", () => {
  const c = createCharacter(db, alice.id, "Aria");
  expect(updatePosition(db, bob.id, c.id, 5, 5)).toBe(false);
  expect(listCharacters(db, alice.id)[0]).toMatchObject({
    x: SPAWN.x,
    y: SPAWN.y,
  });

  expect(updatePosition(db, alice.id, c.id, 5, 7)).toBe(true);
  expect(listCharacters(db, alice.id)[0]).toMatchObject({ x: 5, y: 7 });
});

test("SQL in a character name is stored as data, never executed", () => {
  const evil = "x'); DROP TABLE characters;--";
  createCharacter(db, alice.id, evil);
  expect(listCharacters(db, alice.id)[0].name).toBe(evil);
});

test("findCharacter only finds the owner's character", () => {
  const c = createCharacter(db, alice.id, "Aria");
  expect(findCharacter(db, alice.id, c.id)).toMatchObject({
    id: c.id,
    name: "Aria",
  });
  expect(findCharacter(db, bob.id, c.id)).toBeUndefined();
  expect(findCharacter(db, alice.id, 99999)).toBeUndefined();
});
