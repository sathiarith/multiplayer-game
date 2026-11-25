# Runbook: play.sathchau.dev

Server: Amazon Lightsail `game-1`, Ohio (us-east-2a), static IP 77.113.122.65.
Connect with `ssh game`. Everything lives in `~/game` (compose.yaml, Caddyfile,
.env, deploy.sh, backup.sh, sprites/). Times on the server are UTC.

## Is it up?

    curl -s -o /dev/null -w "%{http_code}\n" https://play.sathchau.dev/api/me    # 401 = healthy
    ssh game "cd ~/game && docker compose ps"                                     # all healthy

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
   the static IP to it (DNS then needs no change), set up SSH, Docker and swap.
2. Copy compose.yaml, Caddyfile, deploy.sh, backup.sh and sprites/ (Part 2, Step 3).
3. Recreate .env from the password manager (same POSTGRES_PASSWORD and SESSION_SECRET).
4. `docker compose up -d --wait postgres`, restore the newest backup from the bucket
   (above), then `docker compose up -d --wait`.
5. Update DEPLOY_KNOWN_HOSTS in GitHub (the new server has a new fingerprint), and
   add the deploy key line to authorized_keys.

## Disk full

    df -h /
    docker system df
    docker image prune -a --filter "until=168h"    # images unused for a week

## Certificate

Caddy renews it automatically. If browsers warn: `docker compose logs caddy | grep -i error`,
check that ports 80 and 443 are open in the Lightsail firewall, and that DNS still points here.
