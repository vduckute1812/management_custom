import { z } from "zod";
import { APP_LOCALES } from "../../types/locale";
import { MONEY_CURRENCIES } from "../../types/money";
import { ASSIGNABLE_USER_ROLES, type UserRole } from "../../types/task";

export const loginBodySchema = z.object({
  email: z.string().trim().email("A valid email is required"),
  password: z.string().min(1, "Password is required"),
});

export const signupBodySchema = z.object({
  email: z.string().trim().email("A valid email is required"),
  password: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name must be 120 characters or fewer"),
  /** Preferred UI / email language; defaults to `en` server-side when omitted. */
  locale: z
    .string()
    .refine((v): v is (typeof APP_LOCALES)[number] =>
      (APP_LOCALES as readonly string[]).includes(v),
    )
    .optional(),
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

export const verifyEmailBodySchema = z.object({
  token: z.string().min(1, "token is required"),
});

export const forgotPasswordBodySchema = z.object({
  email: z.string().trim().email("A valid email is required"),
});

export const resetPasswordBodySchema = z.object({
  token: z.string().min(1, "token is required"),
  password: z.string().min(1, "Password is required"),
});

/**
 * Self-service account deletion. `email` is the typed confirmation, so it is
 * compared against the signed-in account rather than looked up. `password` is
 * required for accounts that have one — the handler decides, since Google-only
 * accounts have no hash to check.
 */
export const deleteAccountBodySchema = z.object({
  email: z.string().trim().min(1, "Type your email address to confirm"),
  password: z.string().min(1).optional(),
});

const optionalProfileText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v));

/** Display name is required on the account — empty / null is rejected. */
const profileNameField = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(120, "Name must be 120 characters or fewer")
  .optional();

export const profilePatchBodySchema = z
  .object({
    name: profileNameField,
    avatarUploadId: optionalProfileText,
    title: optionalProfileText,
    job: optionalProfileText,
    location: optionalProfileText,
  })
  .refine(
    (b) =>
      b.name !== undefined ||
      b.avatarUploadId !== undefined ||
      b.title !== undefined ||
      b.job !== undefined ||
      b.location !== undefined,
    { message: "At least one profile field is required" },
  );

export const preferencesPatchBodySchema = z
  .object({
    locale: z
      .string()
      .refine((v): v is (typeof APP_LOCALES)[number] =>
        (APP_LOCALES as readonly string[]).includes(v),
      )
      .optional(),
    moneyCurrency: z
      .number()
      .int()
      .refine((v): v is (typeof MONEY_CURRENCIES)[number] =>
        (MONEY_CURRENCIES as readonly number[]).includes(v),
      )
      .optional(),
  })
  .refine((b) => b.locale !== undefined || b.moneyCurrency !== undefined, {
    message: "At least one preference field is required",
  });

export const userDirectoryQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(20).optional().default(20),
});

export const adminUserRoleBodySchema = z.object({
  role: z
    .number()
    .int()
    .refine(
      (v): v is UserRole =>
        (ASSIGNABLE_USER_ROLES as readonly number[]).includes(v),
      {
        message: `role must be one of ${ASSIGNABLE_USER_ROLES.join(", ")}`,
      },
    ),
});
