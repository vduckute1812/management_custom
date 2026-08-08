#!/usr/bin/env bash
# Copy/link Pi-local secrets into the repo's docker/ directory for CI deploy.
#
# The Actions checkout lives under the runner work dir and does not contain
# gitignored files. Keep secrets once under:
#   ${MGMT_SECRETS_DIR:-$HOME/.config/management}
# and this script materializes them into docker/ before deploy.
#
# Usage (from repo root):
#   bash docker/link-secrets.sh
#
# Layout expected in the secrets dir (all optional except .env.prod):
#   .env.prod
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

[[ -d "${SECRETS_DIR}" ]] || die "secrets dir missing: ${SECRETS_DIR}
Create it on the Pi once, e.g.:
  mkdir -p \"${SECRETS_DIR}\"
  cp /path/to/your/docker/.env.prod \"${SECRETS_DIR}/.env.prod\"
  cp -a /path/to/your/docker/ssl \"${SECRETS_DIR}/ssl\"
  cp -a /path/to/your/docker/cloudflared \"${SECRETS_DIR}/cloudflared\"
  cp /path/to/your/docker/cloudflared.env \"${SECRETS_DIR}/cloudflared.env\"
Override with MGMT_SECRETS_DIR if you keep secrets elsewhere."

mkdir -p "${DOCKER_DIR}"

if ! link_or_copy_file "${SECRETS_DIR}/.env.prod" "${DOCKER_DIR}/.env.prod"; then
  if [[ ! -f "${DOCKER_DIR}/.env.prod" ]]; then
    die ".env.prod not found in ${SECRETS_DIR} or ${DOCKER_DIR}
Copy your production env file to:
  ${SECRETS_DIR}/.env.prod"
  fi
fi

link_or_copy_file "${SECRETS_DIR}/cloudflared.env" "${DOCKER_DIR}/cloudflared.env" || true
link_or_copy_tree "${SECRETS_DIR}/ssl" "${DOCKER_DIR}/ssl" || true
link_or_copy_tree "${SECRETS_DIR}/cloudflared" "${DOCKER_DIR}/cloudflared" || true

# Compose needs REDIS_PASSWORD in process env for ${REDIS_PASSWORD:?…}
# interpolation (redis --requirepass). Mint once into the secrets file when
# older Pi envs predate Redis auth.
# shellcheck source=docker/lib-compose.sh
source "${ROOT}/docker/lib-compose.sh"
mgmt_ensure_redis_password "${DOCKER_DIR}/.env.prod" \
  || die "could not ensure REDIS_PASSWORD in ${DOCKER_DIR}/.env.prod"
mgmt_link_compose_dotenv || true

log "secrets ready (from ${SECRETS_DIR})"
