<script setup lang="ts">
defineProps<{
  label: string;
  value: string;
  tone?: "neutral" | "in" | "out" | "warn";
}>();
</script>

<template>
  <div
    class="relative overflow-hidden rounded-2xl px-4 py-3.5 ring-1"
    :class="{
      'bg-gradient-to-br from-slate-50 to-white ring-slate-200/80':
        !tone || tone === 'neutral',
      'bg-gradient-to-br from-emerald-50 to-white ring-emerald-100':
        tone === 'in',
      'bg-gradient-to-br from-rose-50 to-white ring-rose-100': tone === 'out',
      'bg-gradient-to-br from-amber-50 to-white ring-amber-100':
        tone === 'warn',
    }"
  >
    <div
      class="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-40 blur-2xl"
      :class="{
        'bg-slate-300': !tone || tone === 'neutral',
        'bg-emerald-300': tone === 'in',
        'bg-rose-300': tone === 'out',
        'bg-amber-300': tone === 'warn',
      }"
      aria-hidden="true"
    />
    <p
      class="relative text-[11px] font-semibold uppercase tracking-[0.08em]"
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
      class="relative mt-1.5 text-lg font-semibold tabular-nums tracking-tight sm:text-xl"
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
