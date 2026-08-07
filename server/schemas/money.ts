import { z } from "zod";
import {
  MONEY_BUDGET_SCOPES,
  MONEY_CATEGORIES,
  MONEY_DIRECTIONS,
  MONEY_SAVINGS_GOAL_STATUSES,
  MoneyBudgetScope,
  type MoneyBudgetScope as MoneyBudgetScopeT,
  type MoneyCategory,
  type MoneyDirection,
  type MoneySavingsGoalStatus,
} from "~/types/money";
import { dateOnly, optionalDate } from "./common";

const directionSchema = z
  .number()
  .int()
  .refine(
    (v): v is MoneyDirection =>
      (MONEY_DIRECTIONS as readonly number[]).includes(v),
    { message: "Invalid direction" },
  );

const categorySchema = z
  .number()
  .int()
  .refine(
    (v): v is MoneyCategory =>
      (MONEY_CATEGORIES as readonly number[]).includes(v),
    { message: "Invalid category" },
  );

const userCategoryIdSchema = z.string().min(1).max(64);

const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "yearMonth must be YYYY-MM");

export const moneyTransactionsQuerySchema = z.object({
  yearMonth: yearMonthSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
  cursor: z.string().trim().min(1).max(512).optional(),
});

export const moneyTransactionUpsertBodySchema = z
  .object({
    id: z.string().min(1).optional(),
    occurredOn: dateOnly,
    amountMinor: z
      .number()
      .int("Amount must be a whole number of đồng")
      .min(0)
      .max(Number.MAX_SAFE_INTEGER),
    direction: directionSchema,
    category: categorySchema.nullable().optional(),
    userCategoryId: userCategoryIdSchema.nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((body, ctx) => {
    const hasBuiltin = body.category != null;
    const hasCustom = Boolean(body.userCategoryId);
    if (hasBuiltin === hasCustom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of category or userCategoryId",
        path: hasBuiltin ? ["userCategoryId"] : ["category"],
      });
    }
  });

const savingsStatusSchema = z
  .number()
  .int()
  .refine(
    (v): v is MoneySavingsGoalStatus =>
      (MONEY_SAVINGS_GOAL_STATUSES as readonly number[]).includes(v),
    { message: "Invalid savings goal status" },
  );

export const moneySavingsGoalUpsertBodySchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(120),
  targetMinor: z
    .number()
    .int("Target must be a whole number of đồng")
    .min(0)
    .max(Number.MAX_SAFE_INTEGER),
  status: savingsStatusSchema.optional(),
  targetDate: optionalDate,
  note: z.string().trim().max(500).nullable().optional(),
});

export const moneySavingsContributionCreateBodySchema = z.object({
  occurredOn: dateOnly,
  amountMinor: z
    .number()
    .int("Amount must be a whole number of đồng")
    .min(1)
    .max(Number.MAX_SAFE_INTEGER),
  note: z.string().trim().max(500).nullable().optional(),
});

const budgetScopeSchema = z
  .number()
  .int()
  .refine(
    (v): v is MoneyBudgetScopeT =>
      (MONEY_BUDGET_SCOPES as readonly number[]).includes(v),
    { message: "Invalid budget scope" },
  );

export const moneyBudgetsQuerySchema = z.object({
  yearMonth: yearMonthSchema.optional(),
});

export const moneyBudgetUpsertBodySchema = z
  .object({
    id: z.string().min(1).optional(),
    yearMonth: yearMonthSchema,
    scope: budgetScopeSchema,
    category: categorySchema.nullable().optional(),
    userCategoryId: userCategoryIdSchema.nullable().optional(),
    amountMinor: z
      .number()
      .int("Amount must be a whole number of đồng")
      .min(0)
      .max(Number.MAX_SAFE_INTEGER),
  })
  .superRefine((body, ctx) => {
    const hasBuiltin = body.category != null;
    const hasCustom = Boolean(body.userCategoryId);
    if (body.scope === MoneyBudgetScope.Overall) {
      if (hasBuiltin || hasCustom) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Overall budget must not set category",
          path: ["category"],
        });
      }
      return;
    }
    if (hasBuiltin === hasCustom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Category budget requires exactly one of category or userCategoryId",
        path: hasBuiltin ? ["userCategoryId"] : ["category"],
      });
    }
  });

export const moneyBudgetsCopyBodySchema = z.object({
  fromYearMonth: yearMonthSchema,
  toYearMonth: yearMonthSchema,
});

export const moneyUserCategoryUpsertBodySchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  emoji: z.string().trim().min(1).max(32),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, "color must be #RRGGBB"),
  direction: directionSchema,
});
