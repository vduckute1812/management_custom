<script setup lang="ts">
import type { Component } from "vue";

const { t } = useI18n();
const { settings, update, effectiveTheme } = useSettings();
const { exportJSON, exportCSV, exportEpicsCSV, exportICS } = useExport();
const { fetchAll: fetchTasks, tasks } = useTasks();
const { fetchAll: fetchEpics, epics } = useEpics();
const { pushToast } = useToasts();
const auth = useAuth();
const router = useRouter();
const route = useRoute();
const { apiFetch } = useApi();
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
const {
  permission: notifPermission,
  hydratePermission,
  requestPermission,
  sendTest,
  canFire: canFireNotifications,
} = useNotifications();

useSeoMeta({
  title: computed(() => t("seo.settings")),
  description: computed(() => t("seo.settingsDescription")),
});

const googleEnabled = ref(false);
const googleLinked = ref(false);
const hasPassword = ref(true);
const googleBusy = ref(false);

async function loadIdentities() {
  if (!auth.isAuthenticated.value) return;
  try {
    const [providers, identities] = await Promise.all([
      apiFetch<{ google: boolean }>("/api/auth/providers"),
      apiFetch<{
        googleLinked: boolean;
        hasPassword: boolean;
      }>("/api/auth/identities"),
    ]);
    googleEnabled.value = providers.google === true;
    googleLinked.value = identities.googleLinked === true;
    hasPassword.value = identities.hasPassword === true;
  } catch {
    googleEnabled.value = false;
  }
}

async function onUnlinkGoogle() {
  if (googleBusy.value) return;
  googleBusy.value = true;
  try {
    await apiFetch("/api/auth/google/unlink", { method: "POST" });
    googleLinked.value = false;
    pushToast(t("settings.account.googleUnlinked"), {
      tone: "success",
      duration: 2200,
    });
  } catch (err: unknown) {
    const msg =
      (err as { data?: { statusMessage?: string }; statusMessage?: string })
        ?.data?.statusMessage ??
      (err as { statusMessage?: string }).statusMessage ??
      t("settings.account.googleUnlinkFailed");
    pushToast(msg, { tone: "danger", duration: 4000 });
  } finally {
    googleBusy.value = false;
  }
}

async function onLogout() {
  await auth.logout();
  await router.replace("/");
}

const deleteOpen = ref(false);
const deleteBusy = ref(false);
const deleteError = ref("");

function openDeleteAccount() {
  deleteError.value = "";
  deleteOpen.value = true;
}

async function onDeleteAccount(payload: { email: string; password: string }) {
  if (deleteBusy.value) return;
  deleteBusy.value = true;
  deleteError.value = "";
  try {
    await apiFetch("/api/auth/account", {
      method: "DELETE",
      body: {
        email: payload.email,
        password: payload.password || undefined,
      },
    });
    deleteOpen.value = false;
    // The row is gone, so /api/auth/logout would 401 — drop local state directly.
    auth.clearSession();
    pushToast(t("settings.danger.deleted"), {
      tone: "success",
      duration: 6000,
    });
    await router.replace("/");
  } catch (err: unknown) {
    deleteError.value = apiErrorMessage(err, t("settings.danger.failed"));
  } finally {
    deleteBusy.value = false;
  }
}

if (import.meta.client) {
  hydratePermission();
  void loadIdentities();
  const oauthErr =
    typeof route.query.oauth_error === "string" ? route.query.oauth_error : "";
  const linked = route.query.linked === "google";
  if (oauthErr || linked) {
    if (oauthErr) {
      const key =
        (
          {
            denied: "auth.googleDenied",
            state: "auth.googleStateInvalid",
            config: "auth.googleNotConfigured",
            email: "auth.googleEmailUnverified",
            conflict: "auth.googleConflict",
            auth: "auth.googleAuthRequired",
            failed: "auth.googleFailed",
            google: "auth.googleUpstream",
          } as Record<string, string>
        )[oauthErr] || "auth.googleFailed";
      queueMicrotask(() => {
        pushToast(t(key), { tone: "danger", duration: 4200 });
      });
    } else {
      queueMicrotask(() => {
        pushToast(t("settings.account.googleLinked"), {
          tone: "success",
          duration: 2200,
        });
      });
      googleLinked.value = true;
    }
    const nextQuery = { ...route.query };
    delete nextQuery.oauth_error;
    delete nextQuery.linked;
    void router.replace({ path: "/settings", query: nextQuery });
  }
}

