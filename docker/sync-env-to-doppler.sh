#!/usr/bin/env bash
# Upload a local env file into Doppler (config prd by default).
#
# Intended to run on the Pi (has ~/.config/management/.env.prod) with a
# write-capable token:
#
#   export DOPPLER_TOKEN=dp.st.prd.…   # or doppler.token file
#   bash docker/sync-env-to-doppler.sh
#
# Options:
#   ENV_FILE=…              (default: docker/.env.prod or secrets dir)
#   DOPPLER_PROJECT=…       (default: management_custom)
#   DOPPLER_CONFIG=…        (default: prd)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRETS_DIR="${MGMT_SECRETS_DIR:-${HOME}/.config/management}"
TOKEN_FILE="${DOPPLER_TOKEN_FILE:-${SECRETS_DIR}/doppler.token}"
PROJECT="${DOPPLER_PROJECT:-management_custom}"
CONFIG="${DOPPLER_CONFIG:-prd}"

log() { echo "[doppler-sync] $*"; }
die() { echo "[doppler-sync] ERROR: $*" >&2; exit 1; }

if [[ -z "${DOPPLER_TOKEN:-}" && -f "${TOKEN_FILE}" ]]; then
  DOPPLER_TOKEN="$(tr -d '[:space:]' < "${TOKEN_FILE}")"
  export DOPPLER_TOKEN
fi
[[ -n "${DOPPLER_TOKEN:-}" ]] || die "set DOPPLER_TOKEN or create ${TOKEN_FILE}"

if ! command -v doppler >/dev/null 2>&1; then
  bash "${ROOT}/docker/install-doppler-cli.sh"
  export PATH="${HOME}/.local/bin:${PATH}"
fi
command -v doppler >/dev/null 2>&1 || die "doppler CLI missing"

ENV_FILE="${ENV_FILE:-}"
if [[ -z "${ENV_FILE}" ]]; then
  if [[ -f "${ROOT}/docker/.env.prod" ]]; then
    ENV_FILE="${ROOT}/docker/.env.prod"
  elif [[ -f "${SECRETS_DIR}/.env.prod" ]]; then
    ENV_FILE="${SECRETS_DIR}/.env.prod"
  else
    die "no .env.prod at docker/.env.prod or ${SECRETS_DIR}/.env.prod"
  fi
fi
[[ -f "${ENV_FILE}" ]] || die "missing ${ENV_FILE}"
# Resolve symlink to real file for upload.
ENV_FILE="$(readlink -f "${ENV_FILE}" 2>/dev/null || realpath "${ENV_FILE}" 2>/dev/null || echo "${ENV_FILE}")"

# Never upload Doppler's own meta keys or blank values.
tmp="$(mktemp)"
trap 'rm -f "${tmp}"' EXIT
# Drop comments/blank; drop DOPPLER_* meta; drop empty values.
grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "${ENV_FILE}" \
  | grep -vE '^(DOPPLER_PROJECT|DOPPLER_CONFIG|DOPPLER_ENVIRONMENT)=' \
  | grep -vE '^[A-Za-z_][A-Za-z0-9_]*=\s*$' \
  > "${tmp}" || true
[[ -s "${tmp}" ]] || die "${ENV_FILE} has no uploadable KEY=VAL lines"

key_count="$(grep -c '=' "${tmp}" || true)"
log "uploading ${key_count} keys from ${ENV_FILE} → ${PROJECT}/${CONFIG}"

doppler secrets upload "${tmp}" \
  --project "${PROJECT}" \
  --config "${CONFIG}"

log "upload ok — verifying names (values hidden)"
doppler secrets --only-names --project "${PROJECT}" --config "${CONFIG}"
log "done"
