/**
 * Feed page token: `createdAt|id` (stable under equal timestamps).
 * Legacy clients may still send a bare ISO `createdAt`.
 */
export function encodeFeedCursor(createdAt: string, id: string): string {
  return `${createdAt}|${id}`;
}

export function parseFeedCursor(cursor: string): {
  createdAt: string;
  id: string | null;
} {
  const trimmed = cursor.trim();
  const sep = trimmed.lastIndexOf("|");
  if (sep > 0) {
    const createdAt = trimmed.slice(0, sep);
    const id = trimmed.slice(sep + 1);
    if (createdAt && id) return { createdAt, id };
  }
  return { createdAt: trimmed, id: null };
}
