#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE="/home/duc13t3/.pyenv/versions/toastmaster-env/bin/podman-compose -f docker/docker-compose.prod.yml"
PUBLIC_IP="${PUBLIC_IP:-27.79.44.74}"
LAN_IP="${LAN_IP:-192.168.1.4}"

cd "$ROOT"

echo "==> Ensuring TLS certificates exist"
bash docker/init-ssl.sh

echo "==> Ensuring MySQL volume exists"
podman volume exists management_mgmt-mysql-data 2>/dev/null || podman volume create management_mgmt-mysql-data

echo "==> Stopping dev MySQL stack (if running) to avoid port conflicts"
/home/duc13t3/.pyenv/versions/toastmaster-env/bin/podman-compose down 2>/dev/null || true

echo "==> Building production app image"
podman build -f docker/Dockerfile.prod -t localhost/mgmt-app-prod:latest .

echo "==> Starting production stack"
$COMPOSE up -d --force-recreate

echo
echo "Production stack started."
echo "  HTTP:"
echo "    Local:   http://127.0.0.1:8080"
echo "    LAN:     http://${LAN_IP}:8080"
echo "    Public:  http://${PUBLIC_IP}:8080"
echo "  HTTPS:"
echo "    Local:   https://127.0.0.1:8443"
echo "    LAN:     https://${LAN_IP}:8443"
echo "    Public:  https://${PUBLIC_IP}:8443"
echo
echo "Router forwards needed:"
echo "  ${PUBLIC_IP}:8080 -> ${LAN_IP}:8080"
echo "  ${PUBLIC_IP}:8443 -> ${LAN_IP}:8443"
echo
echo "Health: curl http://127.0.0.1:8080/health  (or curl -k https://127.0.0.1:8443/health)"
echo "Logs:   $COMPOSE logs -f app nginx"
