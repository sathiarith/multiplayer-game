// The XP table from the database, checked once when it is loaded:
// [{ level, xpRequired, maxHp }], from level 1 up. The aliases are quoted
// because PostgreSQL lowercases names that are not.
export async function loadLevels(db) {
  const rows = await db.query(
    `SELECT level, xp_required AS "xpRequired", max_hp AS "maxHp" FROM levels ORDER BY level`,
  );
  if (rows.length === 0 || rows[0].level !== 1 || rows[0].xpRequired !== 0) {
    throw new Error("The levels table must start at level 1 with 0 XP");
  }
  rows.forEach((row, i) => {
    const previous = rows[i - 1];
    if (
      row.level !== i + 1 ||
      (previous && row.xpRequired <= previous.xpRequired)
    ) {
      throw new Error(
        "Levels must count up by one, each needing more XP than the last",
      );
    }
  });
  return rows;
}
