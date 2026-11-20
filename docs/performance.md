# Query performance

Measured with `node scripts/explain.js` (from `server/`) on a scratch database
with 20,000 players (40% of them with a score), in November 2026.

| Query | Plan | Execution time | Notes |
| --- | --- | --- | --- |
| Log in (find a user by name) | Index Scan using `users_username_lower` | 0.02 ms | The query must use `lower(username)`, the indexed expression. |
| List a player's characters | Index Scan using `idx_characters_user_id`, then Sort | 0.02 ms | The sort handles 1 to 3 rows. An index on `(user_id, id)` would remove it, but is not worth having. |
| A character's inventory | Index Scan using `inventory_pkey`, joined to `items` | 0.04 ms | `character_id` is the key's first column. `items` has 3 rows, so a Seq Scan of it is the cheapest choice. |
| Leaderboard (database fallback) | Index Scan using `idx_characters_leaderboard` | 0.026 ms (was 0.126 ms) | Migration 006. See below. |

## The leaderboard index

The query asks for characters with a score, ordered by `score DESC, id ASC`,
top 10. Most leaderboard reads are answered by Redis; this query runs when
Redis is empty or down, so it must stay fast at any size.

**Before migration 006** (an index on `score` only):

```text
Limit (actual time=0.060..0.062 rows=10.00 loops=1)
  Buffers: shared hit=14
  ->  Incremental Sort (actual time=0.058..0.059 rows=10.00 loops=1)
        Sort Key: score DESC, id
        Presorted Key: score
        ->  Index Scan Backward using idx_characters_score on characters (actual time=0.009..0.022 rows=12.00 loops=1)
              Index Cond: (score > 0)
Execution Time: 0.126 ms
```

The index gives rows in score order, but ties must still be sorted by `id`,
so Postgres reads past the tenth row to finish the last group of equal
scores (12 rows read for 10 returned), then sorts them.

**After migration 006** (`(score DESC, id ASC) WHERE score > 0`):

```text
Limit (actual time=0.008..0.018 rows=10.00 loops=1)
  Buffers: shared hit=12
  ->  Index Scan using idx_characters_leaderboard on characters (actual time=0.007..0.017 rows=10.00 loops=1)
Execution Time: 0.026 ms
```

No sort and no filter: the index is already in the query's order, and only
contains characters that have scored. It reads exactly 10 entries.

At 20,000 players both plans take a fraction of a millisecond. The difference
that matters is the shape: the old plan's work grows with the number of tied
scores, while the new one reads 10 index entries however large the table
gets. The partial index is also smaller, since 60% of characters have no
score yet.

## Test speed

| Setup | `npm test` duration |
| --- | --- |
| Development Postgres (durable writes) | 32 s |
| Test Postgres in memory, `fsync` off (port 5433) | 18.7 s |

Every test copies a database, and with durable writes Postgres waits for the
disk on each copy and each commit. The test server keeps its data in memory
and does not wait, which is safe only because test data is thrown away. The
development database keeps durable writes. The slowest file, `realtime.test.js`
(63 tests, each with its own database and game server), now sets the pace;
splitting it so its parts run in parallel is on the backlog.