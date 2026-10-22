export const MAX_CHARACTERS = 3;
export const SPAWN = { x: 100, y: 60 }; // center of the spawn tile in level1.json
export const WORLD = { width: 800, height: 600 };

export class CharacterLimitError extends Error {}

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

// Returns true only if the character exists AND belongs to this user.
export function updatePosition(db, userId, characterId, x, y) {
  const info = db
    .prepare(
      "UPDATE characters SET pos_x = ?, pos_y = ? WHERE id = ? AND user_id = ?",
    )
    .run(x, y, characterId, userId);
  return info.changes === 1;
}
