<script setup lang="ts">
withDefaults(
  defineProps<{
    /** Tailwind size classes for the mark, e.g. `h-8 w-8`. */
    sizeClass?: string;
    /** Soften the outer radius to match surrounding chrome. */
    roundedClass?: string;
    /**
     * When true (default), the image is decorative — a nearby text label
     * already names the brand. When false, exposes `nav.brand` as alt text.
     */
    decorative?: boolean;
  }>(),
  {
    sizeClass: "h-8 w-8",
    roundedClass: "rounded-lg",
    decorative: true,
  },
);

const { t } = useI18n();
</script>

<template>
  <img
    src="/logo.svg"
    width="64"
    height="64"
    decoding="async"
    :alt="decorative ? '' : t('nav.brand')"
    :aria-hidden="decorative ? 'true' : undefined"
    :class="[sizeClass, roundedClass, 'shrink-0 shadow-sm']"
  />
</template>
