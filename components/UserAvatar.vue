<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
    size?: "sm" | "md" | "lg";
  }>(),
  { size: "md" },
);

const initial = computed(() => {
  const src = (props.name || props.email || "").trim();
  return src.charAt(0).toUpperCase() || "?";
});

const sizeClass = computed(() => {
  switch (props.size) {
    case "sm":
      return "h-7 w-7 text-[10px]";
    case "lg":
      return "h-14 w-14 text-lg";
    default:
      return "h-8 w-8 text-xs";
  }
});
</script>

<template>
  <span
    class="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 font-semibold text-slate-700"
    :class="sizeClass"
    aria-hidden="true"
  >
    <img
      v-if="avatarUrl"
      :src="avatarUrl"
      alt=""
      class="h-full w-full object-cover"
    />
    <template v-else>{{ initial }}</template>
  </span>
</template>
