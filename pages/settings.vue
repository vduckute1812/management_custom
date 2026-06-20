<script setup lang="ts">
import { h, type Component } from "vue";

const { settings, update, effectiveTheme } = useSettings();
const { exportJSON, exportCSV, exportEpicsCSV, exportICS } = useExport();
const { fetchAll: fetchTasks, tasks } = useTasks();
const { fetchAll: fetchEpics, epics } = useEpics();
const { pushToast } = useToasts();
const {
  permission: notifPermission,
  hydratePermission,
  requestPermission,
  sendTest,
  canFire: canFireNotifications,
} = useNotifications();

if (import.meta.client) {
  hydratePermission();
}

async function toggleNotifications() {
  const next = !settings.value.notificationsEnabled;
  update("notificationsEnabled", next);
  if (!next) return;

  // In-app toasts always work — flipping the switch is enough. Then
  // opportunistically ask for OS-notification permission as an upgrade.
  pushToast("Pre-task alerts on", { tone: "success", duration: 1800 });
  const result = await requestPermission();
  if (result === "denied") {
    pushToast(
      "Browser blocked desktop notifications — you'll still see in-app alerts.",
      { tone: "info", duration: 4500 }
    );
  } else if (result === "unsupported") {
    pushToast(
      "Desktop notifications aren't supported in this browser — in-app alerts will fire instead.",
      { tone: "info", duration: 4500 }
    );
  }
}

async function requestDesktopPermission() {
  const result = await requestPermission();
  if (result === "granted") {
    pushToast("Desktop notifications enabled", { tone: "success", duration: 1800 });
  } else if (result === "denied") {
    pushToast(
      "Permission denied — re-allow in your browser's site settings.",
      { tone: "danger", duration: 4500 }
    );
  } else if (result === "unsupported") {
    pushToast("This browser doesn't support desktop notifications.", {
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
      return "Granted — desktop pop-ups will fire too";
    case "denied":
      return "Denied — in-app toasts still fire; re-allow in site settings for desktop pop-ups";
    case "unsupported":
      return "Desktop pop-ups unsupported in this browser — in-app toasts still fire";
    default:
      return "Not requested yet — in-app toasts will fire; tap below to enable desktop pop-ups too";
  }
});

const canRequestDesktop = computed(
  () =>
    notifPermission.value === "default" &&
    settings.value.notificationsEnabled
);

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
    ]
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
    ]
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
    ]
  );

const themeOptions = [
  { value: "system" as const, label: "System", icon: SystemIcon },
  { value: "light" as const, label: "Light", icon: SunIcon },
  { value: "dark" as const, label: "Dark", icon: MoonIcon },
];

// Make sure the export has fresh data even if the user came here cold.
await useAsyncData("settings:hydrate", async () => {
  await Promise.all([fetchTasks(), fetchEpics()]);
  return { ok: true };
});

function announce(message: string) {
  pushToast(message, { tone: "success", duration: 2200 });
}

function doExportJSON() {
  exportJSON();
  announce("Downloaded JSON");
}

function doExportCSV() {
  exportCSV();
  announce("Downloaded tasks CSV");
}

function doExportEpics() {
  exportEpicsCSV();
  announce("Downloaded epics CSV");
}

function doExportICS() {
  exportICS();
  announce("Downloaded iCal feed");
}
</script>

