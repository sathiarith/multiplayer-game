# 0004: PostgreSQL instead of SQLite

Date: 2026-11-18. Status: accepted.

## Context
SQLite served every query through one synchronous connection inside the
server process. That hid concurrency (nothing could run between a check and
its write) and could not be shared by several server processes.

## Decision
PostgreSQL 18 through `pg`, with a connection pool. Plain SQL migrations with
up and down steps, applied in transactions under an advisory lock. Tests copy
a migrated template database, one per test.

## Consequences
- Every query is asynchronous; a transaction holds one connection.
- Race conditions are real, so writes that must not double up check and
  change in one statement (or lock rows).
- The test suite needs Docker, and stops if Postgres is not reachable.
- Moving to PostgreSQL 19 later is a version change plus a dump and restore.