#!/usr/bin/env bash
# Upsert Google OAuth env into the Pi secrets .env.prod.
#
# When production keys live in Doppler, prefer:
#   doppler secrets set GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… \
#     --project management_custom --config prd
# then re-run Deploy so the Pi refreshes docker/.env.prod. This script still
# patches the local/cached .env.prod for emergency / offline use.
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
#   MGMT_SECRETS_DIR=$HOME/.config/management
#   SKIP_RECREATE=1   — only write env (ci-deploy will recreate the app)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=docker/lib-compose.sh
source "${ROOT}/docker/lib-compose.sh"

SECRETS_DIR="${MGMT_SECRETS_DIR:-${HOME}/.config/management}"
SECRETS_ENV="${SECRETS_DIR}/.env.prod"
DOCKER_ENV="${ROOT}/docker/.env.prod"
BOOTSTRAP="${ROOT}/docker/google-oauth.bootstrap.env"

if [[ -f "${BOOTSTRAP}" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "${BOOTSTRAP}"
  set +a
  # Assemble from split parts when provided (avoids raw OAuth patterns in git).
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
[[ -d "${SECRETS_DIR}" ]] || die "secrets dir missing: ${SECRETS_DIR}"
[[ -f "${SECRETS_ENV}" ]] || die "missing ${SECRETS_ENV}"

upsert_env() {
  local file="$1" key="$2" value="$3"
  local tmp
  tmp="$(mktemp)"
  if [[ -f "${file}" ]]; then
    grep -Ev "^[[:space:]]*${key}=" "${file}" >"${tmp}" || true
  else
    : >"${tmp}"
  fi
  printf '%s=%s\n' "${key}" "${value}" >>"${tmp}"
  mv "${tmp}" "${file}"
  chmod 600 "${file}" 2>/dev/null || true
}

log "updating secrets env (values not printed)"
upsert_env "${SECRETS_ENV}" "GOOGLE_CLIENT_ID" "${CLIENT_ID}"
upsert_env "${SECRETS_ENV}" "GOOGLE_CLIENT_SECRET" "${CLIENT_SECRET}"
upsert_env "${SECRETS_ENV}" "GOOGLE_REDIRECT_URI" "${REDIRECT_URI}"

log "linking secrets into docker/"
bash "${ROOT}/docker/link-secrets.sh"
[[ -f "${DOCKER_ENV}" ]] || die "docker/.env.prod missing after link-secrets"

grep -q '^GOOGLE_CLIENT_ID=.\+' "${DOCKER_ENV}" || die "GOOGLE_CLIENT_ID not written"
grep -q '^GOOGLE_CLIENT_SECRET=.\+' "${DOCKER_ENV}" || die "GOOGLE_CLIENT_SECRET not written"
grep -q '^GOOGLE_REDIRECT_URI=.\+' "${DOCKER_ENV}" || die "GOOGLE_REDIRECT_URI not written"
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
