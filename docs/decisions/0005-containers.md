# 0005: Containers and Docker Compose

Date: 2026-11-21. Status: accepted.

## Context
The game needs Node, PostgreSQL and Redis, and the client must be built and
served. Running each by hand differs from machine to machine, and nothing
waited for a dependency to be ready.

## Decision
- Two images: the server (multi-stage, production dependencies only, non-root,
  health check on /health), and the web front (the built client served by
  unprivileged nginx, which forwards /api and /socket.io to the server).
- Docker Compose runs both with postgres:18 and redis:7, on a private network.
  Only nginx publishes a port. Start-up waits on health checks.
- Data in named volumes; secrets from an uncommitted .env, required by Compose.
- One server container, because one process owns the game world (0003).
- The licensed sprites are mounted at run time, never built into an image.
- Development settings over plain HTTP until Sprint 9 adds HTTPS.

## Consequences
- One command starts the same stack on any machine with Docker.
- The server must trust exactly one proxy (TRUST_PROXY=1) for client addresses.
- Changing POSTGRES_PASSWORD after the first start needs a manual change in the
  database, because Postgres reads it only when creating the data folder.