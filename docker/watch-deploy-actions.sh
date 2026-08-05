#!/usr/bin/env bash
# Keep the self-hosted GitHub Actions runner healthy and re-run failed
# "Deploy (Raspberry Pi)" workflows once the runner is back online.
#
# Designed to run ON the Pi via a user systemd timer (see
# docker/install-deploy-watch.sh). The Actions runner lives OUTSIDE the
# git checkout (default ~/actions-runner — sibling of management_custom).
#
# Auth for `gh`:
#   - Prefer GH_TOKEN / GITHUB_TOKEN in the environment, or
#   - ${MGMT_SECRETS_DIR}/github.token (fine-grained PAT: Actions read/write),
#   - else an existing `gh auth login` session for the Pi user.
#
# Env knobs:
#   MGMT_ACTIONS_RUNNER_DIR  default: $HOME/actions-runner
#   MGMT_SECRETS_DIR         default: $HOME/.config/management
#   MGMT_GITHUB_REPO         default: vduckute1812/management_custom
#   MGMT_DEPLOY_WORKFLOW     default: "Deploy (Raspberry Pi)"
#   MGMT_DEPLOY_MAX_RERUNS   default: 2  (per failed run id)
#   MGMT_DEPLOY_QUEUED_MIN   default: 20 (minutes stuck Queued → restart runner)

set -euo pipefail

REPO="${MGMT_GITHUB_REPO:-vduckute1812/management_custom}"
WORKFLOW="${MGMT_DEPLOY_WORKFLOW:-Deploy (Raspberry Pi)}"
RUNNER_DIR="${MGMT_ACTIONS_RUNNER_DIR:-${HOME}/actions-runner}"
SECRETS_DIR="${MGMT_SECRETS_DIR:-${HOME}/.config/management}"
STATE_DIR="${SECRETS_DIR}"
STATE_FILE="${STATE_DIR}/deploy-watch.state"
MAX_RERUNS="${MGMT_DEPLOY_MAX_RERUNS:-2}"
QUEUED_MIN="${MGMT_DEPLOY_QUEUED_MIN:-20}"

log() { echo "[deploy-watch] $*"; }
warn() { echo "[deploy-watch] WARN: $*" >&2; }

mkdir -p "${STATE_DIR}"
touch "${STATE_FILE}"

# --- auth ------------------------------------------------------------------
if [[ -z "${GH_TOKEN:-${GITHUB_TOKEN:-}}" && -f "${SECRETS_DIR}/github.token" ]]; then
  export GH_TOKEN
  GH_TOKEN="$(tr -d '[:space:]' <"${SECRETS_DIR}/github.token")"
fi

have_gh_auth=0
if command -v gh >/dev/null 2>&1; then
  if gh auth status -h github.com >/dev/null 2>&1 || [[ -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]]; then
    have_gh_auth=1
  fi
fi

# --- runner health ---------------------------------------------------------
# Prefer the systemd unit installed by svc.sh (system service on this Pi).
find_runner_unit() {
  local unit
  unit="$(basename /etc/systemd/system/actions.runner.*.service 2>/dev/null | head -n1 || true)"
  if [[ -n "${unit}" && "${unit}" != "actions.runner.*.service" ]]; then
    echo "${unit}"
    return 0
  fi
  return 1
}

ensure_runner() {
  local unit=""
  if unit="$(find_runner_unit)"; then
    if systemctl is-active --quiet "${unit}"; then
      log "runner service OK (${unit})"
      return 0
    fi
    log "runner service inactive — starting ${unit}"
    if sudo -n systemctl start "${unit}" 2>/dev/null; then
      sleep 2
      if systemctl is-active --quiet "${unit}"; then
        log "runner service started"
        return 0
      fi
    fi
    warn "could not start ${unit} (need passwordless sudo — see install-deploy-watch.sh)"
  fi

  if [[ ! -d "${RUNNER_DIR}" ]]; then
    warn "runner dir missing: ${RUNNER_DIR} (outside the git checkout)"
    return 1
  fi
  if [[ -x "${RUNNER_DIR}/svc.sh" ]]; then
    log "falling back to ${RUNNER_DIR}/svc.sh start"
    if sudo -n bash -c "cd '${RUNNER_DIR}' && ./svc.sh start" 2>/dev/null; then
      sleep 2
      log "svc.sh start requested"
      return 0
    fi
    warn "svc.sh start needs sudo"
  fi
  return 1
}

