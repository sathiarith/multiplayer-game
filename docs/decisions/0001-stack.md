# 0001: Technology stack

Date: 2026-10-15
Status: Accepted

## Context

I want to learn the web stack end to end by building a multiplayer game,
and the choices should also match skills common in job listings.

## Decision

- Node.js and JavaScript on both client and server, so one language covers everything.
- SQLite first, then PostgreSQL in Sprint 8.
- React for the interface, introduced in Sprint 4 after the backend exists.

## Alternatives considered

- PostgreSQL from the start: closer to production, but adds setup before I have learned SQL basics.
- React from the start: I would be learning the framework before I understand the DOM and Canvas it sits on.
- Python/Django backend: strong option, planned as a separate admin service in the stretch sprint.

## Consequences

- Moving from SQLite to PostgreSQL later costs a migration, so SQL stays behind a data-access layer.
- Shared JavaScript lets the server reuse the client's movement and collision code.
- I will not touch PHP, Angular, or .NET unless a target job requires them.