/**
 * Direct-message chat between users (1:1).
 */

import type { ReactionType } from "./reaction";
import {
  ReactionType as ChatMessageReaction,
  REACTION_EMOJI,
  REACTION_TYPES,
  emptyReactions,
  reactionCountOf,
} from "./reaction";

export type ChatMessageReactionType = ReactionType;
export { ChatMessageReaction };
export const CHAT_REACTION_TYPES = REACTION_TYPES;
export const CHAT_REACTION_EMOJI = REACTION_EMOJI;

export function emptyChatReactions(): Record<ChatMessageReactionType, number> {
  return emptyReactions();
}

export function chatReactionCount(
  reactions: Record<ChatMessageReactionType, number> | null | undefined,
): number {
  return reactionCountOf(reactions);
}

export const ChatMessageKind = {
  Text: 0,
  Emoji: 1,
  Sticker: 2,
  Image: 3,
  Audio: 4,
} as const;
export type ChatMessageKind =
  (typeof ChatMessageKind)[keyof typeof ChatMessageKind];

export const CHAT_MESSAGE_KINDS = [
  ChatMessageKind.Text,
  ChatMessageKind.Emoji,
  ChatMessageKind.Sticker,
  ChatMessageKind.Image,
  ChatMessageKind.Audio,
] as const;

export interface ChatPeer {
  id: string;
  name: string | null;
  email: string;
  avatarUrl?: string | null;
}

export interface ChatAttachment {
  id: string;
  url: string;
  mime: string;
  kind: "image" | "audio" | "document";
  fileName: string;
  sizeBytes: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  kind: ChatMessageKind;
  body: string | null;
  stickerId: string | null;
  uploadId: string | null;
  durationMs: number | null;
  attachment: ChatAttachment | null;
  createdAt: string;
  /** Aggregated reaction counts by type. */
  reactions: Record<ChatMessageReactionType, number>;
  /** Total reactions (all types). */
  reactionCount: number;
  /** Current viewer's reaction, if any. */
  myReaction: ChatMessageReactionType | null;
  /** True when the authenticated viewer sent this message. */
  mine?: boolean;
  /** True when the peer's last_read_at is at or after this message (mine only). */
  readByPeer?: boolean;
}

export interface ChatConversation {
  id: string;
  peer: ChatPeer;
  lastMessage: ChatMessage | null;
  lastMessageAt: string | null;
  unreadCount: number;
  /** When the other participant last read this thread (ISO), if known. */
  peerLastReadAt: string | null;
  createdAt: string;
}

export interface ChatSticker {
  id: string;
  emoji: string;
  labelKey: string;
  category: "gestures" | "mood" | "celebration" | "work";
}

