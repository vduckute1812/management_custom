/**
 * In-process job worker.
 *
 * Runs inside the Nitro app process (no separate worker container required
 * on a Pi). Claims jobs with SKIP LOCKED, processes one at a time, and
 * backs off when the queue is idle.
 *
 * Disable with QUEUE_WORKER_ENABLED=false (useful for migrate-only containers).
 */
import { hostname } from "node:os";
import {
  claimNextJob,
  completeJob,
  failJob,
  purgeOldJobs,
  requeueStaleJobs,
} from "../db/jobs";
import { processJob } from "../utils/queue";

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  return !["0", "false", "no", "off"].includes(raw.trim().toLowerCase());
}

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export default defineNitroPlugin((nitroApp) => {
  if (!envBool("QUEUE_WORKER_ENABLED", true)) {
    console.info("[queue] worker disabled (QUEUE_WORKER_ENABLED=false)");
    return;
  }

  const workerId = `nitro:${hostname()}:${process.pid}`;
  const pollMs = envInt("QUEUE_POLL_MS", 1500);
  const batchIdleMs = envInt("QUEUE_IDLE_MS", 4000);
  const staleSec = envInt("QUEUE_STALE_SECONDS", 300);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let maintenanceAt = 0;

  async function tick() {
    if (stopped) return;
    try {
      // Periodic housekeeping — cheap, so every ~2 minutes is fine.
      if (Date.now() - maintenanceAt > 120_000) {
        maintenanceAt = Date.now();
        const requeued = await requeueStaleJobs(staleSec);
        if (requeued > 0) {
          console.warn(`[queue] requeued ${requeued} stale processing job(s)`);
        }
        await purgeOldJobs(envInt("QUEUE_PURGE_DAYS", 14));
        // Expired stories leave R2 orphans unless we sweep them even when
        // nobody opens the tray. Run inline (cheap SELECT) rather than
        // enqueueing a self-job that needs another tick.
        try {
          const { purgeExpiredStories } = await import("../db/stories");
          const purged = await purgeExpiredStories();
          if (purged.stories > 0 || purged.uploads > 0) {
            console.info(
              `[queue] purged expired stories=${purged.stories} uploads=${purged.uploads}`,
            );
          }
        } catch (err) {
          console.warn(
            "[queue] expired story purge failed:",
            (err as Error)?.message || err,
          );
        }
      }

      const job = await claimNextJob(workerId);
      if (!job) {
        schedule(batchIdleMs);
        return;
      }

      try {
        await processJob(job);
        await completeJob(job.id);
        console.info(`[queue] completed type=${job.type} id=${job.id}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const failed = await failJob(job.id, message);
        console.error(
          `[queue] failed type=${job.type} id=${job.id} attempt=${failed?.attempts}/${failed?.maxAttempts}: ${message}`,
        );
      }
      // Keep draining while work remains.
      schedule(25);
      return;
    } catch (err) {
      console.error("[queue] tick error:", (err as Error)?.message || err);
      schedule(pollMs);
      return;
    }
  }

  function schedule(ms: number) {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void tick();
    }, ms);
  }

  console.info(
    `[queue] worker starting id=${workerId} poll=${pollMs}ms idle=${batchIdleMs}ms`,
  );
  schedule(750);

  nitroApp.hooks.hook("close", () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    console.info("[queue] worker stopped");
  });
});
