/**
 * In-process job worker.
 *
 * Runs inside the Nitro app process (no separate worker container required
 * on a Pi). Claims jobs with SKIP LOCKED. Default concurrency is 2 with at
 * most one `articles.*` job at a time so LLM/fetch work cannot starve mail
 * and media jobs. Set QUEUE_CONCURRENCY=1 for strict serial.
 *
 * Disable with QUEUE_WORKER_ENABLED=false (useful for migrate-only containers).
 */
import { hostname } from "node:os";
import {
  claimNextJob,
  completeJob,
  failJob,
  purgeOldJobs,
  purgeSensitiveEmailJobs,
  requeueStaleJobs,
  type JobRow,
} from "../db/core/jobs";
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

function isArticleJob(type: string): boolean {
  return type.startsWith("articles.");
}

export default defineNitroPlugin((nitroApp) => {
  if (!envBool("QUEUE_WORKER_ENABLED", true)) {
    console.info("[queue] worker disabled (QUEUE_WORKER_ENABLED=false)");
    return;
  }

  const baseWorkerId = `nitro:${hostname()}:${process.pid}`;
  const pollMs = envInt("QUEUE_POLL_MS", 1500);
  const batchIdleMs = envInt("QUEUE_IDLE_MS", 4000);
  const staleSec = envInt("QUEUE_STALE_SECONDS", 300);
  const concurrency = Math.min(envInt("QUEUE_CONCURRENCY", 2), 4);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let maintenanceAt = 0;
  let maintenanceTicks = 0;
  let maintenanceRunning = false;
  let slotSeq = 0;
  const active = new Map<string, JobRow>();

  async function runMaintenance() {
    if (maintenanceRunning) return;
    if (Date.now() - maintenanceAt <= 120_000) return;
    maintenanceRunning = true;
    maintenanceAt = Date.now();
    try {
      const requeued = await requeueStaleJobs(staleSec);
      if (requeued > 0) {
        console.warn(`[queue] requeued ${requeued} stale processing job(s)`);
      }
      await purgeOldJobs(envInt("QUEUE_PURGE_DAYS", 14));
      await purgeSensitiveEmailJobs(envInt("QUEUE_AUTH_EMAIL_PURGE_HOURS", 24));
      try {
        const { purgeExpiredStories } = await import("../db/feed/stories");
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
      try {
        const { purgeExpiredRefreshTokens } =
          await import("../db/auth/refresh-tokens");
        const { purgeStaleEmailVerifications } =
          await import("../db/auth/email-verifications");
        const { purgeStalePasswordResets } =
          await import("../db/auth/password-resets");
        const refresh = await purgeExpiredRefreshTokens();
        const verify = await purgeStaleEmailVerifications();
        const reset = await purgeStalePasswordResets();
        if (refresh + verify + reset > 0) {
          console.info(
            `[queue] purged auth tokens refresh=${refresh} verify=${verify} reset=${reset}`,
          );
        }
      } catch (err) {
        console.warn(
          "[queue] auth token purge failed:",
          (err as Error)?.message || err,
        );
      }
      maintenanceTicks += 1;
      if (maintenanceTicks % 15 === 0) {
        try {
          const { recountCommentCounts } =
            await import("../db/feed/postComments");
          const fixed = await recountCommentCounts();
          if (fixed > 0) {
            console.info(`[queue] comment_count drift fixed posts=${fixed}`);
          }
        } catch (err) {
          console.warn(
            "[queue] comment_count recount failed:",
            (err as Error)?.message || err,
          );
        }
      }
      try {
        const { maybeScheduleDailyArticleFetch } =
          await import("../services/admin/articleService");
        await maybeScheduleDailyArticleFetch();
      } catch (err) {
        console.warn(
          "[queue] article fetch schedule failed:",
          (err as Error)?.message || err,
        );
      }
    } finally {
      maintenanceRunning = false;
    }
  }

  async function processClaimed(job: JobRow) {
    active.set(job.id, job);
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
    } finally {
      active.delete(job.id);
    }
  }

  async function tick() {
    if (stopped) return;
    try {
      await runMaintenance();

      const freeSlots = concurrency - active.size;
      if (freeSlots <= 0) {
        schedule(pollMs);
        return;
      }

      let claimed = 0;
      let articleHeld = [...active.values()].some((j) => isArticleJob(j.type));

      for (let n = 0; n < freeSlots; n++) {
        const slotId = `${baseWorkerId}:${slotSeq++}`;
        const job = await claimNextJob(slotId, {
          excludeArticleTypes: articleHeld,
        });
        if (!job) break;
        claimed += 1;
        if (isArticleJob(job.type)) articleHeld = true;
        void processClaimed(job);
      }

      if (claimed === 0 && active.size === 0) {
        schedule(batchIdleMs);
        return;
      }
      schedule(active.size < concurrency ? 25 : pollMs);
    } catch (err) {
      console.error("[queue] tick error:", (err as Error)?.message || err);
      schedule(pollMs);
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
    `[queue] worker starting id=${baseWorkerId} concurrency=${concurrency} poll=${pollMs}ms idle=${batchIdleMs}ms`,
  );
  schedule(750);

  nitroApp.hooks.hook("close", () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    console.info("[queue] worker stopped");
  });
});
