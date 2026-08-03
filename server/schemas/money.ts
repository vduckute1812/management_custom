import { z } from "zod";
import {
  MONEY_CATEGORIES,
  MONEY_DIRECTIONS,
  type MoneyCategory,
  type MoneyDirection,
} from "~/types/money";
import { dateOnly } from "./common";

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

const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "yearMonth must be YYYY-MM");

export const moneyTransactionsQuerySchema = z.object({
  yearMonth: yearMonthSchema.optional(),
});

export const moneyTransactionUpsertBodySchema = z.object({
  id: z.string().min(1).optional(),
  occurredOn: dateOnly,
  amountMinor: z
    .number()
    .int("Amount must be a whole number of đồng")
    .min(0)
    .max(Number.MAX_SAFE_INTEGER),
  direction: directionSchema,
  category: categorySchema,
  note: z.string().trim().max(500).nullable().optional(),
});
