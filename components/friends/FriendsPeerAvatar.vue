<script setup lang="ts">
const { mediaUrl } = useMediaUrl();

const props = withDefaults(
  defineProps<{
    avatarUrl?: string | null;
    name?: string | null;
    email?: string | null;
    tone?: "brand" | "slate";
  }>(),
  {
    avatarUrl: null,
    name: null,
    email: null,
    tone: "brand",
  },
);

const initial = computed(() => {
  const label = props.name || props.email || "";
  return label.trim().charAt(0).toUpperCase() || "?";
});

const toneClass = computed(() =>
  props.tone === "slate" ? "bg-slate-500" : "bg-brand-600",
);
</script>

<template>
  <div
    class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-white"
    :class="toneClass"
  >
    <img
      v-if="avatarUrl"
      :src="mediaUrl(avatarUrl)"
      alt=""
      class="h-full w-full object-cover"
      loading="lazy"
      decoding="async"
    />
    <span v-else>{{ initial }}</span>
  </div>
</template>
