/**
 * Cloudflare R2 client (S3-compatible).
 *
 * Required env:
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET
 *
 * Optional:
 *   R2_ENDPOINT          — defaults to https://{accountId}.r2.cloudflarestorage.com
 *   R2_SIGNED_URL_TTL    — seconds for GET signed URLs (default 3600)
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let _client: S3Client | null = null;

export function r2Config() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() || "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() || "";
  const bucket = process.env.R2_BUCKET?.trim() || "";
  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    (accountId
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : "");
  const signedTtl = Number(process.env.R2_SIGNED_URL_TTL || "3600");

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint,
    signedTtl:
      Number.isFinite(signedTtl) && signedTtl > 0 ? Math.floor(signedTtl) : 3600,
  };
}

export function assertR2Configured(): void {
  const c = r2Config();
  if (!c.accountId || !c.accessKeyId || !c.secretAccessKey || !c.bucket) {
    throw Object.assign(
      new Error(
        "Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET."
      ),
      { statusCode: 503 }
    );
  }
}

function getR2Client(): S3Client {
  assertR2Configured();
  if (_client) return _client;
  const c = r2Config();
  _client = new S3Client({
    region: "auto",
    endpoint: c.endpoint,
    credentials: {
      accessKeyId: c.accessKeyId,
      secretAccessKey: c.secretAccessKey,
    },
    forcePathStyle: false,
  });
  return _client;
}

export async function r2PutObject(args: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  const c = r2Config();
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: c.bucket,
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
    })
  );
}

export async function r2DeleteObject(key: string): Promise<void> {
  const c = r2Config();
  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: c.bucket,
      Key: key,
    })
  );
}

export async function r2GetObjectBuffer(key: string): Promise<{
  body: Buffer;
  contentType?: string;
}> {
  const c = r2Config();
  const out = await getR2Client().send(
    new GetObjectCommand({
      Bucket: c.bucket,
      Key: key,
    })
  );
  const bytes = await out.Body?.transformToByteArray();
  if (!bytes) {
    throw Object.assign(new Error("Empty object from R2"), { statusCode: 404 });
  }
  return {
    body: Buffer.from(bytes),
    contentType: out.ContentType || undefined,
  };
}

/** Short-lived GET URL so browsers can load media without Authorization headers. */
export async function r2SignedGetUrl(key: string): Promise<string> {
  const c = r2Config();
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({
      Bucket: c.bucket,
      Key: key,
    }),
    { expiresIn: c.signedTtl }
  );
}
