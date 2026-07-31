import { z } from "zod";

export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const optionalDate = z
  .union([dateOnly, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === null || v === undefined ? null : v));
