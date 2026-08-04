---
name: user-delete-cascade
description: >-
  Hard rule: deleting a user must erase every artefact that belongs to them.
  When adding a new table (or column) that stores a user id — user_id,
  sender_id, owner_id, user_a_id, … — the FK must be ON DELETE CASCADE
  unless the row is not owned by that user. External stores (R2, jobs JSON,
  caches, denormalized counters) need an explicit deleteUser step in the
  same change. Use when writing migrations, CREATE TABLE, schemas, deleteUser
  changes, account-deletion flows, or any feature that stores per-user data.
---

# User delete must purge everything owned

**Hard rule:** when a user is hard-deleted, **nothing that belongs to them
may remain** — MySQL rows, object-storage keys, queue jobs addressed to
them, or caches that still serve their content.

**Hard rule for new tables:** if a new table (or a new column on an existing
table) holds a user id for **owned** data, declare

`FOREIGN KEY (…) REFERENCES users(id) ON DELETE CASCADE`

in the migration that creates it. No exceptions for “we’ll clean it up
later.” Shipping the table without the cascade is a bug.

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

---

## Adding a new table (migrations)

Every new migration under `server/db/migrations/` that introduces a user
reference must decide **owned** vs **not owned** up front.

### Owned by the user → `ON DELETE CASCADE` (default)

The row exists only because the user exists (their tasks, posts, money
rows, uploads, sessions, reactions they cast, chat participation, …).

```sql
-- ✅ template for a user-owned table
CREATE TABLE example_items (
  id         VARCHAR(64)  NOT NULL,
  user_id    VARCHAR(64)  NOT NULL,
  -- … payload columns …
  created_at DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_example_items_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_example_items_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Same rule for other ownership column names: `sender_id`, `owner_id`,
`user_a_id`, `user_b_id`, `actor_id`, … — if deleting the user should
remove the row, it is `ON DELETE CASCADE`.

### Child of an owned row → cascade through the parent

```sql
-- ✅ children die with the parent (parent already cascades from users)
CONSTRAINT fk_example_children_item
  FOREIGN KEY (item_id) REFERENCES example_items(id) ON DELETE CASCADE,
```

Do **not** skip the parent→child cascade and rely on “we only delete via
the API.” A direct `deleteUser` / admin delete never walks your service
layer.

### Not owned by that user → `SET NULL` or no user FK

Use only when the row must outlive the referenced user (or the reference
is optional metadata):

```sql
-- ✅ other people’s share posts keep their row when the original vanishes
CONSTRAINT fk_posts_shared
  FOREIGN KEY (shared_post_id) REFERENCES posts(id) ON DELETE SET NULL,

-- ✅ optional pointer at an upload, not ownership of the upload row
CONSTRAINT fk_users_avatar
  FOREIGN KEY (avatar_upload_id) REFERENCES uploads(id) ON DELETE SET NULL,
```

If you reach for `ON DELETE SET NULL` on a `user_id` column, stop —
that almost always means the row was actually owned and will orphan
content. Prefer CASCADE, or redesign so ownership is explicit.

### Outside MySQL — same PR as the table

If the feature also writes:

- R2 / object keys,
- `jobs.payload` (or any JSON that embeds email / user id),
- denormalized counters on **other** users’ rows,
- caches that serve the new content publicly,

then extend `deleteUser` **in the same change** as the migration, extend
`scripts/verify-user-delete-cascade.ts`, and update the “Account
hard-delete” note in `implement/database.md`.

---

## Do — calling delete

```ts
// ✅ only go through deleteUser
await deleteUser(id);
```

## Don’t

```sql
-- ❌ new table with user_id and no FK (orphans on delete)
user_id VARCHAR(64) NOT NULL

-- ❌ FK that blocks delete or leaves owned rows behind
FOREIGN KEY (user_id) REFERENCES users(id)              -- default RESTRICT
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  -- not for ownership columns

-- ❌ child table that does not cascade from its owned parent
FOREIGN KEY (item_id) REFERENCES example_items(id)      -- RESTRICT
```

```ts
-- ❌ bypass deleteUser
await pool.query("DELETE FROM users WHERE id = ?", [id]);

-- ❌ new per-user R2 / job / cache without a deleteUser hook
await r2PutObject(`user-export/${userId}.zip`, body);
await enqueueJob({ type: "email.send", payload: { to: user.email, … } });
```

## Checklist — new migration / table

1. Name the ownership column (`user_id` / `sender_id` / …).
2. Add `CONSTRAINT … FOREIGN KEY (…) REFERENCES users(id) ON DELETE CASCADE`.
3. Index the ownership column if you query by it.
4. Child tables: `ON DELETE CASCADE` to the owned parent.
5. Confirm you did **not** use `SET NULL` / bare FK on an ownership column.
6. If anything lives outside that FK graph, extend `deleteUser` + the audit script + docs in this PR.
7. Integer enums on the new table follow the `integer-db-enums` skill.
8. Document the table in `implement/database.md`.

## Checklist — other per-user data (non-table)

1. **No user id in JSON / free text** unless `deleteUser` can find and remove it (see `jobs.payload.to`).
2. **Object storage:** list keys before the user row goes away; purge after commit.
3. **Denormalized fields on other people’s rows** are recalculated in `deleteUser`.
4. **Caches / SSE** that can still show the user are busted (or die with a short TTL — prefer an explicit bust for public content).
5. **Privacy / terms** stay honest if the cascade surface changes (`utils/legal/privacy.ts`).
6. Run / extend `scripts/verify-user-delete-cascade.ts` against a local DB before shipping.

## Heuristic

If you would write `WHERE user_id = ?` to list “their stuff”, that stuff
**must** disappear when the account disappears — via CASCADE on the new
table, or an explicit `deleteUser` step. If unsure, add CASCADE **and**
an audit assertion.
