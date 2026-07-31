#!/usr/bin/env bash
# CI/CD deploy for the Raspberry Pi production stack.
#
# Guarantees:
#   1. Syncs ops libs (`uv`) before compose/build. App `npm ci` (inside
#      Dockerfile.prod) retries on registry timeouts so flaky Pi links get
#      more than one chance before the build is declared failed.
#   2. If the image *build* fails, the currently running stack is left alone.
#   3. Runs DB migrations against MySQL with the *new* image before switching
#      the live app. Migration failure leaves the running app untouched and
#      restores the `:previous` image tag.
#   4. If the new container fails its health check, we retag the previous
#      image as :latest and recreate the app.
#   5. Prunes *old app SHA tags* and stopped containers around the build.
#      Keeps :latest / :previous / the new SHA / :builder-cache (layer cache
#      for apk + npm ci). Avoids `system prune` / builder-cache wipe on every
#      deploy — that was forcing cold npm ci (~6 min) on the Pi. Aggressive
#      prune only runs when free disk is critically low. Never touches volumes.
#
# Usage (from repo root, on the Pi):
#   bash docker/ci-deploy.sh
#   GIT_SHA=abc1234 bash docker/ci-deploy.sh
#
# Env knobs: see docker/lib-compose.sh

set -euo pipefail

# CRITICAL when run from a GitHub Actions self-hosted runner: the runner kills
# every process carrying its RUNNER_TRACKING_ID env var when the job ends.
# Podman's per-container helpers (conmon, slirp4netns, rootlessport) inherit it
# and get murdered post-job — containers stay "running" but lose all networking
# (exec fails with "Transport endpoint is not connected", published ports die).
# Blanking the variable opts our children out of that cleanup.
export RUNNER_TRACKING_ID=""

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=docker/lib-compose.sh
source "${ROOT}/docker/lib-compose.sh"

cd "${ROOT}"

LAN_IP="${LAN_IP:-192.168.1.4}"
IMAGE="${MGMT_IMAGE:-localhost/mgmt-app-prod}"
# The app publishes ${LAN_IP}:3000 (not 127.0.0.1), so probe the LAN bind.
HEALTH_URL="${MGMT_HEALTH_URL:-http://${LAN_IP}:3000/api/health}"
HEALTH_RETRIES="${MGMT_HEALTH_RETRIES:-30}"
HEALTH_SLEEP="${MGMT_HEALTH_SLEEP:-2}"
MYSQL_CONTAINER="${MGMT_MYSQL_CONTAINER:-mgmt-mysql-prod}"
MYSQL_WAIT_RETRIES="${MGMT_MYSQL_WAIT_RETRIES:-60}"
REDIS_CONTAINER="${MGMT_REDIS_CONTAINER:-mgmt-redis-prod}"
REDIS_WAIT_RETRIES="${MGMT_REDIS_WAIT_RETRIES:-30}"

for arg in "$@"; do
  case "${arg}" in
    --help|-h)
      sed -n '2,20p' "$0"
      exit 0
      ;;
  esac
done

RUNTIME="$(mgmt_runtime)"
GIT_SHA="${GIT_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo manual)}"
NEW_TAG="${IMAGE}:${GIT_SHA}"
LATEST_TAG="${IMAGE}:latest"
PREV_TAG="${IMAGE}:previous"
# Tagged builder stage so apk + npm ci layers survive post-deploy cleanup.
BUILDER_CACHE_TAG="${IMAGE}:builder-cache"
# Only run aggressive prune (dangling + system) below this free space (GiB).
DISK_FREE_MIN_GIB="${MGMT_DISK_FREE_MIN_GIB:-4}"

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

disk_free_gib() {
  # Free space on / in GiB (integer). Falls back to 999 if df is unreadable.
  local avail
  avail="$(df -BG / 2>/dev/null | awk 'NR==2 { gsub(/G/, "", $4); print $4 }' || true)"
  if [[ "${avail}" =~ ^[0-9]+$ ]]; then
    echo "${avail}"
  else
    echo 999
  fi
}

