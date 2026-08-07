import { DomainError } from "~/server/utils/http";

/** Stable keyset cursor for rows ordered by a timestamp and string id. */
export function encodeTimestampCursor(timestamp: string, id: string): string {
  return `${timestamp}|${id}`;
}

export function parseTimestampCursor(cursor: string): {
  timestamp: string;
  id: string;
} {
  const trimmed = cursor.trim();
  const separator = trimmed.lastIndexOf("|");
  const timestamp = separator > 0 ? trimmed.slice(0, separator) : "";
  const id = separator > 0 ? trimmed.slice(separator + 1) : "";

  if (!timestamp || !id || Number.isNaN(new Date(timestamp).getTime())) {
    throw new DomainError(400, "Invalid cursor");
  }

  return { timestamp, id };
}
