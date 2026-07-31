<script setup lang="ts">
import type { AppLocale } from "~/types/locale";

const props = withDefaults(
  defineProps<{
    /** compact = native select for menus; buttons = settings grid */
    variant?: "select" | "buttons";
    id?: string;
  }>(),
  { variant: "select" },
);

const { locales, locale } = useI18n();
const { update } = useSettings();

const options = computed(() =>
  locales.value.map((l) =>
    typeof l === "string"
      ? { code: l, name: l }
      : { code: l.code, name: l.name ?? l.code },
  ),
);

function onSelect(code: string) {
  update("locale", code as AppLocale);
}

function onSelectChange(e: Event) {
  const value = (e.target as HTMLSelectElement).value;
  onSelect(value);
}
</script>

<template>
  <div
    v-if="variant === 'buttons'"
    class="flex flex-wrap gap-2"
    role="group"
    :aria-labelledby="id"
  >
    <button
      v-for="opt in options"
      :key="opt.code"
      type="button"
      class="rounded-lg border px-3 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      :class="
        locale === opt.code
          ? 'border-brand-500 bg-brand-50 text-brand-800'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      "
      :aria-pressed="locale === opt.code"
      @click="onSelect(opt.code)"
    >
      {{ opt.name }}
    </button>
  </div>
  <label v-else class="inline-flex items-center gap-2 text-sm text-slate-700">
    <span class="sr-only">{{ $t("nav.language") }}</span>
    <select
      :id="id"
      class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      :value="locale"
      :aria-label="$t('nav.language')"
      @change="onSelectChange"
    >
      <option v-for="opt in options" :key="opt.code" :value="opt.code">
        {{ opt.name }}
      </option>
    </select>
  </label>
</template>
