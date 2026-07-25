#!/usr/bin/env bash
# Shared helpers for production deploy scripts.
#
# Compose is invoked through `uv run podman-compose` from the repo root
# (see pyproject.toml). No Poetry/pyenv absolute paths.
#
# Override with env vars when needed:
#   MGMT_COMPOSE      — full compose command override (space-separated)
#   MGMT_COMPOSE_FILE — compose file relative to repo root
#                       (default: docker/docker-compose.prod.yml)
#   MGMT_IMAGE        — app image name (default: localhost/mgmt-app-prod)
#   LAN_IP            — LAN address advertised in deploy output

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

  local root
  root="$(mgmt_repo_root)"

  if command -v uv >/dev/null 2>&1; then
    # Ensure deps from pyproject.toml are available (no-op when locked/synced).
    if [[ -f "${root}/pyproject.toml" ]]; then
      (cd "${root}" && uv sync --frozen >/dev/null 2>&1) \
        || (cd "${root}" && uv sync >/dev/null)
    fi
    COMPOSE_ARR=(uv run --project "${root}" podman-compose)
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

  echo "[deploy] ERROR: need \`uv\` (preferred) or podman-compose/docker compose on PATH." >&2
  echo "[deploy] Install uv: https://docs.astral.sh/uv/getting-started/installation/" >&2
  return 1
}

mgmt_runtime() {
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
  local root file
  root="$(mgmt_repo_root)"
  file="${MGMT_COMPOSE_FILE:-docker/docker-compose.prod.yml}"
  mgmt_compose_cmd || return 1
  (cd "${root}" && "${COMPOSE_ARR[@]}" -f "${file}" "$@")
}
