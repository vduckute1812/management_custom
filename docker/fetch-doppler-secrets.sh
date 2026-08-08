#!/usr/bin/env bash
# Download production env secrets from Doppler into docker/.env.prod.
#
# Doppler is the only source of truth for KEY=VAL secrets. Missing token,
# empty config, or missing required keys → exit 1 (no local fallback).
#
# Auth (first match wins):
#   1. DOPPLER_TOKEN env
#   2. DOPPLER_TOKEN_FILE (default: ~/.config/management/doppler.token)
#
# Optional:
#   DOPPLER_PROJECT   (default: management_custom)
#   DOPPLER_CONFIG    (default: prd)
#
# Usage:
#   bash docker/fetch-doppler-secrets.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCKER_DIR="${ROOT}/docker"
OUT="${DOCKER_DIR}/.env.prod"
SECRETS_DIR="${MGMT_SECRETS_DIR:-${HOME}/.config/management}"
TOKEN_FILE="${DOPPLER_TOKEN_FILE:-${SECRETS_DIR}/doppler.token}"
PROJECT="${DOPPLER_PROJECT:-management_custom}"
CONFIG="${DOPPLER_CONFIG:-prd}"

# Keys that must be present and non-empty after download.
REQUIRED_KEYS=(
  JWT_SECRET
  DB_HOST
  DB_USER
  DB_PASS
  DB_NAME
  MYSQL_ROOT_PASSWORD
  REDIS_PASSWORD
)

log() { echo "[doppler] $*"; }
die() { echo "[doppler] ERROR: $*" >&2; exit 1; }

resolve_token() {
  if [[ -n "${DOPPLER_TOKEN:-}" ]]; then
    return 0
  fi
  if [[ -f "${TOKEN_FILE}" ]]; then
    # shellcheck disable=SC2155
    export DOPPLER_TOKEN="$(tr -d '[:space:]' < "${TOKEN_FILE}")"
    [[ -n "${DOPPLER_TOKEN}" ]] || die "empty token file: ${TOKEN_FILE}"
    return 0
  fi
  return 1
}

require_keys() {
  local envf="$1" missing=() key val
  for key in "${REQUIRED_KEYS[@]}"; do
    val="$(grep -E "^${key}=" "${envf}" 2>/dev/null | head -n1 | cut -d= -f2- || true)"
    val="${val%$'\r'}"
    if [[ "${#val}" -ge 2 && ( "${val}" == \"*\" || "${val}" == \'*\' ) ]]; then
      val="${val:1:${#val}-2}"
    fi
    if [[ -z "${val}" ]]; then
      missing+=("${key}")
    fi
  done
  if ((${#missing[@]} > 0)); then
    die "required secret(s) missing or empty in Doppler ${PROJECT}/${CONFIG}: ${missing[*]}
Add them in the Doppler dashboard (or \`doppler secrets set\`), then re-run deploy."
  fi
}

if ! command -v doppler >/dev/null 2>&1; then
  bash "${DOCKER_DIR}/install-doppler-cli.sh" || true
fi
if ! command -v doppler >/dev/null 2>&1; then
  if [[ -x "${HOME}/.local/bin/doppler" ]]; then
    export PATH="${HOME}/.local/bin:${PATH}"
  fi
fi
command -v doppler >/dev/null 2>&1 || die "Doppler CLI not installed"

resolve_token || die "DOPPLER_TOKEN not set and ${TOKEN_FILE} missing
Set GitHub Actions secret DOPPLER_TOKEN or create ${TOKEN_FILE} (mode 600)."

mkdir -p "${DOCKER_DIR}"
tmp="$(mktemp)"
trap 'rm -f "${tmp}" "${tmp}.clean"' EXIT

log "downloading secrets (project=${PROJECT} config=${CONFIG})"
download_args=(secrets download --no-file --format env-no-quotes)
if [[ -n "${PROJECT}" ]]; then
  download_args+=(--project "${PROJECT}")
fi
if [[ -n "${CONFIG}" ]]; then
  download_args+=(--config "${CONFIG}")
fi

if ! doppler "${download_args[@]}" > "${tmp}"; then
  die "doppler secrets download failed"
fi

# Strip Doppler meta keys if present; keep app secrets only.
if ! grep -vE '^(DOPPLER_PROJECT|DOPPLER_CONFIG|DOPPLER_ENVIRONMENT)=' "${tmp}" \
  > "${tmp}.clean"; then
  : > "${tmp}.clean"
fi

if [[ ! -s "${tmp}.clean" ]]; then
  die "Doppler config ${PROJECT}/${CONFIG} has no app secrets (only meta keys).
Add production secrets in Doppler, then re-run deploy."
fi

require_keys "${tmp}.clean"

rm -f "${OUT}"
install -m 0600 "${tmp}.clean" "${OUT}"
log "wrote ${OUT} ($(grep -c '=' "${OUT}" | tr -d ' ') keys)"

exit 0
