<script setup lang="ts">
import type { SystemSnapshot } from "~/types/system";

const { t } = useI18n();
const { apiFetch } = useApi();
const { pushToast } = useToasts();

const snapshot = ref<SystemSnapshot | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);
const autoRefresh = ref(true);
let timer: ReturnType<typeof setInterval> | null = null;

async function load() {
  loading.value = true;
  error.value = null;
  try {
    snapshot.value = await apiFetch<SystemSnapshot>("/api/admin/system");
  } catch (err: unknown) {
    error.value =
      (err as { data?: { statusMessage?: string }; statusMessage?: string })
        ?.data?.statusMessage ??
      (err as { statusMessage?: string }).statusMessage ??
      t("admin.systemFailed");
    pushToast(error.value, { tone: "danger", duration: 3200 });
  } finally {
    loading.value = false;
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
  return "bg-brand-600";
}

function latencyTone(ms: number | null | undefined, ok: boolean): string {
  if (!ok) return "text-rose-600";
  if (ms == null) return "text-slate-500";
  if (ms >= 200) return "text-amber-600";
  if (ms >= 80) return "text-slate-800";
  return "text-emerald-700";
}

function startTimer() {
  stopTimer();
  if (!autoRefresh.value) return;
  timer = setInterval(() => {
    if (document.visibilityState === "visible") void load();
  }, 10_000);
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

watch(autoRefresh, () => startTimer());

onMounted(() => {
  void load().then(() => startTimer());
});

onBeforeUnmount(() => stopTimer());
</script>

<template>
  <section
    class="bg-white border border-slate-200 rounded-xl p-4 space-y-4"
    aria-labelledby="admin-system-title"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2
          id="admin-system-title"
          class="text-sm font-semibold text-slate-800"
        >
          {{ $t("admin.systemTitle") }}
        </h2>
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
          @click="load"
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
      <p class="text-[11px] text-slate-400">
        {{
          $t("admin.systemCollectedAt", {
            time: new Date(snapshot.collectedAt).toLocaleString(),
          })
        }}
        · {{ $t("admin.systemScopeHint") }}
      </p>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div
          class="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5"
        >
          <p class="text-[11px] uppercase tracking-wider text-slate-400">
            {{ $t("admin.systemRamProcess") }}
          </p>
          <p class="text-lg font-semibold tabular-nums text-slate-900">
            {{ formatBytes(snapshot.process.memory.rssBytes) }}
          </p>
          <p class="text-[11px] text-slate-500 tabular-nums">
            {{ $t("admin.systemHeap") }}:
            {{ formatBytes(snapshot.process.memory.heapUsedBytes) }}
            /
            {{ formatBytes(snapshot.process.memory.heapTotalBytes) }}
          </p>
        </div>

        <div
          class="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5"
        >
          <p class="text-[11px] uppercase tracking-wider text-slate-400">
            {{ $t("admin.systemRamHost") }}
          </p>
          <p class="text-lg font-semibold tabular-nums text-slate-900">
            {{ snapshot.host.memory.usedPercent }}%
          </p>
          <p class="text-[11px] text-slate-500 tabular-nums">
            {{ formatBytes(snapshot.host.memory.usedBytes) }}
            /
            {{ formatBytes(snapshot.host.memory.totalBytes) }}
          </p>
          <div class="mt-1.5 h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              class="h-full rounded-full transition-all"
              :class="barClass(snapshot.host.memory.usedPercent)"
              :style="{
                width: `${Math.min(100, snapshot.host.memory.usedPercent)}%`,
              }"
            />
          </div>
        </div>

        <div
          class="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5"
        >
          <p class="text-[11px] uppercase tracking-wider text-slate-400">
            {{ $t("admin.systemCpu") }}
          </p>
          <p class="text-lg font-semibold tabular-nums text-slate-900">
            {{ snapshot.process.cpu.percent.toFixed(1) }}%
          </p>
          <p class="text-[11px] text-slate-500">
            {{
              $t("admin.systemCpuDetail", {
                cores: snapshot.process.cpu.cores,
                ms: snapshot.process.cpu.sampleMs,
              })
            }}
          </p>
        </div>

        <div
          class="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5"
        >
          <p class="text-[11px] uppercase tracking-wider text-slate-400">
            {{ $t("admin.systemUptime") }}
          </p>
          <p class="text-lg font-semibold tabular-nums text-slate-900">
            {{ formatDuration(snapshot.process.uptimeMs) }}
          </p>
          <p class="text-[11px] text-slate-500">
            Node {{ snapshot.process.nodeVersion }} ·
            {{ snapshot.host.platform }}/{{ snapshot.host.arch }}
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="rounded-lg border border-slate-100 px-3 py-2.5 space-y-2">
          <h3 class="text-xs font-semibold text-slate-700">
            {{ $t("admin.systemDisk") }}
          </h3>
          <template v-if="snapshot.host.disk">
            <p class="text-sm font-semibold tabular-nums text-slate-900">
              {{ snapshot.host.disk.usedPercent }}%
              <span class="text-xs font-normal text-slate-500">
                ({{ formatBytes(snapshot.host.disk.usedBytes) }}
                /
                {{ formatBytes(snapshot.host.disk.totalBytes) }})
              </span>
            </p>
            <div class="h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div
                class="h-full rounded-full"
                :class="barClass(snapshot.host.disk.usedPercent)"
                :style="{
                  width: `${Math.min(100, snapshot.host.disk.usedPercent)}%`,
                }"
              />
            </div>
            <p class="text-[11px] text-slate-500">
              {{ snapshot.host.disk.path }} · {{ $t("admin.systemFree") }}:
              {{ formatBytes(snapshot.host.disk.freeBytes) }}
            </p>
          </template>
          <p v-else class="text-xs text-slate-500">
            {{ $t("admin.systemDiskUnavailable") }}
          </p>
        </div>

        <div class="rounded-lg border border-slate-100 px-3 py-2.5 space-y-2">
          <h3 class="text-xs font-semibold text-slate-700">
            {{ $t("admin.systemLatency") }}
          </h3>
          <dl class="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt class="text-[11px] text-slate-400">
                {{ $t("admin.systemLatencyDb") }}
              </dt>
              <dd
                class="font-semibold tabular-nums"
                :class="
                  latencyTone(snapshot.latency.db.ms, snapshot.latency.db.ok)
                "
              >
                {{ formatMs(snapshot.latency.db.ms) }}
                <span class="text-[11px] font-normal">
                  {{
                    snapshot.latency.db.ok
                      ? $t("admin.systemOk")
                      : $t("admin.systemFail")
                  }}
                </span>
              </dd>
            </div>
            <div>
              <dt class="text-[11px] text-slate-400">
                {{ $t("admin.systemLatencyHttp") }}
              </dt>
              <dd
                class="font-semibold tabular-nums"
                :class="
                  latencyTone(
                    snapshot.latency.http.ms,
                    snapshot.latency.http.ok,
                  )
                "
              >
                {{ formatMs(snapshot.latency.http.ms) }}
                <span class="text-[11px] font-normal">
                  {{
                    snapshot.latency.http.ok
                      ? $t("admin.systemOk")
                      : $t("admin.systemFail")
                  }}
                </span>
              </dd>
            </div>
          </dl>
          <p class="text-[11px] text-slate-500">
            {{ $t("admin.systemLoadAvg") }}:
            {{ snapshot.host.loadAverage.join(" · ") }}
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div class="rounded-lg border border-slate-100 px-3 py-2.5">
          <p class="font-semibold text-slate-700 mb-1">
            {{ $t("admin.systemHealth") }}
          </p>
          <p>
            DB:
            <span
              :class="snapshot.health.db ? 'text-emerald-700' : 'text-rose-600'"
              >{{
                snapshot.health.db
                  ? $t("admin.systemOk")
                  : $t("admin.systemFail")
              }}</span
            >
          </p>
          <p>
            {{ $t("admin.systemMigrations") }}:
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
            <span v-if="!snapshot.health.migrations.ok" class="text-slate-500">
              (pending={{ snapshot.health.migrations.pending }}, drift={{
                snapshot.health.migrations.drift
              }})
            </span>
          </p>
        </div>
        <div class="rounded-lg border border-slate-100 px-3 py-2.5">
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
        <div class="rounded-lg border border-slate-100 px-3 py-2.5">
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
          <p class="tabular-nums text-slate-600">
            pending {{ snapshot.queue.jobs.pending }} · processing
            {{ snapshot.queue.jobs.processing }} · done
            {{ snapshot.queue.jobs.completed }} · dead
            {{ snapshot.queue.jobs.dead }}
          </p>
        </div>
      </div>
    </template>
  </section>
</template>
