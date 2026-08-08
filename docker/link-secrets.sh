#!/usr/bin/env bash
# Materialize production secrets into the repo's docker/ directory for deploy.
#
# Source of truth (first that works):
#   1. Doppler — when DOPPLER_TOKEN or ~/.config/management/doppler.token exists
#      (see docker/fetch-doppler-secrets.sh)
#   2. Local secrets dir — ${MGMT_SECRETS_DIR:-$HOME/.config/management}
#
# File-based secrets (ssl/, cloudflared/) always come from the local secrets
# dir; Doppler only manages env KEY=VAL pairs for docker/.env.prod.
#
# Usage (from repo root):
#   bash docker/link-secrets.sh
#
# Layout expected in the secrets dir (all optional except .env.prod when
# Doppler is not configured):
#   .env.prod
#   doppler.token     (service token; alternative to DOPPLER_TOKEN env)
#   cloudflared.env
#   ssl/fullchain.pem
#   ssl/privkey.pem
#   cloudflared/…   (tunnel credentials)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRETS_DIR="${MGMT_SECRETS_DIR:-${HOME}/.config/management}"
DOCKER_DIR="${ROOT}/docker"

log() { echo "[link-secrets] $*"; }
die() { echo "[link-secrets] ERROR: $*" >&2; exit 1; }

link_or_copy_file() {
  local src="$1" dst="$2"
  if [[ -e "${dst}" || -L "${dst}" ]]; then
    return 0
  fi
  if [[ ! -f "${src}" ]]; then
    return 1
  fi
  mkdir -p "$(dirname "${dst}")"
  # Prefer a symlink so edits in the secrets dir stay in sync.
  ln -sfn "${src}" "${dst}"
  log "linked $(basename "${dst}") ← ${src}"
  return 0
}

link_or_copy_tree() {
  local src="$1" dst="$2"
  if [[ -d "${dst}" ]] && [[ -n "$(ls -A "${dst}" 2>/dev/null || true)" ]]; then
    return 0
  fi
  if [[ ! -d "${src}" ]]; then
    return 1
  fi
  mkdir -p "${dst}"
  # Copy contents (ssl keys / tunnel json); avoid nested symlink surprises.
  cp -a "${src}/." "${dst}/"
  log "copied $(basename "${dst}")/ ← ${src}/"
  return 0
}

mkdir -p "${DOCKER_DIR}"

# ── Env secrets: Doppler first, then local file ──────────────────────────
doppler_rc=0
bash "${DOCKER_DIR}/fetch-doppler-secrets.sh" || doppler_rc=$?
if [[ "${doppler_rc}" -eq 0 ]]; then
  log "env secrets from Doppler → ${DOCKER_DIR}/.env.prod"
elif [[ "${doppler_rc}" -eq 2 ]]; then
  log "Doppler not configured — using local secrets dir"
  [[ -d "${SECRETS_DIR}" ]] || die "secrets dir missing: ${SECRETS_DIR}
Create it on the Pi once, e.g.:
  mkdir -p \"${SECRETS_DIR}\"
  cp /path/to/your/docker/.env.prod \"${SECRETS_DIR}/.env.prod\"
  # Or enable Doppler:
  #   printf '%s' 'dp.st.prd.…' > \"${SECRETS_DIR}/doppler.token\"
  #   chmod 600 \"${SECRETS_DIR}/doppler.token\"
  cp -a /path/to/your/docker/ssl \"${SECRETS_DIR}/ssl\"
  cp -a /path/to/your/docker/cloudflared \"${SECRETS_DIR}/cloudflared\"
  cp /path/to/your/docker/cloudflared.env \"${SECRETS_DIR}/cloudflared.env\"
Override with MGMT_SECRETS_DIR if you keep secrets elsewhere."

  if ! link_or_copy_file "${SECRETS_DIR}/.env.prod" "${DOCKER_DIR}/.env.prod"; then
    if [[ ! -f "${DOCKER_DIR}/.env.prod" ]]; then
      die ".env.prod not found in ${SECRETS_DIR} or ${DOCKER_DIR}
Copy your production env file to:
  ${SECRETS_DIR}/.env.prod
Or configure Doppler (DOPPLER_TOKEN / ${SECRETS_DIR}/doppler.token)."
    fi
  fi
else
  die "Doppler fetch failed (exit ${doppler_rc})"
fi

# ── File secrets (always local) ──────────────────────────────────────────
if [[ -d "${SECRETS_DIR}" ]]; then
  link_or_copy_file "${SECRETS_DIR}/cloudflared.env" "${DOCKER_DIR}/cloudflared.env" || true
  link_or_copy_tree "${SECRETS_DIR}/ssl" "${DOCKER_DIR}/ssl" || true
  link_or_copy_tree "${SECRETS_DIR}/cloudflared" "${DOCKER_DIR}/cloudflared" || true
fi

# Compose needs REDIS_PASSWORD in process env for ${REDIS_PASSWORD:?…}
# interpolation (redis --requirepass). Mint once into the secrets file when
# older Pi envs predate Redis auth.
# shellcheck source=docker/lib-compose.sh
source "${ROOT}/docker/lib-compose.sh"
mgmt_ensure_redis_password "${DOCKER_DIR}/.env.prod" \
  || die "could not ensure REDIS_PASSWORD in ${DOCKER_DIR}/.env.prod"
mgmt_ensure_allow_root_db "${DOCKER_DIR}/.env.prod" || true
mgmt_link_compose_dotenv || true

if [[ -n "${DOPPLER_TOKEN:-}" || -f "${SECRETS_DIR}/doppler.token" ]]; then
  # Local mint/bridge writes are not pushed back (service tokens are
  # read-only). Remind operators to sync critical keys into Doppler.
  if ! grep -qE '^REDIS_PASSWORD=.+' "${DOCKER_DIR}/.env.prod" 2>/dev/null; then
    log "WARNING: add REDIS_PASSWORD to Doppler config prd"
  fi
fi

log "secrets ready (env from $([ "${doppler_rc}" -eq 0 ] && echo Doppler || echo "${SECRETS_DIR}"))"
