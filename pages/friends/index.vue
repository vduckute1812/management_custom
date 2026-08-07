<script setup lang="ts">
import type { FriendshipRow } from "~/types/friendship";

const { t } = useI18n();
const auth = useAuth();
const { pushToast } = useToasts();
const { mediaUrl } = useMediaUrl();

useSeoMeta({
  title: () => t("seo.friends"),
  description: () => t("friends.pageDescription"),
  robots: "noindex, nofollow",
});

const {
  friends,
  incoming,
  outgoing,
  loading,
  friendsNextCursor,
  incomingNextCursor,
  outgoingNextCursor,
  loadingMoreFriends,
  loadingMoreIncoming,
  loadingMoreOutgoing,
  refresh,
  loadMoreFriends,
  loadMoreIncoming,
  loadMoreOutgoing,
  request,
  accept,
  remove,
} = useFriends();

const { searchDebounced, results, loading: searching } = useUserDirectory();
const userQuery = ref("");
const busyId = ref<string | null>(null);
const pendingUnfriend = ref<FriendshipRow | null>(null);
const unfriendBusy = ref(false);
const loadError = ref<string | null>(null);

const knownPeerIds = computed(() => {
  const ids = new Set<string>();
  for (const row of [...friends.value, ...incoming.value, ...outgoing.value]) {
    ids.add(row.peer.id);
  }
  return ids;
});

const searchHits = computed(() =>
  results.value.filter((u) => u.id !== auth.user.value?.id),
);

async function loadOverview() {
  loadError.value = null;
  try {
    await refresh();
  } catch {
    loadError.value = t("friends.loadFailed");
  }
}

onMounted(async () => {
  if (!auth.isAuthenticatedUi.value) return;
  await loadOverview();
});

watch(
  () => auth.isAuthenticatedUi.value,
  async (ok) => {
    if (ok) await loadOverview();
  },
);

function onUserQueryInput() {
  searchDebounced(userQuery.value);
}

function peerInitial(row: FriendshipRow) {
  const name = row.peer.name || row.peer.email;
  return name.trim().charAt(0).toUpperCase() || "?";
}

async function onRequest(userId: string) {
  busyId.value = userId;
  try {
    await request(userId);
    pushToast(t("friends.requestSent"), { tone: "success" });
    userQuery.value = "";
    results.value = [];
  } catch {
    pushToast(t("friends.requestFailed"), { tone: "danger" });
  } finally {
    busyId.value = null;
  }
}

async function onAccept(id: string) {
  busyId.value = id;
  try {
    await accept(id);
    pushToast(t("friends.accepted"), { tone: "success" });
  } catch {
    pushToast(t("friends.actionFailed"), { tone: "danger" });
  } finally {
    busyId.value = null;
  }
}

async function onRemove(id: string, kind: "decline" | "cancel") {
  busyId.value = id;
  try {
    await remove(id);
    pushToast(
      kind === "cancel" ? t("friends.cancelled") : t("friends.declined"),
      { tone: "success" },
    );
  } catch {
    pushToast(t("friends.actionFailed"), { tone: "danger" });
  } finally {
    busyId.value = null;
  }
}

function requestUnfriend(row: FriendshipRow) {
  pendingUnfriend.value = row;
}

async function confirmUnfriend() {
  const row = pendingUnfriend.value;
  if (!row || unfriendBusy.value) return;
  unfriendBusy.value = true;
  try {
    await remove(row.id);
    pendingUnfriend.value = null;
    pushToast(t("friends.unfriended"), { tone: "success" });
  } catch {
    pushToast(t("friends.actionFailed"), { tone: "danger" });
  } finally {
    unfriendBusy.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-8 px-4 py-6 sm:px-0">
    <header class="space-y-1">
      <h1 class="text-2xl font-bold tracking-tight text-slate-900">
        {{ $t("friends.title") }}
      </h1>
      <p class="text-sm text-slate-600">
        {{ $t("friends.pageDescription") }}
      </p>
    </header>

    <InlineErrorAlert
      v-if="loadError"
      :message="loadError"
      :retry-label="$t('common.retry')"
      @retry="loadOverview"
    />

    <section class="space-y-3" aria-labelledby="friends-find-heading">
      <h2
        id="friends-find-heading"
        class="text-sm font-semibold text-slate-800"
      >
        {{ $t("friends.findPeople") }}
      </h2>
      <label class="sr-only" for="friends-search">{{
        $t("friends.searchLabel")
      }}</label>
      <input
        id="friends-search"
        v-model="userQuery"
        type="search"
        autocomplete="off"
        class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
        :placeholder="$t('friends.searchPlaceholder')"
        @input="onUserQueryInput"
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
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-600 text-xs font-bold text-white"
          >
            <img
              v-if="user.avatarUrl"
              :src="mediaUrl(user.avatarUrl)"
              alt=""
              class="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <span v-else>{{ (user.name || "?").charAt(0).toUpperCase() }}</span>
          </div>
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
            @click="onRequest(user.id)"
          >
            {{ $t("friends.addFriend") }}
          </button>
          <span v-else class="shrink-0 text-xs font-medium text-slate-500">
            {{ $t("friends.alreadyConnected") }}
          </span>
        </li>
      </ul>
    </section>

    <section
      v-if="incoming.length"
      class="space-y-3"
      aria-labelledby="friends-incoming-heading"
    >
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
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-600 text-xs font-bold text-white"
          >
            <img
              v-if="row.peer.avatarUrl"
              :src="mediaUrl(row.peer.avatarUrl)"
              alt=""
              class="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <span v-else>{{ peerInitial(row) }}</span>
          </div>
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
              @click="onAccept(row.id)"
            >
              {{ $t("friends.accept") }}
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              :disabled="busyId === row.id"
              @click="onRemove(row.id, 'decline')"
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
        @click="loadMoreIncoming"
      >
        {{ $t("common.loadMore") }}
      </button>
    </section>

    <section
      v-if="outgoing.length"
      class="space-y-3"
      aria-labelledby="friends-outgoing-heading"
    >
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
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-500 text-xs font-bold text-white"
          >
            <img
              v-if="row.peer.avatarUrl"
              :src="mediaUrl(row.peer.avatarUrl)"
              alt=""
              class="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <span v-else>{{ peerInitial(row) }}</span>
          </div>
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
            @click="onRemove(row.id, 'cancel')"
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
        @click="loadMoreOutgoing"
      >
        {{ $t("common.loadMore") }}
      </button>
    </section>

    <section class="space-y-3" aria-labelledby="friends-list-heading">
      <h2
        id="friends-list-heading"
        class="text-sm font-semibold text-slate-800"
      >
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
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-600 text-xs font-bold text-white"
          >
            <img
              v-if="row.peer.avatarUrl"
              :src="mediaUrl(row.peer.avatarUrl)"
              alt=""
              class="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <span v-else>{{ peerInitial(row) }}</span>
          </div>
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
            @click="requestUnfriend(row)"
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
        @click="loadMoreFriends"
      >
        {{ $t("common.loadMore") }}
      </button>
    </section>

    <ConfirmDialog
      :open="!!pendingUnfriend"
      :title="$t('friends.unfriendConfirmTitle')"
      :description="$t('friends.unfriendConfirm')"
      :confirm-label="$t('friends.unfriendConfirmAction')"
      :busy="unfriendBusy"
      @cancel="pendingUnfriend = null"
      @confirm="confirmUnfriend"
    />
  </div>
</template>
