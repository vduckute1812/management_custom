<script setup lang="ts">
const { t } = useI18n();
const { settings, update } = useSettings();
const {
  permission: notifPermission,
  hydratePermission,
  requestPermission,
  sendTest,
  canFire: canFireNotifications,
} = useNotifications();
const { pushToast } = useToasts();

if (import.meta.client) {
  hydratePermission();
}

async function toggleNotifications() {
  const next = !settings.value.notificationsEnabled;
  update("notificationsEnabled", next);
  if (!next) return;

  // In-app toasts always work; desktop permission is an optional upgrade.
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
  // sendTest fires a desktop push if it can, and falls back to an in-app toast.
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
</script>

<template>
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
            settings.notificationsEnabled ? 'bg-brand-600' : 'bg-slate-300'
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
          settings.notificationsEnabled ? '' : 'opacity-50 pointer-events-none'
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
        v-if="notifPermission === 'denied' && settings.notificationsEnabled"
        class="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 leading-relaxed"
      >
        {{ $t("settings.notifications.deniedBanner") }}
      </div>
    </div>
  </section>
</template>
