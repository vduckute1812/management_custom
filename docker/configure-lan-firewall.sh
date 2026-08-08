#!/usr/bin/env bash
# Restrict LAN-published MySQL (3306) and Redis (6379) via ufw.
#
# Compose MUST keep ${LAN_IP}:3306 / :6379 publishes (Podman has no service
# DNS). This script does not remove those binds — it limits who may connect.
#
# Default is dry-run. Apply with APPLY=1.
#
# Required:
#   LAN_IP — Pi LAN address (also read from docker/.env.prod if present)
# Optional:
#   EXTRA_ALLOW_CIDRS — comma-separated CIDRs/IPs allowed to reach DB/Redis
#                       (in addition to 127.0.0.1 and LAN_IP)
#
# Usage:
#   LAN_IP=192.168.1.4 bash docker/configure-lan-firewall.sh
#   APPLY=1 LAN_IP=192.168.1.4 bash docker/configure-lan-firewall.sh
#
# Always ensure SSH is allowed before enabling ufw on a remote Pi.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/docker/.env.prod"

log() { echo "[lan-firewall] $*"; }
die() { echo "[lan-firewall] ERROR: $*" >&2; exit 1; }

if [[ -f "${ENV_FILE}" ]]; then
  # Read LAN_IP only — do not bash-source the full env (SMTP_FROM etc. break).
  if [[ -z "${LAN_IP:-}" ]]; then
    LAN_IP="$(
      grep -E '^LAN_IP=' "${ENV_FILE}" 2>/dev/null | head -n1 | cut -d= -f2- \
        | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true
    )"
  fi
fi

LAN_IP="${LAN_IP:-}"
[[ -n "${LAN_IP}" ]] || die "LAN_IP is required (e.g. 192.168.1.4)"
APPLY="${APPLY:-0}"

command -v ufw >/dev/null 2>&1 || die "ufw not found — install ufw or translate rules to nftables"

run() {
  if [[ "${APPLY}" == "1" ]]; then
    log "+ $*"
    "$@"
  else
    log "DRY-RUN: $*"
  fi
}

log "target LAN_IP=${LAN_IP} APPLY=${APPLY}"
log "ensuring OpenSSH stays allowed before any deny rules"

run ufw allow OpenSSH
run ufw allow 22/tcp
# Public HTTP(S) / app (nginx / tunnel still terminate externally).
run ufw allow 80/tcp
run ufw allow 443/tcp
run ufw allow 3000/tcp

allow_db_from() {
  local src="$1"
  run ufw allow from "${src}" to any port 3306 proto tcp comment "mgmt-mysql"
  run ufw allow from "${src}" to any port 6379 proto tcp comment "mgmt-redis"
}

allow_db_from "127.0.0.1"
allow_db_from "${LAN_IP}"

IFS=',' read -r -a EXTRA <<< "${EXTRA_ALLOW_CIDRS:-}"
for cidr in "${EXTRA[@]}"; do
  cidr="$(echo "${cidr}" | tr -d '[:space:]')"
  [[ -n "${cidr}" ]] || continue
  allow_db_from "${cidr}"
done

# Drop prior world-denies so a re-run cannot leave DENY above ALLOW
# (ufw first-match order). Then append denys after the allows above.
if [[ "${APPLY}" == "1" ]]; then
  ufw --force delete deny 3306/tcp >/dev/null 2>&1 || true
  ufw --force delete deny 6379/tcp >/dev/null 2>&1 || true
else
  log "DRY-RUN: ufw --force delete deny 3306/tcp (if present)"
  log "DRY-RUN: ufw --force delete deny 6379/tcp (if present)"
fi

# Deny everyone else on DB/Redis (must come after allow rules).
run ufw deny 3306/tcp comment "mgmt-mysql-deny-world"
run ufw deny 6379/tcp comment "mgmt-redis-deny-world"

if [[ "${APPLY}" == "1" ]]; then
  run ufw --force enable
  log "ufw status:"
  ufw status numbered || true
  log "done. Re-check app health: curl -fsS http://${LAN_IP}:3000/api/health"
else
  log "dry-run complete — re-run with APPLY=1 to enforce"
fi
