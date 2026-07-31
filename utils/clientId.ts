/**
 * Ids minted in the browser for time blocks and checklist items.
 *
 * These are not throwaway UI keys: `upsertTask` inserts the client's `b.id` /
 * `c.id` straight into `time_blocks.id` and `checklist_items.id`
 * (`server/db/tasks.ts`), so they become primary keys and need the same
 * entropy as server-generated ids. The previous inline
 * `Math.random().toString(16).slice(2, 10)` gave 32 bits from a non-CSPRNG,
 * and occasionally fewer than 8 characters — `(0.5).toString(16)` is `"0.8"`.
 *
 * Hex rather than base64url for the same reason as `server/db/ids.ts`: the id
 * columns use the case-insensitive `utf8mb4_unicode_ci` collation.
 */
export type ClientIdPrefix = "block" | "chk";

export function newClientId(prefix: ClientIdPrefix): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `${prefix}_${hex}`;
}
