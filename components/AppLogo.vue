<script setup lang="ts">
withDefaults(
  defineProps<{
    /** Tailwind size classes for the mark, e.g. `h-8 w-8`. */
    sizeClass?: string;
    /**
     * Soften the image box. Prefer `rounded-none` for the hex seal so the
     * transparent corners stay unclipped; auth screens may still pass
     * `rounded-xl` for a softer tile.
     */
    roundedClass?: string;
    /**
     * When true (default), the image is decorative — a nearby text label
     * already names the brand. When false, exposes `nav.brand` as alt text.
     */
    decorative?: boolean;
  }>(),
  {
    sizeClass: "h-8 w-8",
    roundedClass: "rounded-none",
    decorative: true,
  },
);

const { t } = useI18n();
</script>

<template>
  <img
    src="/logo.png"
    width="64"
    height="64"
    decoding="async"
    :alt="decorative ? '' : t('nav.brand')"
    :aria-hidden="decorative ? 'true' : undefined"
    :class="[sizeClass, roundedClass, 'shrink-0']"
  />
</template>
