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
#   LAN_IP            — Pi LAN bind for app/mysql/redis publish + nginx upstream
#                       (default: 192.168.1.4). Used by compose interpolation
#                       and docker/render-nginx-conf.sh.

mgmt_repo_root() {
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  echo "${here}"
}

# Render nginx upstream to the current LAN_IP before any compose call that
# may start/reload nginx. Cheap; keeps bind-mount + reload in sync.
mgmt_render_nginx() {
  local root
  root="$(mgmt_repo_root)"
  LAN_IP="${LAN_IP:-192.168.1.4}" bash "${root}/docker/render-nginx-conf.sh"
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

# Resolve docker/.env.prod (may be a symlink into ~/.config/management).
mgmt_prod_env_file() {
  local root envf
  root="$(mgmt_repo_root)"
  envf="${root}/docker/.env.prod"
  if [[ -L "${envf}" ]]; then
    # Prefer the canonical secrets path so upserts persist across checkouts.
    readlink -f "${envf}" 2>/dev/null || realpath "${envf}" 2>/dev/null || echo "${envf}"
    return 0
  fi
  echo "${envf}"
}

mgmt_env_unquote() {
  local val="$1"
  if [[ "${#val}" -ge 2 && "${val}" == \"*\" ]]; then
    val="${val:1:${#val}-2}"
  elif [[ "${#val}" -ge 2 && "${val}" == \'*\' ]]; then
    val="${val:1:${#val}-2}"
  fi
  printf '%s' "${val}"
}

# Read KEY from an env file (first match). Empty if missing.
mgmt_env_get() {
  local envf="$1" key="$2" line val
  [[ -f "${envf}" ]] || return 0
  line="$(grep -E "^${key}=" "${envf}" 2>/dev/null | head -n1 || true)"
  [[ -n "${line}" ]] || return 0
  val="${line#*=}"
  val="${val%$'\r'}"
  mgmt_env_unquote "${val}"
}

# Compose interpolates ${REDIS_PASSWORD:?…} from process env / dotenv — not from
# service env_file. Older Pi secrets predate Redis auth; mint a password once
# into the canonical secrets file so unattended deploys can start redis.
mgmt_ensure_redis_password() {
  local envf realf existing pw
  envf="${1:-}"
  if [[ -z "${envf}" ]]; then
    envf="$(mgmt_repo_root)/docker/.env.prod"
  fi
  [[ -f "${envf}" ]] || {
    echo "[deploy] ERROR: missing ${envf} (need REDIS_PASSWORD for compose)" >&2
    return 1
  }
  realf="$(mgmt_prod_env_file)"
  [[ -f "${realf}" ]] || realf="${envf}"

  existing="$(mgmt_env_get "${realf}" REDIS_PASSWORD)"
  if [[ -z "${existing}" && "${realf}" != "${envf}" ]]; then
    existing="$(mgmt_env_get "${envf}" REDIS_PASSWORD)"
  fi
  if [[ -n "${existing}" ]]; then
    export REDIS_PASSWORD="${existing}"
    return 0
  fi

  if command -v openssl >/dev/null 2>&1; then
    pw="$(openssl rand -base64 32 | tr -d '\n')"
  else
    pw="$(head -c 48 /dev/urandom | base64 | tr -d '\n' | head -c 43)"
  fi
  [[ -n "${pw}" ]] || {
    echo "[deploy] ERROR: could not generate REDIS_PASSWORD" >&2
    return 1
  }

  if grep -qE '^REDIS_PASSWORD=' "${realf}" 2>/dev/null; then
    # Replace empty placeholder (REDIS_PASSWORD= / REDIS_PASSWORD="").
    sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=${pw}|" "${realf}"
  else
    printf '\n# Auto-generated for docker-compose.prod.yml redis --requirepass\nREDIS_PASSWORD=%s\n' \
      "${pw}" >> "${realf}"
  fi
  export REDIS_PASSWORD="${pw}"
  echo "[deploy] generated REDIS_PASSWORD in ${realf} (len=${#pw})"
}

# Production refuses DB_USER=root unless ALLOW_ROOT_DB=1 (see pool.ts).
# Older Pi secrets still use root for the Nitro process; set the override
# once so migrate + app can boot. Prefer cutting over to the `mgmt` user
# via docker/mysql-create-app-user.sql when convenient.
mgmt_ensure_allow_root_db() {
  local envf realf user allow
  envf="${1:-}"
  if [[ -z "${envf}" ]]; then
    envf="$(mgmt_repo_root)/docker/.env.prod"
  fi
  [[ -f "${envf}" ]] || return 0
  realf="$(mgmt_prod_env_file)"
  [[ -f "${realf}" ]] || realf="${envf}"

  user="$(mgmt_env_get "${realf}" DB_USER)"
  if [[ -z "${user}" && "${realf}" != "${envf}" ]]; then
    user="$(mgmt_env_get "${envf}" DB_USER)"
  fi
  user="${user:-root}"
  if [[ "${user}" != "root" ]]; then
    return 0
  fi

  allow="$(mgmt_env_get "${realf}" ALLOW_ROOT_DB)"
  if [[ -z "${allow}" && "${realf}" != "${envf}" ]]; then
    allow="$(mgmt_env_get "${envf}" ALLOW_ROOT_DB)"
  fi
  if [[ "${allow}" == "1" ]]; then
    export ALLOW_ROOT_DB=1
    return 0
  fi

  if grep -qE '^ALLOW_ROOT_DB=' "${realf}" 2>/dev/null; then
    sed -i 's|^ALLOW_ROOT_DB=.*|ALLOW_ROOT_DB=1|' "${realf}"
  else
    printf '\n# Temporary: DB_USER=root still in use — prefer docker/mysql-create-app-user.sql\nALLOW_ROOT_DB=1\n' \
      >> "${realf}"
  fi
  export ALLOW_ROOT_DB=1
  echo "[deploy] WARNING: set ALLOW_ROOT_DB=1 in ${realf} (DB_USER=root). Cut over to DB_USER=mgmt when possible."
}

# Export KEY=VAL from docker/.env.prod for compose *interpolation*
# (${REDIS_PASSWORD:?…} in docker-compose.prod.yml). Service `env_file:`
# only injects into containers after YAML is already resolved — without this,
# newer podman-compose fails with "required variable REDIS_PASSWORD is missing".
mgmt_export_prod_env() {
  local envf="$1"
  local line key val
  [[ -f "${envf}" ]] || return 0
  while IFS= read -r line || [[ -n "${line}" ]]; do
    line="${line%$'\r'}"
    # Allow optional "export " prefix from some secret templates.
    line="${line/#export /}"
    case "${line}" in
      '' | \#*) continue ;;
    esac
    [[ "${line}" == *=* ]] || continue
    key="${line%%=*}"
    key="${key%"${key##*[![:space:]]}"}"
    key="${key#"${key%%[![:space:]]*}"}"
    val="${line#*=}"
    val="$(mgmt_env_unquote "${val}")"
    # Only export valid shell identifiers.
    [[ "${key}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    export "${key}=${val}"
  done < "${envf}"
}

# podman-compose / docker compose also load a dotenv named `.env` next to the
# compose file (or in cwd). Keep docker/.env → .env.prod so interpolation
# works even if a caller forgets to export.
mgmt_link_compose_dotenv() {
  local root docker_dir
  root="$(mgmt_repo_root)"
  docker_dir="${root}/docker"
  [[ -f "${docker_dir}/.env.prod" ]] || return 0
  if [[ -e "${docker_dir}/.env" || -L "${docker_dir}/.env" ]]; then
    return 0
  fi
  ln -sfn .env.prod "${docker_dir}/.env"
  echo "[deploy] linked docker/.env → .env.prod (compose interpolation)"
}

mgmt_compose() {
  local root file
  root="$(mgmt_repo_root)"
  file="${MGMT_COMPOSE_FILE:-docker/docker-compose.prod.yml}"
  mgmt_compose_cmd || return 1
  # Export so compose `${LAN_IP:-…}` port binds + nginx render agree.
  export LAN_IP="${LAN_IP:-192.168.1.4}"
  mgmt_ensure_redis_password "${root}/docker/.env.prod" || return 1
  mgmt_ensure_allow_root_db "${root}/docker/.env.prod" || return 1
  mgmt_link_compose_dotenv
  mgmt_export_prod_env "${root}/docker/.env.prod"
  if [[ -z "${REDIS_PASSWORD:-}" ]]; then
    echo "[deploy] ERROR: REDIS_PASSWORD still empty after export from docker/.env.prod" >&2
    return 1
  fi
  mgmt_render_nginx || return 1
  (cd "${root}" && "${COMPOSE_ARR[@]}" -f "${file}" "$@")
}
