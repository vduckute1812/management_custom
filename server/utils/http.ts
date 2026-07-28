import type { H3Event } from "h3";
import type { ZodTypeAny, z } from "zod";

/**
 * Shared request parsing + domain-error translation for Nitro handlers.
 */

export async function parseBody<T extends ZodTypeAny>(
  event: H3Event,
  schema: T,
): Promise<z.infer<T>> {
  const raw = await readBody(event).catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message || "Invalid body",
      data: { issues: parsed.error.issues },
    });
  }
  return parsed.data;
}

export function parseQuery<T extends ZodTypeAny>(
  event: H3Event,
  schema: T,
): z.infer<T> {
  const parsed = schema.safeParse(getQuery(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message || "Invalid query",
      data: { issues: parsed.error.issues },
    });
  }
  return parsed.data;
}

/** Lightweight typed error for service-layer business failures. */
export class DomainError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "DomainError";
    this.statusCode = statusCode;
  }
}

export function mapDomainError(err: unknown): never {
  if (err instanceof DomainError) {
    throw createError({
      statusCode: err.statusCode,
      statusMessage: err.message,
    });
  }
  const statusCode = (err as { statusCode?: number })?.statusCode;
  const message = (err as Error)?.message;
  if (
    typeof statusCode === "number" &&
    statusCode >= 400 &&
    statusCode < 600 &&
    message
  ) {
    throw createError({ statusCode, statusMessage: message });
  }
  throw err;
}
