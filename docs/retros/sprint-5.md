# Sprint 5 retro

**Sprint goal:** two browsers, two players, seeing each other move, with the server in charge
**Met?** yes

## Done

- Stories 5.1 to 5.5 (PRs: 67, 68, 69, 70, 71)
- Test count at end of sprint: 338 (up from 205 at the end of Sprint 4)

## Not done

- Nothing from the sprint scope.
- Deliberately deferred: connection limits per IP and per user, a fuller
  graceful shutdown, a per-tick input queue on the server, detecting a login
  change made in another tab, and a WebSocket fallback for networks that block it.

## What went well

- I checked behavior in DevTools instead of taking it on trust: the WebSocket
  rows and the `welcome` frame in the Network tab, and the `sid` cookie values
  in two tabs and in two browsers. That check turned the account mix-up into a
  fact I understand.
- I reported experiment results exactly, including the ones that did not match.
  That exposed the real numbers behind the lost-input test and showed that the
  console warning came from StrictMode and not from a bug.
- I treated dependency warnings as decisions: I denied the blocked `scarf`
  install script on purpose, and I checked the `body-parser` advisory before
  fixing it with a plain `npm audit fix`.
- The test suite grew from 205 to 338 tests, and each failure pointed at a
  specific cause.

## What slowed me down

- Several instructions I was given were wrong or incomplete: the lost-input
  numbers in the prediction test, the test that kicked a player before the
  character had moved, the claim that a returning player would reappear where
  they left, and a line of the position endpoint that survived the removal.
  Running the tests found each one.
- Removing a feature touched about ten places, and one half-deleted line
  broke a whole test file.
- Tabs in one browser share a single login, so testing two accounts at once
  looked like the accounts were mixed up. I now use a normal window and an
  Incognito window.
- Console and DevTools output that looked like problems but were not: the
  "closed before the connection is established" warning from StrictMode, and
  the Network tab's "Socket" filter listing three rows, one of them Vite's own.

## One thing to change next sprint

- When I remove a feature, I will search for its names with `Select-String`
  and run each edited test file on its own before running the full suite.

## Things I learned that I could not explain before

- Why the client sends which keys are held and never a position: the server
  decides what is allowed, so a cheater who edits the client can only fool
  their own screen.
- What `ack` is for: it is the last input the server has applied, so the client
  takes the server's position and replays only the inputs the server has not
  seen yet.
- Why other players are drawn about 100 ms in the past: snapshots arrive 20 times
  a second, so blending between two of them looks smooth, while showing only the
  newest one looks like stepping.
- Why a WebSocket server must check `Origin` itself: browsers apply CORS to
  fetch requests, but not to WebSockets.
- Why the save comes before the player is forgotten: the owner lookup reads
  from the list of online players, so deleting first leaves nothing to save.
  A crash can lose at most 30 seconds, and a clean stop loses nothing.
- Why the movement step lives in `shared/`: the server and the client run the
  same code, so they cannot disagree about how a step works, and a test
  checks that they agree.
- Browsers keep one cookie jar for all tabs, so a second login in another tab
  replaces the first. Separate browsers or an Incognito window have separate
  jars.
- Corrected: I first expected two tabs of the same browser to hold two different
  accounts, and I assumed returning to a character would restore its position
  before anything saved it. Both were wrong, and the explanations above are the
  corrected ones.

## Status for "stakeholders" (3 lines)

- Done: Players log in, pick a character, and share one live world over
  WebSockets. The server decides all movement, other players move smoothly,
  your own character responds instantly, abusive clients are disconnected, and
  progress is saved. 338 automated tests pass.
- Next: Sprint 6: sessions and rate limits in Redis, a leaderboard, and
  end-to-end tests with Playwright.
- Blocked: Nothing. Risk: Docker Desktop may need setup on Windows before Redis
  can run, and the multi-server story needs rethinking, because the game world
  lives in one process's memory.
