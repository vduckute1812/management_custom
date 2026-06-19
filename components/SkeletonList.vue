<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    /** Number of skeleton rows. */
    rows?: number;
    /** Variant. `row` = single-line list, `card` = card grid item. */
    variant?: "row" | "card" | "calendarDay";
  }>(),
  { rows: 4, variant: "row" }
);
</script>

<template>
  <div
    v-if="props.variant === 'row'"
    class="divide-y divide-slate-100"
    role="status"
    aria-label="Loading content"
  >
    <div
      v-for="n in props.rows"
      :key="n"
      class="px-4 py-4 flex items-start justify-between gap-3"
    >
      <div class="flex-1 space-y-2">
        <SkeletonBlock width="w-3/4" height="h-3.5" />
        <SkeletonBlock width="w-1/2" height="h-2.5" />
      </div>
      <SkeletonBlock width="w-12" height="h-4" rounded="rounded-full" />
    </div>
  </div>

  <div
    v-else-if="props.variant === 'card'"
    class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
    role="status"
    aria-label="Loading content"
  >
    <div
      v-for="n in props.rows"
      :key="n"
      class="bg-white ring-1 ring-slate-200 rounded-xl p-4 space-y-3"
    >
      <div class="flex items-center justify-between">
        <SkeletonBlock width="w-2/3" height="h-4" />
        <SkeletonBlock width="w-12" height="h-4" rounded="rounded-full" />
      </div>
      <SkeletonBlock width="w-full" height="h-2.5" />
      <SkeletonBlock width="w-1/2" height="h-2.5" />
      <SkeletonBlock width="w-full" height="h-1.5" rounded="rounded-full" />
    </div>
  </div>

  <div
    v-else-if="props.variant === 'calendarDay'"
    class="p-4 space-y-3"
    role="status"
    aria-label="Loading calendar"
  >
    <SkeletonBlock width="w-32" height="h-6" />
    <div class="space-y-2">
      <SkeletonBlock
        v-for="n in props.rows"
        :key="n"
        width="w-full"
        height="h-10"
        rounded="rounded-lg"
      />
    </div>
  </div>
</template>
