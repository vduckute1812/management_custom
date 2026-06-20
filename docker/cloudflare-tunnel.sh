#!/usr/bin/env bash
set -euo pipefail

# Expose the app over trusted HTTPS via Cloudflare Tunnel (no router port 80 needed).
#
# Foreground (stops when you close SSH):
#   bash docker/cloudflare-tunnel.sh
#
# Persistent (survives SSH disconnect + reboot):
#   bash docker/install-cloudflare-tunnel.sh
#   journalctl --user -u mgmt-cloudflare-tunnel -f

DIR="$(cd "$(dirname "$0")" && pwd)"
BIN="${DIR}/bin/cloudflared"
UPSTREAM="${TUNNEL_UPSTREAM:-http://127.0.0.1:8080}"
ARCH="$(uname -m)"

case "${ARCH}" in
  aarch64|arm64) CF_ARCH=arm64 ;;
  armv7l|armv6l) CF_ARCH=arm ;;
  x86_64|amd64) CF_ARCH=amd64 ;;
  *) echo "[tunnel] unsupported architecture: ${ARCH}"; exit 1 ;;
esac

if [[ ! -x "${BIN}" ]]; then
  echo "[tunnel] downloading cloudflared (${CF_ARCH})…"
  mkdir -p "${DIR}/bin"
  curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}" -o "${BIN}"
  chmod +x "${BIN}"
fi

echo "[tunnel] starting Cloudflare Tunnel -> ${UPSTREAM}"
echo "[tunnel] look for: https://….trycloudflare.com"
echo "[tunnel] press Ctrl+C to stop (use install-cloudflare-tunnel.sh to run in background)"
echo

exec "${BIN}" tunnel --no-autoupdate --url "${UPSTREAM}"
