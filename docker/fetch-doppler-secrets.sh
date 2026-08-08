#!/usr/bin/env bash
# Download production env secrets from Doppler into docker/.env.prod.
#
# Auth (first match wins):
#   1. DOPPLER_TOKEN env
#   2. DOPPLER_TOKEN_FILE (default: ~/.config/management/doppler.token)
#   3. doppler CLI already configured for this directory
#
# Optional:
#   DOPPLER_PROJECT   (default: management_custom)
#   DOPPLER_CONFIG    (default: prd)
#   MGMT_SECRETS_DIR  — also write a cache copy as ${dir}/.env.prod
#
# Usage:
#   bash docker/fetch-doppler-secrets.sh
#   DOPPLER_TOKEN=dp.st.prd.… bash docker/fetch-doppler-secrets.sh
#
# Exit 0 when secrets were written. Exit 2 when Doppler is not configured
# (caller may fall back to a local secrets dir). Exit 1 on hard failure.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCKER_DIR="${ROOT}/docker"
OUT="${DOCKER_DIR}/.env.prod"
SECRETS_DIR="${MGMT_SECRETS_DIR:-${HOME}/.config/management}"
TOKEN_FILE="${DOPPLER_TOKEN_FILE:-${SECRETS_DIR}/doppler.token}"
PROJECT="${DOPPLER_PROJECT:-management_custom}"
CONFIG="${DOPPLER_CONFIG:-prd}"

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

if ! command -v doppler >/dev/null 2>&1; then
  bash "${DOCKER_DIR}/install-doppler-cli.sh" || true
fi
if ! command -v doppler >/dev/null 2>&1; then
  if [[ -x "${HOME}/.local/bin/doppler" ]]; then
    export PATH="${HOME}/.local/bin:${PATH}"
  fi
fi
command -v doppler >/dev/null 2>&1 || {
  log "CLI not installed — skip Doppler fetch"
  exit 2
}

if ! resolve_token; then
  # Personal/scoped login may still work for interactive use.
  if ! doppler me >/dev/null 2>&1; then
    log "no DOPPLER_TOKEN / ${TOKEN_FILE} — skip Doppler fetch"
    exit 2
  fi
fi

mkdir -p "${DOCKER_DIR}"
tmp="$(mktemp)"
trap 'rm -f "${tmp}"' EXIT

log "downloading secrets (project=${PROJECT} config=${CONFIG})"
download_args=(secrets download --no-file --format env-no-quotes)
# Service tokens already pin project+config; flags are harmless / required
# when using a personal token or empty token with setup.
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
  # grep exit 1 = no lines left (or no matches to print). Treat empty as fail.
  : > "${tmp}.clean"
fi

if [[ ! -s "${tmp}.clean" ]]; then
  die "Doppler config ${CONFIG} has no app secrets yet (only meta keys).
Import the Pi env file into Doppler, then re-run:
  doppler secrets upload ~/.config/management/.env.prod --config ${CONFIG}
Or Dashboard → ${PROJECT} → ${CONFIG} → Import."
fi

# Replace any prior symlink/file so we own a materialised env from Doppler.
rm -f "${OUT}"
install -m 0600 "${tmp}.clean" "${OUT}"
log "wrote ${OUT} ($(grep -c '=' "${OUT}" | tr -d ' ') keys)"

# Cache under the secrets dir so offline deploys can fall back.
if [[ -d "${SECRETS_DIR}" ]] || mkdir -p "${SECRETS_DIR}" 2>/dev/null; then
  cache="${SECRETS_DIR}/.env.prod"
  # Do not overwrite a symlink that points at OUT (would recurse).
  if [[ -L "${cache}" ]]; then
    target="$(readlink -f "${cache}" 2>/dev/null || true)"
    if [[ "${target}" == "$(readlink -f "${OUT}")" ]]; then
      log "secrets cache is symlink to ${OUT} — skip duplicate write"
    else
      install -m 0600 "${tmp}.clean" "${cache}"
      log "cached ${cache}"
    fi
  else
    install -m 0600 "${tmp}.clean" "${cache}"
    log "cached ${cache}"
  fi
  # Persist token file path hint only — never write the token from env into
  # git. Operators may place the service token at ${TOKEN_FILE} themselves.
fi

exit 0
