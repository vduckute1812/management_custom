#!/usr/bin/env bash
set -euo pipefail

# Detect the router's current public IP and update local config when it changes.
# Viettel (and most home ISPs) assign a new public IP after reboot or periodically.
#
#   bash docker/sync-public-ip.sh
#   bash docker/sync-public-ip.sh --no-restart   # update config only
#
# Optional env overrides:
#   LAN_IP=192.168.1.4 bash docker/sync-public-ip.sh

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${DIR}/.." && pwd)"
ENV_FILE="${DIR}/.env.prod"
STATE_FILE="${DIR}/.public-ip"
LAN_IP="${LAN_IP:-192.168.1.4}"
RESTART=false
AUTO_RESTART_ON_CHANGE=true

for arg in "$@"; do
  case "${arg}" in
    --restart) RESTART=true ;;
    --no-restart) AUTO_RESTART_ON_CHANGE=false ;;
  esac
done

detect_public_ip() {
  local ip url
  for url in \
    "https://api.ipify.org" \
    "https://ifconfig.me/ip" \
    "https://icanhazip.com"
  do
    ip="$(curl -4 -fsSL --max-time 12 "${url}" 2>/dev/null | tr -d '[:space:]')"
    if [[ "${ip}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "${ip}"
      return 0
    fi
  done
  return 1
}

read_stored_ip() {
  if [[ -f "${STATE_FILE}" ]]; then
    tr -d '[:space:]' < "${STATE_FILE}"
    return 0
  fi
  if [[ -f "${ENV_FILE}" ]]; then
    grep '^APP_HOST=' "${ENV_FILE}" | cut -d= -f2- | tr -d '[:space:]'
    return 0
  fi
  return 1
}

update_app_host() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "[ip] missing ${ENV_FILE} — skipping APP_HOST update"
    return 0
  fi
  if grep -q '^APP_HOST=' "${ENV_FILE}"; then
    sed -i "s|^APP_HOST=.*|APP_HOST=${CURRENT}|" "${ENV_FILE}"
  else
    printf '\nAPP_HOST=%s\n' "${CURRENT}" >> "${ENV_FILE}"
  fi
}

restart_nginx() {
  local compose="/home/duc13t3/.pyenv/versions/toastmaster-env/bin/podman-compose -f docker/docker-compose.prod.yml"
  if podman ps --format '{{.Names}}' 2>/dev/null | grep -qx 'mgmt-nginx-prod'; then
    cd "${ROOT}"
    ${compose} up -d --force-recreate nginx
    echo "[ip] recreated mgmt-nginx-prod with updated TLS certificate"
  fi
}

notify_ip_change() {
  local old_ip="$1"
  if [[ -z "${old_ip}" ]]; then
    return 0
  fi
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "[ip] skipping email notification — missing ${ENV_FILE}"
    return 0
  fi
  if node --env-file="${ENV_FILE}" --import tsx "${ROOT}/scripts/notify-public-ip-change.ts" \
    "${old_ip}" "${CURRENT}" "${LAN_IP}"; then
    echo "[ip] notification email sent"
  else
    echo "[ip] WARNING: could not send notification email"
  fi
}

echo "[ip] detecting public IP…"
CURRENT="$(detect_public_ip)" || {
  echo "[ip] could not detect public IP (check internet connectivity)"
  exit 1
}

STORED=""
if STORED="$(read_stored_ip 2>/dev/null)"; then
  :
else
  STORED=""
fi

if [[ "${CURRENT}" == "${STORED}" ]]; then
  echo "[ip] public IP unchanged: ${CURRENT}"
  exit 0
fi

if [[ -n "${STORED}" ]]; then
  echo "[ip] public IP changed: ${STORED} -> ${CURRENT}"
else
  echo "[ip] recording public IP: ${CURRENT}"
fi

printf '%s\n' "${CURRENT}" > "${STATE_FILE}"
update_app_host

echo "[ip] regenerating TLS certificate for new public IP"
PUBLIC_IP="${CURRENT}" LAN_IP="${LAN_IP}" bash "${DIR}/init-ssl.sh"

if [[ "${RESTART}" == true || "${AUTO_RESTART_ON_CHANGE}" == true ]]; then
  restart_nginx
fi

notify_ip_change "${STORED}"

echo
echo "Update your Viettel router port forwarding to the new public IP:"
echo "  ${CURRENT}:8080 -> ${LAN_IP}:8080"
echo "  ${CURRENT}:8443 -> ${LAN_IP}:8443"
echo
echo "Direct access:"
echo "  HTTP:  http://${CURRENT}:8080"
echo "  HTTPS: https://${CURRENT}:8443  (self-signed — browser will warn)"
echo
echo "Cloudflare Tunnel (email links) is unaffected — run sync-tunnel-url.sh if needed."
