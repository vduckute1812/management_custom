---
name: user-delete-cascade
description: >-
  Hard rule: deleting a user must erase every artefact that belongs to them.
  New user-owned tables need ON DELETE CASCADE (or an explicit deleteUser
  step). External stores (R2, jobs JSON, caches, denormalized counters) are
  never left behind. Use when writing migrations with user_id, deleteUser
  changes, account-deletion flows, or any feature that stores per-user data.
---

# User delete must purge everything owned

**Hard rule:** when a user is hard-deleted, **nothing that belongs to them
may remain** — MySQL rows, object-storage keys, queue jobs addressed to
them, or caches that still serve their content.

Canonical implementation: `deleteUser` in
[`server/db/users.ts`](../../server/db/users.ts). Both self-service
(`DELETE /api/auth/account`) and admin (`DELETE /api/admin/users/:id`)
**must** call it — never `DELETE FROM users` ad hoc.

Docs: [`implement/database.md`](../../implement/database.md)
(“Account hard-delete”). Audit script:
[`scripts/verify-user-delete-cascade.ts`](../../scripts/verify-user-delete-cascade.ts).

## What `deleteUser` already does

| Layer                 | Mechanism                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Owned MySQL rows      | Every FK to `users(id)` is `ON DELETE CASCADE`                                                    |
| Email queue jobs      | `deleteJobsForRecipientEmail` — `jobs` has no `user_id`                                           |
| Cloudflare R2         | Pre-collect `uploads.storage_key` + legacy `stories.media_storage_key`, then `purgeR2StorageKeys` |
| Denormalized counters | Recount `posts.comment_count` on posts they commented on                                          |
| Public feed cache     | `invalidatePublicFeedCaches()`                                                                    |

Share posts **owned by other users** that pointed at this user’s originals
keep their row with `shared_post_id` SET NULL — those posts belong to the
sharer, not the deleted account.

## Do — new user-owned table

```sql
-- ✅ owned row vanishes with the user
user_id VARCHAR(64) NOT NULL,
CONSTRAINT fk_example_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
```

```ts
// ✅ only go through deleteUser
await deleteUser(id);
```

If the new data **cannot** use a FK (JSON payload, external object store,
in-memory / Redis cache, denormalized counter on someone else’s row):

1. Extend `deleteUser` in the **same change** as the feature.
2. Collect whatever you need **before** `DELETE FROM users`.
3. Clean it up inside the transaction when it is MySQL, or best-effort
   after commit when it is external (same pattern as R2 / feed cache).
4. Extend `scripts/verify-user-delete-cascade.ts` so a leftover fails the audit.
5. Update the “Account hard-delete” note in `implement/database.md`.

## Don’t

```sql
-- ❌ user-owned table with no FK (orphans on delete)
user_id VARCHAR(64) NOT NULL

-- ❌ FK that blocks or orphans instead of cascading
FOREIGN KEY (user_id) REFERENCES users(id)            -- default RESTRICT
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  -- only OK when the row is NOT owned by the user (e.g. shared_post_id)
```

```ts
-- ❌ bypass deleteUser
await pool.query("DELETE FROM users WHERE id = ?", [id]);

-- ❌ new per-user R2 / job / cache without a deleteUser hook
await r2PutObject(`user-export/${userId}.zip`, body);
await enqueueJob({ type: "email.send", payload: { to: user.email, … } });
```

## Checklist (new per-user data)

1. **MySQL ownership:** column is `user_id` (or `sender_id` / `user_a_id` / …) with `REFERENCES users(id) ON DELETE CASCADE`.
2. **Children of owned rows** cascade too (`time_blocks` → `tasks` → `users`, etc.).
3. **No user id in JSON / free text** unless `deleteUser` learns how to find and remove it (see `jobs.payload.to`).
4. **Object storage:** keys are listed before the user row goes away; purge after commit.
5. **Denormalized fields on other people’s rows** (counts, last-message pointers, …) are recalculated in `deleteUser`.
6. **Caches / SSE maps** that can still show the user are invalidated or keyed so they die with TTL — prefer an explicit bust when the user’s public content is involved.
7. **Privacy / terms** stay honest if the cascade surface changes (`utils/legal/privacy.ts` retention + “your requests” sections).
8. Run / extend `scripts/verify-user-delete-cascade.ts` against a local DB before shipping.

## Heuristic

If you would write `WHERE user_id = ?` to list “their stuff”, that stuff
**must** disappear when the account disappears — via CASCADE or an explicit
`deleteUser` step. If unsure, add CASCADE **and** an audit assertion.
