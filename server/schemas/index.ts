import { z } from "zod";
import {
  EPIC_COLORS,
  RECURRENCE_RULES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "~/types/task";
import {
  POST_FONT_FAMILIES,
  POST_FORMATS,
  POST_TEXT_COLORS,
} from "~/types/post";
import {
  POST_BODY_MAX_MANUSCRIPT,
  POST_BODY_MAX_UPDATE,
  POST_TITLE_MAX,
} from "~/utils/postBodyLimits";
import { UPLOAD_MAX_PER_POST } from "~/utils/uploadPolicy";
import { CONTENT_LOCALES } from "~/utils/contentLocale";
import {
  CHAT_BODY_MAX,
  CHAT_MESSAGE_KINDS,
  ChatMessageKind,
} from "~/types/chat";

const statusSchema = z
  .number()
  .int()
  .refine(
    (v): v is (typeof TASK_STATUSES)[number] =>
      (TASK_STATUSES as readonly number[]).includes(v),
    {
      message: "Invalid status",
    },
  );

const prioritySchema = z
  .number()
  .int()
  .refine(
    (v): v is (typeof TASK_PRIORITIES)[number] =>
      (TASK_PRIORITIES as readonly number[]).includes(v),
    {
      message: "Invalid priority",
    },
  );

const recurrenceRuleSchema = z
  .number()
  .int()
  .refine(
    (v): v is (typeof RECURRENCE_RULES)[number] =>
      (RECURRENCE_RULES as readonly number[]).includes(v),
    {
      message: "Invalid recurrence rule",
    },
  );

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const optionalDate = z
  .union([dateOnly, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === null || v === undefined ? null : v));

const checklistItemSchema = z.object({
  id: z.string().min(1).optional(),
  text: z.string().trim().min(1).max(500),
  done: z.boolean().optional().default(false),
});

const timeBlockSchema = z.object({
  id: z.string().min(1).optional(),
  start: z.string().min(1),
  end: z.string().min(1),
  spentHours: z.number().min(0).optional(),
  projected: z.boolean().optional(),
});

const recurrenceSchema = z.object({
  rule: recurrenceRuleSchema,
  interval: z.number().int().min(1).max(365).optional().default(1),
  until: dateOnly.optional(),
});

export const loginBodySchema = z.object({
  email: z.string().trim().email("A valid email is required"),
  password: z.string().min(1, "Password is required"),
});

export const signupBodySchema = z.object({
  email: z.string().trim().email("A valid email is required"),
  password: z.string().min(1),
  name: z.string().trim().max(120).optional(),
});

export const refreshBodySchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
  })
  .optional()
  .default({});

export const logoutBodySchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
    everywhere: z.boolean().optional().default(false),
  })
  .optional()
  .default({});

export const taskUpsertBodySchema = z.object({
  id: z.string().min(1).optional(),
  epicId: z.string().min(1).nullable().optional(),
  title: z.string().trim().min(1, "Title is required").max(300),
  notes: z.string().max(20_000).optional().nullable(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  dueDate: optionalDate,
  estimatedHours: z.number().min(0).max(10_000).optional().nullable(),
  progress: z.number().min(0).max(100).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(64)).max(40).optional(),
  timeBlocks: z.array(timeBlockSchema).max(500).optional(),
  checklist: z.array(checklistItemSchema).max(200).optional(),
  recurrence: recurrenceSchema.nullable().optional(),
});

export const epicUpsertBodySchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1, "Title is required").max(300),
  description: z.string().max(20_000).optional().nullable(),
  status: statusSchema.optional(),
  color: z
    .string()
    .refine(
      (v): v is (typeof EPIC_COLORS)[number] =>
        (EPIC_COLORS as readonly string[]).includes(v),
      {
        message: "Invalid color",
      },
    )
    .optional(),
  dueDate: optionalDate,
  tags: z.array(z.string().trim().min(1).max(64)).max(40).optional(),
});

export const timerStartBodySchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
});

export const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  cursor: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  locale: z.string().min(2).max(16).optional(),
});

export const postCreateBodySchema = z
  .object({
    body: z.string().trim().min(1, "Post body is required"),
    title: z.string().trim().max(POST_TITLE_MAX).optional().nullable(),
    format: z
      .enum(POST_FORMATS as unknown as [string, ...string[]])
      .optional()
      .default("update"),
    visibility: z
      .enum(["public", "private", "shared"])
      .optional()
      .default("public"),
    audienceUserIds: z.array(z.string().min(1)).max(50).optional().default([]),
    attachmentIds: z
      .array(z.string().min(1))
      .max(UPLOAD_MAX_PER_POST)
      .optional()
      .default([]),
    categoryId: z.string().min(1).nullable().optional(),
    fontFamily: z
      .enum(POST_FONT_FAMILIES as unknown as [string, ...string[]])
      .optional()
      .default("default"),
    textColor: z
      .enum(POST_TEXT_COLORS as unknown as [string, ...string[]])
      .optional()
      .default("default"),
    contentLocale: z
      .enum(CONTENT_LOCALES as unknown as [string, ...string[]])
      .optional()
      .nullable(),
    translationGroupId: z.string().min(1).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const max =
      data.format === "manuscript"
        ? POST_BODY_MAX_MANUSCRIPT
        : POST_BODY_MAX_UPDATE;
    if (data.body.length > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: max,
        type: "string",
        inclusive: true,
        path: ["body"],
        message: `Post body must be at most ${max} characters`,
      });
    }
    if (data.format === "manuscript") {
      const title = (data.title ?? "").trim();
      if (!title) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["title"],
          message: "Manuscript title is required",
        });
      }
    }
  });

export const chatStartBodySchema = z.object({
  peerUserId: z.string().min(1, "peerUserId is required"),
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
    } else if (!data.body?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message: "Message body is required",
      });
    }
  });
