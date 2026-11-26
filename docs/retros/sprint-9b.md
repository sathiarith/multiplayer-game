# Sprint 9b retro (operations)

**Sprint goal:** run the game in the cloud over HTTPS, deploy every merge
automatically and safely, and find out about problems before players do
**Met?** yes

## Done

- Story 9.3 The game at https://play.sathchau.dev on an Amazon Lightsail server
  (Ohio, Ubuntu 24.04, $12 plan): SSH keys only, firewall on 22/80/443, automatic
  security updates, Caddy with automatic HTTPS, NODE_ENV=production, security
  headers (PRs #132, #133); nightly backups to a private bucket, restore tested
  (PRs #134, #135)
- Story 9.4 Automatic deploys after every merge, with health checks, automatic
  and one-command rollback, a restricted deploy key, a runbook and decision
  record 0006 (PRs #136, #137)
- Story 9.5 Monitoring: /healthz, UptimeRobot keyword and page monitors, a
  Healthchecks.io heartbeat for backups, Lightsail alarms, Docker log rotation
  (PRs #138, #139)
- Dependabot updates merged after passing CI, including connect-redis 11.0.0
  (#128, a major version): login checked in production from a private window
- From merge to live: about 3 minutes (CI 1 min 45 s, Images 27 s, Deploy 25 s)
- Alert times in the drills: down to email in about 3 minutes (10:36 to
  10:39 PM), back up to email in about 4 minutes (10:40 to 10:44 PM), with
  checks every 5 minutes
- Stopping Redis: only the health monitor alerted, within about 5 minutes,
  while the page monitor stayed up; /healthz recovered by itself once Redis
  was started again (no server restart needed, as far as I saw)
- A false backup failure: Healthchecks.io turned red and emailed within a
  minute or two, then green again after running ./backup.sh
- Test count at end of sprint: 606 unit and integration tests and 19
  end-to-end tests, none skipped

## Not done (on the backlog)

- Skip deploying commits that are no longer the head of main
- Drill an automatic rollback after a failed health check
- Ship logs off the server; deploy backup.sh and deploy.sh with each release
- Application metrics (players online, tick time, errors per minute)
- IPv6 (an AAAA record) once Docker's IPv6 is set up

## What went well

- The game is live over HTTPS in production mode, and the strict settings
  from earlier sprints all work for real: Secure cookies, https origins only,
  no API docs page, Redis required.
- A merge reaches players in about 3 minutes with no command typed; every
  deploy takes a backup first and checks itself from outside.
- Two quick merges (#139, #128) deployed only the newer one: the concurrency
  rule replaced the waiting deploy, and production went straight to the newest
  version, which contained both changes.
- Every safety net was proven by breaking something on purpose: a restore
  from the bucket matched production, a rollback took about 12 seconds, a
  version that doesn't exist changed nothing, the deploy key could only
  request a deploy, and each outside alert arrived and cleared.
- The first scheduled backup ran unattended at 03:30 UTC
  (game-20261126-033001.dump, 12K) and pinged its heartbeat.
- I traced problems before fixing them: ssh -v showed my key was accepted
  (the first connection had timed out), and /healthz answered before its
  deploy had finished.
- I avoided monitoring's false positives: nginx answers 200 for any address,
  so UptimeRobot's ten guessed monitors could never fail; I deleted them, and
  the health monitor checks for "status":"ok".

## What slowed me down

- Secrets: I merged the deploy workflow before its secrets existed, saved the
  server fingerprint from an empty ssh-keyscan, and first saved the deploy key
  malformed ("error in libcrypto").
- SSH keys on the server: a placeholder pasted literally into
  authorized_keys, and an edited sed command that targeted my own login key.
  It survived only because its comment was sathchau_game, not sathchau-game.
- Running commands in the wrong place: PowerShell commands typed on the
  server several times.
- Windows quirks with ssh-keyscan and ssh-keygen through PowerShell pipes.
- AWS's new console: the Free plan layout, two account numbers, MFA under the
  Builder ID profile, and notification contacts on a separate page.

## Sprint 9a action item: did I do it?

- Partly. I checked each command's output before the next, which caught
  problems early many times. But I pasted a placeholder into authorized_keys
  without replacing it, so the "read it once" part slipped when I was moving
  quickly.

## One thing to change next sprint

- Before pasting a block, I check my prompt matches the block's label:
  PS C:\ for my computer, ubuntu@ for the server.

## Things I learned that I could not explain before

- SSH keys prove who I am without a password; a host fingerprint proves who
  the server is, and must be verified before it's trusted.
- Caddy gets a certificate by proving control of the name to Let's Encrypt,
  which checks from several places at once, and renews it automatically.
- Behind proxies, X-Forwarded-Proto and TRUST_PROXY decide whether the server
  knows the visitor used HTTPS, and so whether a Secure cookie can be set.
- A backup is only proven by a restore.
- A deploy can fail safely: pull first, back up, check health from outside,
  and roll back when it fails.
- A forced command with "restrict" in authorized_keys limits a key to one
  action.
- Migrations must allow rollbacks: add in one release, remove in a later one.
- A heartbeat (dead man's switch) catches the job that never runs, which no
  error message can.
- A health check must check content, not just a 200, when a site answers 200
  for any address.
- Logs belong to their container, and disappear when it's recreated.
- A major-version update from Dependabot needs checking in production, even
  when CI is green.

## Status for "stakeholders" (3 lines)

- Done: The game is live at https://play.sathchau.dev, deployed automatically
  about 3 minutes after each merge, with nightly tested backups, one-command
  rollbacks, and email alerts when anything breaks. 606 unit and 19 browser
  tests pass on every change.
- Next: A wider retro of the whole project, then choose what comes after
  Sprint 9.
- Blocked: Nothing.
