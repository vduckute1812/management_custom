import type { Ref } from "vue";
import type { ApiFetchOptions } from "~/composables/shared/useApi";
import type {
  ChatConversation,
  ChatMessage,
  ChatMessageReactionType,
} from "~/types/chat";
import { ChatMessageKind } from "~/types/chat";
import { applyOptimisticReaction } from "~/utils/optimisticReaction";

interface ChatApiFetch {
  <T = unknown>(url: string, options?: ApiFetchOptions): Promise<T>;
}

interface ChatMessageActionDependencies {
  activeId: Ref<string | null>;
  messages: Ref<ChatMessage[]>;
  conversations: Ref<ChatConversation[]>;
  sending: Ref<boolean>;
  apiFetch: ChatApiFetch;
  ingestMessage: (
    message: ChatMessage,
    options?: { fromSelf?: boolean },
  ) => void;
}

export function createChatMessageActions(
  dependencies: ChatMessageActionDependencies,
) {
  const {
    activeId,
    messages,
    conversations,
    sending,
    apiFetch,
    ingestMessage,
  } = dependencies;

  async function sendText(text: string) {
    if (!activeId.value) return;
    const body = text.trim();
    if (!body || sending.value) return;
    sending.value = true;
    try {
      const response = await apiFetch<{ message: ChatMessage }>(
        `/api/chat/conversations/${activeId.value}/messages`,
        {
          method: "POST",
          body: { kind: ChatMessageKind.Text, body },
        },
      );
      ingestMessage(response.message, { fromSelf: true });
    } finally {
      sending.value = false;
    }
  }

  async function sendSticker(stickerId: string) {
    if (!activeId.value || sending.value) return;
    sending.value = true;
    try {
      const response = await apiFetch<{ message: ChatMessage }>(
        `/api/chat/conversations/${activeId.value}/messages`,
        {
          method: "POST",
          body: { kind: ChatMessageKind.Sticker, stickerId },
        },
      );
      ingestMessage(response.message, { fromSelf: true });
    } finally {
      sending.value = false;
    }
  }

  async function sendImage(uploadId: string) {
    if (!activeId.value || sending.value) return;
    sending.value = true;
    try {
      const response = await apiFetch<{ message: ChatMessage }>(
        `/api/chat/conversations/${activeId.value}/messages`,
        {
          method: "POST",
          body: { kind: ChatMessageKind.Image, uploadId },
        },
      );
      ingestMessage(response.message, { fromSelf: true });
    } finally {
      sending.value = false;
    }
  }

  async function sendAudio(uploadId: string, durationMs: number) {
    if (!activeId.value || sending.value) return;
    sending.value = true;
    try {
      const response = await apiFetch<{ message: ChatMessage }>(
        `/api/chat/conversations/${activeId.value}/messages`,
        {
          method: "POST",
          body: { kind: ChatMessageKind.Audio, uploadId, durationMs },
        },
      );
      ingestMessage(response.message, { fromSelf: true });
    } finally {
      sending.value = false;
    }
  }

  /**
   * Optimistic reaction mutation with per-message request tokens so rapid
   * clicks don't leave a stale response winning.
   */
  const reactionRequestTokens = new Map<string, number>();

  async function mutateMessageReaction(
    messageId: string,
    reaction: ChatMessageReactionType | null,
  ) {
    if (!activeId.value) return;
    const previous = messages.value.find((message) => message.id === messageId);
    if (!previous) return;
    if (reaction === null && previous.myReaction == null) return;
    if (reaction !== null && previous.myReaction === reaction) return;

    const token = (reactionRequestTokens.get(messageId) ?? 0) + 1;
    reactionRequestTokens.set(messageId, token);
    const isLatest = () => reactionRequestTokens.get(messageId) === token;

    const optimisticCounts = applyOptimisticReaction(previous, reaction);

    messages.value = messages.value.map((message) =>
      message.id === messageId ? { ...message, ...optimisticCounts } : message,
    );

    try {
      const path = `/api/chat/conversations/${activeId.value}/messages/${messageId}/reactions`;
      const response =
        reaction != null
          ? await apiFetch<{
              message: ChatMessage;
              reactions: Record<ChatMessageReactionType, number>;
              reactionCount: number;
              myReaction: ChatMessageReactionType | null;
            }>(path, { method: "POST", body: { reaction } })
          : await apiFetch<{
              message: ChatMessage;
              reactions: Record<ChatMessageReactionType, number>;
              reactionCount: number;
              myReaction: ChatMessageReactionType | null;
            }>(path, { method: "DELETE" });
      if (!isLatest()) return;
      messages.value = messages.value.map((message) =>
        message.id === messageId
          ? {
              ...message,
              reactions: response.reactions ?? response.message.reactions,
              reactionCount:
                response.reactionCount ?? response.message.reactionCount,
              myReaction: response.myReaction ?? response.message.myReaction,
            }
          : message,
      );
    } catch {
      if (!isLatest()) return;
      messages.value = messages.value.map((message) =>
        message.id === messageId ? previous : message,
      );
    }
  }

  async function setMessageReaction(
    messageId: string,
    reaction: ChatMessageReactionType,
  ) {
    await mutateMessageReaction(messageId, reaction);
  }

  async function clearMessageReaction(messageId: string) {
    await mutateMessageReaction(messageId, null);
  }

  async function deleteMessage(messageId: string) {
    if (!activeId.value) return;
    const previousMessages = messages.value;
    const previousConversations = conversations.value.map((conversation) => ({
      ...conversation,
      lastMessage: conversation.lastMessage
        ? { ...conversation.lastMessage }
        : null,
    }));
    messages.value = messages.value.filter(
      (message) => message.id !== messageId,
    );
    const conversation = conversations.value.find(
      (candidate) => candidate.id === activeId.value,
    );
    if (conversation?.lastMessage?.id === messageId) {
      const remaining = messages.value;
      conversation.lastMessage =
        remaining.length > 0 ? (remaining[remaining.length - 1] ?? null) : null;
    }
    try {
      await apiFetch(
        `/api/chat/conversations/${activeId.value}/messages/${messageId}`,
        { method: "DELETE" },
      );
    } catch (error) {
      messages.value = previousMessages;
      conversations.value = previousConversations;
      throw error;
    }
  }

  return {
    sendText,
    sendSticker,
    sendImage,
    sendAudio,
    setMessageReaction,
    clearMessageReaction,
    deleteMessage,
  };
}
