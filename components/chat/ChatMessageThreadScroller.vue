<script setup lang="ts">
import type { ChatMessage } from "~/types/chat";
import {
  canRequestOlderChatMessages,
  isChatNearTopForOlder,
  isChatStuckToBottom,
  restoreChatScrollAfterPrepend,
  scrollTopForLastMessage,
} from "~/utils/chatThreadScroll";

const props = defineProps<{
  messages: ChatMessage[];
  hasMore?: boolean;
  loading?: boolean;
  loadingMore?: boolean;
  peerLastReadAt?: string | null;
}>();

const emit = defineEmits<{
  loadMore: [];
  scroll: [];
}>();

const { t } = useI18n();

const scroller = ref<HTMLElement | null>(null);
const threadColumn = ref<HTMLElement | null>(null);
const loadOlderSentinel = ref<HTMLElement | null>(null);
const endAnchor = ref<HTMLElement | null>(null);
const stickToBottom = ref(true);
/** After open/hydrate, pin to the last message before any older-page fetch. */
const pinReady = ref(false);
const scrollSnapshot = ref<{ scrollHeight: number; scrollTop: number } | null>(
  null,
);

let pinGeneration = 0;
let olderObserver: IntersectionObserver | null = null;
let sizeObserver: ResizeObserver | null = null;

const lastMessageId = computed(
  () => props.messages[props.messages.length - 1]?.id ?? null,
);

function isReadByPeer(msg: ChatMessage): boolean {
  if (!msg.mine) return false;
  if (typeof msg.readByPeer === "boolean") return msg.readByPeer;
  if (!props.peerLastReadAt) return false;
  return (
    new Date(msg.createdAt).getTime() <=
    new Date(props.peerLastReadAt).getTime()
  );
}

const lastReadMineId = computed(() => {
  for (let i = props.messages.length - 1; i >= 0; i--) {
    const m = props.messages[i];
    if (m?.mine && isReadByPeer(m)) return m.id;
  }
  return null;
});

function requestLoadMore(opts?: { userGesture?: boolean }) {
  const el = scroller.value;
  const allowed = canRequestOlderChatMessages({
    hasMore: !!props.hasMore,
    loadingMore: !!props.loadingMore,
    pinReady: pinReady.value,
    userGesture: opts?.userGesture,
    scrollHeight: el?.scrollHeight ?? 0,
    clientHeight: el?.clientHeight ?? 0,
  });
  if (!allowed) return;

  if (el) {
    scrollSnapshot.value = {
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
    };
  }
  emit("loadMore");
}

function onScroll() {
  const el = scroller.value;
  if (!el) return;
  emit("scroll");
  stickToBottom.value = isChatStuckToBottom(
    el.scrollHeight,
    el.scrollTop,
    el.clientHeight,
  );
  if (!pinReady.value) return;
  if (
    isChatNearTopForOlder(el.scrollTop) &&
    props.hasMore &&
    !props.loadingMore
  ) {
    requestLoadMore();
  }
}

/** Keep the last message flush with the bottom of the scrollport. */
function scrollToBottom(force = false) {
  const el = scroller.value;
  if (!el) return;
  if (!force && !stickToBottom.value) return;
  el.scrollTop = scrollTopForLastMessage(el.scrollHeight, el.clientHeight);
}

function pinToNewest() {
  const gen = ++pinGeneration;
  pinReady.value = false;
  stickToBottom.value = true;
  scrollSnapshot.value = null;

  const apply = () => {
    if (gen !== pinGeneration) return;
    scrollToBottom(true);
  };

  const finish = () => {
    if (gen !== pinGeneration) return;
    apply();
    // Reveal UI (Load older sentinel mounts here) then re-anchor so the
    // extra top chrome cannot leave us short of the last message.
    pinReady.value = true;
    nextTick(() => {
      apply();
      requestAnimationFrame(apply);
    });
  };

  nextTick(() => {
    apply();
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(finish);
    });
  });
}

function restoreScrollAfterPrepend() {
  const el = scroller.value;
  const snap = scrollSnapshot.value;
  if (!el || !snap) return;
  el.scrollTop = restoreChatScrollAfterPrepend(
    el.scrollHeight,
    snap.scrollHeight,
    snap.scrollTop,
  );
  scrollSnapshot.value = null;
}

