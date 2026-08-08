<script setup lang="ts">
defineProps<{
  filteredCount: number;
  totalCount: number;
}>();
</script>

<template>
  <div
    class="px-3 py-2 border-t border-slate-100 flex items-center gap-3 text-[11px] text-slate-400"
  >
    <span>
      <kbd class="px-1 bg-slate-100 rounded text-slate-600 font-mono">↑↓</kbd>
      {{ $t("commandPalette.navigate") }}
    </span>
    <span>
      <kbd class="px-1 bg-slate-100 rounded text-slate-600 font-mono">↵</kbd>
      {{ $t("commandPalette.open") }}
    </span>
    <span class="ml-auto">
      {{
        $t("commandPalette.countOf", {
          filtered: filteredCount,
          total: totalCount,
        })
      }}
    </span>
  </div>
</template>