ensure_runner || true

# --- helpers for state -----------------------------------------------------
rerun_count() {
  local run_id="$1"
  awk -v id="${run_id}" '$1 == id { print $2; found=1 } END { if (!found) print 0 }' "${STATE_FILE}"
}

bump_rerun() {
  local run_id="$1"
  local count
  count="$(rerun_count "${run_id}")"
  count=$((count + 1))
  local tmp
  tmp="$(mktemp)"
  awk -v id="${run_id}" '$1 != id { print }' "${STATE_FILE}" >"${tmp}"
  echo "${run_id} ${count} $(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"${tmp}"
  mv "${tmp}" "${STATE_FILE}"
}

# --- query latest deploy runs ----------------------------------------------
if ! command -v gh >/dev/null 2>&1; then
  warn "gh CLI not on PATH — runner heal attempted; install gh for re-runs"
  exit 0
fi

if [[ "${have_gh_auth}" -ne 1 ]]; then
  warn "gh not authenticated. Put a PAT in ${SECRETS_DIR}/github.token or run: gh auth login"
  log "skipping Actions API checks; runner heal attempted above"
  exit 0
fi

mapfile -t RUNS < <(
  gh run list \
    --repo "${REPO}" \
    --workflow "${WORKFLOW}" \
    --branch master \
    --limit 5 \
    --json databaseId,status,conclusion,createdAt,displayTitle,url \
    --jq '.[] | [.databaseId, .status, (.conclusion // ""), .createdAt, .displayTitle, .url] | @tsv' \
    2>/dev/null || true
)

if [[ ${#RUNS[@]} -eq 0 ]]; then
  warn "could not list workflow runs for ${WORKFLOW}"
  exit 0
fi

IFS=$'\t' read -r RUN_ID STATUS CONCLUSION CREATED TITLE URL <<<"${RUNS[0]}"
log "latest: id=${RUN_ID} status=${STATUS} conclusion=${CONCLUSION:-none} — ${TITLE}"

if [[ "${STATUS}" == "queued" || "${STATUS}" == "waiting" ]]; then
  created_epoch="$(date -u -d "${CREATED}" +%s 2>/dev/null || echo 0)"
  now_epoch="$(date -u +%s)"
  age_min=0
  if [[ "${created_epoch}" -gt 0 ]]; then
    age_min=$(( (now_epoch - created_epoch) / 60 ))
  fi
  log "run ${RUN_ID} is ${STATUS} for ~${age_min}m (${URL})"
  if [[ "${age_min}" -ge "${QUEUED_MIN}" ]]; then
    warn "queued ≥ ${QUEUED_MIN}m — restarting runner for pickup"
    ensure_runner || true
  fi
  exit 0
fi

if [[ "${STATUS}" == "in_progress" ]]; then
  log "deploy in progress — no action"
  exit 0
fi

if [[ "${STATUS}" == "completed" && "${CONCLUSION}" == "failure" ]]; then
  count="$(rerun_count "${RUN_ID}")"
  if [[ "${count}" -ge "${MAX_RERUNS}" ]]; then
    warn "run ${RUN_ID} already re-run ${count}× (max ${MAX_RERUNS}) — manual check needed"
    warn "  ${URL}"
    exit 0
  fi

  ensure_runner || true

  log "re-running failed deploy ${RUN_ID} (attempt $((count + 1))/${MAX_RERUNS})"
  if gh run rerun "${RUN_ID}" --repo "${REPO}" --failed; then
    bump_rerun "${RUN_ID}"
    log "rerun requested: ${URL}"
  else
    warn "gh run rerun failed for ${RUN_ID}"
    exit 1
  fi
  exit 0
fi

if [[ "${STATUS}" == "completed" && "${CONCLUSION}" == "cancelled" ]]; then
  log "latest run cancelled (likely superseded) — no action"
  exit 0
fi

if [[ "${STATUS}" == "completed" && "${CONCLUSION}" == "success" ]]; then
  log "latest deploy succeeded — no action"
  exit 0
fi

log "no action for status=${STATUS} conclusion=${CONCLUSION:-none}"
exit 0
