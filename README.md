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
to download them and which files go in `client/assets/`.
