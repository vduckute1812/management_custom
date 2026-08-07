import { z } from "zod";
import {
  CHAT_BODY_MAX,
  CHAT_MESSAGE_KINDS,
  ChatMessageKind,
} from "~/types/chat";
import { postReactionBodySchema } from "./post";

export const chatMessageReactionBodySchema = postReactionBodySchema;

export const chatStartBodySchema = z.object({
  peerUserId: z.string().min(1, "peerUserId is required"),
});

export const chatConversationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().trim().min(1).max(512).optional(),
});

export const chatMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  before: z.string().min(1).optional(),
  after: z.string().min(1).optional(),
});

export const chatSendBodySchema = z
  .object({
    kind: z
      .number()
      .int()
      .refine(
        (v): v is ChatMessageKind =>
          (CHAT_MESSAGE_KINDS as readonly number[]).includes(v),
        { message: "Invalid message kind" },
      )
      .optional()
      .default(ChatMessageKind.Text),
    body: z.string().trim().max(CHAT_BODY_MAX).optional().nullable(),
    stickerId: z.string().trim().min(1).max(64).optional().nullable(),
    uploadId: z.string().trim().min(1).max(64).optional().nullable(),
    durationMs: z.number().int().min(200).max(120_000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === ChatMessageKind.Sticker) {
      if (!data.stickerId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stickerId"],
          message: "stickerId is required for sticker messages",
        });
      }
    } else if (
      data.kind === ChatMessageKind.Image ||
      data.kind === ChatMessageKind.Audio
    ) {
      if (!data.uploadId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["uploadId"],
          message: "uploadId is required for media messages",
        });
      }
      if (data.kind === ChatMessageKind.Audio && data.durationMs == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["durationMs"],
          message: "durationMs is required for voice messages",
        });
      }
    } else if (!data.body?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message: "Message body is required",
      });
    }
  });
