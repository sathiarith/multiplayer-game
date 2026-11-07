# Security notes

Last reviewed: 2026-10-27
Scope: the Express API in `server/` as of Sprint 3.
Framework: OWASP Top 10:2025.

This is a developer self-review, not an audit. Each category says what is
handled, where the evidence is, and what is deliberately deferred.

## Scope and assumptions

- Assets: account credentials, session cookies, character data.
- Attackers considered: anonymous users on the internet, logged-in players who
  cheat or try to read other players' data, and a malicious website that a
  logged-in player visits.
- Not yet covered: the browser client (Sprint 4), WebSockets (Sprint 5),
  Redis (Sprint 6), containers and deployment (Sprints 8 and 9).

## A01 Broken Access Control

Handled:

- Every route except register, login, and `/health` goes through `requireAuth`.
- Looking up a character for the game connection and saving its state both use `WHERE id = ?` AND `user_id = ?`.
- A character that isn’t yours gets the same `not_found` refusal as one that doesn’t exist, and that ids in the handshake are parsed with `parseId` (plain digits only).
- Ids in URLs accept plain digits only (`parseId`), so `1e2` and `0x10` cannot
  turn into other ids.
- Cross-site requests are refused: a CORS allowlist with no wildcard, plus an
  `Origin` check on every state-changing request (`originGuard`).
- The WebSocket handshake checks `Origin` against the same allowlist as the REST guard, because browsers do not apply CORS to WebSockets. The user comes only from the session, and a character is checked for ownership exactly as in REST.

Evidence: the intruder test in `characters.api.test.js`, the forged-request
tests in `security.test.js`, and the id test in `validation.api.test.js`.

Deferred:

- Access control is opt-in per route. A new route could forget `requireAuth`.
  Mitigation: review new routes against the existing auth tests.

## A02 Security Misconfiguration

Handled:

- `helmet` sets security headers on every response, and `X-Powered-By` is removed.
- Configuration is validated at startup (`config.js`). In production the server
  refuses to start without a 32+ character `SESSION_SECRET`, with `https://`
  origins in `ALLOWED_ORIGINS`, and it turns on `Secure` cookies.
- Secrets live in `.env`, which is git-ignored. `.env.example` holds placeholders only.
- The server listens on `127.0.0.1` unless `HOST` says otherwise.
- Unexpected errors return a generic message, never a stack trace.

Evidence: `config.test.js`, `security.test.js`, `errors.test.js`.

Deferred:

- HTTPS is not set up until Sprint 9, and Express `trust proxy` must be set
  behind a reverse proxy, or every client looks like one address.
- The default Content-Security-Policy suits an API. Revisit it when the
  server also serves the web client.
- Redis listens on localhost only and has no password. Production needs a password and TLS (Sprint 9).

## A03 Software Supply Chain Failures

Handled:

- `package-lock.json` is committed, so installs are repeatable.
- npm blocks dependency install scripts by default. Only `better-sqlite3`
  (it needs a native binary) is allowed, through `allowScripts` in
  `server/package.json`.
- `npm audit` findings are reviewed, not auto-fixed with `--force`. The one
  known finding is in the `serve` development tool, which was replaced by
  `http-server`.
- Third-party art is credited in `CREDITS.md` and kept out of git, as its
  license requires.
- `npm audit` is reviewed on every dependency change. A high-severity `body-parser` advisory (denial of service through compressed request bodies) was fixed by a minor update. The Swagger UI dependency tree includes `@scarf/scarf`, whose analytics install script is denied in `allowScripts`.

Deferred:

- Automated dependency checks (`npm audit` in CI, Dependabot) arrive in Sprint 9.
- Dependency versions use caret ranges. The lockfile pins what is installed.

## A04 Cryptographic Failures

Handled:

- Passwords are hashed with bcrypt (cost 12, random salt per password).
  Plaintext passwords are never stored, logged, or returned.
- Session cookies are signed with a secret from the environment, and request
  ids come from `crypto.randomUUID()`.
- Passwords over bcrypt's 72-byte limit are refused instead of silently truncated.

Evidence: `app.test.js` (stored value is a bcrypt hash), `logging.test.js`
(no cookie or password in logs).

Deferred:

- TLS (Sprint 9). Until then `Secure` cookies are off in development.
- The SQLite file is not encrypted at rest, and backups are not set up yet.

## A05 Injection

Handled:

- All SQL uses `?` parameters. The only interpolated string is a fixed column
  list written in code, never user input.
- Input is validated with strict zod schemas before it reaches any query.
- Tests store SQL fragments as ordinary usernames and character names.
- The server renders no HTML. The in-game HUD uses `textContent`, not `innerHTML`.

Evidence: `users.test.js`, `characters.test.js`, `validation.test.js`.

