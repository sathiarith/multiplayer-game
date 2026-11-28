# Sprint 1 retro

**Sprint goal:** playable single-player canvas game
**Met?** yes

## Done

- Stories 1.1 to 1.6 (PRs 16, 19, 20, 21, 22, 24, listed below)
- Test count at end of sprint: 32

## Not done

- N/A

## What went well

- Debugging evidence: the server log showed the level2.json 404 chain, and determined that a stale cache caused the unchanged behavior after player character speed modifier was changed.
- Became more familiar with git commands (git merge, git push)
- Considered licensing issues when using external assets and changed plans when github storage of sprite assets violated the license's terms.

## What slowed me down

- Unsaved files and browser caching (twice and once, respectively)
- Commits that included unrelated files, because npm run format rewrote files I hadn't touched.
- Starting work before creating the branch

## One thing to change next sprint

- Ensure working on a separate branch and not directly on main by running git branch --show-current

## Things I learned that I could not explain before

- Git workflow:
  - I learned more about git commands and developed a clearer understanding of git commands. For example,
    the general command flow is to open a new branch to work out changes with generous use of git status to track targeted changes (git switch -c [branch name]), after completing any changes/feature I would add the changes in preparation of committing(git add [all relevant directories]), then use git commit -m "message" to document files put into the staging area. Then the commits would be pushed to the Github repository (git push -u origin [branch name]), handling the pull request, and deleting both Github's working branch along with the local (local being git branch -d [branch name]). Lastly, ensure the working branch is back to main and matches changes with remote branch/Github repo (git pull).
- Aspects of the game:
  - 1.1 Keyboard movement: Event loop, requestAnimationFrame, delta time (PR 16)
  - 1.2 Tile map and walls: fetch, async/await, pure functions, axis-by-axis collision (PR 19)
  - 1.3 Logic/rendering separation: ES modules, a shared/ boundary enforced by ESLint (PR 20)
  - 1.4 HUD overlay: Flexbox, absolute positioning, change-only DOM updates (PR 21)
  - 1.5 and 1.6 Animated sprite plus fallback: drawImage, canvas transforms, Promise.all, graceful degradation (PR 22 and 24)

## Status for "stakeholders" (3 lines)

- Done: Playable single-player prototype: an animated character walks a tile map
  with wall collision and a live HUD. 32 automated tests pass.
- Next: ID and password storage and character storage
- Blocked: None. Risk: native build tools for password hashing on Windows.
