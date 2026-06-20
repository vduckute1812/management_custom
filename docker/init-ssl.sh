#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SSL_DIR="${DIR}/ssl"
PUBLIC_IP="${PUBLIC_IP:-27.79.44.74}"
LAN_IP="${LAN_IP:-192.168.1.4}"
DAYS="${SSL_DAYS:-825}"

CERT="${SSL_DIR}/fullchain.pem"
KEY="${SSL_DIR}/privkey.pem"

mkdir -p "${SSL_DIR}"

if [[ -f "${CERT}" && -f "${KEY}" ]]; then
  echo "[ssl] certificates already exist in ${SSL_DIR}"
  exit 0
fi

echo "[ssl] generating self-signed certificate (${DAYS} days)"
echo "[ssl] SANs: IP:${PUBLIC_IP}, IP:${LAN_IP}, DNS:localhost"

openssl req -x509 -nodes -days "${DAYS}" -newkey rsa:2048 \
  -keyout "${KEY}" \
  -out "${CERT}" \
  -subj "/CN=${PUBLIC_IP}" \
  -addext "subjectAltName=IP:${PUBLIC_IP},IP:${LAN_IP},DNS:localhost"

chmod 600 "${KEY}"
chmod 644 "${CERT}"

echo "[ssl] wrote ${CERT}"
echo "[ssl] wrote ${KEY}"
echo
echo "Browsers will warn about self-signed certs — expected for IP-only hosting."
echo "To use a real certificate, replace fullchain.pem and privkey.pem in docker/ssl/"
