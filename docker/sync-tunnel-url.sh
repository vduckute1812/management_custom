#!/usr/bin/env bash
set -euo pipefail

# Copy the active Cloudflare quick-tunnel URL into docker/.env.prod as
# APP_BASE_URL so verification emails link to the public hostname.
#
#   bash docker/sync-tunnel-url.sh
#   bash docker/sync-tunnel-url.sh --restart-app

DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${DIR}/.env.prod"
RESTART_APP=false

for arg in "$@"; do
  if [[ "${arg}" == "--restart-app" ]]; then
    RESTART_APP=true
  fi
done

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[sync] missing ${ENV_FILE}"
  exit 1
fi

URL="$(
  journalctl --user -u mgmt-cloudflare-tunnel --no-pager 2>/dev/null \
    | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' \
    | tail -1
)"

if [[ -z "${URL}" ]]; then
  echo "[sync] no trycloudflare.com URL found — is mgmt-cloudflare-tunnel running?"
  exit 1
fi

if grep -q '^APP_BASE_URL=' "${ENV_FILE}"; then
  sed -i "s|^APP_BASE_URL=.*|APP_BASE_URL=${URL}|" "${ENV_FILE}"
else
  printf '\nAPP_BASE_URL=%s\n' "${URL}" >> "${ENV_FILE}"
fi

echo "[sync] APP_BASE_URL=${URL}"

if [[ "${RESTART_APP}" == true ]]; then
  COMPOSE="/home/duc13t3/.pyenv/versions/toastmaster-env/bin/podman-compose -f docker/docker-compose.prod.yml"
  cd "${DIR}/.."
  ${COMPOSE} up -d --force-recreate app
  echo "[sync] recreated mgmt-app-prod with updated APP_BASE_URL"
fi
