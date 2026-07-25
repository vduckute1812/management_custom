#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE="/home/duc13t3/.pyenv/versions/toastmaster-env/bin/podman-compose -f docker/docker-compose.prod.yml"
LAN_IP="${LAN_IP:-192.168.1.4}"
SKIP_TUNNEL_URL=false

for arg in "$@"; do
  case "${arg}" in
    --skip-tunnel-url|--no-sync-tunnel) SKIP_TUNNEL_URL=true ;;
  esac
done

cd "$ROOT"

echo "==> Syncing public IP (Viettel router may assign a new one)"
if bash docker/sync-public-ip.sh; then
  PUBLIC_IP="$(tr -d '[:space:]' < docker/.public-ip)"
else
  PUBLIC_IP="${PUBLIC_IP:-$(tr -d '[:space:]' < docker/.public-ip 2>/dev/null || echo 27.79.44.74)}"
  echo "[deploy] WARNING: could not detect public IP — using ${PUBLIC_IP}"
fi

if [[ "${SKIP_TUNNEL_URL}" == true ]]; then
  echo "==> Skipping Cloudflare tunnel URL sync (keeping existing APP_BASE_URL)"
  if grep -q '^APP_BASE_URL=' docker/.env.prod 2>/dev/null; then
    echo "[deploy] APP_BASE_URL=$(grep '^APP_BASE_URL=' docker/.env.prod | cut -d= -f2-)"
  fi
else
  echo "==> Syncing Cloudflare tunnel URL into production env"
  if bash docker/sync-tunnel-url.sh; then
    echo "[deploy] APP_BASE_URL updated from tunnel logs"
  else
    echo "[deploy] WARNING: could not sync APP_BASE_URL — verification links may be wrong"
  fi
fi

echo "==> Ensuring TLS certificates exist"
PUBLIC_IP="${PUBLIC_IP}" LAN_IP="${LAN_IP}" bash docker/init-ssl.sh

echo "==> Ensuring MySQL volume exists"
podman volume exists management_mgmt-mysql-data 2>/dev/null || podman volume create management_mgmt-mysql-data

echo "==> Building production app image"
podman build -f docker/Dockerfile.prod -t localhost/mgmt-app-prod:latest .

echo "==> Starting production stack"
$COMPOSE up -d --force-recreate

PUBLIC_URL="https://dntechx.com"
if [[ -f docker/cloudflared.env ]]; then
  # shellcheck disable=SC1091
  PUBLIC_URL="$(grep '^APP_BASE_URL=' docker/cloudflared.env | cut -d= -f2-)"
fi

echo
echo "Production stack started."
echo "  Public: ${PUBLIC_URL}  (Cloudflare Tunnel — no modem port-forward)"
echo "  LAN:    http://${LAN_IP}:8080"
echo
if [[ -f docker/cloudflared/config.yml ]] || [[ -f docker/cloudflared/tunnel.token ]]; then
  echo "Tunnel:  systemctl --user status mgmt-cloudflare-tunnel"
else
  echo "Tunnel not configured yet:"
  echo "  bash docker/setup-named-tunnel.sh"
  echo "  bash docker/install-cloudflare-tunnel.sh"
fi
echo "Logs: $COMPOSE logs -f app nginx"
