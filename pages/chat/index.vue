<script setup lang="ts">
const { t } = useI18n();
const auth = useAuth();
const route = useRoute();
const router = useRouter();

useSeoMeta({
  title: () => t("seo.chat"),
  description: () => t("chat.pageDescription"),
  robots: "noindex, nofollow",
});

const {
  conversations,
  activeId,
  activeConversation,
  messages,
  peerLastReadAt,
  messagesHasMore,
  loadingConversations,
  loadingMessages,
  sending,
  stickers,
  emoji,
  refreshConversations,
  ensureCatalog,
  startConversation,
  openConversation,
  loadOlderMessages,
  sendText,
  sendSticker,
  sendImage,
  sendAudio,
  startPolling,
  stopPolling,
  closeConversation,
} = useChat();

const { searchDebounced, results, loading: searching } = useUserDirectory();

const userQuery = ref("");
const showNewChat = ref(false);
const loadingMore = ref(false);
const starting = ref(false);

const peerFromQuery = computed(() => {
  const raw = route.query.with;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
});

const showThread = computed(() => Boolean(activeId.value));

onMounted(async () => {
  if (!auth.isAuthenticatedUi.value) return;
  await Promise.all([refreshConversations(), ensureCatalog()]);
  if (peerFromQuery.value) {
    starting.value = true;
    try {
      await startConversation(peerFromQuery.value);
      await router.replace({ path: "/chat", query: {} });
    } finally {
      starting.value = false;
    }
  }
  startPolling();
});

onBeforeUnmount(() => {
  stopPolling();
});

watch(
  () => auth.isAuthenticatedUi.value,
  async (ok) => {
    if (ok) {
      await refreshConversations();
      startPolling();
    } else {
      stopPolling();
    }
  },
);

function onSelectConversation(id: string) {
  void openConversation(id);
}

function onUserQueryInput() {
  searchDebounced(userQuery.value);
}

async function startWithUser(userId: string) {
  starting.value = true;
  showNewChat.value = false;
  userQuery.value = "";
  results.value = [];
  try {
    await startConversation(userId);
  } finally {
    starting.value = false;
  }
}

async function onLoadMore() {
  if (loadingMore.value) return;
  loadingMore.value = true;
  try {
    await loadOlderMessages();
  } finally {
    loadingMore.value = false;
  }
}

function peerLabel() {
  const c = activeConversation.value;
  if (!c) return "";
  return c.peer.name?.trim() || c.peer.email;
}

function backToList() {
  closeConversation();
}
</script>

<template>
  <div
    class="mx-auto flex h-[calc(100dvh-3.5rem)] max-w-[1600px] flex-col px-0 sm:px-4 sm:py-4"
  >
    <div
      class="flex min-h-0 flex-1 overflow-hidden border-slate-200 bg-white sm:rounded-2xl sm:border sm:shadow-sm"
    >
      <aside
        class="flex w-full min-w-0 flex-col border-r border-slate-200 sm:w-80 lg:w-96"
        :class="showThread ? 'hidden sm:flex' : 'flex'"
      >
        <div
          class="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3"
        >
          <div>
            <h1 class="text-base font-semibold text-slate-900">
              {{ t("chat.title") }}
            </h1>
            <p class="text-xs text-slate-500">{{ t("chat.subtitle") }}</p>
          </div>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            @click="showNewChat = !showNewChat"
          >
            {{ t("chat.newChat") }}
          </button>
        </div>

        <div v-if="showNewChat" class="border-b border-slate-100 p-3">
          <label class="sr-only" for="chat-user-search">{{
            t("chat.searchPeople")
          }}</label>
          <input
            id="chat-user-search"
            v-model="userQuery"
            type="search"
            autocomplete="off"
            class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
            :placeholder="t('chat.searchPeoplePlaceholder')"
            @input="onUserQueryInput"
          />
          <ul v-if="userQuery.trim()" class="mt-2 max-h-48 overflow-y-auto">
            <li v-if="searching" class="px-2 py-2 text-xs text-slate-400">
              {{ t("chat.searching") }}
            </li>
            <li
              v-else-if="!results.length"
              class="px-2 py-2 text-xs text-slate-400"
            >
              {{ t("chat.noPeopleFound") }}
            </li>
            <li v-for="u in results" :key="u.id">
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                :disabled="starting"
                @click="startWithUser(u.id)"
              >
                <UserAvatar
                  :name="u.name"
                  :email="u.email"
                  :avatar-url="u.avatarUrl"
                  size="sm"
                />
                <span class="min-w-0">
                  <span
                    class="block truncate text-sm font-medium text-slate-800"
                  >
                    {{ u.name?.trim() || u.email }}
                  </span>
                  <span
                    v-if="u.name?.trim()"
                    class="block truncate text-xs text-slate-400"
                  >
                    {{ u.email }}
                  </span>
                </span>
              </button>
            </li>
          </ul>
        </div>

        <ChatConversationList
          class="min-h-0 flex-1"
          :conversations="conversations"
          :active-id="activeId"
          :loading="loadingConversations"
          @select="onSelectConversation"
        />
      </aside>

      <section
        class="flex min-w-0 flex-1 flex-col"
        :class="showThread ? 'flex' : 'hidden sm:flex'"
      >
        <template v-if="activeConversation">
          <header
            class="flex items-center gap-3 border-b border-slate-200 px-3 py-2.5"
          >
            <button
              type="button"
              class="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 sm:hidden"
              :aria-label="t('chat.backToList')"
              @click="backToList"
            >
              ←
            </button>
            <UserAvatar
              :name="activeConversation.peer.name"
              :email="activeConversation.peer.email"
              :avatar-url="activeConversation.peer.avatarUrl"
              size="md"
            />
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-slate-900">
                {{ peerLabel() }}
              </p>
              <p class="truncate text-xs text-slate-500">
                {{ activeConversation.peer.email }}
              </p>
            </div>
          </header>

          <ChatMessageThread
            :messages="messages"
            :has-more="messagesHasMore"
            :loading="loadingMessages"
            :loading-more="loadingMore"
            :peer-last-read-at="peerLastReadAt"
            @load-more="onLoadMore"
          />

          <ChatComposer
            :emoji="emoji"
            :stickers="stickers"
            :sending="sending"
            @send-text="sendText"
            @send-sticker="sendSticker"
            @send-image="sendImage"
            @send-audio="sendAudio"
          />
        </template>

        <div
          v-else
          class="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center"
        >
          <p class="text-base font-semibold text-slate-800">
            {{ t("chat.pickConversation") }}
          </p>
          <p class="max-w-sm text-sm text-slate-500">
            {{ t("chat.pickConversationHint") }}
          </p>
        </div>
      </section>
    </div>
  </div>
</template>
