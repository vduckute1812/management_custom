<script setup lang="ts">
import type { FriendshipRow } from "~/types/friendship";

defineProps<{
  outgoing: FriendshipRow[];
  busyId: string | null;
  outgoingNextCursor: string | null;
  loadingMoreOutgoing: boolean;
}>();

const emit = defineEmits<{
  cancel: [id: string];
  loadMore: [];
}>();
</script>

<template>
  <section class="space-y-3" aria-labelledby="friends-outgoing-heading">
    <h2
      id="friends-outgoing-heading"
      class="text-sm font-semibold text-slate-800"
    >
      {{ $t("friends.outgoing") }}
    </h2>
    <ul
      class="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white"
    >
      <li
        v-for="row in outgoing"
        :key="row.id"
        class="flex items-center gap-3 px-3 py-2.5"
      >
        <FriendsPeerAvatar
          :avatar-url="row.peer.avatarUrl"
          :name="row.peer.name"
          tone="slate"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-slate-900">
            {{ row.peer.name }}
          </p>
          <p class="truncate text-xs text-slate-500">
            {{ $t("friends.pending") }}
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          :disabled="busyId === row.id"
          @click="emit('cancel', row.id)"
        >
          {{ $t("friends.cancelRequest") }}
        </button>
      </li>
    </ul>
    <button
      v-if="outgoingNextCursor"
      type="button"
      class="rounded-lg px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
      :disabled="loadingMoreOutgoing"
      :aria-busy="loadingMoreOutgoing"
      @click="emit('loadMore')"
    >
      {{ $t("common.loadMore") }}
    </button>
  </section>
</template>
