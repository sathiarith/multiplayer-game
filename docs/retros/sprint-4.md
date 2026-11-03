# Sprint 4 retro

**Sprint goal:** a React front end with login, character select and the game canvas
**Met?** yes

## Done

- Stories 4.1 to 4.4 (PRs: 53, 54, 55, 56)
- Test count at end of sprint: 205 (up from 134 at the end of Sprint 3)

## Not done

- Nothing from the sprint scope.
- Deliberately deferred: the chosen character does not survive a page reload,
  positions are not saved from the game, and client code is not in the
  coverage report.

## What went well

- When the StrictMode test failed, I found the cause with evidence. A log line
  showed only one request was made, and a small probe test showed that
  StrictMode does run effects twice in my setup. That showed the fault was in
  that one test, not in the app.
- I checked behavior in DevTools instead of taking it on trust: the request
  URL showing port 5173 (the proxy at work), the session cookie, and the
  keydown listener count dropping from one to `undefined` after leaving the
  Play page.
- I asked for clearer directions when the mutation and `key` experiments were
  vague, and the rewritten version worked. I also ran every experiment, and
  the results matched.

## What slowed me down

- I committed on `main` while building story 4.3 and only noticed when I ran
  `git status`. This is the same slip as in Sprint 1, and my Sprint 2 action
  item did not prevent it.
- Some instructions were ambiguous or wrong: I looked at the Login page when
  the instruction meant Register, I could not find the full request URL in the
  Network tab, and the first version of the StrictMode test never made the
  second request it was waiting for.
- Prettier cannot format `.env.example`, so that file has to be left out of the
  command.

## One thing to change next sprint

- I installed a local pre-commit hook that refuses commits on `main`, and tested
  it with an empty commit. It is local, so it is not shared through git, and
  `--no-verify` bypasses it. I will also run `git branch --show-current` before
  editing anything.

## Things I learned that I could not explain before

- React decides whether to re-render by checking whether the new state is a
  different object. `push` edits the existing array and `return s` hands back
  the same object, so React sees no change and skips the render.
- The cleanup function in `GameCanvas` cancels a map request that is still
  loading, cancels the next animation frame, and removes the key listeners.
  Without it, every visit to the Play page would leave another game loop and
  another set of listeners running. I saw this in DevTools: one `keydown`
  listener on the Play page and none after leaving.
- StrictMode runs an effect twice in development on purpose (start, clean up,
  start again) to expose missing cleanup. The game does not need to run twice.
- The browser only talks to the Vite dev server on port 5173. Vite forwards
  `/api` requests to port 3001 itself, so the Network tab shows 5173, the
  app looks same-origin, and the session cookie works.
- A test that finds a button by its role and name is more reliable than one
  that uses its CSS class. A user finds a button by what it says, so a restyle
  does not break the test, and a button with no accessible name fails the
  query, which is also a problem for screen-reader users.
- A reload throws away everything React holds in memory, including the selected
  character, but my login survives because the session is a cookie stored by
  the browser. So `/play` finds no selected character and redirects to
  `/characters`. Things live in three places: React's memory (lost on reload),
  the browser (cookies survive), and the server (survives both).
- Corrected: I first thought the cleanup existed to remove one of two game
  loops, that port 5173 was "trusted" by port 3001, and that `/play` redirected
  because loading `/characters` was safer. All three were wrong, and the
  explanations above are the corrected ones.

## Status for "stakeholders" (3 lines)

- Done: A React front end where users register, log in, create up to three
  characters, and play a tile-map game with an animated character and a live
  HUD. 205 automated tests pass.
- Next: Sprint 5: real-time multiplayer, where the server controls movement
  and players see each other.
- Blocked: Nothing. Risk: Sprint 5 is the hardest sprint, and the WebSocket
  connection needs the Vite proxy and the origin check set up first.
