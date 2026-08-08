#!/usr/bin/env bash
# Set Gemini / LLM keys in Doppler (config prd), then refresh the app.
#
# Usage (on the Pi or any machine with DOPPLER_TOKEN):
#   GEMINI_API_KEY=… bash docker/configure-gemini.sh
#
# Optional:
#   LLM_PROVIDER=gemini          (default)
#   GEMINI_MODEL=gemini-flash-lite-latest
#   SKIP_RECREATE=1              — only write Doppler (ci-deploy will recreate)
#   DOPPLER_PROJECT / DOPPLER_CONFIG
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=docker/lib-compose.sh
source "${ROOT}/docker/lib-compose.sh"

PROJECT="${DOPPLER_PROJECT:-management_custom}"
CONFIG="${DOPPLER_CONFIG:-prd}"
TOKEN_FILE="${DOPPLER_TOKEN_FILE:-${MGMT_SECRETS_DIR:-${HOME}/.config/management}/doppler.token}"

PROVIDER="${LLM_PROVIDER:-gemini}"
API_KEY="${GEMINI_API_KEY:-}"
MODEL="${GEMINI_MODEL:-gemini-flash-lite-latest}"
SKIP_RECREATE="${SKIP_RECREATE:-0}"

log() { echo "[configure-gemini] $*"; }
die() { echo "[configure-gemini] ERROR: $*" >&2; exit 1; }

[[ -n "${API_KEY}" ]] || die "GEMINI_API_KEY is required"

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

log "setting LLM keys in Doppler ${PROJECT}/${CONFIG} (values not printed)"
doppler secrets set \
  "LLM_PROVIDER=${PROVIDER}" \
  "GEMINI_API_KEY=${API_KEY}" \
  "GEMINI_MODEL=${MODEL}" \
  --project "${PROJECT}" \
  --config "${CONFIG}"

log "refreshing docker/.env.prod from Doppler"
bash "${ROOT}/docker/link-secrets.sh"
[[ -f "${ROOT}/docker/.env.prod" ]] || die "docker/.env.prod missing after Doppler fetch"
grep -q '^GEMINI_API_KEY=.\+' "${ROOT}/docker/.env.prod" || die "GEMINI_API_KEY not in Doppler download"
log "keys present in docker/.env.prod"

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
  sleep 1
done
[[ "${ok}" == "1" ]] || die "app health check failed after recreate"
log "done — drafts can be rewritten via Admin → Re-generate AI"
