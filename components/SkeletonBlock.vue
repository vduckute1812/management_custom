<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    /** Tailwind width class, e.g. 'w-24' or 'w-full'. */
    width?: string;
    /** Tailwind height class, e.g. 'h-3' or 'h-32'. */
    height?: string;
    /** Tailwind rounding class. */
    rounded?: string;
  }>(),
  {
    width: "w-full",
    height: "h-3",
    rounded: "rounded",
  }
);
</script>

<template>
  <div
    class="skeleton"
    :class="[props.width, props.height, props.rounded]"
    aria-hidden="true"
  />
</template>
