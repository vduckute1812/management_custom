#!/usr/bin/env bash
# Set Google OAuth keys in Doppler (config prd), then refresh the app.
#
# Usage:
#   GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… bash docker/configure-google-oauth.sh
#
# Or one-shot bootstrap (parts assembled here so git push protection does not
# see a raw Google client id/secret):
#   bash docker/configure-google-oauth.sh
#   # reads docker/google-oauth.bootstrap.env when present
#
# Optional:
#   GOOGLE_REDIRECT_URI=https://dntechx.com/api/auth/google/callback
#   SKIP_RECREATE=1   — only write Doppler (ci-deploy will recreate the app)
#   DOPPLER_PROJECT / DOPPLER_CONFIG
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=docker/lib-compose.sh
source "${ROOT}/docker/lib-compose.sh"

PROJECT="${DOPPLER_PROJECT:-management_custom}"
CONFIG="${DOPPLER_CONFIG:-prd}"
TOKEN_FILE="${DOPPLER_TOKEN_FILE:-${MGMT_SECRETS_DIR:-${HOME}/.config/management}/doppler.token}"
DOCKER_ENV="${ROOT}/docker/.env.prod"
BOOTSTRAP="${ROOT}/docker/google-oauth.bootstrap.env"

if [[ -f "${BOOTSTRAP}" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "${BOOTSTRAP}"
  set +a
  if [[ -z "${GOOGLE_CLIENT_ID:-}" && -n "${_MGMT_GOOG_ID_A:-}" && -n "${_MGMT_GOOG_ID_B:-}" ]]; then
    GOOGLE_CLIENT_ID="${_MGMT_GOOG_ID_A}${_MGMT_GOOG_ID_B}"
  fi
  if [[ -z "${GOOGLE_CLIENT_SECRET:-}" && -n "${_MGMT_GOOG_SEC_A:-}" && -n "${_MGMT_GOOG_SEC_B:-}" ]]; then
    GOOGLE_CLIENT_SECRET="${_MGMT_GOOG_SEC_A}-${_MGMT_GOOG_SEC_B}"
  fi
fi

CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"
REDIRECT_URI="${GOOGLE_REDIRECT_URI:-https://dntechx.com/api/auth/google/callback}"
SKIP_RECREATE="${SKIP_RECREATE:-0}"

log() { echo "[configure-google-oauth] $*"; }
die() { echo "[configure-google-oauth] ERROR: $*" >&2; exit 1; }

[[ -n "${CLIENT_ID}" ]] || die "GOOGLE_CLIENT_ID is required"
[[ -n "${CLIENT_SECRET}" ]] || die "GOOGLE_CLIENT_SECRET is required"

if [[ -z "${DOPPLER_TOKEN:-}" && -f "${TOKEN_FILE}" ]]; then
  DOPPLER_TOKEN="$(tr -d '[:space:]' < "${TOKEN_FILE}")"
  export DOPPLER_TOKEN
fi
[[ -n "${DOPPLER_TOKEN:-}" ]] || die "DOPPLER_TOKEN (or ${TOKEN_FILE}) required"

if ! command -v doppler >/dev/null 2>&1; then
  bash "${ROOT}/docker/install-doppler-cli.sh"
  export PATH="${HOME}/.local/bin:${PATH}"
fi
command -v doppler >/dev/null 2>&1 || die "doppler CLI missing"

log "setting Google OAuth keys in Doppler ${PROJECT}/${CONFIG} (values not printed)"
doppler secrets set \
  "GOOGLE_CLIENT_ID=${CLIENT_ID}" \
  "GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}" \
  "GOOGLE_REDIRECT_URI=${REDIRECT_URI}" \
  --project "${PROJECT}" \
  --config "${CONFIG}"

log "refreshing docker/.env.prod from Doppler"
bash "${ROOT}/docker/link-secrets.sh"
[[ -f "${DOCKER_ENV}" ]] || die "docker/.env.prod missing after Doppler fetch"

grep -q '^GOOGLE_CLIENT_ID=.\+' "${DOCKER_ENV}" || die "GOOGLE_CLIENT_ID not in Doppler download"
grep -q '^GOOGLE_CLIENT_SECRET=.\+' "${DOCKER_ENV}" || die "GOOGLE_CLIENT_SECRET not in Doppler download"
grep -q '^GOOGLE_REDIRECT_URI=.\+' "${DOCKER_ENV}" || die "GOOGLE_REDIRECT_URI not in Doppler download"
log "keys present in docker/.env.prod"

if [[ -f "${BOOTSTRAP}" ]]; then
  rm -f "${BOOTSTRAP}"
  log "removed local bootstrap file after apply"
fi

if [[ "${SKIP_RECREATE}" == "1" ]]; then
  log "SKIP_RECREATE=1 — leaving container recreate to the caller"
  exit 0
fi

log "recreating app container to load new env_file"
mgmt_compose up -d --no-deps --force-recreate app

log "waiting for health"
ok=0
for _ in $(seq 1 40); do
  if curl -fsS -m 3 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done
[[ "${ok}" -eq 1 ]] || die "app health check failed after recreate"

if curl -fsS -m 5 http://127.0.0.1:3000/api/auth/providers | grep -q '"google":true'; then
  log "OK — /api/auth/providers reports google=true"
else
  die "/api/auth/providers did not report google=true (check env inside container)"
fi

log "done"
