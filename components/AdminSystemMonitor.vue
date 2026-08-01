<script setup lang="ts">
import type { Chart as ChartType } from "chart.js";
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
const trendChart = ref<HTMLCanvasElement | null>(null);
let trendInst: ChartType | null = null;
let ChartCtor: typeof ChartType | null = null;

const overallOk = computed(() => {
  const s = snapshot.value;
  if (!s) return false;
  return s.health.db && s.health.migrations.ok && s.latency.db.ok;
});

async function ensureChartLib() {
  if (ChartCtor) return ChartCtor;
  const mod = await import("chart.js");
  mod.Chart.register(
    mod.LineController,
    mod.LineElement,
    mod.PointElement,
    mod.LinearScale,
    mod.CategoryScale,
    mod.Filler,
    mod.Legend,
    mod.Tooltip,
  );
  ChartCtor = mod.Chart;
  return ChartCtor;
}

function chartInkColors() {
  const styles = getComputedStyle(document.documentElement);
  const ink = styles.getPropertyValue("--ink").trim() || "#0f172a";
  const muted = styles.getPropertyValue("--ink-muted").trim() || "#64748b";
  const border = styles.getPropertyValue("--border").trim() || "#e2e8f0";
  return { ink, muted, border };
}

async function renderTrend() {
  if (!trendChart.value || history.value.length < 2) return;
  const Chart = await ensureChartLib();
  const { muted, border } = chartInkColors();
  const labels = history.value.map((h) =>
    new Date(h.at).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  );
  const cfg = {
    type: "line" as const,
    data: {
      labels,
      datasets: [
        {
          label: t("admin.systemCpu"),
          data: history.value.map((h) => h.cpu),
          borderColor: "rgb(14, 165, 233)",
          backgroundColor: "rgba(14, 165, 233, 0.12)",
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2,
          yAxisID: "y",
        },
        {
          label: t("admin.systemRamHost"),
          data: history.value.map((h) => h.mem),
          borderColor: "rgb(99, 102, 241)",
          backgroundColor: "rgba(99, 102, 241, 0.08)",
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2,
          yAxisID: "y",
        },
        {
          label: t("admin.systemLatencyDb"),
          data: history.value.map((h) => h.dbMs),
          borderColor: "rgb(245, 158, 11)",
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index" as const, intersect: false },
      plugins: {
        legend: {
          position: "bottom" as const,
          labels: { boxWidth: 10, font: { size: 11 }, color: muted },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxTicksLimit: 6, font: { size: 10 }, color: muted },
        },
        y: {
          min: 0,
          max: 100,
          title: {
            display: true,
            text: "%",
            font: { size: 10 },
            color: muted,
          },
          ticks: { font: { size: 10 }, color: muted },
          grid: { color: border },
        },
        y1: {
          position: "right" as const,
          min: 0,
          grid: { drawOnChartArea: false },
          title: {
            display: true,
            text: "ms",
            font: { size: 10 },
            color: muted,
          },
          ticks: { font: { size: 10 }, color: muted },
        },
      },
    },
  };

  if (trendInst) {
    trendInst.data = cfg.data;
    trendInst.options = cfg.options;
    trendInst.update("none");
    return;
  }
  trendInst = new Chart(trendChart.value, cfg);
}

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
    await nextTick();
    await renderTrend();
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

function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return t("common.emDash");
  const abs = Math.abs(n);
  if (abs < 1024) return `${Math.round(n)} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let v = n / 1024;
  let i = 0;
  while (Math.abs(v) >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
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

function formatMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return t("common.emDash");
  return `${Math.round(ms)} ms`;
}

function barClass(percent: number): string {
  if (percent >= 90) return "bg-rose-500";
  if (percent >= 75) return "bg-amber-500";
  return "bg-emerald-500";
}

function latencyTone(ms: number | null | undefined, ok: boolean): string {
  if (!ok) return "text-rose-600";
  if (ms == null) return "text-slate-500";
  if (ms >= 200) return "text-amber-600";
  if (ms >= 80) return "text-slate-800";
  return "text-emerald-700";
}

function levelClass(level: string): string {
  if (level === "error") return "text-rose-600";
  if (level === "warn") return "text-amber-600";
  if (level === "info") return "text-sky-700";
  return "text-slate-500";
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
  trendInst?.destroy();
  trendInst = null;
});
</script>

<template>
  <section
    class="rounded-xl border border-slate-200 bg-white p-4 space-y-4 shadow-sm"
    aria-labelledby="admin-system-title"
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
          {{ loading ? $t("common.loading") : $t("common.reload") }}
        </button>
      </div>
    </div>

    <p
      v-if="error"
      class="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2"
    >
      {{ error }}
    </p>

    <p v-else-if="!snapshot && loading" class="text-xs text-slate-500">
      {{ $t("common.loading") }}
    </p>

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

      <!-- Gauge row -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          v-for="gauge in [
            {
              key: 'cpu',
              label: $t('admin.systemCpu'),
              pct: snapshot.process.cpu.percent,
              detail: $t('admin.systemCpuDetail', {
                cores: snapshot.process.cpu.cores,
                ms: snapshot.process.cpu.sampleMs,
              }),
            },
            {
              key: 'mem',
              label: $t('admin.systemRamHost'),
              pct: snapshot.host.memory.usedPercent,
              detail: `${formatBytes(snapshot.host.memory.usedBytes)} / ${formatBytes(snapshot.host.memory.totalBytes)}`,
            },
            {
              key: 'disk',
              label: $t('admin.systemDisk'),
              pct: snapshot.host.disk?.usedPercent ?? 0,
              detail: snapshot.host.disk
                ? `${formatBytes(snapshot.host.disk.usedBytes)} / ${formatBytes(snapshot.host.disk.totalBytes)}`
                : $t('admin.systemDiskUnavailable'),
            },
          ]"
          :key="gauge.key"
          class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
        >
          <div class="flex items-baseline justify-between gap-2">
            <p class="text-[11px] uppercase tracking-wider text-slate-500">
              {{ gauge.label }}
            </p>
            <p class="text-2xl font-semibold tabular-nums text-slate-900">
              {{ Number(gauge.pct).toFixed(1) }}%
            </p>
          </div>
          <div class="mt-2 h-2.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="barClass(Number(gauge.pct))"
              :style="{ width: `${Math.min(100, Number(gauge.pct))}%` }"
            />
          </div>
          <p class="mt-1.5 text-[11px] text-slate-500 tabular-nums">
            {{ gauge.detail }}
          </p>
        </div>
      </div>

      <!-- Trend chart -->
      <div class="rounded-xl border border-slate-200 bg-white p-3">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-xs font-semibold text-slate-700">
            {{ $t("admin.systemTrendTitle") }}
          </h3>
          <p class="text-[11px] text-slate-500">
            {{ $t("admin.systemTrendHint") }}
          </p>
        </div>
        <div class="h-48">
          <canvas ref="trendChart"></canvas>
        </div>
        <p
          v-if="history.length < 2"
          class="text-[11px] text-slate-500 text-center -mt-40 relative"
        >
          {{ $t("admin.systemTrendWaiting") }}
        </p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <!-- Latency -->
        <div
          class="rounded-xl border border-slate-200 bg-white px-3 py-3 space-y-3"
        >
          <h3 class="text-xs font-semibold text-slate-700">
            {{ $t("admin.systemLatency") }}
          </h3>
          <div
            v-for="row in [
              {
                label: $t('admin.systemLatencyDb'),
                ms: snapshot.latency.db.ms,
                ok: snapshot.latency.db.ok,
              },
              {
                label: $t('admin.systemLatencyHealth'),
                ms: snapshot.latency.http.ms,
                ok: snapshot.latency.http.ok,
              },
              {
                label: $t('admin.systemLatencyRedis'),
                ms: snapshot.latency.redis?.ms ?? null,
                ok: snapshot.latency.redis?.ok ?? false,
                skip: snapshot.latency.redis == null,
              },
            ].filter((r) => !('skip' in r && r.skip))"
            :key="row.label"
            class="space-y-1"
          >
            <div class="flex items-center justify-between text-sm">
              <span class="text-slate-600">{{ row.label }}</span>
              <span
                class="font-semibold tabular-nums"
                :class="latencyTone(row.ms, row.ok)"
              >
                {{ formatMs(row.ms) }}
                ·
                {{ row.ok ? $t("admin.systemOk") : $t("admin.systemFail") }}
              </span>
            </div>
            <div class="h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div
                class="h-full rounded-full transition-all"
                :class="
                  !row.ok
                    ? 'bg-rose-500'
                    : (row.ms ?? 0) >= 200
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                "
                :style="{
                  width: `${Math.min(100, ((row.ms ?? 0) / 250) * 100)}%`,
                }"
              />
            </div>
          </div>
          <p class="text-[11px] text-slate-500">
            {{ $t("admin.systemLoadAvg") }}:
            {{ snapshot.host.loadAverage.join(" · ") }}
          </p>
          <p class="text-[11px] text-slate-500 tabular-nums">
            {{ $t("admin.systemRamProcess") }}:
            {{ formatBytes(snapshot.process.memory.rssBytes) }}
            ({{ $t("admin.systemHeap") }}
            {{ formatBytes(snapshot.process.memory.heapUsedBytes) }})
          </p>
        </div>

        <!-- Services -->
        <div
          class="rounded-xl border border-slate-200 bg-white px-3 py-3 space-y-3 text-xs text-slate-600"
        >
          <h3 class="text-xs font-semibold text-slate-700">
            {{ $t("admin.systemServices") }}
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div
              class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <p class="font-semibold text-slate-700 mb-1">
                {{ $t("admin.systemHealth") }}
              </p>
              <p>
                DB
                <span
                  :class="
                    snapshot.health.db ? 'text-emerald-700' : 'text-rose-600'
                  "
                  >{{
                    snapshot.health.db
                      ? $t("admin.systemOk")
                      : $t("admin.systemFail")
                  }}</span
                >
              </p>
              <p>
                {{ $t("admin.systemMigrations") }}
                <span
                  :class="
                    snapshot.health.migrations.ok
                      ? 'text-emerald-700'
                      : 'text-rose-600'
                  "
                  >{{
                    snapshot.health.migrations.ok
                      ? $t("admin.systemOk")
                      : $t("admin.systemFail")
                  }}</span
                >
              </p>
            </div>
            <div
              class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <p class="font-semibold text-slate-700 mb-1">
                {{ $t("admin.systemCache") }}
              </p>
              <p class="tabular-nums">
                {{ snapshot.cache.driver }}
                · Redis
                {{
                  snapshot.cache.redisConfigured
                    ? $t("admin.systemConfigured")
                    : $t("admin.systemNotConfigured")
                }}
              </p>
            </div>
            <div
              class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2"
            >
              <p class="font-semibold text-slate-700 mb-1">
                {{ $t("admin.systemQueue") }}
              </p>
              <p>
                {{
                  snapshot.queue.workerEnabled
                    ? $t("admin.systemWorkerOn")
                    : $t("admin.systemWorkerOff")
                }}
              </p>
              <div class="mt-2 grid grid-cols-4 gap-1 text-center">
                <div
                  v-for="cell in [
                    {
                      label: 'pending',
                      n: snapshot.queue.jobs.pending,
                      cls: 'text-amber-700',
                    },
                    {
                      label: 'processing',
                      n: snapshot.queue.jobs.processing,
                      cls: 'text-sky-700',
                    },
                    {
                      label: 'done',
                      n: snapshot.queue.jobs.completed,
                      cls: 'text-emerald-700',
                    },
                    {
                      label: 'dead',
                      n: snapshot.queue.jobs.dead,
                      cls: 'text-rose-700',
                    },
                  ]"
                  :key="cell.label"
                  class="rounded-md bg-white border border-slate-200 px-1 py-1.5"
                >
                  <p class="text-[10px] uppercase text-slate-500">
                    {{ cell.label }}
                  </p>
                  <p
                    class="text-sm font-semibold tabular-nums"
                    :class="cell.cls"
                  >
                    {{ cell.n }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Logs -->
      <div class="rounded-xl border border-slate-200 overflow-hidden">
        <div
          class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50"
        >
          <div>
            <h3 class="text-xs font-semibold text-slate-700">
              {{ $t("admin.systemLogsTitle") }}
            </h3>
            <p class="text-[11px] text-slate-500">
              {{ $t("admin.systemLogsHint") }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <label class="sr-only" for="admin-log-filter">{{
              $t("admin.systemLogsFilter")
            }}</label>
            <select
              id="admin-log-filter"
              v-model="logFilter"
              class="text-xs border border-slate-300 rounded-md px-2 py-1 bg-white"
            >
              <option value="all">{{ $t("admin.systemLogsAll") }}</option>
              <option value="error">error</option>
              <option value="warn">warn</option>
              <option value="info">info</option>
            </select>
            <button
              type="button"
              class="text-xs font-semibold rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              :disabled="logsLoading"
              @click="loadLogs"
            >
              {{ logsLoading ? $t("common.loading") : $t("common.reload") }}
            </button>
          </div>
        </div>
        <p v-if="logsError" class="text-xs text-rose-600 px-3 py-2 bg-rose-50">
          {{ logsError }}
        </p>
        <div
          class="max-h-64 overflow-auto bg-slate-950 text-[11px] font-mono leading-relaxed"
        >
          <p
            v-if="!logs.length && !logsLoading"
            class="px-3 py-4 text-slate-400"
          >
            {{ $t("admin.systemLogsEmpty") }}
          </p>
          <div
            v-for="(entry, idx) in logs"
            :key="`${entry.at}-${idx}`"
            class="px-3 py-0.5 border-b border-slate-900/80 hover:bg-slate-900"
          >
            <span class="text-slate-500">{{
              new Date(entry.at).toLocaleTimeString()
            }}</span>
            <span class="ml-2 uppercase" :class="levelClass(entry.level)">{{
              entry.level
            }}</span>
            <span class="ml-2 text-slate-200 whitespace-pre-wrap break-all">{{
              entry.message
            }}</span>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
