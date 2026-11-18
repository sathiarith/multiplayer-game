import { level } from "./level.js";

export const MAX_CHARACTERS = 3;
// Derived from the shared map, so the server and the client cannot disagree.
export const SPAWN = {
  x: (level.spawn.col + 0.5) * level.tileSize,
  y: (level.spawn.row + 0.5) * level.tileSize,
};
export class CharacterLimitError extends Error {}
export class NameTakenError extends Error {}

// pos_x AS x renames the column in the result, so the API says x and y.
const COLUMNS = "id, name, class, level, hp, score, xp, pos_x AS x, pos_y AS y";

export function listCharacters(db, userId) {
  return db.query(
    `SELECT ${COLUMNS} FROM characters WHERE user_id = $1 ORDER BY id`,
    [userId],
  );
}

export async function createCharacter(
  db,
  userId,
  name,
  characterClass = "warrior",
) {
  try {
    // Count and insert as one unit, so the limit holds.
    return await db.transaction(async (tx) => {
      const { n } = await tx.one(
        "SELECT CAST(COUNT(*) AS integer) AS n FROM characters WHERE user_id = $1",
        [userId],
      );
      if (n >= MAX_CHARACTERS) throw new CharacterLimitError();
      return tx.one(
        `INSERT INTO characters (user_id, name, class, pos_x, pos_y)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
        [userId, name, characterClass, SPAWN.x, SPAWN.y],
      );
    });
  } catch (err) {
    if (db.isUniqueViolation(err)) throw new NameTakenError();
    throw err;
  }
}

// Saves what the server knows about a character. Returns true only if the
// character exists AND belongs to this user. Score, level and XP are left
// unchanged when not given.
export async function saveCharacterState(
  db,
  userId,
  characterId,
  { x, y, hp, score, level, xp },
) {
  const { changes } = await db.run(
    `UPDATE characters
        SET pos_x = $1, pos_y = $2, hp = $3,
            score = COALESCE($4, score), level = COALESCE($5, level), xp = COALESCE($6, xp)
      WHERE id = $7 AND user_id = $8`,
    [x, y, hp, score ?? null, level ?? null, xp ?? null, characterId, userId],
  );
  return changes === 1;
}

// The character if it exists AND belongs to this user, otherwise undefined.
export function findCharacter(db, userId, characterId) {
  return db.one(
    `SELECT ${COLUMNS} FROM characters WHERE id = $1 AND user_id = $2`,
    [characterId, userId],
  );
}
