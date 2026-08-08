<script setup lang="ts">
import type { PostAuthor } from "~/types/post";

defineProps<{
  userQuery: string;
  searching: boolean;
  searchHits: PostAuthor[];
  knownPeerIds: Set<string>;
  busyId: string | null;
}>();

const emit = defineEmits<{
  "update:userQuery": [value: string];
  request: [userId: string];
}>();

function onInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  emit("update:userQuery", value);
}
</script>

<template>
  <section class="space-y-3" aria-labelledby="friends-find-heading">
    <h2 id="friends-find-heading" class="text-sm font-semibold text-slate-800">
      {{ $t("friends.findPeople") }}
    </h2>
    <label class="sr-only" for="friends-search">{{
      $t("friends.searchLabel")
    }}</label>
    <input
      id="friends-search"
      :value="userQuery"
      type="search"
      autocomplete="off"
      class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
      :placeholder="$t('friends.searchPlaceholder')"
      @input="onInput"
    />
    <SkeletonList v-if="searching" :rows="3" />
    <ul
      v-else-if="searchHits.length"
      class="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white"
    >
      <li
        v-for="user in searchHits"
        :key="user.id"
        class="flex items-center gap-3 px-3 py-2.5"
      >
        <FriendsPeerAvatar :avatar-url="user.avatarUrl" :name="user.name" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-slate-900">
            {{ user.name || $t("friends.addFriend") }}
          </p>
        </div>
        <button
          v-if="!knownPeerIds.has(user.id)"
          type="button"
          class="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          :disabled="busyId === user.id"
          :aria-busy="busyId === user.id"
          @click="emit('request', user.id)"
        >
          {{ $t("friends.addFriend") }}
        </button>
        <span v-else class="shrink-0 text-xs font-medium text-slate-500">
          {{ $t("friends.alreadyConnected") }}
        </span>
      </li>
    </ul>
  </section>
</template>
