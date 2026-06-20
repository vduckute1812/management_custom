#!/usr/bin/env bash
set -euo pipefail

# Install a user systemd service so the tunnel keeps running after SSH disconnect.
#
#   bash docker/install-cloudflare-tunnel.sh
#
# Commands:
#   systemctl --user status mgmt-cloudflare-tunnel
#   journalctl --user -u mgmt-cloudflare-tunnel -f    # find the public URL
#   systemctl --user stop mgmt-cloudflare-tunnel
#   systemctl --user restart mgmt-cloudflare-tunnel

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${DIR}/.." && pwd)"
BIN="${DIR}/bin/cloudflared"
UNIT_NAME="mgmt-cloudflare-tunnel.service"
UNIT_DST="${HOME}/.config/systemd/user/${UNIT_NAME}"

ensure_cloudflared() {
  [[ -x "${BIN}" ]] && return 0
  local arch cf_arch
  arch="$(uname -m)"
  case "${arch}" in
    aarch64|arm64) cf_arch=arm64 ;;
    armv7l|armv6l) cf_arch=arm ;;
    x86_64|amd64) cf_arch=amd64 ;;
    *) echo "[tunnel] unsupported architecture: ${arch}"; exit 1 ;;
  esac
  echo "[tunnel] downloading cloudflared (${cf_arch})…"
  mkdir -p "${DIR}/bin"
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${cf_arch}" -o "${BIN}"
  chmod +x "${BIN}"
}

echo "==> Ensuring cloudflared is installed"
ensure_cloudflared

echo "==> Installing systemd user service"
mkdir -p "${HOME}/.config/systemd/user"
cat > "${UNIT_DST}" <<EOF
[Unit]
Description=Cloudflare Tunnel for management app
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${ROOT}
ExecStart=${BIN} tunnel --no-autoupdate --url http://127.0.0.1:8080
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

echo "==> Enabling and starting ${UNIT_NAME}"
systemctl --user daemon-reload
systemctl --user enable --now "${UNIT_NAME}"

echo
echo "Tunnel service started."
echo "  Status:  systemctl --user status ${UNIT_NAME}"
echo "  URL log: journalctl --user -u ${UNIT_NAME} -f"
echo
sleep 3
journalctl --user -u "${UNIT_NAME}" -n 30 --no-pager | grep -E 'trycloudflare|INF|ERR' || journalctl --user -u "${UNIT_NAME}" -n 15 --no-pager

echo
echo "==> Syncing APP_BASE_URL into docker/.env.prod"
if bash "${DIR}/sync-tunnel-url.sh" --restart-app; then
  echo "[tunnel] verification emails will use the Cloudflare URL above"
else
  echo "[tunnel] WARNING: could not sync APP_BASE_URL — run: bash docker/sync-tunnel-url.sh --restart-app"
fi
