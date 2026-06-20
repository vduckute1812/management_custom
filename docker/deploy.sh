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

echo "==> Building production app image"
podman build -f docker/Dockerfile.prod -t localhost/mgmt-app-prod:latest .

echo "==> Starting production stack"
$COMPOSE up -d --force-recreate

echo
echo "Production stack started."
echo "  HTTP:   http://${PUBLIC_IP}:8080"
echo "  HTTPS:  https://${PUBLIC_IP}:8443  (self-signed — browser will warn)"
echo
echo "Router forwards: ${PUBLIC_IP}:8080 -> ${LAN_IP}:8080, ${PUBLIC_IP}:8443 -> ${LAN_IP}:8443"
echo "Logs: $COMPOSE logs -f app nginx"