/** Built-in sticker catalog — large emoji rendered client-side (no R2). */
export const CHAT_STICKERS: ChatSticker[] = [
  {
    id: "wave",
    emoji: "👋",
    labelKey: "chat.stickers.wave",
    category: "gestures",
  },
  {
    id: "thumbs_up",
    emoji: "👍",
    labelKey: "chat.stickers.thumbsUp",
    category: "gestures",
  },
  {
    id: "clap",
    emoji: "👏",
    labelKey: "chat.stickers.clap",
    category: "gestures",
  },
  {
    id: "pray",
    emoji: "🙏",
    labelKey: "chat.stickers.pray",
    category: "gestures",
  },
  { id: "ok", emoji: "👌", labelKey: "chat.stickers.ok", category: "gestures" },
  {
    id: "point",
    emoji: "👉",
    labelKey: "chat.stickers.point",
    category: "gestures",
  },
  {
    id: "smile",
    emoji: "😄",
    labelKey: "chat.stickers.smile",
    category: "mood",
  },
  {
    id: "laugh",
    emoji: "😂",
    labelKey: "chat.stickers.laugh",
    category: "mood",
  },
  { id: "love", emoji: "😍", labelKey: "chat.stickers.love", category: "mood" },
  { id: "cool", emoji: "😎", labelKey: "chat.stickers.cool", category: "mood" },
  {
    id: "think",
    emoji: "🤔",
    labelKey: "chat.stickers.think",
    category: "mood",
  },
  { id: "sad", emoji: "😢", labelKey: "chat.stickers.sad", category: "mood" },
  {
    id: "party",
    emoji: "🎉",
    labelKey: "chat.stickers.party",
    category: "celebration",
  },
  {
    id: "fire",
    emoji: "🔥",
    labelKey: "chat.stickers.fire",
    category: "celebration",
  },
  {
    id: "rocket",
    emoji: "🚀",
    labelKey: "chat.stickers.rocket",
    category: "celebration",
  },
  {
    id: "star",
    emoji: "⭐",
    labelKey: "chat.stickers.star",
    category: "celebration",
  },
  {
    id: "trophy",
    emoji: "🏆",
    labelKey: "chat.stickers.trophy",
    category: "celebration",
  },
  {
    id: "heart",
    emoji: "❤️",
    labelKey: "chat.stickers.heart",
    category: "celebration",
  },
  {
    id: "laptop",
    emoji: "💻",
    labelKey: "chat.stickers.laptop",
    category: "work",
  },
  { id: "bulb", emoji: "💡", labelKey: "chat.stickers.bulb", category: "work" },
  {
    id: "check",
    emoji: "✅",
    labelKey: "chat.stickers.check",
    category: "work",
  },
  { id: "memo", emoji: "📝", labelKey: "chat.stickers.memo", category: "work" },
  {
    id: "coffee",
    emoji: "☕",
    labelKey: "chat.stickers.coffee",
    category: "work",
  },
  {
    id: "clock",
    emoji: "⏰",
    labelKey: "chat.stickers.clock",
    category: "work",
  },
];

export const CHAT_STICKER_IDS = new Set(CHAT_STICKERS.map((s) => s.id));

export function getChatSticker(id: string): ChatSticker | undefined {
  return CHAT_STICKERS.find((s) => s.id === id);
}

/** Common emoji quick-picks for the chat composer. */
export const CHAT_EMOJI_PICKER = [
  "😀",
  "😁",
  "😂",
  "🤣",
  "😊",
  "😍",
  "🥰",
  "😘",
  "😜",
  "🤔",
  "😮",
  "😢",
  "😭",
  "😤",
  "😡",
  "🤯",
  "😴",
  "😷",
  "🤒",
  "🤠",
  "👋",
  "🤚",
  "✋",
  "👍",
  "👎",
  "👌",
  "✌️",
  "🤞",
  "👏",
  "🙌",
  "🙏",
  "💪",
  "❤️",
  "🧡",
  "💛",
  "💚",
  "💙",
  "💜",
  "🖤",
  "💔",
  "⭐",
  "✨",
  "🔥",
  "💯",
  "🎉",
  "🎊",
  "🎈",
  "🎁",
  "🏆",
  "🥇",
  "☕",
  "🍕",
  "🍔",
  "🍣",
  "🍦",
  "🍺",
  "🧋",
  "🍩",
  "🍪",
  "🍰",
  "💻",
  "📱",
  "⌚",
  "📷",
  "🎮",
  "🎧",
  "📚",
  "✏️",
  "📌",
  "✅",
  "🚀",
  "✈️",
  "🏠",
  "🌴",
  "🌊",
  "☀️",
  "🌙",
  "⚡",
  "🌈",
  "🐶",
] as const;

export const CHAT_BODY_MAX = 4000;

/** Max voice note length (2 minutes). */
export const CHAT_VOICE_MAX_MS = 120_000;

/** Soft client cap before upload; server uses uploadPolicy audio maxBytes. */
export const CHAT_VOICE_MAX_BYTES = 5 * 1024 * 1024;
