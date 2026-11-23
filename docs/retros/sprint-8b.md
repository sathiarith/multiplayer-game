# Sprint 8b retro (containers)

**Sprint goal:** package the game into containers, so the whole stack starts
with one command, the same way on any machine
**Met?** yes

## Done

- Story 8.3 Production images for the server and the web front, and the
  `TRUST_PROXY` setting (PR #105)
- Story 8.4 The whole game runs with `docker compose up --build` (PR #106)
- Story 8.5 (optional) PostgreSQL, MySQL and SQL Server compared hands-on
  (PR #108)
- Formatting-only changes from Prettier (PRs #107 and #109)
- Image sizes: game-server 70.5 MB of content (307 MB on disk), game-web
  25.7 MB of content (90.9 MB on disk)
- Test count at end of sprint: 605 unit and integration tests and 19
  end-to-end tests, none skipped
- Docs: decision record 0005, the README's container section,
  docs/database-comparison.md with its scripts

## Not done

- HTTPS and production mode in the containers (Sprint 9, as planned with Option A)
- Security headers from nginx for the pages themselves (Sprint 9)
- Splitting realtime.test.js (still on the backlog from Sprint 8a)

## What went well

- I checked the images for what matters, not just that they built: the server
  runs as `node`, can't change its own code, and the images contain no `.env`,
  no dev dependencies and no licensed sprites. Each was proven with a command.
- After the second crash from a missing file, I searched the code for every
  path outside `server/`, instead of waiting for the next crash.
- Compose brought all four services up healthy on the first start, in the
  order the file asks for: databases first, then the server, then nginx.
- The database comparison found two silent defaults: MySQL's client guessed
  the wrong text encoding and stored a garbled name without any error, and
  `sqlcmd` left off a setting that SQL Server's filtered indexes need. I
  confirmed the first with `HEX()` instead of trusting either result.
- I reviewed my documents line by line before committing them.

## What slowed me down

- The allowlist ignore file missed two files the server needs
  (`data/loot.json` and `docs/openapi.yaml`). The builds succeeded, and the
  server only crashed when it started.
- Where things live and where commands run: I typed `ls -a` in PowerShell
  instead of inside the container, mixed up the two `.env` files, and had not
  yet created `compose.yaml` at the root.
- Running commands before something was ready: pinging MySQL while it was
  still setting up, reading the SQL Server log too early, and opening DevTools
  after the game had already connected.
- Some instructions I followed were unclear or wrong: excluding all of
  `server/data`, a claim about addresses in the server log, a "step 3" that
  could mean two places, and code blocks not marked as whole files or edits.

## Sprint 8a action item: did I do it?

- It barely came up. The action was to copy a step's file list onto the card
  and tick each file once its own test passed. This sprint's steps changed
  only a few files each (a Dockerfile, an ignore file, compose.yaml), so there
  was little to track. I'll keep it for the next step that changes many files
  at once.

## One thing to change next sprint

- After starting anything (a container, a server, a tool), I wait for its
  ready signal (a health check, a ping, a log line) before using it.

## Things I learned that I could not explain before

- The build context is everything Docker may copy; an allowlist ignore file
  excludes everything first, so secrets can't slip in, but a wrong rule only
  shows up when the program runs.
- Copying package files before the code lets Docker reuse the dependency
  install from cache, so rebuilds after a code change take seconds.
- Inside a container, 127.0.0.1 means the container itself, so a server must
  listen on 0.0.0.0 to be reachable.
- Running as a non-root user, with files owned by root, means a compromised
  server can't rewrite its own code.
- nginx can serve the built client and forward /api and /socket.io, so the
  browser sees one origin; WebSockets need the Upgrade and Connection headers
  passed on.
- A single-page app needs every unknown path to return index.html, so a
  refresh on /play still loads the app.
- X-Forwarded-For carries the client's address through a proxy, and may only
  be trusted when the proxy is your own (TRUST_PROXY=1); otherwise anyone can
  fake it.
- `depends_on` with `condition: service_healthy` waits until a dependency is
  ready, not just started.
- Named volumes keep data across `docker compose down`; `down -v` deletes it.
- PostgreSQL, MySQL and SQL Server differ in returning new rows, case and
  accent rules, partial indexes and transactional schema changes; MySQL
  commits a CREATE TABLE even inside a transaction.
- Defaults decide a lot: always state the text encoding, and know which
  session settings a tool turns on.

## Status for "stakeholders" (3 lines)

- Done: The whole game (database, cache, server and web front) runs in
  containers with one command, with health checks, persistent data and no
  secrets or licensed art in the images. A comparison of three databases
  backs the choice of PostgreSQL. 605 unit and 19 browser tests pass.
- Next: Sprint 9: automated checks on every pull request, HTTPS, production
  mode, and deploying the stack.
- Blocked: Nothing.