# Free Podman/Docker storage carefully. Keeps :latest / :previous / in-flight
# SHA / :builder-cache intact. Never uses `image prune -a` (would delete
# :previous). Never touches named volumes (MySQL data).
#
# Extra keep refs can be passed as args (e.g. prune_image_storage "${NEW_TAG}").
# Set aggressive=1 via env MGMT_PRUNE_AGGRESSIVE=1 or when free disk is low.
prune_image_storage() {
  local free_gib aggressive=false
  free_gib="$(disk_free_gib)"
  if [[ "${MGMT_PRUNE_AGGRESSIVE:-0}" == "1" ]] || (( free_gib < DISK_FREE_MIN_GIB )); then
    aggressive=true
  fi

  log "pruning old app tags / stopped containers (free=${free_gib}G; aggressive=${aggressive})"
  df -h / /var/tmp "${TMPDIR:-/tmp}" 2>/dev/null | awk 'NR==1 || /\/$|tmp/' || df -h /

  local keep_ref
  declare -A KEEP=()
  KEEP["${LATEST_TAG}"]=1
  KEEP["${PREV_TAG}"]=1
  KEEP["${NEW_TAG}"]=1
  KEEP["${BUILDER_CACHE_TAG}"]=1
  for keep_ref in "$@"; do
    [[ -n "${keep_ref}" ]] && KEEP["${keep_ref}"]=1
  done

  remove_old_app_tags() {
    local ref repo tag
    while IFS= read -r ref; do
      [[ -z "${ref}" || "${ref}" == *":<none>" ]] && continue
      repo="${ref%:*}"
      tag="${ref##*:}"
      # Only touch tags of our app image repo.
      [[ "${repo}" == "${IMAGE}" || "${repo}" == "${IMAGE##*/}" ]] || continue
      [[ -n "${KEEP[${ref}]+x}" ]] && continue
      # Also match when listing omits the localhost/ prefix.
      [[ -n "${KEEP[${IMAGE}:${tag}]+x}" ]] && continue
      log "removing old image ${ref}"
      "${RUNTIME}" rmi -f "${ref}" >/dev/null 2>&1 || true
    done < <(
      if [[ "${RUNTIME}" == "podman" ]]; then
        podman images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null || true
      else
        docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null || true
      fi
    )
  }

  remove_dangling_images() {
    local id
    if [[ "${RUNTIME}" == "podman" ]]; then
      podman image prune -f >/dev/null 2>&1 || true
    else
      docker image prune -f >/dev/null 2>&1 || true
    fi
    while IFS= read -r id; do
      [[ -z "${id}" ]] && continue
      log "removing dangling image ${id}"
      "${RUNTIME}" rmi -f "${id}" >/dev/null 2>&1 || true
    done < <(
      if [[ "${RUNTIME}" == "podman" ]]; then
        podman images -f dangling=true -q 2>/dev/null || true
      else
        docker images -f dangling=true -q 2>/dev/null || true
      fi
    )
  }

  # Stopped one-shot migrate/build containers.
  if [[ "${RUNTIME}" == "podman" ]]; then
    podman container prune -f >/dev/null 2>&1 || true
  else
    docker container prune -f >/dev/null 2>&1 || true
  fi

  remove_old_app_tags

  # Aggressive mode only: wipe dangling intermediates + unused networks.
  # Skipping this on healthy disks preserves builder layer cache (apk/npm ci).
  if [[ "${aggressive}" == true ]]; then
    log "disk low or MGMT_PRUNE_AGGRESSIVE=1 — pruning dangling images + system leftovers"
    remove_dangling_images
    if [[ "${RUNTIME}" == "podman" ]]; then
      podman system prune -f >/dev/null 2>&1 || true
    else
      docker builder prune -f >/dev/null 2>&1 || true
      docker system prune -f >/dev/null 2>&1 || true
    fi
  fi

  df -h / /var/tmp "${TMPDIR:-/tmp}" 2>/dev/null | awk 'NR==1 || /\/$|tmp/' || df -h /
}

