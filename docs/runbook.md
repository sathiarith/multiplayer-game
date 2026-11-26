# Runbook: play.sathchau.dev

Server: Amazon Lightsail `game-1`, Ohio (us-east-2a), static IP 77.113.122.65.
Connect with `ssh game`. Everything lives in `~/game` (compose.yaml, Caddyfile,
.env, deploy.sh, backup.sh, sprites/). Times on the server are UTC.

## Is it up?

    curl -s -o /dev/null -w "%{http_code}\n" https://play.sathchau.dev/api/me    # 401 = healthy
    ssh game "cd ~/game && docker compose ps"                                     # all healthy

## Alerts, and what to do

| Alert                                    | From            | First step                                                                                                                                        |
| ---------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `play.sathchau.dev health` down          | UptimeRobot     | `ssh game "cd ~/game && docker compose ps"`: which service isn't healthy? Then its logs.                                                          |
| `play.sathchau.dev page` down            | UptimeRobot     | Same; if every service is healthy, check Caddy's log and the Lightsail firewall.                                                                  |
| Health down, page up                     | UptimeRobot     | Postgres or Redis failing: `docker compose logs postgres redis --since 30m`. After Redis comes back, restart the server if /healthz stays at 503. |
| `nightly database backup` late or failed | Healthchecks.io | `tail ~/backups/backup.log`; run `./backup.sh` by hand and read its error.                                                                        |
| CPU >= 80% or burst capacity <= 20%      | Lightsail       | `docker stats --no-stream`: which container? Then its logs.                                                                                       |
| Status check failures                    | Lightsail       | Reboot the instance from the Lightsail console; if it repeats, see "The server is lost".                                                          |

Errors in the last day:

    docker compose logs server --no-log-prefix --since 24h | jq -R -c 'fromjson? | select(.level >= 50) | {time, msg, err: .err.message}'

Requests per status code in the last hour:

    docker compose logs server --no-log-prefix --since 1h | jq -R -r 'fromjson? | select(.res) | .res.statusCode' | sort | uniq -c

Docker keeps at most 3 x 10 MB of logs per container (`/etc/docker/daemon.json`).
Logs are lost when a container is recreated, including on every deploy. To keep
them before a manual restart:

    docker compose logs server --no-log-prefix > ~/server-$(date -u +%F-%H%M).log

Where the monitoring lives: UptimeRobot (two monitors, every 5 minutes, email),
Healthchecks.io (`nightly database backup`, cron `30 3 * * *` UTC, 1 hour of grace,
email), and Lightsail alarms on `game-1` (email to the Ohio contact).

## Deploy a version

Automatic after every merge to main. By hand: GitHub, Actions, Deploy,
"Run workflow", with the tag (sha-<12 characters>). Or on the server:

    cd ~/game && ./deploy.sh sha-<12 characters>

## Roll back

GitHub, Actions, Deploy, "Run workflow", with the previous good tag
(the Deployments page lists them). Or on the server:

    cd ~/game && ./deploy.sh previous
    tail ~/game/deploys.log

A failed deploy rolls itself back; the Deploy run turns red.

## Read the logs

    cd ~/game
    docker compose logs server --since 30m
    docker compose logs caddy --since 30m
    tail ~/backups/backup.log

## Restart one part

    cd ~/game && docker compose restart server      # or web, caddy, redis, postgres

Restarting the server disconnects players for a few seconds; positions are saved first.

## Restore the database from a backup

1. Pick a backup: `aws --profile game-backup s3 ls s3://sathchau-game-backups/db/` (or `ls ~/backups`).
2. Download it: `aws --profile game-backup s3 cp s3://sathchau-game-backups/db/<file> /tmp/restore.dump`
3. Stop the server, so nothing writes meanwhile: `docker compose stop server web`
4. Restore over the current data:

       docker compose cp /tmp/restore.dump postgres:/tmp/restore.dump
       docker compose exec -T postgres pg_restore -U game -d game --clean --if-exists /tmp/restore.dump

5. Start again: `docker compose up -d --wait`
6. Check: log in, and compare a few counts with what you expected.

Practise first on a throwaway container (see README, Backups).

## Rotate a secret

- SESSION_SECRET: edit .env, then `docker compose up -d --wait server`. Everyone is logged out.
- POSTGRES_PASSWORD: change it inside Postgres first
  (`ALTER USER game PASSWORD '...'`), then in .env, then restart the server.
- Bucket key: create a new key in the bucket's Permissions, `aws configure --profile game-backup`, delete the old key.
- Deploy key: new key pair; on the server, replace only the line ending
  `github-deploy` in ~/.ssh/authorized_keys; update the DEPLOY_SSH_KEY secret.

Before closing a session in which you changed ~/.ssh/authorized_keys, test a
new login from a second window (`ssh game "echo ok"`). Keep a copy first:
`cp ~/.ssh/authorized_keys ~/.ssh/authorized_keys.bak`.

## The server is lost

1. Create a new instance as in Story 9.3 Part 1 (Ohio, Ubuntu 24.04, $12), attach
   the static IP to it (DNS then needs no change), set up SSH, Docker and swap, Docker log rotation (`/etc/docker/daemon.json`), and jq.
2. Copy compose.yaml, Caddyfile, deploy.sh, backup.sh and sprites/ (Part 2, Step 3).
3. Recreate .env from the password manager (same POSTGRES_PASSWORD and SESSION_SECRET).
4. `docker compose up -d --wait postgres`, restore the newest backup from the bucket
   (above), then `docker compose up -d --wait`.
5. Update DEPLOY_KNOWN_HOSTS in GitHub (the new server has a new fingerprint), and
   add the deploy key line to authorized_keys.
6. Re-add BACKUP_HEARTBEAT_URL to .env, re-create the Lightsail alarms on the new
   instance, and check both UptimeRobot monitors go up again.

## Disk full

    df -h /
    docker system df
    docker image prune -a --filter "until=168h"    # images unused for a week

## Certificate

Caddy renews it automatically. If browsers warn: `docker compose logs caddy | grep -i error`,
check that ports 80 and 443 are open in the Lightsail firewall, and that DNS still points here.
