#!/usr/bin/env bash
# Deploys one published version of the game, and rolls back if it isn't healthy.
#   ./deploy.sh sha-<12 characters>   deploy that version
#   ./deploy.sh previous              go back to the version before the current one
# GitHub Actions calls it through a restricted SSH key: see docs/runbook.md.
set -euo pipefail
set -f # never expand wildcards: arguments are tags, not file names

cd "$(dirname "$0")" # the folder holding compose.yaml and .env

# Called through the restricted key: the requested command arrives in
# SSH_ORIGINAL_COMMAND, and only "deploy <tag>" is accepted.
if [ "${1:-}" = "--from-ssh" ]; then
  read -r action tag extra <<< "${SSH_ORIGINAL_COMMAND:-}"
  if [ "${action:-}" != "deploy" ] || [ -n "${extra:-}" ]; then
    echo "Only 'deploy <tag>' is allowed" >&2
    exit 2
  fi
  set -- "${tag:-}"
fi

env_value() { grep -E "^$1=" .env | cut -d= -f2; }
record() { echo "$(date -u +%FT%TZ) $1 $2" >> deploys.log; }

CURRENT="$(env_value IMAGE_TAG)"
DOMAIN="$(env_value DOMAIN)"
[ -f deploys.log ] || record "$CURRENT" ok # the first deploy: remember where we started

case "${1:-}" in
  previous) NEW="$(grep ' ok$' deploys.log | tail -n 2 | head -n 1 | awk '{print $2}')" ;;
  *) NEW="${1:-}" ;;
esac

if ! [[ "$NEW" =~ ^sha-[0-9a-f]{12}$ ]]; then
  echo "Not a version tag: '$NEW' (expected sha- and 12 hexadecimal characters)" >&2
  exit 2
fi
if [ "$NEW" = "$CURRENT" ]; then
  echo "$NEW is already running"
  exit 0
fi

# Healthy means: through Caddy and the real domain, the API answers "not logged in".
healthy() {
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$DOMAIN/api/me")" = "401" ]
}
start_version() { IMAGE_TAG="$1" docker compose up -d --wait --wait-timeout 120 server web; }

echo "Deploying $NEW (now running $CURRENT)"

# 1. Pull first: if the tag doesn't exist, nothing has changed yet.
IMAGE_TAG="$NEW" docker compose pull --quiet server web

# 2. A restore point, in case the new version's migrations need undoing.
./backup.sh

# 3 and 4. Start the new version, and check it from outside.
if start_version "$NEW" && healthy; then
  sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$NEW/" .env
  record "$NEW" ok
  echo "Deployed $NEW"
else
  echo "$NEW is not healthy: going back to $CURRENT" >&2
  start_version "$CURRENT"
  record "$NEW" failed
  exit 1
fi