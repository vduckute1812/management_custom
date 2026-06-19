/**
 * Migration CLI.
 *
 *   npm run migrate            # apply all pending migrations
 *   npm run migrate:status     # show applied + pending + drift
 *   npm run migrate:reset      # DEV ONLY — drop every known table
 *                              # requires MIGRATE_RESET_CONFIRM=yes
 *
 * Exit codes:
 *   0  success
 *   1  unexpected error
 *   2  drift / invalid command
 */
import {
  migrationStatus,
  resetSchema,
  runMigrations,
} from "../server/db/migrator";
import { getPool } from "../server/db/pool";

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

async function cmdStatus(): Promise<number> {
  const s = await migrationStatus();
  if (!s.applied.length && !s.pending.length) {
    console.log("[migrate] no migration files found");
    return 0;
  }
  console.log(
    `[migrate] applied: ${s.applied.length}, pending: ${s.pending.length}` +
      (s.drift.length ? `, drift: ${s.drift.length}` : "")
  );
  for (const m of s.applied) {
    console.log(
      `  [x] ${pad(m.id, 32)} applied ${m.appliedAt} (${m.durationMs}ms)`
    );
  }
  for (const m of s.pending) {
    console.log(`  [ ] ${pad(m.id, 32)} pending`);
  }
  if (s.drift.length) {
    console.error("\n[migrate] CHECKSUM DRIFT detected:");
    for (const d of s.drift) {
      console.error(
        `  ! ${d.id}  on-disk=${d.expected.slice(0, 12)}…  applied=${d.actual.slice(0, 12)}…`
      );
    }
    console.error(
      "\nMigrations are immutable once applied. Revert your edit, " +
        "or add a NEW migration."
    );
    return 2;
  }
  return 0;
}

async function cmdUp(): Promise<number> {
  const result = await runMigrations();
  if (!result.applied.length) {
    console.log(
      `[migrate] nothing to do (${result.alreadyApplied} already applied)`
    );
    return 0;
  }
  for (const id of result.applied) {
    console.log(`[migrate] applied ${id}`);
  }
  console.log(
    `[migrate] done (${result.applied.length} applied, ` +
      `${result.alreadyApplied + result.applied.length} total)`
  );
  return 0;
}

async function cmdReset(): Promise<number> {
  const dropped = await resetSchema();
  console.log(`[migrate] dropped ${dropped.length} tables: ${dropped.join(", ")}`);
  console.log("[migrate] run `npm run migrate` to re-apply from scratch");
  return 0;
}

async function main() {
  const cmd = (process.argv[2] ?? "up").toLowerCase();
  let exit = 1;
  try {
    if (cmd === "up") exit = await cmdUp();
    else if (cmd === "status") exit = await cmdStatus();
    else if (cmd === "reset") exit = await cmdReset();
    else {
      console.error(`Unknown command: "${cmd}". Use one of: up, status, reset`);
      exit = 2;
    }
  } catch (err) {
    console.error("[migrate] error:", (err as Error).message);
    exit = 1;
  } finally {
    await getPool()
      .end()
      .catch(() => {
        // Best-effort; the process is about to exit.
      });
  }
  process.exit(exit);
}

main();
