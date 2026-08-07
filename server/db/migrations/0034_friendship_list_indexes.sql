-- Cover friendship keyset pagination:
-- equality on one endpoint + integer status, followed by created_at/id order.
-- The two indexes also let the accepted-friends OR query use index merge for
-- requester and addressee branches before ordering the resulting page.

ALTER TABLE friendships
  ADD INDEX idx_friendships_requester_status_created_id
    (requester_id, status, created_at, id),
  ADD INDEX idx_friendships_addressee_status_created_id
    (addressee_id, status, created_at, id);
