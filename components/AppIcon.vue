<script setup lang="ts">
export type AppIconName =
  "calendar" | "layers" | "chart" | "cog" | "shield" | "feed" | "user";

const props = withDefaults(
  defineProps<{
    name: AppIconName;
    class?: string;
  }>(),
  {
    class: "w-4 h-4",
  },
);
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    :class="props.class"
    aria-hidden="true"
  >
    <template v-if="name === 'calendar'">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </template>
    <template v-else-if="name === 'layers'">
      <polygon points="12 2 2 7 12 12 22 7 12 2" stroke-linejoin="round" />
      <polyline points="2 17 12 22 22 17" stroke-linejoin="round" />
      <polyline points="2 12 12 17 22 12" stroke-linejoin="round" />
    </template>
    <template v-else-if="name === 'cog'">
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 005.6 15a1.65 1.65 0 00-1.51-1H4a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H10a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V10a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
      />
    </template>
    <template v-else-if="name === 'shield'">
      <path
        d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"
        stroke-linejoin="round"
      />
    </template>
    <template v-else-if="name === 'feed'">
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" stroke-linejoin="round" />
      <polyline points="16 6 12 2 8 6" stroke-linejoin="round" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </template>
    <template v-else-if="name === 'user'">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </template>
    <template v-else-if="name === 'chart'">
      <path d="M3 3v18h18" stroke-linecap="round" />
      <path
        d="M7 14l4-4 4 4 5-7"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </template>
  </svg>
</template>
