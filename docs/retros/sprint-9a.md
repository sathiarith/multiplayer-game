# Sprint 9a retro (automation)

**Sprint goal:** check every change automatically, and publish every tested
commit as images that can be traced back to their code
**Met?** yes

## Done

- The repository made public after a history scan (Gitleaks: 92 commits, no
  leaks), with the licence set to UNLICENSED (PR #116), secret scanning, push
  protection and Dependabot alerts
- Story 9.1 CI on every pull request: lint, unit and integration tests with
  coverage, the client build, the end-to-end tests, and both images built and
  started (PR #118), required on main through a ruleset
- Fixes found by CI: the loot and monster data, hidden by .gitignore since
  Sprint 7 (PR #119), and a trade test that assumed answers arrive in order
  (PR #121)
- Story 9.2 Images published to ghcr.io after green CI on main, tagged by
  commit, base images pinned by digest, Dependabot configured (PRs #122, #129)
- Docs: the CI badge, and README sections on CI and published images
  (PRs #120, #130)
- Dependabot's first update merged after passing CI (PR #117)
- First fully automatic publish: sha-9bc6f5d77737
- CI run: 1 min 47 s in total, as its three jobs run in parallel. Images run:
  publish game-server 21 s, publish game-web 15 s
- Test count at end of sprint: 605 unit and integration tests and 19
  end-to-end tests, none skipped

## Not done

- Sprint 9b: a server, HTTPS on play.sathchau.dev, production mode, backups,
  deploys, and monitoring
- Splitting realtime.test.js (still on the backlog)
- A request id for trade offers, so refusals can be matched to their offer
  (new, on the backlog)

## What went well

- The repository went public safely: a scan of the whole history found no
  secrets, and two checks proved no .env file and no licensed sprite was ever
  committed.
- CI found two real problems on its first day, both invisible on my machine:
  the loot and monster files had never been committed, and a trade test
  assumed answers arrive in the order they were asked.
- Every published image can be traced to its code: I pulled
  sha-9bc6f5d77737 without logging in, and its revision label matched the
  commit exactly.
- Pinning the base images by digest showed its value at once: postgres:18
  had already moved on since I first used it.
- Dependabot's first pull request went through the same checks as mine.

## What slowed me down

- The CI pull request itself (#118) was merged while red: checks can only be
  required after they have run once, which left a window.
- Publishing was refused twice until each package's Actions access listed
  the repository once, with Write. Finding the right settings pages took
  about an hour.
- GitHub's interface: finding a job's logs, the security settings and the
  package settings, under names that don't match what they do.
- Commands that didn't run as written: a commit refused on main that left
  its changes staged there, a <placeholder> typed literally, and PowerShell
  stripping quotes inside a docker inspect template.

## Sprint 8b action item: did I do it?

- Yes. I waited for each thing I started to be ready before using it:
  containers, the server, and CI runs. The idea is now built into the
  pipeline too: CI waits for Postgres and Redis to answer before testing,
  and docker compose up --wait waits for every health check.

## One thing to change next sprint

- Before running a command, I read it once: I replace anything in
  <angle brackets>, and check each command's output before running the next.

## Things I learned that I could not explain before

- A GitHub Actions workflow is made of triggers, jobs and steps; jobs run in
  parallel on separate machines, and a composite action shares steps
  between them.
- CI should start its databases the same way I do, and wait until they are
  ready; in a new Postgres container, pg_isready must ask over TCP.
- A workflow's token gets only the permissions it declares: read-only for
  CI, and packages: write only for publishing.
- A ruleset turns a red check into a blocked merge, but only after the check
  has run once.
- workflow_run makes publishing depend on a green CI run, only for main.
- A moving tag (main, node:24-alpine) can point at different images over
  time; a fixed one (sha-..., a digest) always means the same image.
- A revision label inside an image traces it back to the exact commit.
- Dependabot watches actions, npm packages and base images; grouping keeps
  its pull requests manageable, and CI checks each one.
- "Works on my machine" isn't proof: ignored files and timing both made code
  pass for me and fail elsewhere.
- Before a repository goes public, its whole history must be checked, since
  deleted files remain in it.

## Status for "stakeholders" (3 lines)

- Done: Every change is checked automatically (605 unit and 19 browser
  tests, plus both images starting) before it can be merged, and every
  tested commit is published as images traceable to their code. The
  repository is public.
- Next: Sprint 9b: a server, HTTPS on play.sathchau.dev, production mode,
  backups, automatic deploys and monitoring.
- Blocked: Nothing.
