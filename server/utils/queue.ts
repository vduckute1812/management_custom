/**
 * Background job queue — high-level API on top of MySQL `jobs`.
 *
 * Why MySQL (not Redis/Bull) for the queue:
 *   - Single-node Pi deploys already run MySQL; no new stateful service.
 *   - Jobs survive process restarts and deploys.
 *   - Redis stays optional and is reserved for the *cache* driver.
 *
 * The Nitro plugin `server/plugins/job-worker.ts` claims and runs jobs.
 */

import {
  enqueueJob,
  type JobRow,
} from "~/server/db/jobs";
import {
  sendMail,
  sendVerificationEmail,
  type SendMailArgs,
} from "~/server/utils/mailer";

export const JobTypes = {
  EmailSend: "email.send",
  EmailVerification: "email.verification",
  CacheInvalidate: "cache.invalidate",
  MediaPurgeExpired: "media.purgeExpired",
} as const;

export type JobType = (typeof JobTypes)[keyof typeof JobTypes];

export async function enqueueEmailSend(
  args: SendMailArgs,
  opts?: { delaySeconds?: number; maxAttempts?: number },
): Promise<JobRow> {
  return enqueueJob({
    type: JobTypes.EmailSend,
    payload: {
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html ?? null,
    },
    delaySeconds: opts?.delaySeconds,
    maxAttempts: opts?.maxAttempts ?? 5,
  });
}

export async function enqueueVerificationEmail(
  args: { to: string; token: string },
  opts?: { delaySeconds?: number; maxAttempts?: number },
): Promise<JobRow> {
  return enqueueJob({
    type: JobTypes.EmailVerification,
    payload: { to: args.to, token: args.token },
    delaySeconds: opts?.delaySeconds,
    maxAttempts: opts?.maxAttempts ?? 5,
  });
}

export async function enqueueCacheInvalidate(
  prefixes: string[],
  opts?: { delaySeconds?: number },
): Promise<JobRow> {
  return enqueueJob({
    type: JobTypes.CacheInvalidate,
    payload: { prefixes },
    delaySeconds: opts?.delaySeconds,
    maxAttempts: 3,
  });
}

export async function enqueueMediaPurgeExpired(
  opts?: { delaySeconds?: number },
): Promise<JobRow> {
  return enqueueJob({
    type: JobTypes.MediaPurgeExpired,
    payload: {},
    delaySeconds: opts?.delaySeconds,
    maxAttempts: 3,
  });
}

export async function processJob(job: JobRow): Promise<void> {
  switch (job.type) {
    case JobTypes.EmailSend: {
      const to = String(job.payload.to || "");
      const subject = String(job.payload.subject || "");
      const text = String(job.payload.text || "");
      const html =
        typeof job.payload.html === "string" ? job.payload.html : undefined;
      if (!to || !subject) throw new Error("email.send: missing to/subject");
      await sendMail({ to, subject, text, html });
      return;
    }
    case JobTypes.EmailVerification: {
      const to = String(job.payload.to || "");
      const token = String(job.payload.token || "");
      if (!to || !token) {
        throw new Error("email.verification: missing to/token");
      }
      await sendVerificationEmail({ to, token });
      return;
    }
    case JobTypes.CacheInvalidate: {
      const { cacheDelPrefix } = await import("~/server/utils/cache");
      const prefixes = Array.isArray(job.payload.prefixes)
        ? job.payload.prefixes.map(String)
        : [];
      for (const prefix of prefixes) {
        if (prefix) await cacheDelPrefix(prefix);
      }
      return;
    }
    case JobTypes.MediaPurgeExpired: {
      const { purgeExpiredStories } = await import("~/server/db/stories");
      const result = await purgeExpiredStories();
      if (result.stories > 0 || result.uploads > 0) {
        console.info(
          `[queue] media.purgeExpired stories=${result.stories} uploads=${result.uploads}`,
        );
      }
      return;
    }
    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}
