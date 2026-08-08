<script setup lang="ts">
const { t } = useI18n();
const { exportJSON, exportCSV, exportEpicsCSV, exportICS } = useExport();
const { fetchAll: fetchTasks, tasks } = useTasks();
const { fetchAll: fetchEpics, epics } = useEpics();
const { pushToast } = useToasts();

const exportDataReady = ref(false);
const exportDataLoading = ref(false);
let exportDataInflight: Promise<void> | null = null;

const dataCountsLabel = computed(() => {
  if (!exportDataReady.value) {
    return exportDataLoading.value
      ? t("settings.data.loadingCounts")
      : t("settings.data.countsHint");
  }
  const epicCount = epics.value.length;
  const taskCount = tasks.value.length;
  const key =
    epicCount === 1 && taskCount === 1
      ? "settings.data.counts"
      : "settings.data.countsPlural";
  return t(key, { epicCount, taskCount });
});

async function ensureExportData() {
  if (exportDataReady.value) return;
  if (exportDataInflight) {
    await exportDataInflight;
    return;
  }
  exportDataLoading.value = true;
  exportDataInflight = (async () => {
    try {
      await Promise.all([
        fetchTasks({ include: ["blocks", "checklists"] }),
        fetchEpics(),
      ]);
      exportDataReady.value = true;
    } finally {
      exportDataLoading.value = false;
      exportDataInflight = null;
    }
  })();
  await exportDataInflight;
}

onMounted(() => {
  void ensureExportData().catch(() => undefined);
});

function announce(message: string) {
  pushToast(message, { tone: "success", duration: 2200 });
}

async function doExportJSON() {
  await ensureExportData();
  exportJSON();
  announce(t("toasts.downloadedJson"));
}

async function doExportCSV() {
  await ensureExportData();
  exportCSV();
  announce(t("toasts.downloadedTasksCsv"));
}

async function doExportEpics() {
  await ensureExportData();
  exportEpicsCSV();
  announce(t("toasts.downloadedEpicsCsv"));
}

async function doExportICS() {
  await ensureExportData();
  exportICS();
  announce(t("toasts.downloadedIcal"));
}
</script>

<template>
  <section class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm">
    <header class="px-5 py-3 border-b border-slate-100">
      <h2 class="text-sm font-semibold text-slate-800">
        {{ $t("settings.data.title") }}
      </h2>
      <p class="text-[11px] text-slate-500">
        {{ dataCountsLabel }}
      </p>
    </header>

    <div class="px-5 py-4 space-y-4">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          type="button"
          class="px-3 py-2.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition flex items-center justify-center gap-2"
          @click="doExportJSON"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-3.5 h-3.5"
          >
            <path
              d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          {{ $t("settings.data.jsonSnapshot") }}
        </button>
        <button
          type="button"
          class="px-3 py-2.5 rounded-lg text-xs font-medium bg-white ring-1 ring-slate-300 text-slate-700 hover:bg-slate-50 transition flex items-center justify-center gap-2"
          @click="doExportCSV"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-3.5 h-3.5"
          >
            <path
              d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          {{ $t("settings.data.tasksCsv") }}
        </button>
        <button
          type="button"
          class="px-3 py-2.5 rounded-lg text-xs font-medium bg-white ring-1 ring-slate-300 text-slate-700 hover:bg-slate-50 transition flex items-center justify-center gap-2"
          @click="doExportEpics"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-3.5 h-3.5"
          >
            <path
              d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          {{ $t("settings.data.epicsCsv") }}
        </button>
        <button
          type="button"
          class="px-3 py-2.5 rounded-lg text-xs font-medium bg-white ring-1 ring-slate-300 text-slate-700 hover:bg-slate-50 transition flex items-center justify-center gap-2"
          @click="doExportICS"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-3.5 h-3.5"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {{ $t("settings.data.calendarIcs") }}
        </button>
      </div>

      <details class="text-xs">
        <summary
          class="cursor-pointer text-slate-600 hover:text-slate-800 select-none"
        >
          {{ $t("settings.data.formatReference") }}
        </summary>
        <ul class="mt-2 pl-5 list-disc text-slate-500 space-y-1">
          <li>{{ $t("settings.data.formatJson") }}</li>
          <li>{{ $t("settings.data.formatTasksCsv") }}</li>
          <li>{{ $t("settings.data.formatEpicsCsv") }}</li>
          <li>{{ $t("settings.data.formatIcs") }}</li>
        </ul>
      </details>
    </div>
  </section>
</template>
