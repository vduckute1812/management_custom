#!/usr/bin/env bash
# Manual production deploy entrypoint.
#
# Prefer `docker/ci-deploy.sh` (used by GitHub Actions) — it tags images and
# rolls back automatically if the new build fails health checks.
# This wrapper keeps the historical `bash docker/deploy.sh` command working.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "${ROOT}/docker/ci-deploy.sh" "$@"
