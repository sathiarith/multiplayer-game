# Sprint 6 retro

**Sprint goal:** move shared state to Redis, add a leaderboard, and test the whole stack in real browsers
**Met?** yes

## Done

- Stories 6.1, 6.2, 6.3, 6.5 and 6.4 (PRs #74, #76, #77, #79, #80), plus the
  security notes update (#78) and a README step for starting Redis and
  setting `REDIS_URL` (#75)
- Test count at end of sprint: 401 unit and integration tests (up from 338),
  plus 12 end-to-end tests and 1 skipped placeholder
- Decision record: `docs/decisions/0003-scaling-the-game-server.md`

## Not done

- Nothing from the sprint scope. Story 6.4 was rewritten: the original
  ("two servers, one world") is not possible with the Socket.IO adapter,
  because each server keeps its world in memory.
- Deliberately deferred: Redis password and TLS, a leaderboard page in the
  React app, detecting a session change made in another tab, a test that
  really restarts the server, and decision record 0002 (password hashing).

## What went well

- I checked what was in Redis directly with `redis-cli`: the session keys and
  their expiry, the rate-limit counts, and the leaderboard's sorted set. The
  tests passing was not the only evidence.
- I installed Docker with real checks: `hello-world`, `PONG` from Redis, and
  the port bound to `127.0.0.1` only.
- I asked whether the Vite `ECONNABORTED` messages mattered before ignoring
  them, and the answer came from my own output: they only appeared in tests
  that opened the game.
- I made an end-to-end test fail on purpose and read its trace, so I know how
  to debug a failure there.
- I asked for my `security.md` to be checked against what was built, which
  found stale lines and wording that was never finished.

## What slowed me down

- Some instructions I was given were flawed: a test fixture read an
  environment variable that nothing set, several `security.md` edits were
  written as instructions and their wording ended up in the file, and the
  Story 6.1 security note was never given to me at all.
- `process is not defined` took a round of questions, because the cause
  depends on which tool reports it.
- Story 6.4 had to be rewritten mid-sprint, because it promised something the
  adapter cannot do.
- Noisy output that was not a problem: the Vite socket errors and an npm
  configuration warning.
- Tests that skip themselves when Redis is missing can hide that they never ran.

## Sprint 5 action item: did I do it?

- Yes. When I remove a feature, I search for its names with `Select-String`
  and run each edited test file on its own before the full suite. Sprint 6
  removed little, so the search came up less often, but running each edited
  test file on its own was part of every story.

## One thing to change next sprint

- When I paste an edit into a document, I reread the result as a finished
  sentence, not an instruction.

## Things I learned that I could not explain before

- Why players stay logged in through a restart now: sessions live in Redis,
  and any server process using the same Redis and secret can read them.
- Why the login limiter fails closed: if Redis being down let every attempt
  through, an attacker would knock Redis over first.
- The database holds the scores and Redis holds an index of them. If the
  Redis keys are deleted, the next read rebuilds them from the database, so
  nothing is lost.
- How the leaderboard avoids showing a half-built board: it is rebuilt under a
  temporary key and renamed over the real one in one transaction.
- Why the end-to-end tests need their own stack: their own ports, database
  and Redis database 15, so flushing Redis before each test never touches my
  development data.
- A browser context has its own cookies, like a separate browser, so one test
  can run two accounts side by side.
- Why the Redis adapter cannot share a game world: it forwards broadcasts
  between servers, but each server still simulates only its own players, so a
  client would receive two worlds mixed together. To scale, run more worlds,
  each owned by one process.
- What `disableOfflineQueue` changes: when Redis is down, commands fail at
  once instead of waiting, so requests do not hang.
- Why a Redis URL must never be logged: it can contain a password.
- Corrected: I suspected the Vite socket errors were a bug. They come from
  connections closed on purpose, by React's development checks and by the end
  of each test.

## Status for "stakeholders" (3 lines)

- Done: Sessions, login limits and a leaderboard now live in Redis, so a
  server restart no longer logs players out. End-to-end tests drive real
  browsers through the whole game. 401 automated tests plus 12 browser tests
  pass.
- Next: Sprint 7: chat, combat and items, which turn the movement demo into a game.
- Blocked: Nothing. Decision record 0002 (password hashing) still needs writing.
