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
 * Rewrite markdown `<img src="/api/uploads/...">` through `mediaUrl`.
 * Upload URLs authenticate via the HttpOnly access cookie — no query token.
 */
export function withUploadAccessTokens(
  html: string,
  mediaUrl: (path: string) => string,
): string {
  return html.replace(
    /(<img\b[^>]*?\bsrc=")(\/api\/uploads\/[^"?#]+)((?:\?[^"]*)?)(")/gi,
    (_m, pre: string, path: string, _query: string, post: string) => {
      // Drop any legacy `?access_token=` that may still sit in stored HTML.
      return `${pre}${mediaUrl(path)}${post}`;
    },
  );
}
