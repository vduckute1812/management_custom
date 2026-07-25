#!/usr/bin/env bash
# Install a GitHub Actions self-hosted runner on this Raspberry Pi.
#
# Prerequisites:
#   - This machine is the Pi that already runs the management stack
#   - You have a repo (or org) registration token from:
#       GitHub → Settings → Actions → Runners → New self-hosted runner
#
# Usage:
#   bash docker/install-github-runner.sh \
#     --url https://github.com/vduckute1812/management_custom \
#     --token AAAAAAAAAAAAAAAA
#
# Optional:
#   --user duc13t3          Linux user that owns the runner (default: $USER)
#   --dir  ~/actions-runner  Install directory (default: ~/actions-runner)
#   --name mgmt-pi          Runner name (default: hostname)
#
# After install the runner is registered with the custom label `management`
# (plus GitHub's automatic self-hosted / OS / arch labels). The workflow
# matches on: runs-on: [self-hosted, management]

set -euo pipefail

REPO_URL=""
TOKEN=""
RUNNER_USER="${USER}"
RUNNER_DIR="${HOME}/actions-runner"
RUNNER_NAME="$(hostname -s 2>/dev/null || hostname)"
# Only the custom label — GitHub adds self-hosted / linux|Windows / ARM64|ARM|X64.
LABELS="management"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) REPO_URL="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --user) RUNNER_USER="$2"; shift 2 ;;
    --dir) RUNNER_DIR="$2"; shift 2 ;;
    --name) RUNNER_NAME="$2"; shift 2 ;;
    --labels) LABELS="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${REPO_URL}" || -z "${TOKEN}" ]]; then
  echo "Usage: $0 --url <github-repo-url> --token <registration-token>" >&2
  exit 1
fi

ARCH="$(uname -m)"
case "${ARCH}" in
  aarch64|arm64) RUNNER_ARCH="arm64" ;;
  armv7l|armhf)  RUNNER_ARCH="arm" ;;
  x86_64)        RUNNER_ARCH="x64" ;;
  *)
    echo "Unsupported architecture: ${ARCH}" >&2
    exit 1
    ;;
esac

# Resolve the latest runner release tag + asset for this arch.
echo "==> Resolving latest actions/runner release for linux-${RUNNER_ARCH}"
API="https://api.github.com/repos/actions/runner/releases/latest"
ASSET_URL="$(curl -fsSL "${API}" \
  | grep -oE "https://github.com/actions/runner/releases/download/[^\"]+/actions-runner-linux-${RUNNER_ARCH}-[0-9.]+\\.tar\\.gz" \
  | head -n1)"
if [[ -z "${ASSET_URL}" ]]; then
  echo "Could not find a linux-${RUNNER_ARCH} runner asset in the latest release." >&2
  exit 1
fi
echo "    ${ASSET_URL}"

mkdir -p "${RUNNER_DIR}"
cd "${RUNNER_DIR}"

if [[ ! -f ./config.sh ]]; then
  echo "==> Downloading runner"
  curl -fsSL -o actions-runner.tar.gz "${ASSET_URL}"
  tar xzf actions-runner.tar.gz
  rm -f actions-runner.tar.gz
else
  echo "==> Runner already unpacked in ${RUNNER_DIR}"
fi

if [[ ! -f .runner ]]; then
  echo "==> Configuring runner (${RUNNER_NAME})"
  ./config.sh --unattended \
    --url "${REPO_URL}" \
    --token "${TOKEN}" \
    --name "${RUNNER_NAME}" \
    --labels "${LABELS}" \
    --work "_work" \
    --replace
else
  echo "==> Runner already configured (.runner present) — skipping config"
fi

echo "==> Installing systemd user service"
# svc.sh installs a system service when run as root, otherwise a user service.
./svc.sh install "${RUNNER_USER}"
./svc.sh start

echo
echo "Runner installed and started."
echo "  Dir:    ${RUNNER_DIR}"
echo "  Name:   ${RUNNER_NAME}"
echo "  Labels: ${LABELS}"
echo
echo "Verify in GitHub → Settings → Actions → Runners:"
echo "  Status must be Idle (green). If Offline, start the service:"
echo "    cd ${RUNNER_DIR} && ./svc.sh start"
echo "  Labels must include: management"
echo
echo "If a workflow is stuck Queued, cancel it in the Actions UI, fix the"
echo "runner, then re-run the workflow (or push to master)."
echo
echo "Also ensure uv is installed on this Pi:"
echo "  curl -LsSf https://astral.sh/uv/install.sh | sh"
echo
echo "After the first checkout on the runner, place local secrets in the"
echo "workspace (relative paths — not committed):"
echo "  docker/.env.prod"
echo "  docker/ssl/…"
echo "  docker/cloudflared/…"
