/**
 * Single source of truth for what may be uploaded.
 *
 * Shared by the client (pre-flight checks + `accept` attributes) and the
 * server (`/api/uploads`). The client copy is a UX convenience only — every
 * rule here is re-enforced server-side against the received bytes.
 */
import type { AttachmentKind } from "~/types/post";

export const KB = 1024;
export const MB = 1024 * KB;

export interface UploadTypeRule {
  /** Canonical MIME stored in the DB and sent to R2 as Content-Type. */
  mime: string;
  /** Coarse bucket used by the feed UI to decide inline render vs. link. */
  kind: AttachmentKind;
  /** Lowercase extensions (with dot) that map to this MIME. */
  extensions: string[];
  /** Per-type ceiling in bytes. */
  maxBytes: number;
  /** Short human label used in error copy, e.g. "JPEG". */
  label: string;
}

/**
 * Per-type ceilings. These follow common practice for social/document
 * attachments rather than one blanket number: photos off a phone land around
 * 2–4MB, animated GIFs run larger, and text files that reach even 512KB are
 * almost always a mistake.
 */
export const UPLOAD_RULES: readonly UploadTypeRule[] = [
  {
    mime: "image/jpeg",
    kind: "image",
    extensions: [".jpg", ".jpeg"],
    maxBytes: 5 * MB,
    label: "JPEG",
  },
  {
    mime: "image/png",
    kind: "image",
    extensions: [".png"],
    maxBytes: 5 * MB,
    label: "PNG",
  },
  {
    mime: "image/webp",
    kind: "image",
    extensions: [".webp"],
    maxBytes: 5 * MB,
    label: "WebP",
  },
  {
    mime: "image/gif",
    kind: "image",
    extensions: [".gif"],
    maxBytes: 8 * MB,
    label: "GIF",
  },
  {
    mime: "application/pdf",
    kind: "document",
    extensions: [".pdf"],
    maxBytes: 10 * MB,
    label: "PDF",
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "document",
    extensions: [".docx"],
    maxBytes: 10 * MB,
    label: "Word (.docx)",
  },
  {
    mime: "text/plain",
    kind: "document",
    extensions: [".txt"],
    maxBytes: 512 * KB,
    label: "Text",
  },
  {
    mime: "text/markdown",
    kind: "document",
    extensions: [".md", ".markdown"],
    maxBytes: 512 * KB,
    label: "Markdown",
  },
];

const RULE_BY_MIME = new Map(UPLOAD_RULES.map((r) => [r.mime, r]));

const RULE_BY_EXT = new Map<string, UploadTypeRule>(
  UPLOAD_RULES.flatMap((r) => r.extensions.map((ext) => [ext, r] as const)),
);

/**
 * Largest per-type ceiling. Used as the cheap first gate before we know which
 * rule applies, and to size the reverse-proxy body limit.
 */
export const UPLOAD_MAX_BYTES = UPLOAD_RULES.reduce(
  (max, r) => Math.max(max, r.maxBytes),
  0,
);

/** Max attachments on a single post. Mirrored by the posts API schema. */
export const UPLOAD_MAX_PER_POST = 10;

/** Longest filename we keep; the `uploads.file_name` column is VARCHAR(255). */
export const UPLOAD_MAX_FILENAME_LENGTH = 255;

/** Value for `<input type="file" accept="...">` covering every allowed type. */
export const UPLOAD_ACCEPT_ATTR = [
  ...UPLOAD_RULES.flatMap((r) => r.extensions),
  ...UPLOAD_RULES.map((r) => r.mime),
].join(",");

/** Same, restricted to images (story composer). */
export const UPLOAD_ACCEPT_IMAGES_ATTR = UPLOAD_RULES.filter(
  (r) => r.kind === "image",
)
  .flatMap((r) => [...r.extensions, r.mime])
  .join(",");

/** Extension list for user-facing "allowed types" copy, e.g. "jpg, png, …". */
export const UPLOAD_ALLOWED_EXTENSIONS = UPLOAD_RULES.flatMap((r) =>
  r.extensions.map((e) => e.slice(1)),
);

/** Same, restricted to images. */
export const UPLOAD_ALLOWED_IMAGE_EXTENSIONS = UPLOAD_RULES.filter(
  (r) => r.kind === "image",
).flatMap((r) => r.extensions.map((e) => e.slice(1)));

export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) return "";
  return fileName.slice(dot).toLowerCase();
}

/**
 * Resolve a file to its rule. The extension wins over the browser-supplied
 * Content-Type, which is attacker-controlled and frequently wrong
 * (`application/octet-stream` for .md, `text/plain` for .csv, and so on).
 *
 * An extension that exists but isn't on the list is a hard no — falling back
 * to the declared MIME there would let `payload.exe` through just by claiming
 * to be `image/png`. The declared MIME is only consulted for names that carry
 * no extension at all.
 */
export function resolveUploadRule(
  fileName: string,
  declaredMime?: string | null,
): UploadTypeRule | null {
  const ext = fileExtension(fileName);
  if (ext) return RULE_BY_EXT.get(ext) ?? null;

  const mime = (declaredMime || "").toLowerCase().split(";")[0].trim();
  return RULE_BY_MIME.get(mime) ?? null;
}

export function formatBytes(bytes: number): string {
  if (bytes >= MB) {
    const mb = bytes / MB;
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)}MB`;
  }
  return `${Math.round(bytes / KB)}KB`;
}

export type UploadRejectionCode =
  "empty" | "unsupportedType" | "tooLarge" | "nameTooLong" | "contentMismatch";

export interface UploadRejection {
  code: UploadRejectionCode;
  /** Interpolation values for the matching i18n message. */
  params: Record<string, string | number>;
}

/**
 * Validate what we can know without reading the bytes: name, declared type,
 * and size. Returns `null` when the file passes.
 */
export function checkUploadMeta(file: {
  name: string;
  type?: string;
  size: number;
}): UploadRejection | null {
  if (file.name.length > UPLOAD_MAX_FILENAME_LENGTH) {
    return {
      code: "nameTooLong",
      params: { max: UPLOAD_MAX_FILENAME_LENGTH },
    };
  }

  if (file.size <= 0) {
    return { code: "empty", params: { name: file.name } };
  }

  const rule = resolveUploadRule(file.name, file.type);
  if (!rule) {
    return {
      code: "unsupportedType",
      params: {
        name: file.name,
        allowed: UPLOAD_ALLOWED_EXTENSIONS.join(", "),
      },
    };
  }

  if (file.size > rule.maxBytes) {
    return {
      code: "tooLarge",
      params: {
        name: file.name,
        type: rule.label,
        max: formatBytes(rule.maxBytes),
        size: formatBytes(file.size),
      },
    };
  }

  return null;
}
