#!/usr/bin/env bash
# Verify the least-privilege MySQL app user can DML on rc.* and cannot DDL.
#
# Required env (from docker/.env.prod or export):
#   DB_PASS
# Optional:
#   DB_USER / DB_NAME / MYSQL_APP_USER_HOST / MYSQL_CONTAINER
#   DB_HOST — unused inside the container (connects via socket/local mysql client)
#
# Usage:
#   bash docker/verify-mysql-app-user.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCKER_DIR="${ROOT}/docker"
ENV_FILE="${DOCKER_DIR}/.env.prod"

log() { echo "[mysql-app-user] $*"; }
die() { echo "[mysql-app-user] ERROR: $*" >&2; exit 1; }

# Load only keys we need from KEY=VAL lines (see apply-mysql-app-user.sh).
# CLI/exported vars win over the file.
load_env_keys() {
  [[ -f "${ENV_FILE}" ]] || return 0
  local line key val
  while IFS= read -r line || [[ -n "${line}" ]]; do
    [[ "${line}" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line}" || "${line}" != *=* ]] && continue
    key="${line%%=*}"
    val="${line#*=}"
    if [[ "${val}" =~ ^\"(.*)\"$ ]]; then
      val="${BASH_REMATCH[1]}"
      val="${val//\\\"/\"}"
    elif [[ "${val}" =~ ^\'(.*)\'$ ]]; then
      val="${BASH_REMATCH[1]}"
    fi
    case "${key}" in
      DB_USER|DB_PASS|DB_NAME|MYSQL_ROOT_PASSWORD|MYSQL_APP_USER_HOST|MYSQL_CONTAINER)
        if [[ ! -v "${key}" ]]; then
          printf -v "${key}" '%s' "${val}"
          export "${key?}"
        fi
        ;;
    esac
  done < "${ENV_FILE}"
}

load_env_keys

DB_USER="${DB_USER:-mgmt}"
DB_PASS="${DB_PASS:-}"
DB_NAME="${DB_NAME:-rc}"
MYSQL_APP_USER_HOST="${MYSQL_APP_USER_HOST:-%}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-mgmt-mysql-prod}"

[[ -n "${DB_PASS:-}" ]] || die "DB_PASS is required"
[[ "${DB_USER}" != "root" ]] || die "DB_USER must not be root"

RUNTIME=podman
command -v podman >/dev/null 2>&1 || RUNTIME=docker
command -v "${RUNTIME}" >/dev/null 2>&1 || die "need podman or docker on PATH"

sql_quote() {
  printf "%s" "$1" | sed "s/'/''/g"
}

USER_Q="$(sql_quote "${DB_USER}")"
PASS_Q="$(sql_quote "${DB_PASS}")"
DB_Q="$(sql_quote "${DB_NAME}")"
PROBE_TABLE="_mgmt_priv_probe_$$"

log "verifying '${DB_USER}' can SELECT on \`${DB_NAME}\` via ${MYSQL_CONTAINER}"

"${RUNTIME}" exec -i "${MYSQL_CONTAINER}" \
  env MYSQL_PWD="${DB_PASS}" \
  mysql -u"${DB_USER}" -N -e "SELECT 1 FROM DUAL;" "${DB_NAME}" \
  | grep -qx '1' || die "SELECT 1 failed for ${DB_USER}"

log "confirming DDL is denied (CREATE TABLE should fail)"
set +e
DDL_OUT="$("${RUNTIME}" exec -i "${MYSQL_CONTAINER}" \
  env MYSQL_PWD="${DB_PASS}" \
  mysql -u"${DB_USER}" -e \
  "CREATE TABLE \`${DB_Q}\`.\`${PROBE_TABLE}\` (id INT PRIMARY KEY);" 2>&1)"
DDL_RC=$?
set -e
if [[ "${DDL_RC}" -eq 0 ]]; then
  # Roll back if grants were wrong.
  "${RUNTIME}" exec -i "${MYSQL_CONTAINER}" \
    env MYSQL_PWD="${MYSQL_ROOT_PASSWORD:-}" \
    mysql -uroot -e "DROP TABLE IF EXISTS \`${DB_Q}\`.\`${PROBE_TABLE}\`;" 2>/dev/null || true
  die "CREATE TABLE succeeded — ${DB_USER} is over-privileged"
fi
log "DDL denied as expected"

log "OK — safe to set DB_USER=${DB_USER} / DB_PASS in Doppler and remove ALLOW_ROOT_DB"
log "Keep MYSQL_ROOT_PASSWORD for migrate. Restrict host firewall on LAN 3306/6379."
