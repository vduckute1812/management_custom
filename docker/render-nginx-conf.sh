#!/usr/bin/env bash
# Render docker/nginx.prod.conf.template → docker/nginx.prod.rendered.conf
# substituting __LAN_IP__. Safe to re-run; preserves inode when the output
# already exists so a live bind-mount + `nginx -s reload` picks up edits.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${DIR}/nginx.prod.conf.template"
OUT="${DIR}/nginx.prod.rendered.conf"
LAN_IP="${LAN_IP:-192.168.1.4}"

if [[ ! -f "${TEMPLATE}" ]]; then
  echo "[nginx] ERROR: missing template ${TEMPLATE}" >&2
  exit 1
fi

# Reject values that would break the nginx config or look like injection.
if [[ ! "${LAN_IP}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "[nginx] ERROR: LAN_IP must be an IPv4 address (got: ${LAN_IP})" >&2
  exit 1
fi

tmp="$(mktemp)"
trap 'rm -f "${tmp}"' EXIT
sed "s/__LAN_IP__/${LAN_IP}/g" "${TEMPLATE}" > "${tmp}"

if [[ -f "${OUT}" ]]; then
  # Truncate-in-place so Podman/Docker file bind-mounts keep the same inode.
  cat "${tmp}" > "${OUT}"
else
  cp "${tmp}" "${OUT}"
fi

echo "[nginx] rendered ${OUT} (LAN_IP=${LAN_IP})"
