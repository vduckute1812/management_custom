#!/usr/bin/env bash
# CI/CD deploy for the Raspberry Pi production stack.
#
# Guarantees:
#   1. Syncs ops libs (`uv`) before compose/build.
#   2. If the image *build* fails, the currently running stack is left alone.
#   3. Runs DB migrations against MySQL with the *new* image before switching
#      the live app. Migration failure leaves the running app untouched and
#      restores the `:previous` image tag.
#   4. If the new container fails its health check, we retag the previous
#      image as :latest and recreate the app.
#
# Usage (from repo root, on the Pi):
#   bash docker/ci-deploy.sh
#   bash docker/ci-deploy.sh --skip-tunnel-url
#   GIT_SHA=abc1234 bash docker/ci-deploy.sh
#
# Env knobs: see docker/lib-compose.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=docker/lib-compose.sh
source "${ROOT}/docker/lib-compose.sh"

cd "${ROOT}"

LAN_IP="${LAN_IP:-192.168.1.4}"
IMAGE="${MGMT_IMAGE:-localhost/mgmt-app-prod}"
SKIP_TUNNEL_URL=false
HEALTH_URL="${MGMT_HEALTH_URL:-http://127.0.0.1:3000/}"
HEALTH_RETRIES="${MGMT_HEALTH_RETRIES:-30}"
HEALTH_SLEEP="${MGMT_HEALTH_SLEEP:-2}"
MYSQL_CONTAINER="${MGMT_MYSQL_CONTAINER:-mgmt-mysql-prod}"
MYSQL_WAIT_RETRIES="${MGMT_MYSQL_WAIT_RETRIES:-60}"

for arg in "$@"; do
  case "${arg}" in
    --skip-tunnel-url|--no-sync-tunnel) SKIP_TUNNEL_URL=true ;;
    --help|-h)
      sed -n '2,22p' "$0"
      exit 0
      ;;
  esac
done

RUNTIME="$(mgmt_runtime)"
GIT_SHA="${GIT_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo manual)}"
NEW_TAG="${IMAGE}:${GIT_SHA}"
LATEST_TAG="${IMAGE}:latest"
PREV_TAG="${IMAGE}:previous"

log() { echo "[ci-deploy] $*"; }
die() { echo "[ci-deploy] ERROR: $*" >&2; exit 1; }

image_exists() {
  if [[ "${RUNTIME}" == "podman" ]]; then
    podman image exists "$1" 2>/dev/null
  else
    docker image inspect "$1" >/dev/null 2>&1
  fi
}

tag_image() {
  local src="$1" dst="$2"
  "${RUNTIME}" tag "${src}" "${dst}"
}

restore_previous_tag() {
  if [[ "${HAD_PREVIOUS}" == true ]]; then
    log "restoring image tag ${PREV_TAG} → ${LATEST_TAG}"
    tag_image "${PREV_TAG}" "${LATEST_TAG}"
  fi
}

health_ok() {
  # Any HTTP response from the app means Nitro is up. 401/302/200 all count —
  # we only care that the new process is answering, not that auth succeeds.
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 2 --max-time 5 \
    "${HEALTH_URL}" 2>/dev/null || true)"
  [[ -n "${code}" && "${code}" != "000" ]]
}

wait_healthy() {
  local i
  for i in $(seq 1 "${HEALTH_RETRIES}"); do
    if health_ok; then
      log "health check passed (attempt ${i}/${HEALTH_RETRIES})"
      return 0
    fi
    sleep "${HEALTH_SLEEP}"
  done
  return 1
}

mysql_healthy() {
  local status
  status="$("${RUNTIME}" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "${MYSQL_CONTAINER}" 2>/dev/null || true)"
  [[ "${status}" == "healthy" || "${status}" == "running" ]] || return 1
  # Prefer the real ping when the container is up.
  "${RUNTIME}" exec "${MYSQL_CONTAINER}" \
    mysqladmin ping -h 127.0.0.1 -uroot -p"${MYSQL_ROOT_PASSWORD}" --silent \
    >/dev/null 2>&1
}

wait_mysql() {
  local i
  log "waiting for MySQL (${MYSQL_CONTAINER})"
  for i in $(seq 1 "${MYSQL_WAIT_RETRIES}"); do
    if mysql_healthy; then
      log "MySQL is ready (attempt ${i}/${MYSQL_WAIT_RETRIES})"
      return 0
    fi
    sleep 2
  done
  return 1
}

read_mysql_root_password() {
  # Prefer compose service env; fall back to docker/.env.prod DB_PASS.
  MYSQL_ROOT_PASSWORD="root@1345"
  if grep -q '^MYSQL_ROOT_PASSWORD=' docker/docker-compose.prod.yml 2>/dev/null; then
    MYSQL_ROOT_PASSWORD="$(
      sed -n 's/.*MYSQL_ROOT_PASSWORD: *"\([^"]*\)".*/\1/p' docker/docker-compose.prod.yml | head -n1
    )"
  fi
  if [[ -z "${MYSQL_ROOT_PASSWORD}" && -f docker/.env.prod ]]; then
    MYSQL_ROOT_PASSWORD="$(grep -E '^DB_PASS=' docker/.env.prod | head -n1 | cut -d= -f2- || true)"
  fi
  export MYSQL_ROOT_PASSWORD
}

sync_libs() {
  log "syncing ops libraries (uv)"
  command -v uv >/dev/null 2>&1 || die "uv is required — install from https://docs.astral.sh/uv/"
  if [[ -f uv.lock ]]; then
    uv sync --frozen
  else
    uv sync
  fi

  # Node app libs are installed inside the image build (`npm ci` in Dockerfile.prod).
  # Surface lockfile presence here so a missing package-lock fails early.
  [[ -f package-lock.json ]] || die "package-lock.json missing — cannot sync npm libs in the image build"
  log "npm libs will sync via Dockerfile \`npm ci\` during image build"
}

