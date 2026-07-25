#!/usr/bin/env bash
set -euo pipefail

# Foreground Cloudflare Tunnel (named domain). Stops when you Ctrl+C / close SSH.
#
#   bash docker/cloudflare-tunnel.sh
#
# Persistent (survives SSH disconnect + reboot):
#   bash docker/setup-named-tunnel.sh   # one-time
#   bash docker/install-cloudflare-tunnel.sh

DIR="$(cd "$(dirname "$0")" && pwd)"
BIN="${DIR}/bin/cloudflared"
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

ensure_cloudflared

if [[ -f "${TOKEN_FILE}" ]]; then
  echo "[tunnel] starting named tunnel (token) → ${APP_BASE_URL}"
  echo "[tunnel] upstream configured in Cloudflare Zero Trust dashboard"
  echo
  exec "${BIN}" tunnel --no-autoupdate run --token "$(cat "${TOKEN_FILE}")"
fi

if [[ -f "${CONF_FILE}" ]]; then
  echo "[tunnel] starting named tunnel → ${APP_BASE_URL}"
  echo "[tunnel] config: ${CONF_FILE}"
  echo "[tunnel] press Ctrl+C to stop (use install-cloudflare-tunnel.sh for background)"
  echo
  exec "${BIN}" tunnel --no-autoupdate --config "${CONF_FILE}" run
fi

echo "[tunnel] ERROR: named tunnel not configured."
echo "         Run: bash docker/setup-named-tunnel.sh"
exit 1
