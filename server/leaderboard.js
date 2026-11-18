// The highest scores. The database is the source of truth. With Redis, an index
// of the scores is kept in a sorted set, so reading the top ten does not scan
// the characters table. Without Redis, the database answers.
export const TOP_N = 10;

export function createLeaderboard({
  db,
  redis = null,
  logger,
  prefix = "game:lb:",
}) {
  const SCORES = `${prefix}scores`; // sorted set: member = character id, score = points
  const READY = `${prefix}ready`; // marker: the sorted set was built from the database

  // Highest score first, and for equal scores the lower id first.
  const byRank = (a, b) => b.score - a.score || a.id - b.id;

  // The public shape: no ids, no usernames.
  const present = (entries) =>
    entries.sort(byRank).map((e, i) => ({
      rank: i + 1,
      name: e.name,
      level: e.level,
      score: e.score,
    }));

  async function fromDatabase(limit) {
    return present(
      await db.query(
        "SELECT id, name, level, score FROM characters WHERE score > 0 ORDER BY score DESC, id ASC LIMIT $1",
        [limit],
      ),
    );
  }

  // Builds the sorted set from the database. It is written to a temporary key
  // and renamed over the real one in one transaction, so a reader never sees
  // a half-built board.
  async function rebuild() {
    if (!redis) return;
    const rows = await db.query(
      "SELECT id, score FROM characters WHERE score > 0",
    );
    const temporary = `${SCORES}:rebuild`;
    const transaction = redis.multi().del(temporary);
    if (rows.length > 0) {
      transaction.zAdd(
        temporary,
        rows.map((r) => ({ score: r.score, value: String(r.id) })),
      );
      transaction.rename(temporary, SCORES);
    } else {
      transaction.del(SCORES);
    }
    transaction.set(READY, "1");
    await transaction.exec();
  }

  async function fromRedis(limit) {
    if (!(await redis.exists(READY))) await rebuild();
    const ranked = await redis.zRangeWithScores(SCORES, 0, limit - 1, {
      REV: true,
    });
    if (ranked.length === 0) return [];

    // The names come from the database, with one query for just these ids.
    const ids = ranked.map((m) => Number(m.value));
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    const rows = await db.query(
      `SELECT id, name, level FROM characters WHERE id IN (${placeholders})`,
      ids,
    );
    const known = new Map(rows.map((r) => [r.id, r]));
    return present(
      ranked
        .filter((m) => known.has(Number(m.value)))
        .map((m) => ({ ...known.get(Number(m.value)), score: m.score })),
    );
  }

  return {
    rebuild,

    async top(limit = TOP_N) {
      if (!redis) return fromDatabase(limit);
      try {
        return await fromRedis(limit);
      } catch (err) {
        // Slower is better than wrong: the database always has the full picture.
        logger?.warn(
          { message: err.message },
          "leaderboard falling back to the database",
        );
        return fromDatabase(limit);
      }
    },

    // Called after a character's score was saved to the database.
    async update(characterId, score) {
      if (!redis) return;
      if (score > 0)
        await redis.zAdd(SCORES, { score, value: String(characterId) });
      else await redis.zRem(SCORES, String(characterId));
    },

    async remove(characterId) {
      if (redis) await redis.zRem(SCORES, String(characterId));
    },
  };
}
