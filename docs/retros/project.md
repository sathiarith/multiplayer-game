# Project retrospective: Multiplayer Game, Sprints 0 to 9

From an empty repository to a multiplayer browser game running at
https://play.sathchau.dev: tested on every change, deployed automatically,
backed up nightly, and monitored from outside.

## What exists now

- **The game:** a top-down world in the browser (Canvas, then React), where
  players move with client-side prediction and server reconciliation, chat
  nearby, pick up items, trade with each other, fight goblins, earn XP and
  climb a leaderboard.
- **The server:** Node.js, Express and Socket.IO, with one process owning the
  game world (decision record 0003). Accounts with bcrypt and sessions in
  Redis, rate limits, validation, and security reviewed against the OWASP
  Top 10.
- **The data:** PostgreSQL 18 with versioned, reversible migrations, data
  access proven correct under concurrency, and Redis for sessions, rate
  limits and the leaderboard index.
- **The delivery:** Docker images, Compose locally, GitHub Actions on every
  pull request, images published by commit, and automatic deploys with
  rollback to an Amazon Lightsail server behind Caddy and HTTPS.
- **The operations:** nightly backups off the server with a tested restore,
  outside uptime checks, a backup heartbeat, server alarms, and a runbook.

## How it grew

| Sprints | Focus                                                                | Tests at the end                       |
| ------- | -------------------------------------------------------------------- | -------------------------------------- |
| 0 to 5  | The game, the API, accounts and security, real-time multiplayer      | 32, 79, 134, 205, 338 (Sprints 1 to 5) |
| 6       | Redis (sessions, rate limits, leaderboard), browser end-to-end tests | 401 + 12 end-to-end                    |
| 7       | Game systems: chat, inventory, trading, combat                       | 576 + 19                               |
| 8a      | PostgreSQL, migrations, an async data layer, concurrency             | 602 + 19                               |
| 8b      | Containers: images, Compose, a database comparison                   | 605 + 19                               |
| 9a      | Continuous integration, published images, going public               | 605 + 19                               |
| 9b      | Production: HTTPS, backups, automatic deploys, monitoring            | 606 + 19                               |

The tests grew with the features (Sprints 1 to 7), then held steady while the
foundations changed underneath them (Sprints 8 and 9): the same tests carried
the game through a database switch, containers and the move to the cloud.

## Bugs found before players did

The ones worth remembering, because each was invisible until something
changed the conditions:

- **Concurrency (8a):** tests that fired requests at the same moment found
  that the character limit could be exceeded, and that overlapping saves could
  write an older position last. Both had been hidden by SQLite answering
  instantly; PostgreSQL's real round trips exposed them.
- **Hidden files (9a):** CI's fresh copy of the repository showed that the
  loot and monster data had never been committed: a folder-wide .gitignore
  rule had hidden them since Sprint 7. "Works on my machine" in its purest form.
- **Timing (9a):** a test assumed answers arrive in the order they were asked.
  On CI's different machine, they didn't.
- **Proxies (9b):** behind Caddy, nginx reported "http", so production mode
  would have refused to set the Secure session cookie. Found by reasoning
  about the chain before deploying, and confirmed by the Secure flag after.
- **False confidence (9b):** nginx answers 200 for any address, so a monitor
  that only checks the status code can never fail. The health monitor checks
  for "status":"ok" instead.

## Lessons that kept coming back

- **Change the conditions, and hidden problems appear.** SQLite to PostgreSQL,
  my machine to CI, development to production: each move found something.
  Moving early and often is cheaper than moving once, late.
- **Defaults decide a lot.** Accent-insensitive collations, a sqlcmd setting,
  Docker keeping logs forever, a monitoring tool guessing ten useless
  monitors: none of them was wrong, but each needed looking at.
- **Measure before concluding.** The test-speed result was misleading until I
  checked which database it had used; the deploy "failure" was a check run
  two minutes early.
- **Prove the safety net by using it.** A backup only counts once restored, a
  rollback once rolled back, an alert once received. Every drill found
  something to adjust, or confirmed something I'd only assumed.
- **Least privilege, everywhere.** Non-root containers, a read-only CI token,
  a bucket key for one bucket, a deploy key that can only ask for a deploy.
  Each limit cost minutes, and would contain a mistake or a leak.

## How my habits changed

The action item from each retro, and what it says about where the hard part
moved:

| After     | Action item                                   | Shows                                      |
| --------- | --------------------------------------------- | ------------------------------------------ |
| Sprint 7  | `git diff` after every partial edit           | early on, the risk was in editing code     |
| Sprint 8a | a file-list checklist for many-file changes   | then in keeping track of large changes     |
| Sprint 8b | wait for a ready signal before using anything | then in systems that start asynchronously  |
| Sprint 9a | read each command once; replace placeholders  | then in commands with real consequences    |
| Sprint 9b | check the prompt matches the block's label    | finally in working on two machines at once |

Early sprints were about writing correct code. Later ones were about
operating it safely: the mistakes moved from "the test fails" to "this
command runs on the wrong machine", and the habits followed.

## What I would do differently

- **Start continuous integration in Sprint 1.** It would have caught the
  hidden data files in Sprint 7, the day they were added, rather than two
  sprints later.
- **Deploy something to a real server early** (a "walking skeleton"), even
  if it's ugly. Production found problems no local setup could.
- **Put the data access behind an interface from the start**, so switching
  databases would have been one sprint, not three parts.
- **Set up secrets and settings before merging the code that needs them.**

## Skills highlight

- Built and operate a real-time multiplayer browser game (Node.js, Express,
  Socket.IO, React, PostgreSQL, Redis), live at https://play.sathchau.dev,
  with client-side prediction and a server-authoritative game world.
- Wrote 600+ unit and integration tests and 19 browser end-to-end tests
  (Vitest, Playwright), including concurrency tests that found two race
  conditions before release.
- Migrated from SQLite to PostgreSQL behind an async data interface, with
  reversible migrations and indexes justified with EXPLAIN ANALYZE.
- Built the delivery pipeline: Docker images, GitHub Actions on every pull
  request, images published by commit, and automatic deploys with health
  checks and one-command rollback (about 3 minutes from merge to live).
- Run production on AWS Lightsail behind Caddy (HTTPS, security headers),
  with nightly off-site backups and a tested restore, uptime monitoring,
  backup heartbeats, alarms, and a written runbook.

## Notable moments

- **A race condition found by a test that failed first (8a):** what the bug
  was, why SQLite hid it, how a row lock fixed the character limit, and how
  serializing saves per character fixed the ordering.
- **CI's first day (9a):** a fresh copy of the repository couldn't start the
  game; why that happened, and why it's the reason CI exists.
- **The Secure cookie behind two proxies (9b):** how X-Forwarded-Proto and
  TRUST_PROXY decide whether a login works in production.
- **A deploy that can't break production (9b):** pull first, back up, check
  from outside, roll back; and the drills that proved it.
- **A mistake and its fix (9b):** an edited command that nearly removed my own
  SSH key, what saved it, and the habit I added to the runbook.

## Numbers

- 10 sprints (0 to 9; 8 and 9 in two halves each), 88 pull requests
- 606 unit and integration tests and 19 end-to-end tests, run in about 2
  minutes on every pull request
- About 3 minutes from merge to live; about 12 seconds to roll back
- 5 decision records, a runbook, and a retro for every sprint
