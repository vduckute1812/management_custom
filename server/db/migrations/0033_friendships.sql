-- Friendships (Facebook-style request → accept) + Friends post visibility.
-- FriendshipStatus: Pending=0, Accepted=1
-- PostVisibility adds Friends=3 (Public=0, Private=1, Shared=2 unchanged).

CREATE TABLE IF NOT EXISTS friendships (
  id            VARCHAR(64)     NOT NULL,
  requester_id  VARCHAR(64)     NOT NULL,
  addressee_id  VARCHAR(64)     NOT NULL,
  status        TINYINT UNSIGNED NOT NULL,
  -- Pending=0, Accepted=1
  created_at    DATETIME(3)     NOT NULL,
  updated_at    DATETIME(3)     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_friendships_pair (requester_id, addressee_id),
  KEY idx_friendships_addressee_status (addressee_id, status),
  KEY idx_friendships_requester_status (requester_id, status),
  KEY idx_friendships_status (status),
  CONSTRAINT fk_friendships_requester
    FOREIGN KEY (requester_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_friendships_addressee
    FOREIGN KEY (addressee_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_friendships_not_self
    CHECK (requester_id <> addressee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Existing user (Normal) Public posts → Friends. Admin/superadmin Public stay Public
-- (portal / pipeline broadcast). Role: Normal=0, Admin=1, Superadmin=2.
UPDATE posts p
INNER JOIN users u ON u.id = p.user_id
SET p.visibility = 3
WHERE p.visibility = 0
  AND u.role = 0;
