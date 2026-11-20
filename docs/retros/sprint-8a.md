# Sprint 8a retro (data)

**Sprint goal:** replace SQLite with PostgreSQL, with versioned migrations and
data access that stays correct under real concurrency
**Met?** yes

## Done

- Story 8.1 Migrations with up and down steps, a runner and a seed script (PR #100)
- Story 8.2 PostgreSQL:
  - Part 1, an async data interface, still on SQLite (PR #101)
  - Part 2, the switch to PostgreSQL, SQLite removed (PR #102)
  - Part 3, concurrency proven, a leaderboard index, ordered saves, and a fast
    test database (PR #103)
- Test count at end of sprint: 602 unit and integration tests and 19
  end-to-end tests, none skipped
- Docs: decision record 0004, docs/performance.md, the updated docs/erd.md
  and README

## Not done

- Splitting realtime.test.js so its parts run in parallel. It now sets the
  pace of the whole test run (on the backlog).
- Sprint 8b: Docker images and Compose.

## What went well

- Tests that failed first found two real bugs. Ten characters created at once
  for one player got past the limit, and overlapping saves of one character
  could write an older position last. The second had been in the code since
  Part 1; SQLite hid it by answering instantly, and Postgres's round trips
  exposed it.
- For the 22 test files in Part 2, I used a script for the mechanical edits,
  safely: I committed first, did a dry run, then let lint point at what the
  script couldn't fix.
- I tracked problems down precisely. `git diff --stat` showed the XP-table
  code had overwritten the map file. The goblin end-to-end failure turned out
  to be a timing flake, which I fixed by walking until in reach instead of
  for a fixed time. And checking the port showed my "after" timing hadn't
  used the new test database at all.
- The performance work was measured, not guessed: query plans before and
  after migration 006, and test speed before and after the test database
  (32 s to 18.7 s), written down in docs/performance.md.

## What slowed me down

- Edits applied out of order or to the wrong file: the new loadLevels code
  went into level.js instead of levels.js, I pasted an old copy of a file for
  review, and a line in app.test.js ended up after the request it was meant
  to come before. In Part 2, doing steps in a different order meant I needed
  the remaining work listed again from scratch.
- Some instructions I followed had mistakes: a `...` placeholder that went
  into the README literally, a check pattern that matched lines already
  converted, a hard-coded version list that was missed, and a conclusion
  about test speed drawn before confirming which database had been measured.
- The volume: Part 2 touched about 30 files, mostly mechanical, but long.
- At the start of every run, the first test in each file waited about six
  seconds while all files created databases at once, which needed longer
  timeouts until the in-memory test database arrived.

## Sprint 7 action item: did I do it?

- Partly. The action was to run `git diff <file>` after every partial edit
  and check every removed line. I used it when tests failed and when I was
  prompted, not routinely after each edit. When I did use it, it caught real
  problems (the overwritten level.js, the app.test.js repair). If I had run it
  after every edit, I would have caught the level.js mix-up before running
  the tests.

## One thing to change next sprint

- Before a step that changes many files, I copy its file list onto the card
  as a checklist, and tick each file only once its own test passes.

## Things I learned that I could not explain before

- A migration needs a down step, and a round-trip test proves the down
  really undoes the up, by comparing the schema before and after.
- An advisory lock lets two processes agree that only one runs the
  migrations, without locking any table.
- A transaction must use one connection from BEGIN to COMMIT; a pool hands
  out connections, so the transaction has to hold on to its own.
- The race tests passed on SQLite because nothing could run between a check
  and its write. With an asynchronous database, every `await` is a gap where
  another request can run.
- A lost update happens when two transactions read the same old value and
  the second write erases the first. One fix is a single statement that
  checks and changes together; another is locking the row first.
- `SELECT ... FOR UPDATE` makes concurrent creates for one player take turns,
  while creates for different players don't wait for each other.
- Saves of one character have to run one at a time, in order, or a slow
  older write can land after a newer one.
- How to read an EXPLAIN ANALYZE plan. An index in the query's own column
  order removes the sort, and a partial index (`WHERE score > 0`) leaves out
  rows the query never needs.
- `fsync=off` makes Postgres skip waiting for the disk. It nearly halved the
  test time, and is only safe for data that is thrown away.
- `.sort()` without a comparator sorts numbers as text, so 10 comes before 2.
- When code starts asynchronous work, a test should wait for that work to
  finish (`drain()`), not for time to pass.

## Status for "stakeholders" (3 lines)

- Done: The game now runs on PostgreSQL with versioned migrations. Trades,
  pickups, character creation and saving are proven correct under
  simultaneous requests. 602 unit and 19 browser tests pass.
- Next: Sprint 8b: package the server and client as Docker images, and run
  the whole stack with Docker Compose.
- Blocked: Nothing.