Deferred:

- Chat (Sprint 7) must be escaped when displayed in the client.

## A06 Insecure Design

Handled:

- Rate limits on login and registration, and a per-user character limit that
  runs inside a transaction.
- Unknown fields are rejected, which prevents mass assignment (for example
  creating a character with a chosen level or HP).
- Rules that must not be bypassable live in the server and in the database
  (`UNIQUE`, foreign keys), not only in client code.
- Game clients send inputs only, never positions. Messages over 1024 bytes close the connection, every message costs a token (40 a second, bursts of 60), and malformed inputs, unknown events, and over-limit messages are violations. 20 violations within 10 seconds disconnect the client. The rules are in `docs/protocol.md`, and a test fails if the document and the code disagree.
- The server owns each character’s position and health. They are saved from the server’s own state every 30 seconds and when a player leaves, and no REST endpoint accepts a position.
- Change the rate-limit bullet to say the counters for login and registration are kept in Redis, so they survive a restart and would be shared by every server process.

Accepted trade-offs:

- Registration says "username taken", so usernames can be confirmed.
  Rate limiting makes bulk checking expensive.

Deferred:

- Server-authoritative game state (Sprint 5).
- Limits on connection attempts per IP and a cap on connections per user (Sprint 9, behind the reverse proxy); a timeout for sockets that open but never finish the handshake.

## A07 Authentication Failures

Handled:

- Unknown user and wrong password give the same response, and login always
  performs one bcrypt comparison (a dummy hash when the user is unknown), so
  response times are similar.
- A new session id is issued at login (prevents session fixation). Logout
  destroys the server-side session, so a copied cookie stops working.
- Cookies are `HttpOnly` and `SameSite=Lax`.
- At most 10 failed logins per IP per 15 minutes.
- Passwords need 10 to 72 bytes.
- Rate-limit line counted in Redis.

Evidence: `auth.test.js`, `security.test.js`. The timing equality was
checked by hand (an experiment in Sprint 2), not by an automated test, because
timing tests are unreliable.

Deferred:

- Rate limits are per IP. There is no per-account lockout.
- No multi-factor authentication, password reset, password change, breached-password
  check, or idle timeout.

## A08 Software or Data Integrity Failures

Handled:

- Session cookies are signed, so edited ids are rejected.
- Request bodies are parsed only as JSON and validated against strict schemas.
- Database changes go through versioned migrations stored in the repository.

Deferred:

- Verified builds and deploys (Sprint 9), and image provenance (Sprint 8).

## A09 Security Logging and Alerting Failures

Handled:

- Structured JSON logs with a request id on every line. Failed logins and
  blocked requests appear as warnings, and unexpected errors as errors.
- Cookies and authorization headers are redacted, and request bodies are
  never logged. Incoming request ids are accepted only if short and well formed.
- Disconnections for abuse are logged as warnings with the user and character ids.

Evidence: `logging.test.js`.

Deferred:

- Log collection, retention, and alerts (for example on many 401 or 429
  responses, or any 5xx) arrive with the deployment in Sprint 9.

## A10 Mishandling of Exceptional Conditions

Handled:

- One central error handler. Malformed JSON gives 400, oversized bodies 413,
  unknown routes a JSON 404, and everything else a generic 500 with details
  only in the log.
- Errors in async routes reach the handler (Express 5), and the handler
  passes the error on if a response has already started.
- Configuration errors stop the server at startup, and `/health` returns 503
  when the database is unusable.
- The interactive API documentation (`/api/docs`) is only mounted outside
  production, and it has its own Content-Security-Policy.

Evidence: `errors.test.js`, `logging.test.js`, and the database-failure tests
in `app.test.js` and `characters.api.test.js`.

Deferred:

- Handlers for `uncaughtException` and `unhandledRejection`, graceful shutdown,
  and request timeouts.

## Deferred work summary

| Item                                                  | Planned     |
| ----------------------------------------------------- | ----------- |
| Escape chat messages in the client                    | Sprint 7    |
| TLS, `trust proxy`, `Secure` cookies                  | Sprint 9    |
| Dependency scanning in CI                             | Sprint 9    |
| Alerting, log retention, backups                      | Sprint 9    |
| Process-level error handlers, graceful shutdown       | Sprint 9    |
| Per-account lockout, MFA, password reset              | Not planned |
| Connection-rate limits per IP and per user            | Sprint 9    |
| Full graceful shutdown (timeouts, finishing requests) | Sprint 9    |
| Redis password and TLS                                | Sprint 9    |

## How to re-check

- Run `npm test`. The security behavior above is covered by tests.
- Run `npm audit` in the root and in `server/` and read the findings.
- Review any new route for authentication, ownership, and a schema.
