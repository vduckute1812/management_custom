<script setup lang="ts">
defineProps<{
  exportDisabled: boolean;
}>();

defineEmits<{
  exportCsv: [];
  exportJson: [];
  create: [];
}>();
</script>

<template>
  <header
    class="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white/80 px-4 py-4 backdrop-blur-md md:px-6"
  >
    <div>
      <p
        class="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600"
      >
        {{ $t("nav.sectionMoney") }}
      </p>
      <h1 class="mt-0.5 text-xl font-semibold tracking-tight text-slate-900">
        {{ $t("money.savings.title") }}
      </h1>
      <p class="mt-0.5 text-xs text-slate-500">
        {{ $t("money.savings.subtitle") }}
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <MoneyExportMenu
        :disabled="exportDisabled"
        @csv="$emit('exportCsv')"
        @json="$emit('exportJson')"
      />
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-brand-600/20 transition hover:bg-brand-700"
        @click="$emit('create')"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="h-3.5 w-3.5"
        >
          <path d="M12 5v14M5 12h14" stroke-linecap="round" />
        </svg>
        {{ $t("money.savings.addGoal") }}
      </button>
    </div>
  </header>
</template>
