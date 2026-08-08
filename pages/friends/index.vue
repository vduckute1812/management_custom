<script setup lang="ts">
import type { FriendshipRow } from "~/types/friendship";

const { t } = useI18n();
const auth = useAuth();
const { pushToast } = useToasts();

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

function onUserQueryUpdate(value: string) {
  userQuery.value = value;
  searchDebounced(value);
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
    <FriendsPageHeader />

    <InlineErrorAlert
      v-if="loadError"
      :message="loadError"
      :retry-label="$t('common.retry')"
      @retry="loadOverview"
    />

    <FriendsFindPanel
      :user-query="userQuery"
      :searching="searching"
      :search-hits="searchHits"
      :known-peer-ids="knownPeerIds"
      :busy-id="busyId"
      @update:user-query="onUserQueryUpdate"
      @request="onRequest"
    />

    <FriendsIncomingPanel
      v-if="incoming.length"
      :incoming="incoming"
      :busy-id="busyId"
      :incoming-next-cursor="incomingNextCursor"
      :loading-more-incoming="loadingMoreIncoming"
      @accept="onAccept"
      @decline="(id: string) => onRemove(id, 'decline')"
      @load-more="loadMoreIncoming"
    />

    <FriendsOutgoingPanel
      v-if="outgoing.length"
      :outgoing="outgoing"
      :busy-id="busyId"
      :outgoing-next-cursor="outgoingNextCursor"
      :loading-more-outgoing="loadingMoreOutgoing"
      @cancel="(id: string) => onRemove(id, 'cancel')"
      @load-more="loadMoreOutgoing"
    />

    <FriendsListPanel
      :friends="friends"
      :loading="loading"
      :busy-id="busyId"
      :friends-next-cursor="friendsNextCursor"
      :loading-more-friends="loadingMoreFriends"
      @unfriend="requestUnfriend"
      @load-more="loadMoreFriends"
    />

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