# Refresh the tagged builder stage so the next deploy can reuse apk + npm ci
# layers. Cheap when those steps are already cached; never fails the deploy.
refresh_builder_cache() {
  log "refreshing builder cache tag ${BUILDER_CACHE_TAG}"
  if ! "${RUNTIME}" build -f docker/Dockerfile.prod --target builder \
    -t "${BUILDER_CACHE_TAG}" .; then
    log "WARNING: could not refresh ${BUILDER_CACHE_TAG} — next build may be colder"
  fi
}

health_ok() {
  # Require HTTP 200 from /api/health (DB + migrations current). Other codes
  # (503 degraded, connection refused) keep waiting / trigger rollback.
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 2 --max-time 5 \
    "${HEALTH_URL}" 2>/dev/null || true)"
  [[ "${code}" == "200" ]]
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

mysql_container_running() {
  local status
  status="$("${RUNTIME}" inspect -f '{{.State.Status}}' "${MYSQL_CONTAINER}" 2>/dev/null || true)"
  [[ "${status}" == "running" ]]
}

mysql_port_open() {
  # Rootless Podman can leave a container "running" while the runtime is wedged
  # (exec → "Transport endpoint is not connected", published ports refuse).
  timeout 1 bash -c 'echo > /dev/tcp/127.0.0.1/3306' >/dev/null 2>&1
}

mysql_healthy() {
  # Prefer a real mysqladmin ping; fall back to TCP so we do not depend on
  # Docker-only .State.Health (Podman uses .State.Healthcheck instead).
  mysql_container_running || return 1
  mysql_port_open || return 1

  if "${RUNTIME}" exec -e "MYSQL_PWD=${MYSQL_ROOT_PASSWORD}" "${MYSQL_CONTAINER}" \
    mysqladmin ping -h 127.0.0.1 -uroot --silent >/dev/null 2>&1; then
    return 0
  fi

  if command -v mysqladmin >/dev/null 2>&1; then
    MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" mysqladmin ping -h 127.0.0.1 -P 3306 -uroot --silent \
      >/dev/null 2>&1 && return 0
  fi

  # Port is open — good enough to proceed with LAN-published migrations.
  return 0
}

recreate_mysql() {
  log "recreating MySQL container (data volume preserved)"
  # rm -f first: `compose up` will not heal a wedged-but-still-"running" container.
  "${RUNTIME}" rm -f "${MYSQL_CONTAINER}" >/dev/null 2>&1 || true
  mgmt_compose up -d mysql
}

ensure_mysql() {
  log "starting MySQL (leave current app running)"
  if ! mgmt_compose up -d mysql; then
    return 1
  fi
  # Detect already-wedged instance left by a previous crash/deploy.
  sleep 2
  if mysql_container_running && ! mysql_port_open; then
    log "MySQL looks wedged (running but :3306 closed) — recreating once"
    recreate_mysql || return 1
  fi
  return 0
}

wait_mysql() {
  local i status hc recreated=false
  log "waiting for MySQL (${MYSQL_CONTAINER})"
  for i in $(seq 1 "${MYSQL_WAIT_RETRIES}"); do
    if mysql_healthy; then
      log "MySQL is ready (attempt ${i}/${MYSQL_WAIT_RETRIES})"
      return 0
    fi
    # Mid-wait recovery: Podman sometimes leaves mysqld "running" with dead I/O.
    if [[ "${recreated}" == false ]] && (( i == 15 )); then
      if mysql_container_running && ! mysql_port_open; then
        log "MySQL still not accepting connections — force recreate"
        recreate_mysql || true
        recreated=true
      fi
    fi
    if (( i % 10 == 0 )); then
      status="$("${RUNTIME}" inspect -f '{{.State.Status}}' "${MYSQL_CONTAINER}" 2>/dev/null || echo missing)"
      hc="$("${RUNTIME}" inspect -f '{{if .State.Healthcheck}}{{.State.Healthcheck.Status}}{{else}}n/a{{end}}' \
        "${MYSQL_CONTAINER}" 2>/dev/null || echo n/a)"
      log "MySQL not ready yet (attempt ${i}/${MYSQL_WAIT_RETRIES}; status=${status}; healthcheck=${hc}; port=$(mysql_port_open && echo open || echo closed))"
    fi
    sleep 2
  done
  return 1
}

