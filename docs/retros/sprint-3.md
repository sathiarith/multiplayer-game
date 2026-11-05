# Sprint 3 retro

**Sprint goal:** an API that is tested, documented and hardened
**Met?** yes

## Done

- Stories 3.1 to 3.4 (PRs: 43, 44, 45, 46)
- Test count at end of sprint: 134

## Not done

- Nothing from the sprint scope.

## What went well

- My experiment results contradicted a few of the instructions, and the tests showed which was right. Commenting out credentials: true showed that the test could fail, and the cookie table in DevTools showed the session cookie’s flags directly.
- I found and fixed the duplicated DEFAULT_RATE_LIMITS block and the missing GET /api/characters route from the error output and a Select-String search, instead of rewriting the file.
- My test suite roughly went from 79 to 134 tests, and failures pointed straight at causes (logLevel not returned, a route missing).

## What slowed me down

- Pasting multi-part edits into app.js: a duplicated block, and a route lost when a larger region was replaced than intended.
- Restarts: --watch drops requests that arrive mid-restart, and .env changes need a manual restart.
- Reading tool output: Chrome’s Cookies panel needs a site selected, pino writes levels as numbers (40, not “warn”), and Swagger UI refuses invalid values before sending.
- Some of the instructions I was given were wrong (a test asserting an absent header, the CSP directive that wouldn’t delete, the 404 I promised from Swagger). Worth recording, running it found each one.

## One thing to change next sprint

- After pasting code into an existing file, run git diff and read it before running the tests.

## Things I learned that I could not explain before

- Why coverage can be 100% on broken code: coverage only shows which lines ran,
  not whether a test checked the result, so a bug can sit on a line that
  executes.
- CORS: the browser blocks a page from reading responses from another origin
  unless the server names that origin in `Access-Control-Allow-Origin`. It
  protects the user's browser, and tools like curl ignore it.
- CSRF: a malicious page makes the user's browser send a request to my site with
  the user's cookie attached, so the server thinks it is genuine. The attacker
  can cause an action but cannot read the response or the cookie.
- Why logs must redact cookies: anyone who can read the logs could copy a
  session cookie and act as that user.
- Why unknown fields are rejected: it prevents mass assignment, where a client
  sets fields like `level` or `hp` that the server never meant it to control.
- What a rate limiter cannot do: it can block innocent users who share an IP
  address, an attacker with many addresses gets many tries, and an in-memory
  counter resets when the server restarts.
- What an OpenAPI contract test protects: the spec and the code cannot drift
  apart, because the tests fail if a route or a response is missing from either.

## Status for "stakeholders" (3 lines)

- Done: The API now has enforced test coverage (134 tests), health checks and
  request logging, security hardening (rate limits, cross-origin protection,
  strict input validation) with a written OWASP review, and an API spec that
  tests keep accurate.
- Next: Sprint 4: a React front end with login, character select, and the game
  canvas embedded.
- Blocked: Nothing. Risk: the API's allowed-origins list and the Vite dev proxy
  must be set up before login works from React.
