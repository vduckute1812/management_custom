#!/usr/bin/env bash
# Upsert Gemini / LLM env into the Pi secrets .env.prod.
#
# Usage (on the Pi):
#   GEMINI_API_KEY=… bash docker/configure-gemini.sh
#
# Optional:
#   LLM_PROVIDER=gemini          (default)
#   GEMINI_MODEL=gemini-flash-lite-latest
#   SKIP_RECREATE=1              — only write env (ci-deploy will recreate app)
#   MGMT_SECRETS_DIR=$HOME/.config/management
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=docker/lib-compose.sh
source "${ROOT}/docker/lib-compose.sh"

SECRETS_DIR="${MGMT_SECRETS_DIR:-${HOME}/.config/management}"
SECRETS_ENV="${SECRETS_DIR}/.env.prod"
DOCKER_ENV="${ROOT}/docker/.env.prod"

PROVIDER="${LLM_PROVIDER:-gemini}"
API_KEY="${GEMINI_API_KEY:-}"
MODEL="${GEMINI_MODEL:-gemini-flash-lite-latest}"
SKIP_RECREATE="${SKIP_RECREATE:-0}"

log() { echo "[configure-gemini] $*"; }
die() { echo "[configure-gemini] ERROR: $*" >&2; exit 1; }

[[ -n "${API_KEY}" ]] || die "GEMINI_API_KEY is required"
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
upsert_env "${SECRETS_ENV}" "LLM_PROVIDER" "${PROVIDER}"
upsert_env "${SECRETS_ENV}" "GEMINI_API_KEY" "${API_KEY}"
upsert_env "${SECRETS_ENV}" "GEMINI_MODEL" "${MODEL}"

log "linking secrets into docker/"
bash "${ROOT}/docker/link-secrets.sh"
[[ -f "${DOCKER_ENV}" ]] || die "docker/.env.prod missing after link-secrets"

grep -q '^GEMINI_API_KEY=.\+' "${DOCKER_ENV}" || die "GEMINI_API_KEY not written"
grep -q '^LLM_PROVIDER=.\+' "${DOCKER_ENV}" || die "LLM_PROVIDER not written"
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
