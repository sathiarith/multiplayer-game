import { test, expect, beforeEach, afterEach } from "vitest";
import { openTestDb } from "./pg/test-db.js";
import { createUser } from "./users.js";
import {
  createCharacter,
  listCharacters,
  saveCharacterState,
  findCharacter,
  CharacterLimitError,
  NameTakenError,
  MAX_CHARACTERS,
  SPAWN,
} from "./characters.js";

let db;
let alice;
let bob;

beforeEach(async () => {
  db = await openTestDb();
  alice = await createUser(db, "alice", "hash");
  bob = await createUser(db, "bob", "hash");
});

afterEach(() => db.close());

test("a new character starts at the spawn point with default stats", async () => {
  const c = await createCharacter(db, alice.id, "Aria");
  expect(c).toMatchObject({
    name: "Aria",
    class: "warrior",
    level: 1,
    hp: 100,
    x: SPAWN.x,
    y: SPAWN.y,
  });
});

test("listCharacters returns only the owner's characters", async () => {
  await createCharacter(db, alice.id, "Aria");
  await createCharacter(db, bob.id, "Borin");
  expect((await listCharacters(db, alice.id)).map((c) => c.name)).toEqual([
    "Aria",
  ]);
});

test("the character limit is enforced per user", async () => {
  for (let i = 0; i < MAX_CHARACTERS; i++)
    await createCharacter(db, alice.id, `hero${i}`);
  await expect(createCharacter(db, alice.id, "extra")).rejects.toThrow(
    CharacterLimitError,
  );
  expect(await listCharacters(db, alice.id)).toHaveLength(MAX_CHARACTERS);
  await expect(createCharacter(db, bob.id, "borin")).resolves.toBeDefined();
});

test("names are unique across users, ignoring case", async () => {
  await createCharacter(db, alice.id, "Aria");
  await expect(createCharacter(db, bob.id, "ARIA")).rejects.toBeInstanceOf(
    NameTakenError,
  );
});

test("the database refuses a character for a user that does not exist", async () => {
  await expect(createCharacter(db, 9999, "ghost")).rejects.toThrow(
    /foreign key/i,
  );
});

test("deleting a user deletes their characters", async () => {
  await createCharacter(db, alice.id, "Aria");
  await db.run("DELETE FROM users WHERE id = $1", [alice.id]);
  expect(await listCharacters(db, alice.id)).toEqual([]);
});

test("saveCharacterState only changes the owner's character", async () => {
  const c = await createCharacter(db, alice.id, "Aria");
  expect(
    await saveCharacterState(db, bob.id, c.id, { x: 5, y: 5, hp: 10 }),
  ).toBe(false);
  expect((await listCharacters(db, alice.id))[0]).toMatchObject({
    x: SPAWN.x,
    y: SPAWN.y,
    hp: 100,
  });

  expect(
    await saveCharacterState(db, alice.id, c.id, { x: 5.25, y: 7.5, hp: 40 }),
  ).toBe(true);
  expect((await listCharacters(db, alice.id))[0]).toMatchObject({
    x: 5.25,
    y: 7.5,
    hp: 40,
  });
});

test("saveCharacterState reports a character that does not exist", async () => {
  expect(
    await saveCharacterState(db, alice.id, 99999, { x: 1, y: 1, hp: 1 }),
  ).toBe(false);
});

test("SQL in a character name is stored as data, never executed", async () => {
  const evil = "x'); DROP TABLE characters;--";
  await createCharacter(db, alice.id, evil);
  expect((await listCharacters(db, alice.id))[0].name).toBe(evil);
});

test("findCharacter only finds the owner's character", async () => {
  const c = await createCharacter(db, alice.id, "Aria");
  expect(await findCharacter(db, alice.id, c.id)).toMatchObject({
    id: c.id,
    name: "Aria",
  });
  expect(await findCharacter(db, bob.id, c.id)).toBeUndefined();
  expect(await findCharacter(db, alice.id, 99999)).toBeUndefined();
});

test("a new character starts with a score of 0", async () => {
  expect(await createCharacter(db, alice.id, "Aria")).toHaveProperty(
    "score",
    0,
  );
});

test("saveCharacterState saves the score, and leaves it alone when none is given", async () => {
  const c = await createCharacter(db, alice.id, "Aria");
  await saveCharacterState(db, alice.id, c.id, {
    x: 5,
    y: 5,
    hp: 90,
    score: 12,
  });
  expect((await listCharacters(db, alice.id))[0]).toMatchObject({
    hp: 90,
    score: 12,
  });

  await saveCharacterState(db, alice.id, c.id, { x: 6, y: 6, hp: 80 }); // no score given
  expect((await listCharacters(db, alice.id))[0]).toMatchObject({
    hp: 80,
    score: 12,
  });
});

test("a new character starts at level 1 with no XP", async () => {
  expect(await createCharacter(db, alice.id, "Aria")).toMatchObject({
    level: 1,
    xp: 0,
  });
});

test("saveCharacterState saves level and XP, and leaves them alone when not given", async () => {
  const c = await createCharacter(db, alice.id, "Aria");
  await saveCharacterState(db, alice.id, c.id, {
    x: 5,
    y: 5,
    hp: 120,
    level: 2,
    xp: 60,
  });
  expect((await listCharacters(db, alice.id))[0]).toMatchObject({
    level: 2,
    xp: 60,
    hp: 120,
  });

  await saveCharacterState(db, alice.id, c.id, { x: 6, y: 6, hp: 110 });
  expect((await listCharacters(db, alice.id))[0]).toMatchObject({
    level: 2,
    xp: 60,
    hp: 110,
  });
});