run_migrations() {
  log "running DB migrations with ${LATEST_TAG}"
  # One-shot container on the compose network. Args replace the image CMD so
  # we only migrate (the app entrypoint also migrates on boot — this makes CI
  # fail before switching traffic if schema apply fails).
  # Force DB_HOST=mysql: docker/.env.prod may point at 127.0.0.1 for host tools.
  if ! mgmt_compose run --rm --no-deps \
    -e DB_HOST=mysql \
    app \
    node --import tsx scripts/migrate.ts up; then
    return 1
  fi
  log "migrations applied"
}

rollback() {
  log "rolling back to ${PREV_TAG}"
  if ! image_exists "${PREV_TAG}"; then
    die "no previous image (${PREV_TAG}) available to roll back to"
  fi
  tag_image "${PREV_TAG}" "${LATEST_TAG}"
  mgmt_compose up -d --force-recreate app
  if wait_healthy; then
    log "rollback succeeded — previous release is serving again"
  else
    die "rollback recreate finished but health check still failing"
  fi
}

# ── Preflight ────────────────────────────────────────────────────────────
[[ -f docker/Dockerfile.prod ]] || die "docker/Dockerfile.prod missing"

log "linking Pi-local secrets into docker/"
bash docker/link-secrets.sh
[[ -f docker/.env.prod ]] || die "docker/.env.prod still missing after link-secrets"

log "runtime=${RUNTIME} sha=${GIT_SHA} image=${IMAGE}"
read_mysql_root_password

# ── Sync libraries (uv ops + npm via upcoming image build) ───────────────
sync_libs

# ── Side jobs (best-effort; never abort a deploy for tunnel/IP sync) ─────
log "syncing public IP (best effort)"
if bash docker/sync-public-ip.sh; then
  PUBLIC_IP="$(tr -d '[:space:]' < docker/.public-ip)"
else
  PUBLIC_IP="${PUBLIC_IP:-$(tr -d '[:space:]' < docker/.public-ip 2>/dev/null || echo 27.79.44.74)}"
  log "WARNING: could not detect public IP — using ${PUBLIC_IP}"
fi

if [[ "${SKIP_TUNNEL_URL}" == true ]]; then
  log "skipping Cloudflare tunnel URL sync"
else
  log "syncing Cloudflare tunnel URL (best effort)"
  bash docker/sync-tunnel-url.sh || log "WARNING: tunnel URL sync failed"
fi

log "ensuring TLS certificates"
PUBLIC_IP="${PUBLIC_IP}" LAN_IP="${LAN_IP}" bash docker/init-ssl.sh

log "ensuring MySQL volume exists"
if [[ "${RUNTIME}" == "podman" ]]; then
  podman volume exists management_mgmt-mysql-data 2>/dev/null \
    || podman volume create management_mgmt-mysql-data
else
  docker volume inspect management_mgmt-mysql-data >/dev/null 2>&1 \
    || docker volume create management_mgmt-mysql-data
fi

# ── Snapshot current latest → previous (so we can roll back) ─────────────
HAD_PREVIOUS=false
if image_exists "${LATEST_TAG}"; then
  log "snapshotting ${LATEST_TAG} → ${PREV_TAG}"
  tag_image "${LATEST_TAG}" "${PREV_TAG}"
  HAD_PREVIOUS=true
else
  log "no existing ${LATEST_TAG} — first deploy, rollback target unavailable"
fi

# ── Build (failure here leaves the running stack untouched) ──────────────
log "building ${NEW_TAG} (includes npm ci for app libs)"
if ! "${RUNTIME}" build -f docker/Dockerfile.prod -t "${NEW_TAG}" .; then
  die "image build failed — running stack was not restarted"
fi
tag_image "${NEW_TAG}" "${LATEST_TAG}"
log "build ok; tagged ${LATEST_TAG}"

# ── Ensure MySQL is up, then migrate BEFORE switching the live app ───────
log "starting MySQL (leave current app running)"
if ! mgmt_compose up -d mysql; then
  restore_previous_tag
  die "could not start MySQL — running app not restarted"
fi
if ! wait_mysql; then
  restore_previous_tag
  die "MySQL not ready — running app not restarted"
fi

if ! run_migrations; then
  restore_previous_tag
  die "database migration failed — running app not restarted"
fi

# ── Recreate app + health check ──────────────────────────────────────────
log "recreating production stack"
if ! mgmt_compose up -d --force-recreate; then
  log "compose up failed"
  if [[ "${HAD_PREVIOUS}" == true ]]; then
    rollback
  fi
  die "compose up failed and rollback could not recover"
fi

log "waiting for app health at ${HEALTH_URL}"
if ! wait_healthy; then
  log "new release failed health check"
  if [[ "${HAD_PREVIOUS}" == true ]]; then
    rollback
    die "new release unhealthy — rolled back to previous image"
  fi
  die "new release unhealthy and no previous image to roll back to"
fi

log "deploy succeeded (${GIT_SHA})"
PUBLIC_URL="https://dntechx.com"
if [[ -f docker/cloudflared.env ]]; then
  PUBLIC_URL="$(grep '^APP_BASE_URL=' docker/cloudflared.env | cut -d= -f2- || true)"
fi
echo
echo "Production stack is healthy."
echo "  Public: ${PUBLIC_URL:-https://dntechx.com}"
echo "  LAN:    http://${LAN_IP}:8080"
echo "  Image:  ${NEW_TAG}"
echo "  Libs:   uv sync + image npm ci"
echo "  DB:     migrations applied before app switch"
