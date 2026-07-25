#!/usr/bin/env bash
set -euo pipefail

# Set APP_BASE_URL in docker/.env.prod to the named Cloudflare domain.
#
#   bash docker/sync-tunnel-url.sh
#   bash docker/sync-tunnel-url.sh --restart-app

DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${DIR}/.env.prod"
CF_ENV="${DIR}/cloudflared.env"
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

if [[ ! -f "${CF_ENV}" ]]; then
  echo "[sync] missing ${CF_ENV}"
  exit 1
fi

# shellcheck disable=SC1090
source "${CF_ENV}"

URL="${APP_BASE_URL:-https://${TUNNEL_HOSTNAME}}"

if grep -q '^APP_BASE_URL=' "${ENV_FILE}"; then
  sed -i "s|^APP_BASE_URL=.*|APP_BASE_URL=${URL}|" "${ENV_FILE}"
else
  printf '\nAPP_BASE_URL=%s\n' "${URL}" >> "${ENV_FILE}"
fi

echo "[sync] APP_BASE_URL=${URL}"

if [[ "${RESTART_APP}" == true ]]; then
  # shellcheck source=docker/lib-compose.sh
  source "${DIR}/lib-compose.sh"
  mgmt_compose up -d --force-recreate app
  echo "[sync] recreated mgmt-app-prod with updated APP_BASE_URL"
fi
