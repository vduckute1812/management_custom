/**
 * Accepted-friend-id cache for feed/story/upload ACL IN lists.
 */
import { FriendshipStatus } from "~/types/friendship";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "../core/pool";
import { ACCEPTED_FRIEND_IDS_MAX } from "../../utils/listLimits";

/** Peer user ids with an Accepted friendship (for feed/story ACL `IN` lists). */
const FRIEND_IDS_TTL_MS = 60_000;
const FRIEND_IDS_CACHE_MAX = 500;
const friendIdsCache = new Map<string, { until: number; ids: string[] }>();

function rememberFriendIds(userId: string, ids: string[]) {
  if (friendIdsCache.size >= FRIEND_IDS_CACHE_MAX) {
    const oldest = friendIdsCache.keys().next().value;
    if (oldest) friendIdsCache.delete(oldest);
  }
  friendIdsCache.set(userId, { ids, until: Date.now() + FRIEND_IDS_TTL_MS });
}

export async function listAcceptedFriendIds(userId: string): Promise<string[]> {
  if (!userId) return [];
  const hit = friendIdsCache.get(userId);
  if (hit && hit.until > Date.now()) return hit.ids;

  const pool = getPool();
  // Newest friendships first so ACL prefers active peers if the soft cap hits.
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT IF(requester_id = ?, addressee_id, requester_id) AS peer_id
     FROM friendships
     WHERE status = ?
       AND (requester_id = ? OR addressee_id = ?)
     ORDER BY updated_at DESC, id DESC
     LIMIT ?`,
    [
      userId,
      FriendshipStatus.Accepted,
      userId,
      userId,
      ACCEPTED_FRIEND_IDS_MAX,
    ],
  );
  const ids = rows.map((r) => String(r.peer_id));
  if (ids.length >= ACCEPTED_FRIEND_IDS_MAX) {
    console.warn(
      `[friends] accepted friend-id ACL capped at ${ACCEPTED_FRIEND_IDS_MAX} for user ${userId}`,
    );
  }
  rememberFriendIds(userId, ids);
  return ids;
}

/** Clear process-local friend-id cache (tests / after friendship mutations). */
export function invalidateAcceptedFriendIdsCache(userId?: string) {
  if (!userId) {
    friendIdsCache.clear();
    return;
  }
  friendIdsCache.delete(userId);
}
