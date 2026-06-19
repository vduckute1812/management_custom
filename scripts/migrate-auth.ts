/**
 * One-shot superadmin bootstrap. Seeds the very first install-owner account
 * so a fresh install has someone who can promote other users via
 * `POST /api/admin/users/:id/role`. The seeded account is created with role
 * `superadmin` — a tier above regular admins, never assignable through the
 * API, and protected against demotion. Idempotent: re-running is safe.
 *
 *   npm run migrate:auth
 *
 * Inputs (env):
 *   ADMIN_INITIAL_EMAIL     defaults to admin@local
 *   ADMIN_INITIAL_PASSWORD  REQUIRED on first run; we refuse to seed with a
 *                           weak default. (If you want a "throwaway local"
 *                           experience, set it to anything — we don't judge.)
 *   ADMIN_INITIAL_NAME      defaults to "Administrator"
 *
 * Upgrade path: if a prior version of this script already seeded the account
 * with `role: admin`, re-running this script promotes them to `superadmin`
 * so the install gains its tamper-proof owner without manual SQL.
 */
import {
  UserRole,
  countUsers,
  createUser,
  getPool,
  getUserByEmail,
  updateUserRole,
  verifyMigrationsApplied,
} from "../server/utils/db";
import { hashPassword } from "../server/utils/auth";

const DEFAULT_EMAIL = "admin@local";

async function main() {
  const email = (process.env.ADMIN_INITIAL_EMAIL ?? DEFAULT_EMAIL)
    .trim()
    .toLowerCase();
  const password = process.env.ADMIN_INITIAL_PASSWORD ?? "";
  const name = (process.env.ADMIN_INITIAL_NAME ?? "Administrator").trim();

  if (!password || password.length < 8) {
    throw new Error(
      "ADMIN_INITIAL_PASSWORD must be set to a value of at least 8 characters before seeding the initial admin."
    );
  }

  await verifyMigrationsApplied();
  console.log("[migrate:auth] schema ok");

  const existing = await getUserByEmail(email);
  if (existing) {
    if (existing.role === UserRole.Superadmin) {
      console.log(
        `[migrate:auth] superadmin ${existing.email} already exists (id=${existing.id}); nothing to do`
      );
    } else {
      await updateUserRole(existing.id, UserRole.Superadmin);
      console.log(
        `[migrate:auth] promoted ${existing.email} (id=${existing.id}) role=${existing.role} -> superadmin (${UserRole.Superadmin})`
      );
    }
  } else {
    const before = await countUsers();
    const admin = await createUser({
      email,
      name,
      passwordHash: await hashPassword(password),
      role: UserRole.Superadmin,
      emailVerified: true,
    });
    console.log(
      `[migrate:auth] seeded superadmin ${admin.email} (id=${admin.id}); user count ${before} -> ${before + 1}`
    );
  }

  console.log("[migrate:auth] done");
  await getPool().end();
}

main().catch((err) => {
  console.error("[migrate:auth] FAILED:", err?.message ?? err);
  if (err?.code) console.error("        code:", err.code);
  process.exit(1);
});
