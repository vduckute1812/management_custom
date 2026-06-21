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

cert_public_ip() {
  if [[ ! -f "${CERT}" ]]; then
    return 1
  fi
  openssl x509 -in "${CERT}" -noout -ext subjectAltName 2>/dev/null \
    | grep -oE 'IP Address:[0-9.]+' \
    | head -1 \
    | sed 's/IP Address://'
}

need_regen=false
if [[ "${FORCE_SSL:-}" == "1" ]]; then
  need_regen=true
elif [[ -f "${CERT}" && -f "${KEY}" ]]; then
  existing_ip="$(cert_public_ip || true)"
  if [[ -n "${existing_ip}" && "${existing_ip}" != "${PUBLIC_IP}" ]]; then
    echo "[ssl] certificate is for ${existing_ip}, need ${PUBLIC_IP}"
    need_regen=true
  fi
fi

if [[ -f "${CERT}" && -f "${KEY}" && "${need_regen}" != true ]]; then
  echo "[ssl] certificates already exist in ${SSL_DIR}"
  exit 0
fi

if [[ "${need_regen}" == true ]]; then
  rm -f "${CERT}" "${KEY}"
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

echo "[ssl] wrote ${CERT} and ${KEY}"
echo "[ssl] HTTPS will show a browser warning (self-signed). Use HTTP on port 8080 to avoid it."
