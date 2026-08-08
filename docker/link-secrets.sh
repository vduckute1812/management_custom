#!/usr/bin/env bash
# Materialize production secrets into docker/ for deploy.
#
# Env KEY=VAL secrets: Doppler only (see docker/fetch-doppler-secrets.sh).
# Missing / empty required keys → hard failure (no local .env.prod fallback).
#
# File secrets (TLS, Cloudflare Tunnel) still come from the local secrets dir:
#   ${MGMT_SECRETS_DIR:-$HOME/.config/management}/{ssl,cloudflared,cloudflared.env}
#
# APP_HOST may still be updated later by docker/sync-public-ip.sh when the
# public IP changes (local override after the Doppler download).
#
# Usage (from repo root):
#   bash docker/link-secrets.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Prefer an explicit MGMT_SECRETS_DIR. When the Actions runner has HOME=/root
# but the workspace lives under /home/<user>/actions-runner, use that user's
# ~/.config/management (where doppler.token / ssl / tunnel files usually sit).
if [[ -z "${MGMT_SECRETS_DIR:-}" ]]; then
  if [[ -n "${GITHUB_WORKSPACE:-}" && "${GITHUB_WORKSPACE}" =~ ^(/home/[^/]+)/ ]]; then
    _runner_home="${BASH_REMATCH[1]}"
    if [[ -f "${_runner_home}/.config/management/doppler.token" ]] \
      || [[ -d "${_runner_home}/.config/management" ]]; then
      MGMT_SECRETS_DIR="${_runner_home}/.config/management"
    fi
  fi
fi
SECRETS_DIR="${MGMT_SECRETS_DIR:-${HOME}/.config/management}"
export MGMT_SECRETS_DIR="${SECRETS_DIR}"
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
  cp -a "${src}/." "${dst}/"
  log "copied $(basename "${dst}")/ ← ${src}/"
  return 0
}

mkdir -p "${DOCKER_DIR}"

bash "${DOCKER_DIR}/fetch-doppler-secrets.sh" \
  || die "Doppler secrets required — fix token/config/keys and retry"
[[ -f "${DOCKER_DIR}/.env.prod" ]] || die "docker/.env.prod missing after Doppler fetch"
log "env secrets from Doppler → ${DOCKER_DIR}/.env.prod"

# File secrets (always local; not in Doppler)
if [[ -d "${SECRETS_DIR}" ]]; then
  link_or_copy_file "${SECRETS_DIR}/cloudflared.env" "${DOCKER_DIR}/cloudflared.env" || true
  link_or_copy_tree "${SECRETS_DIR}/ssl" "${DOCKER_DIR}/ssl" || true
  link_or_copy_tree "${SECRETS_DIR}/cloudflared" "${DOCKER_DIR}/cloudflared" || true
fi

# shellcheck source=docker/lib-compose.sh
source "${ROOT}/docker/lib-compose.sh"
mgmt_link_compose_dotenv || true

log "secrets ready (env from Doppler)"