async function toggleNotifications() {
  const next = !settings.value.notificationsEnabled;
  update("notificationsEnabled", next);
  if (!next) return;

  // In-app toasts always work — flipping the switch is enough. Then
  // opportunistically ask for OS-notification permission as an upgrade.
  pushToast(t("toasts.preTaskAlertsOn"), { tone: "success", duration: 1800 });
  const result = await requestPermission();
  if (result === "denied") {
    pushToast(t("toasts.browserBlockedDesktop"), {
      tone: "info",
      duration: 4500,
    });
  } else if (result === "unsupported") {
    pushToast(t("toasts.desktopUnsupported"), {
      tone: "info",
      duration: 4500,
    });
  }
}

async function requestDesktopPermission() {
  const result = await requestPermission();
  if (result === "granted") {
    pushToast(t("toasts.desktopEnabled"), { tone: "success", duration: 1800 });
  } else if (result === "denied") {
    pushToast(t("toasts.permissionDenied"), {
      tone: "danger",
      duration: 4500,
    });
  } else if (result === "unsupported") {
    pushToast(t("toasts.browserNoDesktop"), {
      tone: "danger",
      duration: 3500,
    });
  }
}

function updateLeadMinutes(value: number) {
  const clamped = Math.max(0, Math.min(60, Math.round(value || 0)));
  update("notificationLeadMinutes", clamped);
}

function onTestNotification() {
  // sendTest fires a desktop push if it can, and falls back to an in-app
  // toast otherwise. Either way the user gets feedback.
  sendTest();
}

const notifStatusLabel = computed(() => {
  switch (notifPermission.value) {
    case "granted":
      return t("settings.notifications.statusGranted");
    case "denied":
      return t("settings.notifications.statusDenied");
    case "unsupported":
      return t("settings.notifications.statusUnsupported");
    default:
      return t("settings.notifications.statusDefault");
  }
});

const canRequestDesktop = computed(
  () =>
    notifPermission.value === "default" && settings.value.notificationsEnabled,
);

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

// Inline SVG icons for the theme picker.
const SunIcon: Component = () =>
  h(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      class: "w-5 h-5",
      "aria-hidden": "true",
    },
    [
      h("circle", { cx: "12", cy: "12", r: "4" }),
      h("path", {
        d: "M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41",
        "stroke-linecap": "round",
      }),
    ],
  );
const MoonIcon: Component = () =>
  h(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      class: "w-5 h-5",
      "aria-hidden": "true",
    },
    [
      h("path", {
        d: "M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z",
        "stroke-linejoin": "round",
      }),
    ],
  );
const SystemIcon: Component = () =>
  h(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      class: "w-5 h-5",
      "aria-hidden": "true",
    },
    [
      h("rect", { x: "2", y: "3", width: "20", height: "14", rx: "2" }),
      h("path", {
        d: "M8 21h8M12 17v4",
        "stroke-linecap": "round",
      }),
    ],
  );

const themeOptions = computed(() => [
  {
    value: "system" as const,
    label: t("settings.appearance.system"),
    icon: SystemIcon,
  },
  {
    value: "light" as const,
    label: t("settings.appearance.light"),
    icon: SunIcon,
  },
  {
    value: "dark" as const,
    label: t("settings.appearance.dark"),
    icon: MoonIcon,
  },
]);

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
      await Promise.all([fetchTasks(), fetchEpics()]);
      exportDataReady.value = true;
    } finally {
      exportDataLoading.value = false;
      exportDataInflight = null;
    }
  })();
  await exportDataInflight;
}

