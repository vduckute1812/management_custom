<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    illustration?: "calendar" | "layers" | "chart" | "spark";
    primaryLabel?: string;
    primaryShortcut?: string;
    secondaryLabel?: string;
    secondaryLoading?: boolean;
  }>(),
  { illustration: "spark" }
);

const emit = defineEmits<{
  (e: "primary"): void;
  (e: "secondary"): void;
}>();
</script>

<template>
  <div
    class="rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-12 text-center max-w-lg mx-auto"
  >
    <div class="mx-auto w-16 h-16 mb-4 rounded-2xl bg-brand-50 flex items-center justify-center text-brand-500">
      <svg
        v-if="props.illustration === 'calendar'"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        class="w-9 h-9"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="8" y1="14" x2="10" y2="14" />
        <line x1="14" y1="14" x2="16" y2="14" />
      </svg>
      <svg
        v-else-if="props.illustration === 'layers'"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        class="w-9 h-9"
        aria-hidden="true"
      >
        <polygon points="12 2 2 7 12 12 22 7 12 2" stroke-linejoin="round" />
        <polyline points="2 17 12 22 22 17" stroke-linejoin="round" />
        <polyline points="2 12 12 17 22 12" stroke-linejoin="round" />
      </svg>
      <svg
        v-else-if="props.illustration === 'chart'"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        class="w-9 h-9"
        aria-hidden="true"
      >
        <path d="M3 3v18h18" stroke-linecap="round" />
        <path d="M7 14l4-4 4 4 5-7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <svg
        v-else
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        class="w-9 h-9"
        aria-hidden="true"
      >
        <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
      </svg>
    </div>

    <h3 class="text-base font-semibold text-slate-900">{{ props.title }}</h3>
    <p
      v-if="props.description"
      class="mt-1 text-sm text-slate-500 max-w-sm mx-auto"
    >
      {{ props.description }}
    </p>

    <div
      v-if="props.primaryLabel || props.secondaryLabel"
      class="mt-5 flex items-center justify-center gap-2 flex-wrap"
    >
      <button
        v-if="props.primaryLabel"
        type="button"
        class="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white shadow-sm"
        @click="emit('primary')"
      >
        {{ props.primaryLabel }}
        <kbd
          v-if="props.primaryShortcut"
          class="px-1.5 py-0.5 bg-white/20 rounded text-[10px] font-mono"
        >
          {{ props.primaryShortcut }}
        </kbd>
      </button>
      <button
        v-if="props.secondaryLabel"
        type="button"
        :disabled="props.secondaryLoading"
        class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 ring-1 ring-slate-200 disabled:opacity-60"
        @click="emit('secondary')"
      >
        <svg
          v-if="props.secondaryLoading"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="w-3.5 h-3.5 animate-spin"
        >
          <path d="M21 12a9 9 0 11-6.21-8.56" stroke-linecap="round" />
        </svg>
        {{ props.secondaryLabel }}
      </button>
    </div>
  </div>
</template>
