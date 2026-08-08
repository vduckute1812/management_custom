#!/usr/bin/env bash
# Create/update the least-privilege MySQL app user (`mgmt`) on a live volume.
#
# Reads secrets from docker/.env.prod (or the environment). Does not commit
# passwords. Prefer this over hand-editing CHANGE_ME into the SQL file.
#
# Required env (from .env.prod or export):
#   MYSQL_ROOT_PASSWORD
#   DB_PASS                 — password for the app user
# Optional:
#   DB_USER                 — default mgmt
#   DB_NAME                 — default rc
#   MYSQL_APP_USER_HOST     — default % (LAN app connects via ${LAN_IP})
#   MYSQL_CONTAINER         — default mgmt-mysql-prod
#
# Usage:
#   bash docker/apply-mysql-app-user.sh
#
# After success: set DB_USER/DB_PASS in Doppler, remove ALLOW_ROOT_DB, redeploy.
# Keep MYSQL_ROOT_PASSWORD for migrate/admin. Restrict LAN 3306/6379 with the
# host firewall — do not remove compose LAN publishes (Podman DNS workaround).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCKER_DIR="${ROOT}/docker"
ENV_FILE="${DOCKER_DIR}/.env.prod"

log() { echo "[mysql-app-user] $*"; }
die() { echo "[mysql-app-user] ERROR: $*" >&2; exit 1; }

load_env_file() {
  [[ -f "${ENV_FILE}" ]] || return 0
  # shellcheck disable=SC1090
  set -a
  # shellcheck disable=SC1091
  source "${ENV_FILE}"
  set +a
}

load_env_file

DB_USER="${DB_USER:-mgmt}"
DB_NAME="${DB_NAME:-rc}"
MYSQL_APP_USER_HOST="${MYSQL_APP_USER_HOST:-%}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-mgmt-mysql-prod}"

[[ -n "${MYSQL_ROOT_PASSWORD:-}" ]] || die "MYSQL_ROOT_PASSWORD is required"
[[ -n "${DB_PASS:-}" ]] || die "DB_PASS is required (password for ${DB_USER})"
[[ "${DB_PASS}" != "CHANGE_ME" ]] || die "DB_PASS must not be CHANGE_ME"
[[ "${DB_USER}" != "root" ]] || die "DB_USER must not be root"

# Escape single quotes for SQL string literals.
sql_quote() {
  printf "%s" "$1" | sed "s/'/''/g"
}

USER_Q="$(sql_quote "${DB_USER}")"
HOST_Q="$(sql_quote "${MYSQL_APP_USER_HOST}")"
PASS_Q="$(sql_quote "${DB_PASS}")"
DB_Q="$(sql_quote "${DB_NAME}")"

log "applying '${DB_USER}'@'${MYSQL_APP_USER_HOST}' on ${MYSQL_CONTAINER} (DML on \`${DB_NAME}\`.*)"

if ! command -v podman >/dev/null 2>&1 && ! command -v docker >/dev/null 2>&1; then
  die "need podman or docker on PATH"
fi

RUNTIME=podman
command -v podman >/dev/null 2>&1 || RUNTIME=docker

"${RUNTIME}" exec -i "${MYSQL_CONTAINER}" \
  env MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" \
  mysql -uroot <<SQL
CREATE USER IF NOT EXISTS '${USER_Q}'@'${HOST_Q}' IDENTIFIED BY '${PASS_Q}';
ALTER USER '${USER_Q}'@'${HOST_Q}' IDENTIFIED BY '${PASS_Q}';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${DB_Q}\`.* TO '${USER_Q}'@'${HOST_Q}';
FLUSH PRIVILEGES;
SQL

log "done. Next: bash docker/verify-mysql-app-user.sh"
log "Then Doppler: DB_USER=${DB_USER} DB_PASS=… ; delete ALLOW_ROOT_DB ; redeploy"
log "Firewall: keep compose LAN 3306/6379 publishes; restrict at host (ufw/nft)."