onMounted(() => {
  // Warm counts in the background after paint; export buttons still await.
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
  <div class="flex flex-col h-screen">
    <header
      class="px-4 md:px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between"
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

    <div class="flex-1 overflow-y-auto scrollbar-thin p-4 md:p-6">
      <div class="max-w-2xl mx-auto space-y-6">
        <section
          v-if="auth.user.value"
          class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm"
        >
          <header class="px-5 py-3 border-b border-slate-100">
            <h2 class="text-sm font-semibold text-slate-800">
              {{ $t("settings.account.title") }}
            </h2>
            <p class="text-[11px] text-slate-500">
              {{ $t("settings.account.subtitle") }}
            </p>
          </header>
          <div class="px-5 py-4 flex items-center gap-3">
            <UserAvatar
              :name="auth.user.value.name"
              :email="auth.user.value.email"
              :avatar-url="auth.user.value.avatarUrl"
              size="md"
            />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-slate-800 truncate">
                {{ auth.user.value.name || auth.user.value.email }}
              </p>
              <p class="text-[11px] text-slate-500 truncate">
                <template v-if="auth.user.value.title || auth.user.value.job">
                  <span v-if="auth.user.value.title">{{
                    auth.user.value.title
                  }}</span>
                  <span v-if="auth.user.value.title && auth.user.value.job">
                    ·
                  </span>
                  <span v-if="auth.user.value.job">{{
                    auth.user.value.job
                  }}</span>
                </template>
                <template v-else>
                  {{ auth.user.value.email }}
                </template>
              </p>
            </div>
            <NuxtLink
              to="/profile"
              class="text-xs font-medium text-brand-700 hover:text-brand-800 px-3 py-1.5 rounded-lg hover:bg-brand-50"
            >
              {{ $t("settings.account.editProfile") }}
            </NuxtLink>
            <button
              type="button"
              class="text-xs font-medium text-rose-600 hover:text-rose-700 px-3 py-1.5 rounded-lg hover:bg-rose-50"
              @click="onLogout"
            >
              {{ $t("settings.account.signOut") }}
            </button>
          </div>
          <div
            v-if="googleEnabled"
            class="px-5 pb-4 pt-0 border-t border-slate-100 space-y-2"
          >
            <p class="text-[11px] text-slate-500 pt-3">
              {{ $t("settings.account.googleHint") }}
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <p
                class="text-xs font-medium"
                :class="googleLinked ? 'text-emerald-700' : 'text-slate-600'"
              >
                {{
                  googleLinked
                    ? $t("settings.account.googleLinkedStatus")
                    : $t("settings.account.googleNotLinked")
                }}
              </p>
              <GoogleSignInButton
                v-if="!googleLinked"
                intent="link"
                redirect="/settings"
                :busy="googleBusy"
                class="!w-auto px-3"
                :label="$t('settings.account.linkGoogle')"
              />
              <button
                v-else
                type="button"
                class="text-xs font-medium text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                :disabled="googleBusy || !hasPassword"
                :title="
                  !hasPassword
                    ? $t('settings.account.googleUnlinkNeedPassword')
                    : undefined
                "
                @click="onUnlinkGoogle"
              >
                {{ $t("settings.account.unlinkGoogle") }}
              </button>
            </div>
            <p
              v-if="googleLinked && !hasPassword"
              class="text-[11px] text-amber-700"
            >
              {{ $t("settings.account.googleUnlinkNeedPassword") }}
            </p>
          </div>
        </section>

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
            <LanguageSwitcher variant="buttons" id="settings-language-label" />
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

        <!-- Appearance -->
        <section class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm">
          <header class="px-5 py-3 border-b border-slate-100">
            <h2 class="text-sm font-semibold text-slate-800">
              {{ $t("settings.appearance.title") }}
            </h2>
            <p class="text-[11px] text-slate-500">
              {{ $t("settings.appearance.subtitle") }}
            </p>
          </header>
          <div class="px-5 py-4">
            <div
              class="grid grid-cols-3 gap-2"
              role="radiogroup"
              :aria-label="$t('settings.appearance.themeAria')"
            >
              <button
                v-for="opt in themeOptions"
                :key="opt.value"
                type="button"
                role="radio"
                :aria-checked="settings.theme === opt.value"
                class="flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg ring-1 transition text-xs font-medium"
                :class="
                  settings.theme === opt.value
                    ? 'bg-brand-50 ring-brand-400 text-brand-800'
                    : 'bg-white ring-slate-200 text-slate-700 hover:bg-slate-50'
                "
                @click="update('theme', opt.value)"
              >
                <component :is="opt.icon" />
                <span>{{ opt.label }}</span>
              </button>
            </div>
            <p class="mt-3 text-[11px] text-slate-500">
              {{
                $t("settings.appearance.currentlyPainted", {
                  theme: effectiveTheme,
                })
              }}
              <template v-if="settings.theme === 'system'">
                {{ $t("settings.appearance.followingOs") }}
              </template>
            </p>

            <div class="mt-5 pt-4 border-t border-slate-100">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-sm font-medium text-slate-800">
                    {{ $t("settings.appearance.density") }}
                  </p>
                  <p class="text-[11px] text-slate-500">
                    {{ $t("settings.appearance.densityHint") }}
                  </p>
                </div>
                <div
                  class="inline-flex rounded-lg ring-1 ring-slate-200 overflow-hidden shrink-0"
                >
                  <button
                    v-for="opt in ['comfortable', 'compact'] as const"
                    :key="opt"
                    type="button"
                    class="px-3 py-1.5 text-xs font-medium transition"
                    :class="
                      settings.density === opt
                        ? 'bg-brand-600 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    "
                    @click="update('density', opt)"
                  >
                    {{
                      opt === "comfortable"
                        ? $t("settings.appearance.comfortable")
                        : $t("settings.appearance.compact")
                    }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

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

        <!-- Notifications -->
        <section class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm">
          <header class="px-5 py-3 border-b border-slate-100">
            <h2 class="text-sm font-semibold text-slate-800">
              {{ $t("settings.notifications.title") }}
            </h2>
            <p class="text-[11px] text-slate-500">
              {{
                $t("settings.notifications.subtitle", {
                  count: settings.notificationLeadMinutes,
                  unit:
                    settings.notificationLeadMinutes === 1
                      ? $t("settings.notifications.minute")
                      : $t("settings.notifications.minutes"),
                })
              }}
            </p>
          </header>

          <div class="px-5 py-4 space-y-5">
            <div class="flex items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="text-sm font-medium text-slate-800">
                  {{ $t("settings.notifications.toggleLabel") }}
                </p>
                <p class="text-[11px] text-slate-500">
                  {{
                    $t("settings.notifications.desktopPopups", {
                      status: notifStatusLabel,
                    })
                  }}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                :aria-checked="settings.notificationsEnabled"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition shrink-0"
                :class="
                  settings.notificationsEnabled
                    ? 'bg-brand-600'
                    : 'bg-slate-300'
                "
                @click="toggleNotifications"
              >
                <span
                  class="inline-block h-5 w-5 transform rounded-full bg-white transition shadow"
                  :class="
                    settings.notificationsEnabled
                      ? 'translate-x-5'
                      : 'translate-x-0.5'
                  "
                />
              </button>
            </div>

            <div
              class="grid grid-cols-1 sm:grid-cols-2 gap-4"
              :class="
                settings.notificationsEnabled
                  ? ''
                  : 'opacity-50 pointer-events-none'
              "
            >
              <div>
                <label
                  for="notif-lead"
                  class="block text-xs font-medium text-slate-600 mb-1"
                >
                  {{ $t("settings.notifications.leadTime") }}
                </label>
                <input
                  id="notif-lead"
                  type="number"
                  min="0"
                  max="60"
                  step="1"
                  :value="settings.notificationLeadMinutes"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
                  @input="
                    updateLeadMinutes(
                      Number(($event.target as HTMLInputElement).value),
                    )
                  "
                />
                <p class="mt-1 text-[11px] text-slate-500">
                  {{ $t("settings.notifications.leadHint") }}
                </p>
              </div>
              <div class="flex items-end gap-2 flex-wrap">
                <button
                  type="button"
                  class="px-3 py-2 rounded-lg text-xs font-medium bg-white ring-1 ring-slate-300 text-slate-700 hover:bg-slate-50 transition"
                  @click="onTestNotification"
                >
                  {{
                    canFireNotifications()
                      ? $t("settings.notifications.sendTestNotification")
                      : $t("settings.notifications.sendTestToast")
                  }}
                </button>
                <button
                  v-if="canRequestDesktop"
                  type="button"
                  class="px-3 py-2 rounded-lg text-xs font-medium bg-brand-600 hover:bg-brand-700 text-white transition"
                  @click="requestDesktopPermission"
                >
                  {{ $t("settings.notifications.enableDesktop") }}
                </button>
              </div>
            </div>

            <div
              v-if="
                notifPermission === 'denied' && settings.notificationsEnabled
              "
              class="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 leading-relaxed"
            >
              {{ $t("settings.notifications.deniedBanner") }}
            </div>
          </div>
        </section>

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
        <section
          v-if="auth.user.value"
          class="bg-white ring-1 ring-rose-200 rounded-xl shadow-sm"
        >
          <header class="px-5 py-3 border-b border-rose-100">
            <h2 class="text-sm font-semibold text-rose-700">
              {{ $t("settings.danger.title") }}
            </h2>
            <p class="text-[11px] text-slate-500">
              {{ $t("settings.danger.subtitle") }}
            </p>
          </header>
          <div class="px-5 py-4 space-y-3">
            <p class="text-xs text-slate-600 leading-relaxed">
              {{ $t("settings.danger.body") }}
            </p>
            <p class="text-[11px] text-slate-500">
              {{ $t("settings.danger.exportFirst") }}
            </p>
            <p
              v-if="auth.isSuperAdmin.value"
              class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800"
            >
              {{ $t("settings.danger.superadminBlocked") }}
            </p>
            <button
              v-else
              type="button"
              class="px-3 py-2 rounded-lg text-xs font-semibold text-rose-700 ring-1 ring-rose-300 hover:bg-rose-50 transition"
              @click="openDeleteAccount"
            >
              {{ $t("settings.danger.openButton") }}
            </button>
          </div>
        </section>

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
            <NuxtLink to="/tasks" class="ml-1 text-brand-700 hover:underline">{{
              $t("settings.print.dashboardLink")
            }}</NuxtLink>
          </div>
        </section>
      </div>
    </div>

    <DeleteAccountModal
      :open="deleteOpen"
      :account-email="auth.user.value?.email ?? ''"
      :requires-password="hasPassword"
      :busy="deleteBusy"
      :error="deleteError"
      @cancel="deleteOpen = false"
      @confirm="onDeleteAccount"
    />
  </div>
</template>
