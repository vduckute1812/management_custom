import { CHAT_STICKERS, CHAT_EMOJI_PICKER } from "~/types/chat";
import { requireUser } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  requireUser(event);
  return {
    stickers: CHAT_STICKERS,
    emoji: [...CHAT_EMOJI_PICKER],
  };
});
