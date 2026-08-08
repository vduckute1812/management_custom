<script setup lang="ts">
import type { SystemLogEntry, SystemSnapshot } from "~/types/system";

const { t } = useI18n();
const { apiFetch } = useApi();
const { pushToast } = useToasts();

const HISTORY_MAX = 36;

interface HistoryPoint {
  at: number;
  cpu: number;
  mem: number;
  disk: number;
  dbMs: number;
  healthMs: number;
  redisMs: number | null;
}

const snapshot = ref<SystemSnapshot | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);
const autoRefresh = ref(true);
const history = ref<HistoryPoint[]>([]);
const logs = ref<SystemLogEntry[]>([]);
const logsLoading = ref(false);
const logFilter = ref<"all" | "error" | "warn" | "info">("all");
const logsError = ref<string | null>(null);

let timer: ReturnType<typeof setInterval> | null = null;

const overallOk = computed(() => {
  const s = snapshot.value;
  if (!s) return false;
  return s.health.db && s.health.migrations.ok && s.latency.db.ok;
});

function pushHistory(s: SystemSnapshot) {
  history.value = [
    ...history.value,
    {
      at: Date.now(),
      cpu: s.process.cpu.percent,
      mem: s.host.memory.usedPercent,
      disk: s.host.disk?.usedPercent ?? 0,
      dbMs: s.latency.db.ms ?? 0,
      healthMs: s.latency.http.ms ?? 0,
      redisMs: s.latency.redis?.ms ?? null,
    },
  ].slice(-HISTORY_MAX);
}

async function load(opts?: { manual?: boolean }) {
  loading.value = true;
  if (opts?.manual) error.value = null;
  try {
    const s = await apiFetch<SystemSnapshot>("/api/admin/system");
    snapshot.value = s;
    error.value = null;
    pushHistory(s);
  } catch (err: unknown) {
    const msg =
      (err as { data?: { statusMessage?: string }; statusMessage?: string })
        ?.data?.statusMessage ??
      (err as { statusMessage?: string }).statusMessage ??
      t("admin.systemFailed");
    error.value = msg;
    if (opts?.manual) {
      pushToast(msg, { tone: "danger", duration: 3200 });
    }
  } finally {
    loading.value = false;
  }
}

async function loadLogs() {
  logsLoading.value = true;
  logsError.value = null;
  try {
    const level = logFilter.value === "all" ? "all" : logFilter.value;
    const res = await apiFetch<{ entries: SystemLogEntry[] }>(
      "/api/admin/system/logs",
      { query: { limit: 150, level } },
    );
    logs.value = res.entries;
  } catch (err: unknown) {
    logsError.value =
      (err as { data?: { statusMessage?: string }; statusMessage?: string })
        ?.data?.statusMessage ??
      (err as { statusMessage?: string }).statusMessage ??
      t("admin.systemLogsFailed");
  } finally {
    logsLoading.value = false;
  }
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return t("common.emDash");
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function startTimer() {
  stopTimer();
  if (!autoRefresh.value) return;
  timer = setInterval(() => {
    if (document.visibilityState === "visible") {
      void load();
      void loadLogs();
    }
  }, 12_000);
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

watch(autoRefresh, () => startTimer());
watch(logFilter, () => {
  void loadLogs();
});

onMounted(() => {
  void load({ manual: true }).then(() => startTimer());
  void loadLogs();
});

onBeforeUnmount(() => {
  stopTimer();
});
</script>

<template>
  <section
    class="rounded-xl border border-slate-200 bg-white p-4 space-y-4 shadow-sm"
    aria-labelledby="admin-system-title"
    :aria-busy="loading || logsLoading"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h2
            id="admin-system-title"
            class="text-sm font-semibold text-slate-900"
          >
            {{ $t("admin.systemTitle") }}
          </h2>
          <span
            v-if="snapshot"
            class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
            :class="
              overallOk
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
            "
          >
            {{
              overallOk
                ? $t("admin.systemStatusOk")
                : $t("admin.systemStatusBad")
            }}
          </span>
        </div>
        <p class="text-xs text-slate-500 mt-0.5">
          {{ $t("admin.systemSubtitle") }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <label
          class="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none"
        >
          <input
            v-model="autoRefresh"
            type="checkbox"
            class="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          {{ $t("admin.systemAutoRefresh") }}
        </label>
        <button
          type="button"
          class="text-xs font-semibold rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          :disabled="loading"
          @click="load({ manual: true })"
        >
          {{ $t("common.reload") }}
        </button>
      </div>
    </div>

    <p
      v-if="error"
      class="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2"
    >
      {{ error }}
    </p>

    <SkeletonList v-else-if="!snapshot && loading" :rows="3" variant="card" />

    <template v-else-if="snapshot">
      <p class="text-[11px] text-slate-500">
        {{
          $t("admin.systemCollectedAt", {
            time: new Date(snapshot.collectedAt).toLocaleString(),
          })
        }}
        · {{ $t("admin.systemScopeHint") }} · up
        {{ formatDuration(snapshot.process.uptimeMs) }} · Node
        {{ snapshot.process.nodeVersion }}
      </p>

      <AdminSystemMetrics :snapshot="snapshot" :history="history" />

      <AdminSystemLogs
        v-model:log-filter="logFilter"
        :logs="logs"
        :loading="logsLoading"
        :error="logsError"
        @reload="loadLogs"
      />
    </template>
  </section>
</template>
