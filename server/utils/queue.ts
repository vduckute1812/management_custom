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

import { enqueueJob, type JobRow } from "~/server/db/jobs";
import {
  sendMail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  type SendMailArgs,
} from "~/server/utils/mailer";
import { openSecret, sealSecret } from "~/server/utils/secretBox";

export const JobTypes = {
  EmailSend: "email.send",
  EmailVerification: "email.verification",
  EmailPasswordReset: "email.passwordReset",
  CacheInvalidate: "cache.invalidate",
  MediaPurgeExpired: "media.purgeExpired",
  ArticlesFetch: "articles.fetch",
  ArticlesRewrite: "articles.rewrite",
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
  args: { to: string; token: string; locale?: string },
  opts?: { delaySeconds?: number; maxAttempts?: number },
): Promise<JobRow> {
  return enqueueJob({
    type: JobTypes.EmailVerification,
    // Never store the raw action token in MySQL — only a sealed blob.
    payload: {
      to: args.to,
      tokenSealed: sealSecret(args.token),
      locale: args.locale ?? "en",
    },
    delaySeconds: opts?.delaySeconds,
    maxAttempts: opts?.maxAttempts ?? 5,
  });
}

export async function enqueuePasswordResetEmail(
  args: { to: string; token: string; locale?: string },
  opts?: { delaySeconds?: number; maxAttempts?: number },
): Promise<JobRow> {
  return enqueueJob({
    type: JobTypes.EmailPasswordReset,
    payload: {
      to: args.to,
      tokenSealed: sealSecret(args.token),
      locale: args.locale ?? "en",
    },
    delaySeconds: opts?.delaySeconds,
    maxAttempts: opts?.maxAttempts ?? 5,
  });
}

function resolveEmailActionToken(payload: Record<string, unknown>): string {
  const sealed =
    typeof payload.tokenSealed === "string" ? payload.tokenSealed : "";
  if (sealed) return openSecret(sealed);
  // Legacy jobs (pre-seal) may still carry plaintext — accept once then die.
  const legacy = typeof payload.token === "string" ? payload.token : "";
  return legacy;
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

export async function enqueueMediaPurgeExpired(opts?: {
  delaySeconds?: number;
}): Promise<JobRow> {
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
      const token = resolveEmailActionToken(job.payload);
      const locale =
        typeof job.payload.locale === "string" ? job.payload.locale : "en";
      if (!to || !token) {
        throw new Error("email.verification: missing to/token");
      }
      await sendVerificationEmail({ to, token, locale });
      return;
    }
    case JobTypes.EmailPasswordReset: {
      const to = String(job.payload.to || "");
      const token = resolveEmailActionToken(job.payload);
      const locale =
        typeof job.payload.locale === "string" ? job.payload.locale : "en";
      if (!to || !token) {
        throw new Error("email.passwordReset: missing to/token");
      }
      await sendPasswordResetEmail({ to, token, locale });
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
    case JobTypes.ArticlesFetch: {
      const { runArticleFetchJob } =
        await import("~/server/services/articleService");
      const result = await runArticleFetchJob();
      console.info(
        `[queue] articles.fetch fetched=${result.fetched} inserted=${result.inserted} skipped=${result.skipped} rewriteQueued=${result.rewriteQueued} errors=${result.errors.length}`,
      );
      for (const err of result.errors) {
        console.warn(
          `[queue] articles.fetch source=${err.source}: ${err.message}`,
        );
      }
      return;
    }
    case JobTypes.ArticlesRewrite: {
      const articleId = String(job.payload.articleId || "");
      if (!articleId) {
        throw new Error("articles.rewrite: missing articleId");
      }
      const { runArticleRewriteJob } =
        await import("~/server/services/articleService");
      const article = await runArticleRewriteJob(articleId);
      console.info(
        `[queue] articles.rewrite id=${article.id} status=${article.status}`,
      );
      return;
    }
    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}
