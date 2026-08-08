<script setup lang="ts">
import type { FriendshipRow } from "~/types/friendship";

defineProps<{
  friends: FriendshipRow[];
  loading: boolean;
  busyId: string | null;
  friendsNextCursor: string | null;
  loadingMoreFriends: boolean;
}>();

const emit = defineEmits<{
  unfriend: [row: FriendshipRow];
  loadMore: [];
}>();
</script>

<template>
  <section class="space-y-3" aria-labelledby="friends-list-heading">
    <h2 id="friends-list-heading" class="text-sm font-semibold text-slate-800">
      {{ $t("friends.yourFriends") }}
      <span v-if="!loading" class="ml-1 text-slate-400"
        >({{ friends.length }})</span
      >
    </h2>
    <SkeletonList v-if="loading" :rows="4" />
    <EmptyState
      v-else-if="!friends.length"
      :title="$t('friends.empty')"
      illustration="spark"
    />
    <ul
      v-else
      class="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white"
    >
      <li
        v-for="row in friends"
        :key="row.id"
        class="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:gap-3"
      >
        <FriendsPeerAvatar
          :avatar-url="row.peer.avatarUrl"
          :name="row.peer.name"
        />
        <div class="min-w-0 flex-1 basis-32">
          <p class="truncate text-sm font-semibold text-slate-900">
            {{ row.peer.name }}
          </p>
        </div>
        <NuxtLink
          :to="{ path: '/chat', query: { with: row.peer.id } }"
          class="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
        >
          {{ $t("friends.message") }}
        </NuxtLink>
        <button
          type="button"
          class="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          :disabled="busyId === row.id"
          @click="emit('unfriend', row)"
        >
          {{ $t("friends.unfriend") }}
        </button>
      </li>
    </ul>
    <button
      v-if="friendsNextCursor"
      type="button"
      class="rounded-lg px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
      :disabled="loadingMoreFriends"
      :aria-busy="loadingMoreFriends"
      @click="emit('loadMore')"
    >
      {{ $t("common.loadMore") }}
    </button>
  </section>
</template>
