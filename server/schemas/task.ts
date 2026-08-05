import { z } from "zod";
import {
  EPIC_COLORS,
  RECURRENCE_RULES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "~/types/task";
import { dateOnly, optionalDate } from "./common";

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

/** `GET /api/tasks?include=blocks,checklists` — light list by default. */
export const tasksListQuerySchema = z
  .object({
    include: z.string().max(64).optional().default(""),
  })
  .transform((q, ctx) => {
    const tokens = q.include
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const unknown = tokens.filter(
      (t) => t !== "blocks" && t !== "checklists" && t !== "checklist",
    );
    if (unknown.length) {
      ctx.addIssue({
        code: "custom",
        path: ["include"],
        message: `Unknown include token(s): ${unknown.join(", ")}`,
      });
      return z.NEVER;
    }
    return {
      includeBlocks: tokens.includes("blocks"),
      includeChecklists:
        tokens.includes("checklists") || tokens.includes("checklist"),
    };
  });
