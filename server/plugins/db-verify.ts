import { verifyMigrationsApplied } from "../db/migrator";

/**
 * Nitro server plugin: verify the database schema is up-to-date before
 * we accept any traffic. Schema is owned by `npm run migrate`, not by
 * the app — if migrations are pending or have drifted, we abort the
 * boot with a loud message rather than serving requests against a
 * mismatched schema.
 */
export default defineNitroPlugin(async () => {
  try {
    await verifyMigrationsApplied();
    console.info(
      `[db] schema up to date on database '${process.env.DB_NAME || "rc"}'`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[db] schema verification failed:\n" + message);
    // Re-throw so Nitro surfaces the failure during boot. In production
    // the orchestrator should treat this as a non-recoverable startup
    // error; in dev the developer just sees the message and runs
    // `npm run migrate`.
    throw err;
  }
});
