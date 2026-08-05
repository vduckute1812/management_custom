#!/usr/bin/env bash
set -euo pipefail

# Install a user systemd timer that watches GitHub Deploy (Raspberry Pi)
# runs and re-runs failures after healing ~/actions-runner (outside the repo).
#
#   bash docker/install-deploy-watch.sh
#
# Prerequisites on the Pi:
#   - gh CLI installed and authenticated, OR
#     ~/.config/management/github.token (PAT with Actions: read + write)
#   - actions-runner already installed (docker/install-github-runner.sh)
#   - passwordless sudo for the runner systemd unit (installed below)
#
# Commands:
#   systemctl --user status mgmt-deploy-watch.timer
#   journalctl --user -u mgmt-deploy-watch -f
#   bash docker/watch-deploy-actions.sh   # manual once

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${DIR}/.." && pwd)"
SERVICE_NAME="mgmt-deploy-watch.service"
TIMER_NAME="mgmt-deploy-watch.timer"
INSTALL_DIR="${HOME}/.config/management/bin"
SERVICE_DST="${HOME}/.config/systemd/user/${SERVICE_NAME}"
TIMER_DST="${HOME}/.config/systemd/user/${TIMER_NAME}"
RUNNER_DIR="${MGMT_ACTIONS_RUNNER_DIR:-${HOME}/actions-runner}"
SECRETS_DIR="${MGMT_SECRETS_DIR:-${HOME}/.config/management}"

mkdir -p "${HOME}/.config/systemd/user"
mkdir -p "${SECRETS_DIR}"
mkdir -p "${INSTALL_DIR}"

if [[ ! -f "${DIR}/watch-deploy-actions.sh" ]]; then
  echo "[deploy-watch] ERROR: missing ${DIR}/watch-deploy-actions.sh" >&2
  exit 1
fi

# Copy into a stable path outside the Actions worktree / stale clones.
install -m 0755 "${DIR}/watch-deploy-actions.sh" "${INSTALL_DIR}/watch-deploy-actions.sh"
WATCH_BIN="${INSTALL_DIR}/watch-deploy-actions.sh"

if [[ ! -d "${RUNNER_DIR}" ]]; then
  echo "[deploy-watch] WARNING: runner dir not found: ${RUNNER_DIR}"
  echo "               Expected sibling of management_custom (../actions-runner)."
fi

# Passwordless sudo for controlling only the Actions runner unit.
RUNNER_UNIT="$(basename /etc/systemd/system/actions.runner.*.service 2>/dev/null | head -n1 || true)"
MARKER="${SECRETS_DIR}/.deploy-watch-sudoers-ok"
if [[ -n "${RUNNER_UNIT}" && "${RUNNER_UNIT}" != "actions.runner.*.service" ]]; then
  SUDOERS_FILE="/etc/sudoers.d/mgmt-actions-runner"
  SUDOERS_LINE="${USER} ALL=(root) NOPASSWD: /bin/systemctl start ${RUNNER_UNIT}, /bin/systemctl stop ${RUNNER_UNIT}, /bin/systemctl restart ${RUNNER_UNIT}, /bin/systemctl is-active ${RUNNER_UNIT}"
  if [[ -f "${MARKER}" ]] && sudo -n systemctl is-active "${RUNNER_UNIT}" >/dev/null 2>&1; then
    echo "==> sudoers already allows controlling ${RUNNER_UNIT}"
  else
    echo "==> Installing passwordless sudo for ${RUNNER_UNIT}"
    if command -v sudo >/dev/null 2>&1; then
      printf '%s\n' "${SUDOERS_LINE}" | sudo tee "${SUDOERS_FILE}" >/dev/null
      sudo chmod 440 "${SUDOERS_FILE}"
      sudo visudo -cf "${SUDOERS_FILE}" >/dev/null
      touch "${MARKER}"
      echo "    wrote ${SUDOERS_FILE}"
    else
      echo "[deploy-watch] WARNING: sudo missing — cannot write ${SUDOERS_FILE}"
    fi
  fi
else
  echo "[deploy-watch] WARNING: no actions.runner.*.service under /etc/systemd/system"
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "[deploy-watch] WARNING: gh not on PATH — install before the timer can re-run workflows."
fi

if [[ ! -f "${SECRETS_DIR}/github.token" ]] && ! gh auth status -h github.com >/dev/null 2>&1; then
  echo "[deploy-watch] WARNING: no gh auth and no ${SECRETS_DIR}/github.token"
  echo "               Create a fine-grained PAT (Actions: Read and write) and:"
  echo "                 umask 077"
  echo "                 printf '%s' 'ghp_…' > ${SECRETS_DIR}/github.token"
fi

cat > "${SERVICE_DST}" <<EOF
[Unit]
Description=Watch GitHub Deploy workflow; heal actions-runner; re-run failures
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${HOME}
Environment=MGMT_ACTIONS_RUNNER_DIR=${RUNNER_DIR}
Environment=MGMT_SECRETS_DIR=${SECRETS_DIR}
Environment=HOME=${HOME}
Environment=PATH=${HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=${WATCH_BIN}
EOF

cat > "${TIMER_DST}" <<EOF
[Unit]
Description=Check Deploy (Raspberry Pi) Actions status every 10 minutes

[Timer]
OnBootSec=3min
OnUnitActiveSec=10min
Persistent=true

[Install]
WantedBy=timers.target
EOF

echo "==> Enabling user lingering (timer runs after logout/reboot)"
if loginctl show-user "$(whoami)" 2>/dev/null | grep -q "Linger=no"; then
  if ! sudo loginctl enable-linger "$(whoami)"; then
    echo "[deploy-watch] WARNING: could not enable linger (needs sudo password)."
    echo "               Run once: sudo loginctl enable-linger $(whoami)"
  fi
fi

echo "==> Enabling and starting ${TIMER_NAME}"
systemctl --user daemon-reload
systemctl --user enable --now "${TIMER_NAME}"
systemctl --user start "${SERVICE_NAME}" || true

echo
echo "Deploy watch timer started."
echo "  Runner:  ${RUNNER_DIR}  (outside git checkout)"
echo "  Script:  ${WATCH_BIN}"
echo "  Status:  systemctl --user status ${TIMER_NAME}"
echo "  Logs:    journalctl --user -u ${SERVICE_NAME} -f"
echo "  Manual:  ${WATCH_BIN}"
