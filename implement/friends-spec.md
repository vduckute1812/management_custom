# Friends (social graph)

Feature spec for the **Friends** graph that gates Chat and selective Feed sharing.

## Goal

Let signed-in members request, accept, decline, and unfriend peers on one install. An Accepted friendship is the ACL key for starting 1:1 Chat and for Feed visibility `Friends` / story tray peers.

## Scope

**In**

- Facebook-style request → accept (no follow-only mode)
- Status as TINYINT end-to-end: `Pending=0`, `Accepted=1` (`~/types/friendship.ts`)
- Lists: accepted friends, incoming requests, outgoing requests (cursor-paged)
- Incoming-count badge for header chrome
- Reciprocal pending request auto-accepts on `POST /api/friends`
- Auth required for all routes

**Out (later)**

- Block / mute lists
- Friend suggestions / discovery beyond directory search
- Groups or circles
- Cross-install federation

## UX

1. Module nav **Friends** (Feed+Friends+Chat section) and shortcut `g r` / command palette
2. Page `/friends`: search install members, send request, accept / decline / unfriend
3. Header badge for pending incoming count (`GET /api/friends/incoming-count`)
4. Chat “New chat” lists Accepted friends (not a free-form directory of strangers)
5. Empty state: search to find people on this install

## Data

- `friendships` — ordered pair `(requester_id, addressee_id)`, unique undirected pair constraint, `status` TINYINT, timestamps
- Process-local cache of accepted friend ids for feed/story/upload ACL `IN (…)` lists (`listAcceptedFriendIds` + invalidate on mutate)
- On accept / unfriend, also bust per-viewer upload ACL allow+row cache so friends-visibility media cannot ride a stale allow

Migrations: `0033_friendships.sql`, `0034_friendship_list_indexes.sql`.

Domain SQL: `server/db/friends/` (`friendshipShared`, `friendshipCache`, `friendshipReads`, `friendshipMutations`; barrel `friendships.ts`).

## API (summary)

| Method   | Path                          | Purpose                                                       |
| -------- | ----------------------------- | ------------------------------------------------------------- |
| `GET`    | `/api/friends`                | Compact overview `{ friends, incoming, outgoing }`            |
| `GET`    | `/api/friends/accepted`       | Cursor-paged Accepted friends                                 |
| `GET`    | `/api/friends/incoming`       | Cursor-paged incoming pending                                 |
| `GET`    | `/api/friends/outgoing`       | Cursor-paged outgoing pending                                 |
| `GET`    | `/api/friends/incoming-count` | Badge `{ count }`                                             |
| `POST`   | `/api/friends`                | Body `{ userId }` — request or auto-accept reciprocal pending |
| `POST`   | `/api/friends/:id/accept`     | Addressee accepts                                             |
| `DELETE` | `/api/friends/:id`            | Cancel / decline / unfriend                                   |

See [`api.md`](./api.md) (Friends section) and [`database.md`](./database.md) for the as-built reference. Chat friends-only gate: [`chat-spec.md`](./chat-spec.md).