redis_container_running() {
  local status
  status="$("${RUNTIME}" inspect -f '{{.State.Status}}' "${REDIS_CONTAINER}" 2>/dev/null || true)"
  [[ "${status}" == "running" ]]
}

redis_port_open() {
  timeout 1 bash -c 'echo > /dev/tcp/127.0.0.1/6379' >/dev/null 2>&1
}

redis_healthy() {
  redis_container_running || return 1
  redis_port_open || return 1
  if "${RUNTIME}" exec "${REDIS_CONTAINER}" redis-cli ping 2>/dev/null | grep -qi PONG; then
    return 0
  fi
  # Port open is enough for the app's fail-open connect attempt.
  return 0
}

ensure_redis() {
  log "starting Redis (leave current app running)"
  mgmt_compose up -d redis
}

wait_redis() {
  local i
  log "waiting for Redis (${REDIS_CONTAINER})"
  for i in $(seq 1 "${REDIS_WAIT_RETRIES}"); do
    if redis_healthy; then
      log "Redis is ready (attempt ${i}/${REDIS_WAIT_RETRIES})"
      return 0
    fi
    sleep 1
  done
  return 1
}

read_mysql_root_password() {
  # Secret lives only in the gitignored docker/.env.prod: prefer an explicit
  # MYSQL_ROOT_PASSWORD, otherwise reuse DB_PASS (the app connects as root).
  MYSQL_ROOT_PASSWORD=""
  if [[ -f docker/.env.prod ]]; then
    MYSQL_ROOT_PASSWORD="$(grep -E '^MYSQL_ROOT_PASSWORD=' docker/.env.prod | head -n1 | cut -d= -f2- || true)"
    if [[ -z "${MYSQL_ROOT_PASSWORD}" ]]; then
      MYSQL_ROOT_PASSWORD="$(grep -E '^DB_PASS=' docker/.env.prod | head -n1 | cut -d= -f2- || true)"
    fi
  fi
  [[ -n "${MYSQL_ROOT_PASSWORD}" ]] \
    || die "MYSQL_ROOT_PASSWORD/DB_PASS not found in docker/.env.prod"
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
  # One-shot container: args replace the image CMD so we only migrate (the app
  # entrypoint also migrates on boot — this fails CI before switching traffic).
  #
  # Do NOT force DB_HOST=mysql. On this Pi, podman-compose puts services on the
  # default `podman` network (no service-name DNS), while .env.prod points at the
  # published LAN bind (${LAN_IP}:3306). Overriding to `mysql` caused
  # getaddrinfo ENOTFOUND. Only rewrite loopback hosts that cannot work in-container.
  local db_host
  db_host="$(grep -E '^DB_HOST=' docker/.env.prod 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '[:space:]' || true)"
  case "${db_host}" in
    ""|127.0.0.1|localhost|mysql) db_host="${LAN_IP}" ;;
  esac
  log "migrate DB_HOST=${db_host}"

  # -T: no pseudo-TTY (GitHub Actions has no TTY; avoids podman-compose warning).
  if ! mgmt_compose run --rm --no-deps -T \
    -e "DB_HOST=${db_host}" \
    app \
    node --import tsx scripts/migrate.ts up; then
    return 1
  fi
  log "migrations applied"
}

