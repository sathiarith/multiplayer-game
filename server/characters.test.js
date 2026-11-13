import { test, expect, beforeEach } from "vitest";
import { openDb } from "./db.js";
import { createUser } from "./users.js";
import {
  createCharacter,
  listCharacters,
  saveCharacterState,
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

test("saveCharacterState only changes the owner's character", () => {
  const c = createCharacter(db, alice.id, "Aria");
  expect(saveCharacterState(db, bob.id, c.id, { x: 5, y: 5, hp: 10 })).toBe(
    false,
  );
  expect(listCharacters(db, alice.id)[0]).toMatchObject({
    x: SPAWN.x,
    y: SPAWN.y,
    hp: 100,
  });

  expect(
    saveCharacterState(db, alice.id, c.id, { x: 5.25, y: 7.5, hp: 40 }),
  ).toBe(true);
  expect(listCharacters(db, alice.id)[0]).toMatchObject({
    x: 5.25,
    y: 7.5,
    hp: 40,
  });
});

test("saveCharacterState reports a character that does not exist", () => {
  expect(saveCharacterState(db, alice.id, 99999, { x: 1, y: 1, hp: 1 })).toBe(
    false,
  );
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

test("a new character starts with a score of 0", () => {
  expect(createCharacter(db, alice.id, "Aria").score).toBe(0);
});

test("saveCharacterState saves the score, and leaves it alone when none is given", () => {
  const c = createCharacter(db, alice.id, "Aria");
  saveCharacterState(db, alice.id, c.id, { x: 5, y: 5, hp: 90, score: 12 });
  expect(listCharacters(db, alice.id)[0]).toMatchObject({ hp: 90, score: 12 });

  saveCharacterState(db, alice.id, c.id, { x: 6, y: 6, hp: 80 }); // no score given
  expect(listCharacters(db, alice.id)[0]).toMatchObject({ hp: 80, score: 12 });
});

test("a new character starts at level 1 with no XP", () => {
  expect(createCharacter(db, alice.id, "Aria")).toMatchObject({
    level: 1,
    xp: 0,
  });
});

test("saveCharacterState saves level and XP, and leaves them alone when not given", () => {
  const c = createCharacter(db, alice.id, "Aria");
  saveCharacterState(db, alice.id, c.id, {
    x: 5,
    y: 5,
    hp: 120,
    level: 2,
    xp: 60,
  });
  expect(listCharacters(db, alice.id)[0]).toMatchObject({
    level: 2,
    xp: 60,
    hp: 120,
  });

  saveCharacterState(db, alice.id, c.id, { x: 6, y: 6, hp: 110 });
  expect(listCharacters(db, alice.id)[0]).toMatchObject({
    level: 2,
    xp: 60,
    hp: 110,
  });
});
