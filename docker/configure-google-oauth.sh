#!/usr/bin/env bash
# Upsert Google OAuth env into the Pi secrets .env.prod and recreate the app
# container so Nitro picks up the new values (no full image rebuild).
#
# Usage (on the Pi / self-hosted runner):
#   GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… bash docker/configure-google-oauth.sh
#
# Optional:
#   GOOGLE_REDIRECT_URI=https://dntechx.com/api/auth/google/callback
#   MGMT_SECRETS_DIR=$HOME/.config/management
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=docker/lib-compose.sh
source "${ROOT}/docker/lib-compose.sh"

SECRETS_DIR="${MGMT_SECRETS_DIR:-${HOME}/.config/management}"
SECRETS_ENV="${SECRETS_DIR}/.env.prod"
DOCKER_ENV="${ROOT}/docker/.env.prod"

CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"
REDIRECT_URI="${GOOGLE_REDIRECT_URI:-https://dntechx.com/api/auth/google/callback}"

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
  # Drop any existing assignment for this key (commented or not), then append.
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

# Confirm keys exist without printing values.
grep -q '^GOOGLE_CLIENT_ID=.\+' "${DOCKER_ENV}" || die "GOOGLE_CLIENT_ID not written"
grep -q '^GOOGLE_CLIENT_SECRET=.\+' "${DOCKER_ENV}" || die "GOOGLE_CLIENT_SECRET not written"
grep -q '^GOOGLE_REDIRECT_URI=.\+' "${DOCKER_ENV}" || die "GOOGLE_REDIRECT_URI not written"
log "keys present in docker/.env.prod"

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
