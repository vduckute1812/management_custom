/**
 * Public surface of the server-side DB layer.
 *
 * This file used to hold the entire layer (~1.5k lines); it has been
 * split into focused per-concern modules under `~/server/db/*`. This
 * barrel is the only thing the rest of the codebase imports from —
 * keeping it stable means moving things between sub-modules is a
 * refactor with no caller fallout.
 *
 * The split files live OUTSIDE `server/utils/` so Nitro's auto-import
 * (which scans `server/utils/**`) doesn't expose every internal symbol
 * as an ambient global and conflict with the explicit re-exports here.
 *
 * Sub-modules (in dependency order):
 *   - types.ts                 — Domain + auth types, role helpers
 *   - pool.ts                  — mysql2 pool + env-driven config
 *   - migrator.ts              — Migration runner + schema_migrations
 *   - ids.ts                   — generateId, nowISO
 *   - datetime.ts              — ISO ↔ MySQL DATETIME, JSON helpers
 *   - compute.ts               — Pure aggregations + view materializers
 *   - mappers.ts               — Row interfaces + row → domain converters
 *   - epics.ts                 — Epic CRUD
 *   - tasks.ts                 — Task CRUD + appendBlock
 *   - timer.ts                 — Active-timer get/set
 *   - users.ts                 — User CRUD + role/password/verified mutators
 *   - refresh-tokens.ts        — Refresh-token lifecycle
 *   - email-verifications.ts   — Email-verification lifecycle
 *   - admin.ts                 — Cross-user aggregations (UNSCOPED)
 *
 * NOTE: there is no longer an `ensureBootstrap()`. Schema is managed
 * by `npm run migrate`; the server refuses to start if any migration
 * is pending (see `server/plugins/db-verify.ts`).
 */

export * from "../db/types";
export * from "../db/pool";
export * from "../db/ids";
export * from "../db/compute";
export { toAuthUser } from "../db/mappers";
export * from "../db/epics";
export * from "../db/tasks";
export * from "../db/timer";
export * from "../db/users";
export * from "../db/refresh-tokens";
export * from "../db/email-verifications";
export * from "../db/admin";
// Only the two read-side helpers are exposed through the runtime barrel.
// `runMigrations` / `resetSchema` / `discoverMigrations` are CLI-only and
// are imported directly from `~/server/db/migrator` by `scripts/migrate.ts`.
export { migrationStatus, verifyMigrationsApplied } from "../db/migrator";
