/**
 * Direct-message chat (1:1 conversations, messages, read receipts).
 *
 * This is a thin barrel — implementation lives in focused sub-modules:
 *   - chatShared.ts        — Row interfaces, mappers, shared helpers
 *   - chatConversations.ts — listConversations, getOrCreateDirectConversation, getPeerUserId
 *   - chatMessages.ts      — listMessages, sendMessage, getChatMessageForParticipant, assertChatMessageAccessible
 *   - chatReactions.ts     — setChatMessageReaction, clearChatMessageReaction
 *   - chatReads.ts         — markConversationRead, getUnreadTotal, getUnreadInbox
 */
export * from "./chatConversations";
export * from "./chatMessages";
export * from "./chatReactions";
export * from "./chatReads";
