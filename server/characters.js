export const MAX_CHARACTERS = 3;
// Derived from the shared map, so the server and the client cannot disagree.
export const SPAWN = {
  x: (level.spawn.col + 0.5) * level.tileSize,
  y: (level.spawn.row + 0.5) * level.tileSize,
};
export class CharacterLimitError extends Error {}
import { level } from "./level.js";

// pos_x AS x renames the column in the result, so the API says x and y.
const COLUMNS = "id, name, class, level, hp, pos_x AS x, pos_y AS y";

export function listCharacters(db, userId) {
  return db
    .prepare(`SELECT ${COLUMNS} FROM characters WHERE user_id = ? ORDER BY id`)
    .all(userId);
}

export function createCharacter(db, userId, name, characterClass = "warrior") {
  // Count and insert as one unit, so the limit holds.
  const create = db.transaction(() => {
    const { n } = db
      .prepare("SELECT COUNT(*) AS n FROM characters WHERE user_id = ?")
      .get(userId);
    if (n >= MAX_CHARACTERS) throw new CharacterLimitError();

    const info = db
      .prepare(
        "INSERT INTO characters (user_id, name, class, pos_x, pos_y) VALUES (?, ?, ?, ?, ?)",
      )
      .run(userId, name, characterClass, SPAWN.x, SPAWN.y);
    return db
      .prepare(`SELECT ${COLUMNS} FROM characters WHERE id = ?`)
      .get(Number(info.lastInsertRowid));
  });
  return create();
}

// Saves what the server knows about a character. Returns true only if the
// character exists AND belongs to this user.
export function saveCharacterState(db, userId, characterId, { x, y, hp }) {
  const info = db
    .prepare(
      "UPDATE characters SET pos_x = ?, pos_y = ?, hp = ? WHERE id = ? AND user_id = ?",
    )
    .run(x, y, hp, characterId, userId);
  return info.changes === 1;
}

// The character if it exists AND belongs to this user, otherwise undefined.
export function findCharacter(db, userId, characterId) {
  return db
    .prepare(`SELECT ${COLUMNS} FROM characters WHERE id = ? AND user_id = ?`)
    .get(characterId, userId);
}