<template>
  <div class="flex flex-col h-screen">
    <header
      class="px-4 md:px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between"
    >
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Settings</h1>
        <p class="text-xs text-slate-500 mt-0.5">
          Preferences are saved on this device only.
        </p>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto scrollbar-thin p-4 md:p-6">
      <div class="max-w-2xl mx-auto space-y-6">
        <!-- Appearance -->
        <section class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm">
          <header class="px-5 py-3 border-b border-slate-100">
            <h2 class="text-sm font-semibold text-slate-800">Appearance</h2>
            <p class="text-[11px] text-slate-500">
              Light, dark, or follow your operating system.
            </p>
          </header>
          <div class="px-5 py-4">
            <div
              class="grid grid-cols-3 gap-2"
              role="radiogroup"
              aria-label="Theme"
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
              Currently painted: <strong>{{ effectiveTheme }}</strong>
              <template v-if="settings.theme === 'system'">
                · following your OS preference
              </template>
            </p>

            <div class="mt-5 pt-4 border-t border-slate-100">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-sm font-medium text-slate-800">Density</p>
                  <p class="text-[11px] text-slate-500">
                    Compact shrinks padding by ~25% so more fits per screen.
                    Font sizes stay the same.
                  </p>
                </div>
                <div
                  class="inline-flex rounded-lg ring-1 ring-slate-200 overflow-hidden shrink-0"
                >
                  <button
                    v-for="opt in (['comfortable', 'compact'] as const)"
                    :key="opt"
                    type="button"
                    class="px-3 py-1.5 text-xs font-medium capitalize transition"
                    :class="
                      settings.density === opt
                        ? 'bg-brand-600 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    "
                    @click="update('density', opt)"
                  >
                    {{ opt }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Calendar preferences -->
        <section class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm">
          <header class="px-5 py-3 border-b border-slate-100">
            <h2 class="text-sm font-semibold text-slate-800">Calendar</h2>
            <p class="text-[11px] text-slate-500">
              Used by the weekly and monthly views.
            </p>
          </header>

          <div class="px-5 py-4 space-y-5">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-slate-800">Week starts on</p>
                <p class="text-[11px] text-slate-500">
                  Shifts column order on the weekly grid and the first row of the monthly grid.
                </p>
              </div>
              <div class="inline-flex rounded-lg ring-1 ring-slate-200 overflow-hidden shrink-0">
                <button
                  v-for="opt in (['sun', 'mon'] as const)"
                  :key="opt"
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium capitalize transition"
                  :class="
                    settings.weekStart === opt
                      ? 'bg-brand-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  "
                  @click="update('weekStart', opt)"
                >
                  {{ opt === "sun" ? "Sunday" : "Monday" }}
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-slate-800">Time format</p>
                <p class="text-[11px] text-slate-500">
                  Affects time labels in calendars and the "Up next" sidebar.
                </p>
              </div>
              <div class="inline-flex rounded-lg ring-1 ring-slate-200 overflow-hidden shrink-0">
                <button
                  v-for="opt in (['24h', '12h'] as const)"
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
                  {{ opt === "24h" ? "24-hour" : "12-hour" }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Notifications -->
        <section class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm">
          <header class="px-5 py-3 border-b border-slate-100">
            <h2 class="text-sm font-semibold text-slate-800">Pre-task alerts</h2>
            <p class="text-[11px] text-slate-500">
              In-app toasts always work. Granting browser permission adds
              desktop pop-ups too — both fire <strong>{{ settings.notificationLeadMinutes }}
              {{ settings.notificationLeadMinutes === 1 ? "minute" : "minutes" }}</strong>
              before each scheduled block. Local-only — nothing leaves your machine.
            </p>
          </header>

          <div class="px-5 py-4 space-y-5">
            <div class="flex items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="text-sm font-medium text-slate-800">
                  Notify me before scheduled blocks
                </p>
                <p class="text-[11px] text-slate-500">
                  Desktop pop-ups: <strong>{{ notifStatusLabel }}</strong>
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
                  Lead time (minutes)
                </label>
                <input
                  id="notif-lead"
                  type="number"
                  min="0"
                  max="60"
                  step="1"
                  :value="settings.notificationLeadMinutes"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
                  @input="updateLeadMinutes(Number(($event.target as HTMLInputElement).value))"
                />
                <p class="mt-1 text-[11px] text-slate-500">
                  Fire this many minutes before each block. Defaults to 5;
                  set 0 to alert at the start instead.
                </p>
              </div>
              <div class="flex items-end gap-2 flex-wrap">
                <button
                  type="button"
                  class="px-3 py-2 rounded-lg text-xs font-medium bg-white ring-1 ring-slate-300 text-slate-700 hover:bg-slate-50 transition"
                  @click="onTestNotification"
                >
                  Send test {{ canFireNotifications() ? "notification" : "toast" }}
                </button>
                <button
                  v-if="canRequestDesktop"
                  type="button"
                  class="px-3 py-2 rounded-lg text-xs font-medium bg-brand-600 hover:bg-brand-700 text-white transition"
                  @click="requestDesktopPermission"
                >
                  Enable desktop pop-ups
                </button>
              </div>
            </div>

            <div
              v-if="
                notifPermission === 'denied' && settings.notificationsEnabled
              "
              class="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 leading-relaxed"
            >
              Your browser is blocking desktop pop-ups for this site. In-app
              toasts will keep firing — re-allow notifications in your site
              permissions if you want OS-level pop-ups too.
            </div>
          </div>
        </section>

        <!-- Data ownership -->
        <section class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm">
          <header class="px-5 py-3 border-b border-slate-100">
            <h2 class="text-sm font-semibold text-slate-800">Your data</h2>
            <p class="text-[11px] text-slate-500">
              {{ epics.length }} epic{{ epics.length === 1 ? "" : "s" }} ·
              {{ tasks.length }} task{{ tasks.length === 1 ? "" : "s" }}
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
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                JSON snapshot
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
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                Tasks CSV
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
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                Epics CSV
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
                Calendar (.ics)
              </button>
            </div>

            <details class="text-xs">
              <summary class="cursor-pointer text-slate-600 hover:text-slate-800 select-none">
                Export format reference
              </summary>
              <ul class="mt-2 pl-5 list-disc text-slate-500 space-y-1">
                <li>
                  <strong>JSON</strong> mirrors the API shape, including derived
                  fields (<code>spentHours</code>,
                  <code>estimatedHours</code>, <code>progress</code>).
                </li>
                <li>
                  <strong>Tasks CSV</strong> is one row per <em>time block</em> —
                  tasks with multiple sessions get multiple rows. Tags are
                  pipe-separated.
                </li>
                <li>
                  <strong>Epics CSV</strong> is one row per epic with rolled-up
                  totals.
                </li>
                <li>
                  <strong>Calendar (.ics)</strong> emits one
                  <code>VEVENT</code> per scheduled time block and one
                  <code>VTODO</code> per task with a due date — drop the file
                  into Apple Calendar, Google Calendar, or Outlook for a
                  read-only mirror.
                </li>
              </ul>
            </details>
          </div>
        </section>

        <!-- Print -->
        <section class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm">
          <header class="px-5 py-3 border-b border-slate-100">
            <h2 class="text-sm font-semibold text-slate-800">Print</h2>
            <p class="text-[11px] text-slate-500">
              The dashboard has a print stylesheet for a clean weekly agenda.
            </p>
          </header>
          <div class="px-5 py-4 text-xs text-slate-600 leading-relaxed">
            Open the
            <NuxtLink to="/" class="text-brand-700 hover:underline">
              dashboard
            </NuxtLink>
            in weekly view, then press
            <kbd class="px-1.5 py-0.5 bg-slate-100 rounded font-mono">⌘</kbd>
            <kbd class="px-1.5 py-0.5 bg-slate-100 rounded font-mono ml-1">P</kbd>
            to preview the agenda. Sidebar, navigation, and color-coded
            backgrounds are stripped automatically.
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
