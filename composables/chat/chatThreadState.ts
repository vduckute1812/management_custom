import type {
  ChatConversation,
  ChatMessage,
  ChatMessageReactionType,
} from "~/types/chat";
import type { Ref } from "vue";
import {
  applyPeerRead,
  normalizeMessage,
} from "~/composables/chat/chatThreadLive";

type ApiFetch = <T>(url: string, opts?: Record<string, unknown>) => Promise<T>;

export function createChatThreadState(deps: {
  conversations: Ref<ChatConversation[]>;
  messages: Ref<ChatMessage[]>;
  activeId: Ref<string | null>;
  peerLastReadAt: Ref<string | null>;
  myId: () => string | undefined;
  apiFetch: ApiFetch;
  refreshConversations: () => Promise<void>;
  openConversation: (id: string) => Promise<void>;
}) {
  function touchSidebar(message: ChatMessage) {
    const conv = deps.conversations.value.find(
      (c) => c.id === message.conversationId,
    );
    if (!conv) return;
    conv.lastMessage = message;
    conv.lastMessageAt = message.createdAt;
    deps.conversations.value = [
      conv,
      ...deps.conversations.value.filter((c) => c.id !== conv.id),
    ];
  }

  function ingestMessage(message: ChatMessage, opts?: { fromSelf?: boolean }) {
    if (deps.messages.value.some((m) => m.id === message.id)) return;
    const normalized = normalizeMessage(message, {
      fromSelf: opts?.fromSelf,
      myId: deps.myId(),
    });
    const withRead = applyPeerRead(
      [...deps.messages.value, normalized],
      deps.peerLastReadAt.value,
    );
    deps.messages.value = withRead;
    touchSidebar(withRead[withRead.length - 1] ?? normalized);

    if (
      !normalized.mine &&
      deps.activeId.value &&
      message.conversationId === deps.activeId.value
    ) {
      void deps
        .apiFetch(`/api/chat/conversations/${deps.activeId.value}/read`, {
          method: "POST",
        })
        .catch(() => undefined);
      void deps.refreshConversations().catch(() => undefined);
    }
  }

  function applyReadEvent(userId: string, lastReadAt: string) {
    const myId = deps.myId();
    if (!myId || userId === myId) return;
    deps.peerLastReadAt.value = lastReadAt;
    deps.messages.value = applyPeerRead(
      deps.messages.value,
      deps.peerLastReadAt.value,
    );
    const conv = deps.conversations.value.find(
      (c) => c.id === deps.activeId.value,
    );
    if (conv) conv.peerLastReadAt = lastReadAt;
  }

  function applyReactionEvent(payload: {
    messageId: string;
    conversationId: string;
    userId: string;
    reaction: ChatMessageReactionType | null;
    reactions: Record<ChatMessageReactionType, number>;
    reactionCount: number;
  }) {
    if (deps.activeId.value && payload.conversationId !== deps.activeId.value) {
      return;
    }
    const myId = deps.myId();
    deps.messages.value = deps.messages.value.map((m) => {
      if (m.id !== payload.messageId) return m;
      return {
        ...m,
        reactions: payload.reactions,
        reactionCount: payload.reactionCount,
        myReaction:
          myId && payload.userId === myId ? payload.reaction : m.myReaction,
      };
    });
  }

  function applyDeletedEvent(payload: {
    messageId: string;
    conversationId: string;
  }) {
    if (deps.activeId.value && payload.conversationId !== deps.activeId.value) {
      return;
    }
    deps.messages.value = deps.messages.value.filter(
      (m) => m.id !== payload.messageId,
    );

    const conv = deps.conversations.value.find(
      (c) => c.id === payload.conversationId,
    );
    if (conv?.lastMessage?.id === payload.messageId) {
      const remaining = deps.messages.value;
      conv.lastMessage =
        remaining.length > 0 ? (remaining[remaining.length - 1] ?? null) : null;
    }
  }

  async function pollNewMessages() {
    if (!deps.activeId.value) return;
    const last = deps.messages.value[deps.messages.value.length - 1];
    if (!last) {
      await deps.openConversation(deps.activeId.value);
      return;
    }
    try {
      const res = await deps.apiFetch<{
        messages: ChatMessage[];
        hasMore: boolean;
        peerLastReadAt: string | null;
      }>(`/api/chat/conversations/${deps.activeId.value}/messages`, {
        query: { limit: 50, after: last.id },
      });
      if (res.peerLastReadAt !== undefined) {
        deps.peerLastReadAt.value = res.peerLastReadAt;
      }
      deps.messages.value = applyPeerRead(
        deps.messages.value,
        deps.peerLastReadAt.value,
      );

      if (!res.messages.length) return;

      const existing = new Set(deps.messages.value.map((m) => m.id));
      const fresh = res.messages.filter((m) => !existing.has(m.id));
      for (const msg of fresh) {
        ingestMessage(msg);
      }
    } catch {
      // Fallback / catch-up failures are non-fatal
    }
  }

  return {
    ingestMessage,
    applyReadEvent,
    applyReactionEvent,
    applyDeletedEvent,
    pollNewMessages,
  };
}
