---
name: integer-db-enums
description: >-
  Hard rule: never create string field-type enums. Any closed domain set
  (status, role, kind, reaction, format, visibility, upload kind, …) must be
  TINYINT UNSIGNED + a named integer const — not MySQL ENUM('a','b'), not
  VARCHAR of tokens, not TypeScript "a"|"b" wire types. Use when writing
  migrations, schemas, DTOs, or new enum-shaped API fields.
---

# Never create string field-type enums

**Hard rule:** if a column / DTO field is a closed domain set (an enum), its
**field type must be an integer** — never a string.

That bans all of these for new work:

| Bad field type                               | Example                                   |
| -------------------------------------------- | ----------------------------------------- |
| MySQL `ENUM('a','b')`                        | `reaction ENUM('like','love',…)`          |
| `VARCHAR` / `TEXT` holding tokens            | `status VARCHAR(16)` with `'todo'/'done'` |
| TS string union as the wire/DB type          | `type X = "like" \| "love"`               |
| Zod `z.enum(["like","love"])` for that field | body `{ "reaction": "like" }`             |

Use **`TINYINT UNSIGNED`** + a named `const` object. The same integer flows
MySQL → mapper → API JSON → UI. No string↔number translation helpers.

Canonical docs: [`implement/database.md`](../../implement/database.md)
(“Integer enums, end-to-end”).

## Do

```sql
-- ✅ integer field type
reaction TINYINT UNSIGNED NOT NULL,
-- Like=0, Love=1, Haha=2, Wow=3, Sad=4, Angry=5
```

```ts
// ✅ named integer const (types/*.ts)
export const ReactionType = {
  Like: 0,
  Love: 1,
  Haha: 2,
  Wow: 3,
  Sad: 4,
  Angry: 5,
} as const;
export type ReactionType = (typeof ReactionType)[keyof typeof ReactionType];
export const REACTION_TYPES = [
  ReactionType.Like,
  ReactionType.Love,
  ReactionType.Haha,
  ReactionType.Wow,
  ReactionType.Sad,
  ReactionType.Angry,
] as const;
```

```ts
// ✅ Zod: numbers only
reaction: z.number()
  .int()
  .refine((v): v is ReactionType =>
    (REACTION_TYPES as readonly number[]).includes(v),
  );
```

Wire body: `{ "reaction": 0 }` — never `{ "reaction": "like" }`.

Labels / emoji live in UI maps (`REACTION_EMOJI`, i18n keys) keyed by the
integer const — not in the database string.

## Don’t

```sql
-- ❌ string field-type enum (MySQL ENUM)
reaction ENUM('like', 'love', 'haha', 'wow', 'sad', 'angry') NOT NULL

-- ❌ string field-type enum (VARCHAR tokens)
status VARCHAR(16) NOT NULL  -- 'todo' | 'done'
```

```ts
// ❌ string field-type enum (TS + API)
export type PostReactionType =
  "like" | "love" | "haha" | "wow" | "sad" | "angry";

z.enum(["like", "love", "haha", "wow", "sad", "angry"]);
```

## Checklist (new enum field)

1. Define / extend a numeric `const` in `types/`.
2. Migration: `TINYINT UNSIGNED` only (nullable only if the domain allows `NULL`).
3. Document the `0/1/2…` mapping in the migration comment and `implement/database.md`.
4. Zod: `.number().int().refine` against the const list — reject strings with `400`.
5. Coerce DB rows with `Number(...)` / helpers like `toReactionType` — never keep raw strings.
6. UI: `=== ReactionType.Like` / `!= null` (**`0` is valid** — no truthiness checks).
7. Update `implement/api.md` when the field is public.

## When strings are OK (not enums)

Strings are fine for **open** or **presentational** values, not closed domain enums:

- Free-text (titles, bodies, emails, URLs)
- Opaque tokens that are not switched on in SQL (`epics.color` Tailwind tokens)
- BCP-47 locale tags when stored as tags

**Heuristic:** if you would write `switch (x)` / `z.enum([...])` / `WHERE x IN (…)`,
it is an enum → **integer field type**. If unsure, use integer.

## Migrating a legacy string enum

Do **not** edit an already-applied migration. Add a new one that:

1. Adds `*_int TINYINT UNSIGNED`
2. `UPDATE … SET *_int = CASE old_col WHEN 'like' THEN 0 … END`
3. Drops the string/`ENUM` column and renames `*_int` to the final name

Ship the TypeScript integer const in the same change as the migration.
