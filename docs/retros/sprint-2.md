# Sprint 2 retro

**Sprint goal:** accounts and characters stored in a database behind a REST API
**Met?** yes

## Done
- Stories 2.1 to 2.4 (PRs: 26, 27, 32, 33)
- Test count at end of sprint: 79

## Not done
- None

## What went well
- I found the timing leak myself (the unknown-user login came back faster)
- I asked when an explanation didn’t connect (the cookie, the “break the secret” experiment, the race condition). When explanations didn’t connect, I asked, then confirmed them by running the experiments myself.

## What slowed me down
- Running commands from the wrong folder (inside `server/`) by accident.
- Opening the .db file in a text editor, which showed NUL characters because
  SQLite files are binary.
- PowerShell differences from the examples (`curl`, cookies with `-SessionVariable`)
  and npm's new install-script approval step for `better-sqlite3`.

## One thing to change next sprint
- Run pwd or check the prompt path before any npm command, and run git branch --show-current before editing.

## Things I learned that I could not explain before
- I can explain:
- why a password hash is not encryption: hashing is one-way, so there is nothing to decrypt, even for someone who has the whole database. 
- what a salt does: each password gets its own random salt, so identical passwords
  produce different hashes, and a precomputed rainbow table cannot be reused
  across accounts. 
- why a session cookie holds only a random ID: the account data stays on the server, so a leaked cookie reveals nothing, and the server can invalidate it at logout, 
- why login returns identical errors for two cases: to prevent discovery of account usernames.
- what makes a race condition: concurrent requests can act on stale information and leave an invalid state, for example a fourth character slipping past the limit of three.
- and why the database enforces rules the code also checks: it serves as a last line of defense for bugs and against other programs writing to the same data.

## Status for "stakeholders" (3 lines)
- Done: Users can register, log in, and create characters through a REST API; passwords
  are stored as bcrypt hashes and users can only modify their own characters.
  79 automated tests pass.
- Next: Sprint 3: API tests with Supertest, an OpenAPI spec, and login security
  hardening (rate limiting, security headers).
- Blocked: Nothing. Risk: sessions are lost on every server restart until Redis (Sprint 6).