recreate_app() {
  # Recreate *only* the app. Force-recreating nginx (or the whole stack) drops
  # :8080 briefly; cloudflared then cannot reach origin and public users see
  # Cloudflare/gateway errors during every GitHub-triggered deploy.
  log "recreating app container (leave nginx/mysql running)"
  mgmt_compose up -d --no-deps --force-recreate app
  # Ensure reverse proxy is up without bouncing it; reload so the rendered
  # nginx.prod.rendered.conf (from the template + LAN_IP) takes effect.
  mgmt_compose up -d nginx
  "${RUNTIME}" exec mgmt-nginx-prod nginx -s reload >/dev/null 2>&1 || true
}

rollback() {
  log "rolling back to ${PREV_TAG}"
  if ! image_exists "${PREV_TAG}"; then
    die "no previous image (${PREV_TAG}) available to roll back to"
  fi
  tag_image "${PREV_TAG}" "${LATEST_TAG}"
  if ! recreate_app; then
    die "rollback recreate failed"
  fi
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

# ── Side jobs (best-effort; never abort a deploy for IP/SSL sync) ────────
log "syncing public IP (best effort)"
if bash docker/sync-public-ip.sh; then
  PUBLIC_IP="$(tr -d '[:space:]' < docker/.public-ip)"
else
  PUBLIC_IP="${PUBLIC_IP:-$(tr -d '[:space:]' < docker/.public-ip 2>/dev/null || echo 27.79.44.74)}"
  log "WARNING: could not detect public IP — using ${PUBLIC_IP}"
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

# Free old SHA tags *after* snapshotting :previous so rollback stays available.
# Does not wipe builder layer cache unless disk is critically low.
prune_image_storage

# ── Build (failure here leaves the running stack untouched) ──────────────
log "building ${NEW_TAG} (npm ci cached when lockfile + builder-cache unchanged)"
if ! "${RUNTIME}" build -f docker/Dockerfile.prod -t "${NEW_TAG}" .; then
  # Aggressive prune on failure — reclaim partial layers for the next attempt.
  MGMT_PRUNE_AGGRESSIVE=1 prune_image_storage
  die "image build failed — running stack was not restarted"
fi
tag_image "${NEW_TAG}" "${LATEST_TAG}"
log "build ok; tagged ${LATEST_TAG}"

# ── Ensure MySQL is up, then migrate BEFORE switching the live app ───────
if ! ensure_mysql; then
  restore_previous_tag
  die "could not start MySQL — running app not restarted"
fi
if ! wait_mysql; then
  restore_previous_tag
  die "MySQL not ready — running app not restarted"
fi

if ! ensure_redis; then
  restore_previous_tag
  die "could not start Redis — running app not restarted"
fi
if ! wait_redis; then
  restore_previous_tag
  die "Redis not ready — running app not restarted"
fi

if ! run_migrations; then
  restore_previous_tag
  die "database migration failed — running app not restarted"
fi

# ── Recreate app + health check ──────────────────────────────────────────
log "switching live app to ${GIT_SHA}"
if ! recreate_app; then
  log "app recreate failed"
  if [[ "${HAD_PREVIOUS}" == true ]]; then
    rollback
  fi
  die "app recreate failed and rollback could not recover"
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

# Tag builder layers for the next deploy's apk/npm ci cache, then drop old SHAs.
refresh_builder_cache
log "pruning old app tags after successful deploy"
prune_image_storage "${NEW_TAG}"

PUBLIC_URL="https://dntechx.com"
if [[ -f docker/cloudflared.env ]]; then
  PUBLIC_URL="$(grep '^APP_BASE_URL=' docker/cloudflared.env | cut -d= -f2- || true)"
fi
echo
echo "Production stack is healthy."
echo "  Public: ${PUBLIC_URL:-https://dntechx.com}"
echo "  LAN:    http://${LAN_IP}:8080"
echo "  Image:  ${NEW_TAG}"
echo "  Cache:  ${BUILDER_CACHE_TAG}"
echo "  Libs:   uv sync + image npm ci (layer-cached)"
echo "  DB:     migrations applied before app switch"
echo "  Redis:  ${LAN_IP}:6379 (app cache; fail-open to memory)"
