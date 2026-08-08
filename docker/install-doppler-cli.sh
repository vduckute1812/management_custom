#!/usr/bin/env bash
# Install the Doppler CLI on the current machine (idempotent).
#
#   bash docker/install-doppler-cli.sh
#
# Prefer the official install script. Falls back to a pinned static binary
# for aarch64/x86_64 Linux when curl to the installer is blocked.

set -euo pipefail

log() { echo "[doppler-cli] $*"; }
die() { echo "[doppler-cli] ERROR: $*" >&2; exit 1; }

if command -v doppler >/dev/null 2>&1; then
  log "already installed: $(doppler --version 2>/dev/null | head -n1)"
  exit 0
fi

if [[ "$(uname -s)" != "Linux" ]]; then
  die "unsupported OS $(uname -s) — install from https://docs.doppler.com/docs/install-cli"
fi

# Official installer into user-local bin (no root).
mkdir -p "${HOME}/.local/bin"
export PATH="${HOME}/.local/bin:${PATH}"
if curl -Ls --proto '=https' --tlsv1.2 https://cli.doppler.com/install.sh \
  | sh -s -- --no-package-manager --install-path "${HOME}/.local/bin" 2>/dev/null; then
  if command -v doppler >/dev/null 2>&1; then
    log "installed: $(doppler --version 2>/dev/null | head -n1)"
    exit 0
  fi
fi

# Fallback: user-local bin from GitHub releases.
arch="$(uname -m)"
case "${arch}" in
  aarch64 | arm64) asset_arch="linux_arm64" ;;
  x86_64 | amd64) asset_arch="linux_amd64" ;;
  *) die "no fallback binary for arch ${arch}" ;;
esac

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT
# Resolve latest tag without jq.
tag="$(curl -fsSL https://api.github.com/repos/DopplerHQ/cli/releases/latest \
  | grep -oE '"tag_name":\s*"[^"]+"' | head -n1 | cut -d'"' -f4)"
[[ -n "${tag}" ]] || die "could not resolve Doppler CLI latest release"
url="https://github.com/DopplerHQ/cli/releases/download/${tag}/doppler_${tag#v}_${asset_arch}.tar.gz"
log "downloading ${url}"
curl -fsSL "${url}" -o "${tmpdir}/doppler.tgz"
tar -xzf "${tmpdir}/doppler.tgz" -C "${tmpdir}"
mkdir -p "${HOME}/.local/bin"
install -m 0755 "${tmpdir}/doppler" "${HOME}/.local/bin/doppler"
export PATH="${HOME}/.local/bin:${PATH}"
command -v doppler >/dev/null 2>&1 || die "doppler still missing after install"
log "installed to ${HOME}/.local/bin: $(doppler --version 2>/dev/null | head -n1)"
