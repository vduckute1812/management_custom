<script setup lang="ts">
const { settings, update } = useSettings();
</script>

<template>
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
</template>
