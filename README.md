# Multiplayer Game

A browser-based multiplayer game built to learn the full web stack:
JavaScript, HTML/CSS, React, Node/Express, SQL, WebSockets, Redis, Docker, and CI/CD.

## Stack

- Front end: vanilla JS and Canvas, then React (Vite)
- Back end: Node.js, Express, Socket.IO
- Data: PostgreSQL (SQLite until Sprint 8); Redis for sessions, rate limits and the leaderboard
- Tooling: ESLint, Prettier, Vitest, Playwright, GitHub Actions, Docker

## Getting started

    npm install
    npm run lint
    npm test

The tests need the test Postgres and Redis containers running (see below):

    docker start game-postgres-test game-redis

Without the test Postgres they stop with a message saying so. They never touch
the development database.

## Project structure

- `client/` browser app
- `server/` API and game server
- `shared/` game logic used by both
- `docs/` decisions, API spec, database diagram, performance notes, and runbooks

## Art assets

The sprite sheets are not included. See [CREDITS.md](CREDITS.md) for where
to download them and which files go in `client/public/sprites/`.

## Running locally

1. Start the database and Redis (the first time, create them as described in
   the next section):

       docker start game-postgres game-redis

2. In `server/`: copy `.env.example` to `.env`, then `npm install` and `npm run dev`.
   The server brings the database schema up to date as it starts.
3. In `client/`: `npm install` and `npm run dev`.
4. Open http://127.0.0.1:5173.

## Database and Redis

### First time

Create the three containers. The development Postgres keeps its data in a named
volume, so it survives the container being deleted.

    docker run -d --name game-postgres -p 127.0.0.1:5432:5432 -e POSTGRES_USER=game -e POSTGRES_PASSWORD=game-dev-only -e POSTGRES_DB=game -v game-postgres-data:/var/lib/postgresql postgres:18
    docker run -d --name game-redis -p 127.0.0.1:6379:6379 redis:7

The tests get their own Postgres on port 5433. It keeps its data in memory and
does not wait for the disk (`fsync=off`), which makes the test run about twice
as fast. That is safe only because test data is thrown away; never use these
settings for data you want to keep.

    docker run -d --name game-postgres-test -p 127.0.0.1:5433:5432 -e POSTGRES_USER=game -e POSTGRES_PASSWORD=game-dev-only -e POSTGRES_DB=game --tmpfs /var/lib/postgresql postgres:18 -c fsync=off -c synchronous_commit=off -c full_page_writes=off

Check they answer (give a new container a few seconds to start first):

    docker exec game-postgres psql -U game -d game -c "select version();"
    docker exec game-postgres-test psql -U game -d game -c "show fsync;"
    docker exec game-redis redis-cli ping

The second check should print `off`.

`DATABASE_URL` and `REDIS_URL` in `server/.env` point the server at the
development containers (see `server/.env.example`). In development, `DATABASE_URL`
defaults to the development Postgres. The password `game-dev-only` is for local
development only; a real deployment sets `DATABASE_URL` from a secret store.

### Useful commands (run in `server/`)

| Command | What it does |
| --- | --- |
| `npm run db:status` | Lists every migration, applied or pending |
| `npm run db:migrate` | Applies pending migrations |
| `npm run db:rollback` | Undoes the newest migration |
| `npm run db:seed` | Adds the demo accounts `demo_alice` and `demo_bob` (password `demo-password-123`); safe to run again |

To look inside the database: `docker exec -it game-postgres psql -U game -d game`.
The schema is drawn in [docs/erd.md](docs/erd.md), and query plans are recorded in
[docs/performance.md](docs/performance.md).

## End-to-end tests

`npm run e2e` starts a separate copy of the API (port 3101) and the client (port 5273),
with its own empty database (`game_e2e` in the test Postgres, recreated on every run)
and Redis database 15, and drives real browsers with Playwright. It needs the test
Postgres and Redis containers to be running. The first time, install the browser with
`cd e2e`, `npm install`, and `npx playwright install chromium`. After a failure, open
the report with `npm --prefix e2e run report` and look at the trace.