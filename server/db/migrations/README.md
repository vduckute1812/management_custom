# Migrations

Forward-only SQL migrations applied by `server/db/migrator.ts` and the
`npm run migrate` CLI. The `schema_migrations` table tracks every
applied file by id + SHA-256 checksum.

## File naming

```
NNNN_short_name.sql
```

- `NNNN` — zero-padded sequence number (4+ digits). Files sort
  lexically, which is also the apply order.
- `short_name` — snake_case description (`add_archived_at`,
  `drop_legacy_tags`, …).

Use bare DDL — every migration applies exactly once against a known
schema, so guards like `IF NOT EXISTS` are noise that hide bugs.

## Immutability rule

**Once a migration has been applied to any environment that you don't
own end-to-end, you must not edit it.** The migrator stores the
SHA-256 of every applied file and refuses to run if the on-disk
content has drifted from the stored hash:

```
Migration checksum mismatch:
  - 0002_add_users_avatar_url  on-disk=a31f4c…  applied=7f8d22…

Migrations are immutable once applied. Revert your edit, or add a NEW
migration that performs the change.
```

If you wrote a bad migration that you've already applied **only on
your own dev box**:

1. Fix the file in place, then either `npm run migrate:reset` to drop
   everything and re-apply from scratch (requires
   `MIGRATE_RESET_CONFIRM=yes`) **or** hand-update the row in
   `schema_migrations` to the new checksum.
2. Once a migration is in someone else's DB, you must add a corrective
   follow-up migration instead.

## Transactional caveat

MySQL **does not** support transactional DDL. Statements inside one
`.sql` file run in order, but if statement N fails, 1…N-1 are already
committed. Prefer one logical change per migration so the rollback
story stays "add a follow-up migration".

## Concurrency

`runMigrations()` takes a `GET_LOCK('schema_migrations', 30)` MySQL
advisory lock for the entire run, so two app instances starting at the
same time cannot double-apply.