watch(
  () => props.loadingMore,
  (loading, wasLoading) => {
    if (wasLoading && !loading) {
      nextTick(() => restoreScrollAfterPrepend());
    }
  },
);

watch(
  () => props.messages.length,
  (n, prev) => {
    if (scrollSnapshot.value) return;
    if (!pinReady.value) return;
    if (n > (prev ?? 0)) {
      nextTick(() => scrollToBottom());
    }
  },
);

// New last message (send / live) — stay glued to the end when stuck.
watch(lastMessageId, (id, prev) => {
  if (!id || id === prev) return;
  if (scrollSnapshot.value || !pinReady.value) return;
  nextTick(() => scrollToBottom());
});

watch(
  () => props.loading,
  (loading, wasLoading) => {
    if (loading) {
      pinReady.value = false;
      stickToBottom.value = true;
      scrollSnapshot.value = null;
      return;
    }
    if (wasLoading || wasLoading === undefined) {
      pinToNewest();
    }
  },
  { immediate: true },
);

onMounted(() => {
  if (typeof ResizeObserver !== "undefined") {
    sizeObserver = new ResizeObserver(() => {
      // During hydrate always re-pin; afterwards only while stuck to bottom
      // (media/layout settling must not yank the user away from history).
      if (!pinReady.value || stickToBottom.value) {
        scrollToBottom(true);
      }
    });
    watch(
      threadColumn,
      (el, prev) => {
        if (prev) sizeObserver?.unobserve(prev);
        if (el) sizeObserver?.observe(el);
      },
      { immediate: true },
    );
  }

  if (typeof IntersectionObserver === "undefined") return;
  watch(
    [scroller, loadOlderSentinel, () => props.hasMore, pinReady],
    ([root, el, hasMore, ready]) => {
      olderObserver?.disconnect();
      olderObserver = null;
      if (!root || !el || !hasMore || !ready) return;
      olderObserver = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          requestLoadMore();
        },
        { root, rootMargin: "80px 0px 0px 0px", threshold: 0 },
      );
      olderObserver.observe(el);
    },
    { immediate: true },
  );
});

onBeforeUnmount(() => {
  pinGeneration += 1;
  olderObserver?.disconnect();
  olderObserver = null;
  sizeObserver?.disconnect();
  sizeObserver = null;
});

defineExpose({ scrollToBottom });
</script>

<template>
  <div
    ref="scroller"
    class="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4"
    @scroll="onScroll"
  >
    <!-- min-h-full + mt-auto: short threads sit on the last message at the
         panel bottom; long threads still scroll with the end anchored. -->
    <div ref="threadColumn" class="flex min-h-full flex-col">
      <div v-if="hasMore && pinReady" ref="loadOlderSentinel">
        <ChatMessageThreadLoadOlder
          :has-more="hasMore"
          :loading-more="loadingMore"
          @load-more="requestLoadMore({ userGesture: true })"
        />
      </div>

      <!-- Keep the skeleton up for the whole load so the newest page never
           flashes at scrollTop=0 before pinToNewest runs. -->
      <div v-if="loading" class="space-y-3" aria-busy="true">
        <SkeletonBlock height="h-10" rounded="rounded-2xl" class="ml-8 w-2/3" />
        <SkeletonBlock height="h-10" rounded="rounded-2xl" class="mr-8 w-1/2" />
        <SkeletonBlock height="h-10" rounded="rounded-2xl" class="ml-8 w-3/5" />
      </div>

      <EmptyState
        v-else-if="!messages.length"
        class="my-auto"
        illustration="spark"
        :title="t('chat.threadEmpty')"
      />

      <!-- Laid out but hidden until pinToNewest anchors the last message. -->
      <ul
        v-else
        class="mt-auto space-y-3"
        :class="{ invisible: !pinReady }"
        role="list"
      >
        <slot :last-read-mine-id="lastReadMineId" />
      </ul>

      <div
        ref="endAnchor"
        class="h-px w-full shrink-0"
        aria-hidden="true"
        data-chat-end
      />
    </div>
  </div>
</template>
