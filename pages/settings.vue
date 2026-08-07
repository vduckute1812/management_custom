<script setup lang="ts">
const { t } = useI18n();
const { settings, update } = useSettings();
const { exportJSON, exportCSV, exportEpicsCSV, exportICS } = useExport();
const { fetchAll: fetchTasks, tasks } = useTasks();
const { fetchAll: fetchEpics, epics } = useEpics();
const { pushToast } = useToasts();
const auth = useAuth();
const {
  currency: moneyCurrency,
  options: currencyOptions,
  setCurrency,
} = useMoneyCurrency();
const currencyBusy = ref(false);

async function onCurrencySelect(value: number) {
  if (currencyBusy.value || moneyCurrency.value === value) return;
  currencyBusy.value = true;
  try {
    await setCurrency(value as import("~/types/money").MoneyCurrency);
    pushToast(t("settings.currency.saved"), {
      tone: "success",
      duration: 1800,
    });
  } catch (err: unknown) {
    pushToast(apiErrorMessage(err, t("settings.currency.failed")), {
      tone: "danger",
      duration: 4000,
    });
  } finally {
    currencyBusy.value = false;
  }
}
useSeoMeta({
  title: computed(() => t("seo.settings")),
  description: computed(() => t("seo.settingsDescription")),
});

const hasPassword = ref(true);

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

// Export data is loaded lazily — settings chrome must not wait on full
// tasks/epics payloads at route enter.
const exportDataReady = ref(false);
const exportDataLoading = ref(false);
let exportDataInflight: Promise<void> | null = null;

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
  // Warm export counts in the background after paint; export buttons still await.
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
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <header
      class="shrink-0 px-4 md:px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between"
    >
      <div>
        <h1 class="text-xl font-semibold text-slate-900">
          {{ $t("settings.title") }}
        </h1>
        <p class="text-xs text-slate-500 mt-0.5">
          {{ $t("settings.subtitle") }}
        </p>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-4 md:p-6">
      <div class="max-w-2xl mx-auto space-y-6">
        <SettingsAccountSection @has-password-change="hasPassword = $event" />

        <!-- Language -->
        <section class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm">
          <header class="px-5 py-3 border-b border-slate-100">
            <h2 class="text-sm font-semibold text-slate-800">
              {{ $t("settings.language.title") }}
            </h2>
            <p class="text-[11px] text-slate-500">
              {{ $t("settings.language.subtitle") }}
            </p>
          </header>
          <div class="px-5 py-4">
            <p
              id="settings-language-label"
              class="text-sm font-medium text-slate-800 mb-2"
            >
              {{ $t("settings.language.label") }}
            </p>
            <LanguageSwitcher id="settings-language-label" variant="buttons" />
          </div>
        </section>

        <!-- Currency (signed-in) -->
        <section
          v-if="auth.isAuthenticatedUi"
          class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm"
        >
          <header class="px-5 py-3 border-b border-slate-100">
            <h2 class="text-sm font-semibold text-slate-800">
              {{ $t("settings.currency.title") }}
            </h2>
            <p class="text-[11px] text-slate-500">
              {{ $t("settings.currency.subtitle") }}
            </p>
          </header>
          <div class="px-5 py-4">
            <p
              id="settings-currency-label"
              class="text-sm font-medium text-slate-800 mb-2"
            >
              {{ $t("settings.currency.label") }}
            </p>
            <div
              class="flex flex-wrap gap-2"
              role="group"
              aria-labelledby="settings-currency-label"
            >
              <button
                v-for="opt in currencyOptions"
                :key="opt.value"
                type="button"
                class="rounded-lg border px-3 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                :class="
                  moneyCurrency === opt.value
                    ? 'border-brand-500 bg-brand-50 text-brand-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                "
                :aria-pressed="moneyCurrency === opt.value"
                :disabled="currencyBusy"
                @click="onCurrencySelect(opt.value)"
              >
                {{ $t(opt.labelKey) }}
              </button>
            </div>
            <p class="mt-2 text-[11px] text-slate-500">
              {{ $t("settings.currency.hint") }}
            </p>
          </div>
        </section>

        <SettingsAppearanceSection />

        <!-- Calendar preferences -->
        <section class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm">
          <header class="px-5 py-3 border-b border-slate-100">
            <h2 class="text-sm font-semibold text-slate-800">
              {{ $t("settings.calendar.title") }}
            </h2>
            <p class="text-[11px] text-slate-500">
              {{ $t("settings.calendar.subtitle") }}
            </p>
          </header>

          <div class="px-5 py-4 space-y-5">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-slate-800">
                  {{ $t("settings.calendar.weekStartsOn") }}
                </p>
                <p class="text-[11px] text-slate-500">
                  {{ $t("settings.calendar.weekStartsHint") }}
                </p>
              </div>
              <div
                class="inline-flex rounded-lg ring-1 ring-slate-200 overflow-hidden shrink-0"
              >
                <button
                  v-for="opt in ['sun', 'mon'] as const"
                  :key="opt"
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium transition"
                  :class="
                    settings.weekStart === opt
                      ? 'bg-brand-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  "
                  :aria-pressed="settings.weekStart === opt"
                  @click="update('weekStart', opt)"
                >
                  {{
                    opt === "sun"
                      ? $t("settings.calendar.sunday")
                      : $t("settings.calendar.monday")
                  }}
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-slate-800">
                  {{ $t("settings.calendar.timeFormat") }}
                </p>
                <p class="text-[11px] text-slate-500">
                  {{ $t("settings.calendar.timeFormatHint") }}
                </p>
              </div>
              <div
                class="inline-flex rounded-lg ring-1 ring-slate-200 overflow-hidden shrink-0"
              >
                <button
                  v-for="opt in ['24h', '12h'] as const"
                  :key="opt"
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium transition"
                  :class="
                    settings.timeFormat === opt
                      ? 'bg-brand-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  "
                  :aria-pressed="settings.timeFormat === opt"
                  @click="update('timeFormat', opt)"
                >
                  {{
                    opt === "24h"
                      ? $t("settings.calendar.format24h")
                      : $t("settings.calendar.format12h")
                  }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <SettingsNotificationsSection />

        <!-- Data ownership -->
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

        <!-- Danger zone -->
        <SettingsDangerZone :has-password="hasPassword" />

        <!-- Print -->
        <section class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm">
          <header class="px-5 py-3 border-b border-slate-100">
            <h2 class="text-sm font-semibold text-slate-800">
              {{ $t("settings.print.title") }}
            </h2>
            <p class="text-[11px] text-slate-500">
              {{ $t("settings.print.subtitle") }}
            </p>
          </header>
          <div class="px-5 py-4 text-xs text-slate-600 leading-relaxed">
            {{ $t("settings.print.body") }}
            <NuxtLink to="/tasks" class="ml-1 text-brand-700 hover:underline">
              {{ $t("settings.print.dashboardLink") }}
            </NuxtLink>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
