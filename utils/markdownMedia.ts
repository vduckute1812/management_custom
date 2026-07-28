/** Helpers for embedding uploaded media in Markdown post bodies. */

export function escapeMarkdownAlt(fileName: string): string {
  const cleaned = fileName.replace(/[\[\]\\]/g, "").trim();
  return cleaned.slice(0, 120) || "image";
}

/** Canonical app URL for an upload id. */
export function uploadPath(uploadId: string): string {
  return `/api/uploads/${uploadId}`;
}

/** Markdown image snippet for a stored upload. */
export function markdownImageForUpload(upload: {
  id: string;
  fileName: string;
  url?: string;
}): string {
  const src =
    upload.url && upload.url.startsWith("/api/uploads/")
      ? upload.url.split("?")[0]!
      : uploadPath(upload.id);
  return `![${escapeMarkdownAlt(upload.fileName)}](${src})`;
}

/** Remove markdown images that point at a given upload. */
export function stripMarkdownImagesForUpload(
  body: string,
  uploadId: string,
): string {
  const path = uploadPath(uploadId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body
    .replace(new RegExp(`!\\[[^\\]]*\\]\\(${path}(?:\\?[^)]*)?\\)`, "g"), "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export function bodyReferencesUpload(
  body: string,
  uploadId: string,
  url?: string | null,
): boolean {
  if (body.includes(uploadPath(uploadId))) return true;
  if (url) {
    const bare = url.split("?")[0] ?? url;
    if (bare && body.includes(bare)) return true;
  }
  return false;
}

/**
 * Append `?access_token=` only as a legacy fallback for non-upload paths.
 * Prefer cookie-authenticated `/api/uploads/...` URLs (HttpOnly `mgmt_at`) —
 * `useMediaUrl` returns bare upload paths for same-origin loads.
 */
export function withUploadAccessTokens(
  html: string,
  mediaUrl: (path: string) => string,
): string {
  return html.replace(
    /(<img\b[^>]*?\bsrc=")(\/api\/uploads\/[^"?#]+)((?:\?[^"]*)?)(")/gi,
    (_m, pre: string, path: string, query: string, post: string) => {
      if (/[?&]access_token=/.test(query)) {
        return `${pre}${path}${query}${post}`;
      }
      return `${pre}${mediaUrl(path)}${post}`;
    },
  );
}
