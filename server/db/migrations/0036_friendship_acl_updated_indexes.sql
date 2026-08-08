-- Cover accepted-friend ACL lookups that order by updated_at (newest peers
-- first when ACCEPTED_FRIEND_IDS_MAX truncates). List endpoints keep using
-- 0034's created_at indexes; this pair matches friendshipCache.ts:
--   WHERE status=? AND (requester_id=? OR addressee_id=?)
--   ORDER BY updated_at DESC, id DESC

ALTER TABLE friendships
  ADD INDEX idx_friendships_requester_status_updated_id
    (requester_id, status, updated_at, id),
  ADD INDEX idx_friendships_addressee_status_updated_id
    (addressee_id, status, updated_at, id);
