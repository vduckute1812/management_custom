#!/usr/bin/env bash
set -euo pipefail

# Install a user systemd timer that checks for public IP changes every 15 minutes.
# When Viettel assigns a new IP, config and TLS certs are updated automatically.
#
#   bash docker/install-public-ip-watch.sh
#
# Commands:
#   systemctl --user status mgmt-public-ip-watch.timer
#   journalctl --user -u mgmt-public-ip-watch -f

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${DIR}/.." && pwd)"
SERVICE_NAME="mgmt-public-ip-watch.service"
TIMER_NAME="mgmt-public-ip-watch.timer"
SERVICE_DST="${HOME}/.config/systemd/user/${SERVICE_NAME}"
TIMER_DST="${HOME}/.config/systemd/user/${TIMER_NAME}"

mkdir -p "${HOME}/.config/systemd/user"

cat > "${SERVICE_DST}" <<EOF
[Unit]
Description=Sync Viettel public IP into management app config
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${ROOT}
ExecStart=/usr/bin/env bash ${DIR}/sync-public-ip.sh
EOF

cat > "${TIMER_DST}" <<EOF
[Unit]
Description=Check for Viettel public IP changes every 15 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=15min
Persistent=true

[Install]
WantedBy=timers.target
EOF

echo "==> Enabling user lingering (timer runs after logout/reboot)"
if loginctl show-user "$(whoami)" 2>/dev/null | grep -q "Linger=no"; then
  if ! sudo loginctl enable-linger "$(whoami)"; then
    echo "[ip-watch] WARNING: could not enable linger (needs sudo password)."
    echo "           Run once: sudo loginctl enable-linger $(whoami)"
  fi
fi

echo "==> Enabling and starting ${TIMER_NAME}"
systemctl --user daemon-reload
systemctl --user enable --now "${TIMER_NAME}"

echo
echo "Public IP watch timer started."
echo "  Status:  systemctl --user status ${TIMER_NAME}"
echo "  Logs:    journalctl --user -u ${SERVICE_NAME} -f"
echo "  Manual:  bash docker/sync-public-ip.sh"
