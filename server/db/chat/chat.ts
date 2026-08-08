/**
 * Direct-message chat (1:1 conversations, messages, read receipts).
 *
 * Thin named barrel — implementation lives in focused sub-modules:
 *   - chatShared.ts        — Row interfaces, mappers, shared helpers
 *   - chatConversations.ts — list / get / create conversation, getPeerUserId
 *   - chatMessages.ts      — list / send / access / delete
 *   - chatReactions.ts     — set / clear message reactions
 *   - chatReads.ts         — mark read, unread total / inbox
 */
export {
  getConversationForUser,
  getOrCreateDirectConversation,
  getPeerUserId,
  listConversations,
} from "./chatConversations";
export type { SendMessageInput } from "./chatMessages";
export {
  assertChatMessageAccessible,
  deleteMessage,
  getChatMessageForParticipant,
  listMessages,
  sendMessage,
} from "./chatMessages";
export {
  clearChatMessageReaction,
  setChatMessageReaction,
} from "./chatReactions";
export type { ChatUnreadPreview } from "./chatReads";
export {
  getUnreadInbox,
  getUnreadTotal,
  markConversationRead,
} from "./chatReads";
