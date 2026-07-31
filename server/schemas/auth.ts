import { z } from "zod";

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

const optionalProfileText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v));

export const profilePatchBodySchema = z
  .object({
    name: optionalProfileText,
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

export const userDirectoryQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(20).optional().default(20),
});
