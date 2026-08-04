<script setup lang="ts">
defineProps<{
  label: string;
  prevLabel: string;
  nextLabel: string;
  /** Accessible name for the center control (defaults to visible `label`). */
  currentLabel?: string;
}>();

const emit = defineEmits<{
  prev: [];
  next: [];
  current: [];
}>();
</script>

<template>
  <div
    class="inline-flex items-center gap-1 rounded-xl bg-white/80 p-1 shadow-sm ring-1 ring-slate-200/80 backdrop-blur"
  >
    <button
      type="button"
      class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      :aria-label="prevLabel"
      @click="emit('prev')"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="h-4 w-4"
        aria-hidden="true"
      >
        <path
          d="M15 18l-6-6 6-6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
    <button
      type="button"
      class="min-w-[10.5rem] rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
      :aria-label="currentLabel || label"
      @click="emit('current')"
    >
      {{ label }}
    </button>
    <button
      type="button"
      class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      :aria-label="nextLabel"
      @click="emit('next')"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="h-4 w-4"
        aria-hidden="true"
      >
        <path
          d="M9 18l6-6-6-6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </div>
</template>
