#!/usr/bin/env bash
set -euo pipefail

# Install a user systemd service for the named Cloudflare Tunnel.
#
# Prerequisites (one-time):
#   bash docker/setup-named-tunnel.sh
#
#   systemctl --user status mgmt-cloudflare-tunnel
#   journalctl --user -u mgmt-cloudflare-tunnel -f
#   systemctl --user stop mgmt-cloudflare-tunnel
#   systemctl --user restart mgmt-cloudflare-tunnel

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${DIR}/.." && pwd)"
BIN="${DIR}/bin/cloudflared"
UNIT_NAME="mgmt-cloudflare-tunnel.service"
UNIT_DST="${HOME}/.config/systemd/user/${UNIT_NAME}"
ENV_FILE="${DIR}/cloudflared.env"
CONF_FILE="${DIR}/cloudflared/config.yml"
TOKEN_FILE="${DIR}/cloudflared/tunnel.token"

# shellcheck disable=SC1090
source "${ENV_FILE}"

ensure_cloudflared() {
  local arch cf_arch
  arch="$(uname -m)"
  case "${arch}" in
    aarch64|arm64) cf_arch=arm64 ;;
    armv7l|armv6l) cf_arch=arm ;;
    x86_64|amd64) cf_arch=amd64 ;;
    *) echo "[tunnel] unsupported architecture: ${arch}"; exit 1 ;;
  esac

  if [[ -x "${BIN}" ]] && "${BIN}" --version >/dev/null 2>&1; then
    return 0
  fi

  echo "[tunnel] downloading cloudflared (${cf_arch})…"
  mkdir -p "${DIR}/bin"
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${cf_arch}" -o "${BIN}"
  chmod +x "${BIN}"
}

build_exec_start() {
  if [[ -f "${TOKEN_FILE}" ]]; then
    # systemd does not expand $(...); run via bash so the token file is read at start.
    echo "/bin/bash -c 'exec ${BIN} tunnel --no-autoupdate run --token \"\$(cat ${TOKEN_FILE})\"'"
    return
  fi
  if [[ -f "${CONF_FILE}" ]]; then
    echo "${BIN} tunnel --no-autoupdate --config ${CONF_FILE} run"
    return
  fi
  echo "[tunnel] ERROR: named tunnel not configured."
  echo "         Run: bash docker/setup-named-tunnel.sh"
  echo "         (quick tunnels / trycloudflare.com are no longer used)"
  exit 1
}

echo "==> Ensuring cloudflared is installed"
ensure_cloudflared

EXEC_START="$(build_exec_start)"

echo "==> Installing systemd user service (named tunnel → ${APP_BASE_URL})"
mkdir -p "${HOME}/.config/systemd/user"
cat > "${UNIT_DST}" <<EOF
[Unit]
Description=Cloudflare Tunnel for management app (${TUNNEL_HOSTNAME})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${ROOT}
ExecStart=${EXEC_START}
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
EOF

echo "==> Enabling user lingering (service runs after logout/reboot)"
if loginctl show-user "$(whoami)" -p Linger 2>/dev/null | grep -q "Linger=no"; then
  if ! sudo loginctl enable-linger "$(whoami)"; then
    echo "[tunnel] WARNING: could not enable linger (needs sudo password)."
    echo "         Run once: sudo loginctl enable-linger $(whoami)"
    echo "         Without this, the tunnel stops when you log out of SSH."
  fi
fi

echo "==> Enabling and (re)starting ${UNIT_NAME}"
systemctl --user daemon-reload
systemctl --user enable "${UNIT_NAME}"
# Restart, not just start: an already-running instance would keep the old
# ExecStart (e.g. a previous quick tunnel) and the domain would return 530.
systemctl --user restart "${UNIT_NAME}"

echo
echo "Tunnel service started."
echo "  Public:  ${APP_BASE_URL}"
echo "  Status:  systemctl --user status ${UNIT_NAME}"
echo "  Logs:    journalctl --user -u ${UNIT_NAME} -f"
echo
sleep 3
journalctl --user -u "${UNIT_NAME}" -n 30 --no-pager | grep -E 'Registered|connIndex|INF|ERR|error' \
  || journalctl --user -u "${UNIT_NAME}" -n 15 --no-pager

echo
echo "==> Syncing APP_BASE_URL into docker/.env.prod"
if bash "${DIR}/sync-tunnel-url.sh" --restart-app; then
  echo "[tunnel] verification emails will use ${APP_BASE_URL}"
else
  echo "[tunnel] WARNING: could not sync APP_BASE_URL — run: bash docker/sync-tunnel-url.sh --restart-app"
fi

echo
echo "No modem port-forward needed. Cloudflare reaches this host via the outbound tunnel."
