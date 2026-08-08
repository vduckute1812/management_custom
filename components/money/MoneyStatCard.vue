<script setup lang="ts">
defineProps<{
  label: string;
  value: string;
  tone?: "neutral" | "in" | "out" | "warn";
}>();
</script>

<template>
  <div
    class="px-1 py-2 sm:px-2"
    :class="{
      'border-l-2 border-slate-300 pl-3': !tone || tone === 'neutral',
      'border-l-2 border-emerald-500 pl-3': tone === 'in',
      'border-l-2 border-rose-500 pl-3': tone === 'out',
      'border-l-2 border-amber-500 pl-3': tone === 'warn',
    }"
  >
    <p
      class="text-[11px] font-semibold uppercase tracking-[0.08em]"
      :class="{
        'text-slate-500': !tone || tone === 'neutral',
        'text-emerald-700/80': tone === 'in',
        'text-rose-700/80': tone === 'out',
        'text-amber-800/80': tone === 'warn',
      }"
    >
      {{ label }}
    </p>
    <p
      class="mt-1 text-lg font-semibold tabular-nums tracking-tight sm:text-xl"
      :class="{
        'text-slate-900': !tone || tone === 'neutral',
        'text-emerald-900': tone === 'in',
        'text-rose-900': tone === 'out',
        'text-amber-950': tone === 'warn',
      }"
    >
      {{ value }}
    </p>
  </div>
</template>
