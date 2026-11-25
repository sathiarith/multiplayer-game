# 0006: Automatic deploys, rollbacks, and backward-compatible migrations

Date: 2026-11-25. Status: accepted.

## Context

Production runs on one server from published images. Deploying by hand is
slow and error-prone, and a bad version must be easy to undo.

## Decision

- Merging to main deploys automatically: CI passes, Images publishes
  sha-<12 characters>, then the Deploy workflow asks the server to run it.
- The server's deploy.sh pulls first, backs up the database, restarts only the
  server and nginx, and checks health from outside (through Caddy, /api/me
  answers 401). On failure it starts the previous version again.
- Rolling back is deploying an older tag: the Deploy workflow run by hand, or
  ./deploy.sh previous on the server.
- GitHub's deploy key can only run deploy.sh with a version tag (a forced
  command with "restrict" in authorized_keys). The server's fingerprint is
  pinned. Secrets live in the "production" environment.
- Migrations must be backward-compatible with the previous release ("expand,
  then contract"): add tables, nullable columns or columns with defaults in one
  release; drop or rename only in a later release, once no running code uses
  them. The migration runner ignores migrations it doesn't know, so an older
  version can start on a newer database (tested in migrate.test.js).

## Consequences

- A deploy disconnects players for a few seconds, since one process owns the
  world (0003); clients reconnect by themselves, and positions are saved first.
- Every deploy and its result are recorded in deploys.log on the server and in
  GitHub's deployment history.
- A change that cannot be made backward-compatible needs a planned release,
  with a backup and a tested restore.
