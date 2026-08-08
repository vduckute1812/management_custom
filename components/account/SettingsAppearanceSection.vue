<script setup lang="ts">
import { type Component, h } from "vue";

const { t } = useI18n();
const { settings, update, effectiveTheme } = useSettings();

const SunIcon: Component = () =>
  h(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      class: "h-5 w-5",
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
      class: "h-5 w-5",
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
      class: "h-5 w-5",
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
</script>

<template>
  <section class="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
    <header class="border-b border-slate-100 px-5 py-3">
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
          class="flex flex-col items-center gap-1.5 rounded-lg px-3 py-3 text-xs font-medium ring-1 transition"
          :class="
            settings.theme === opt.value
              ? 'bg-brand-50 text-brand-800 ring-brand-400'
              : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
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

      <div class="mt-5 border-t border-slate-100 pt-4">
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
            class="inline-flex shrink-0 overflow-hidden rounded-lg ring-1 ring-slate-200"
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
              :aria-pressed="settings.density === opt"
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
</template>
