/**
 * Refresh-token reuse vs concurrent-tab race.
 *
 * After rotation, a second client may still present the revoked hash for a
 * short window. Revoking the whole family in that window kills the winner's
 * new session. Outside the grace window, reuse is treated as theft.
 */
export const REFRESH_REUSE_GRACE_MS = 15_000;

/** True when presenting a revoked refresh hash should revoke the family. */
export function shouldRevokeFamilyOnRefreshReuse(
  revokedAtIso: string,
  nowMs: number = Date.now(),
  graceMs: number = REFRESH_REUSE_GRACE_MS,
): boolean {
  const revokedMs = Date.parse(revokedAtIso);
  if (!Number.isFinite(revokedMs)) return true;
  return nowMs - revokedMs >= graceMs;
}
