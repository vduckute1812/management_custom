<script setup lang="ts">
import type { FriendshipRow } from "~/types/friendship";

defineProps<{
  incoming: FriendshipRow[];
  busyId: string | null;
  incomingNextCursor: string | null;
  loadingMoreIncoming: boolean;
}>();

const emit = defineEmits<{
  accept: [id: string];
  decline: [id: string];
  loadMore: [];
}>();
</script>

<template>
  <section class="space-y-3" aria-labelledby="friends-incoming-heading">
    <h2
      id="friends-incoming-heading"
      class="text-sm font-semibold text-slate-800"
    >
      {{ $t("friends.incoming") }}
      <span class="ml-1 text-slate-400">({{ incoming.length }})</span>
    </h2>
    <ul
      class="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white"
    >
      <li
        v-for="row in incoming"
        :key="row.id"
        class="flex flex-wrap items-center gap-3 px-3 py-2.5"
      >
        <FriendsPeerAvatar
          :avatar-url="row.peer.avatarUrl"
          :name="row.peer.name"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-slate-900">
            {{ row.peer.name }}
          </p>
        </div>
        <div class="flex shrink-0 gap-2">
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            :disabled="busyId === row.id"
            @click="emit('accept', row.id)"
          >
            {{ $t("friends.accept") }}
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            :disabled="busyId === row.id"
            @click="emit('decline', row.id)"
          >
            {{ $t("friends.decline") }}
          </button>
        </div>
      </li>
    </ul>
    <button
      v-if="incomingNextCursor"
      type="button"
      class="rounded-lg px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
      :disabled="loadingMoreIncoming"
      :aria-busy="loadingMoreIncoming"
      @click="emit('loadMore')"
    >
      {{ $t("common.loadMore") }}
    </button>
  </section>
</template>
