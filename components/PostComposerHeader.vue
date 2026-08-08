<script setup lang="ts">
defineProps<{
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  userLabel: string;
  visibilityLabel: string;
}>();
</script>

<template>
  <div
    class="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5"
  >
    <UserAvatar :name="name" :email="email" :avatar-url="avatarUrl" size="md" />
    <div class="min-w-0">
      <p class="truncate text-sm font-semibold text-slate-900">
        {{ userLabel }}
      </p>
      <p class="text-[11px] text-slate-400">
        {{ visibilityLabel }}
      </p>
    </div>
    <NuxtLink
      to="/feed/write"
      class="ml-auto inline-flex items-center gap-1.5 rounded-full feed-manuscript-chip px-2.5 py-1 text-[10px] font-semibold transition"
    >
      {{ $t("manuscript.openStudioChip") }}
    </NuxtLink>
  </div>
</template>
