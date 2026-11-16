# Sprint 7 retro

**Sprint goal:** make it a game: chat, items, inventory, trading, and basic combat
**Met?** yes

## Done

- Story 7.1 Chat (PRs #84, #90)
- Story 7.2 Inventory, with item pictures from the sprite pack (PR #91)
- Story 7.3 Trading (PRs #92, #93)
- Story 7.4 Combat (PRs #94, #95, #96), plus the warrior's attack animation (PR #97)
- Between sprints: a login that replaces a session ends that session's game,
  and every tab shows the real user (PRs #82, #83)
- Test count at end of sprint: 576 unit tests and 19 end-to-end
  tests, none skipped
- docs/erd.md: the database schema as a diagram

## Not done

- The optional chat history for moderation: deferred to the backlog.
- Deliberately deferred: combat between players, goblins that chase, a
  leaderboard page, and showing other players' swings at nothing.

## What went well

- I watched the careless version of the trade duplicate coins and leave
  half-done trades before I fixed it. Writing the double-trade test first
  made the bug and the fix both visible.
- I found several problems myself: the `item` folder that should have been
  `items`, Docker not being open behind 29 skipped tests, a missing bracket
  in `netGame.js`, and a typo in a sprite's file name.
- I kept every piece of licensed art out of git, including new subfolders,
  and checked it with `git check-ignore` each time.
- When an experiment didn't look right (typing in the chat box steering the
  character), I asked, then tested it properly by holding a key.
- I shaped the game myself: a goblin instead of a slime, my own naming for
  sprite files, and the warrior's attack animation.

## What slowed me down

- Three partial edits removed more than they should have: the `refusals` line
  in `protocol.js`, `monsters` in the realtime test helper, and the end of
  `onSnapshot`. Each time the tests caught it, but finding the cause took a
  round of questions.
- Some instructions I was given missed things: a hard-coded table list in
  `migrate.test.js`, `docker ps` left out of one story's start, and a
  placeholder test left in place.
- A flaky test that depended on timing (the failed save), and noise from an
  older test that shared one rate-limit store between two limiters.
- The stories were large. Chat, trading and combat each needed two or three
  parts.

## Sprint 6 action item: did I do it?

- Partly. The action was to reread pasted document edits as finished
  sentences. This sprint's doc edits were mostly whole sections copied in,
  so it rarely came up.

## One thing to change next sprint

- After every partial edit, I run `git diff <file>` and check that every
  removed (red) line was meant to go.

## Things I learned that I could not explain before

- A trade must check quantities inside its transaction, at the moment it
  runs. The items that were there when the offer was made may be gone.
- A transaction undoes every statement since it began when anything fails,
  and a database trigger can force a failure halfway to prove it.
- The server checks chat for length and forbidden characters but never
  strips HTML. Escaping is the client's job when it displays the text, and
  React does it by default.
- A two-column primary key makes a stack one row per character and item, and
  `ON CONFLICT` only works with a unique constraint like that.
- Never edit a migration that has already run. Write a new one.
- The client only says "attack". The server picks the target and enforces
  the cooldown, so a modified client gains nothing.
- World time comes from the tick count, so the fight is the same on every
  machine, and tests can run faster.
- Game numbers (the XP table, monsters, item spots) live in data, so
  balancing the game changes data, not code.
- A connection can keep the latest inventory and hand it to anyone who
  subscribes late, so nothing is missed between the welcome and React
  starting to listen.
- Two players grabbing one coin can't both get it today because Node handles
  one message at a time and SQLite answers synchronously. That guarantee
  disappears with an asynchronous database.

## Status for "stakeholders" (3 lines)

- Done: Players chat with those nearby, pick up items, trade with each other
  in safe all-or-nothing trades, and fight goblins to earn XP, levels and a
  place on the leaderboard. 576 unit tests and 19 browser tests pass.
- Next: Sprint 8: move from SQLite to PostgreSQL and run the whole stack with
  Docker Compose. The trades and pickups need row locking once the database
  is asynchronous.
- Blocked: Nothing.
