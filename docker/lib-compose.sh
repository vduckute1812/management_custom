#!/usr/bin/env bash
# Shared helpers for production deploy scripts.
#
# Override with env vars when the Pi layout differs from the defaults:
#   MGMT_COMPOSE   — compose CLI (default: auto-detect podman-compose / docker compose)
#   MGMT_COMPOSE_FILE — path relative to repo root (default: docker/docker-compose.prod.yml)
#   MGMT_IMAGE     — app image name (default: localhost/mgmt-app-prod)
#   LAN_IP         — LAN address advertised in deploy output (default: 192.168.1.4)

mgmt_repo_root() {
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  echo "${here}"
}

mgmt_compose_cmd() {
  if [[ -n "${MGMT_COMPOSE:-}" ]]; then
    # shellcheck disable=SC2206
    COMPOSE_ARR=(${MGMT_COMPOSE})
    return 0
  fi

  # Legacy path used on the original Pi install.
  local legacy="/home/duc13t3/.pyenv/versions/toastmaster-env/bin/podman-compose"
  if [[ -x "${legacy}" ]]; then
    COMPOSE_ARR=("${legacy}")
    return 0
  fi

  if command -v podman-compose >/dev/null 2>&1; then
    COMPOSE_ARR=(podman-compose)
    return 0
  fi

  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    COMPOSE_ARR=(docker compose)
    return 0
  fi

  if command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
    COMPOSE_ARR=(podman compose)
    return 0
  fi

  echo "[deploy] ERROR: no compose CLI found. Install podman-compose or set MGMT_COMPOSE." >&2
  return 1
}

mgmt_runtime() {
  # Prefer podman (current prod), fall back to docker.
  if command -v podman >/dev/null 2>&1; then
    echo "podman"
  elif command -v docker >/dev/null 2>&1; then
    echo "docker"
  else
    echo "[deploy] ERROR: neither podman nor docker found on PATH." >&2
    return 1
  fi
}

mgmt_compose() {
  local file="${MGMT_COMPOSE_FILE:-docker/docker-compose.prod.yml}"
  mgmt_compose_cmd || return 1
  "${COMPOSE_ARR[@]}" -f "${file}" "$@"
}
