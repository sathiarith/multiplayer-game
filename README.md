# Multiplayer Game

A browser-based multiplayer game built to learn the full web stack:
JavaScript, HTML/CSS, React, Node/Express, SQL, WebSockets, Redis, Docker, and CI/CD.

## Planned stack

- Front end: vanilla JS and Canvas, then React (Vite)
- Back end: Node.js, Express, Socket.IO
- Data: SQLite, then PostgreSQL; Redis for sessions and caching
- Tooling: ESLint, Prettier, Vitest, GitHub Actions, Docker

## Getting started

    npm install
    npm run lint
    npm test

## Project structure

- `client/` browser app
- `server/` API and game server
- `shared/` game logic used by both
- `docs/` decisions, API spec, and runbooks

## Art assets

The sprite sheets are not included. See [CREDITS.md](CREDITS.md) for where
to download them and which files go in `client/public/sprites/`.

## Running locally

1. In `server/`: copy `.env.example` to `.env`, then `npm install` and `npm run dev`.
2. In `client/`: `npm install` and `npm run dev`.
3. Open http://127.0.0.1:5173.
4. Start Redis with `docker run -d --name game-redis -p 127.0.0.1:6379:6379 redis:7`, and set `REDIS_URL in server/.env`.
