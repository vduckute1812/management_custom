import {
  canViewerAccessUpload,
  getUploadById,
  readUploadFile,
  signedUploadUrl,
} from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

/**
 * Auth + ACL gate, then 302 to a short-lived Cloudflare R2 signed URL.
 * Query `?access_token=` is accepted via auth middleware for <img> tags.
 * Query `?redirect=0` streams through the API instead (debugging).
 */
export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Upload id required" });
  }

  const allowed = await canViewerAccessUpload(user.sub, id);
  if (!allowed) {
    throw createError({ statusCode: 404, statusMessage: "Upload not found" });
  }

  const row = await getUploadById(id);
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: "Upload not found" });
  }

  const q = getQuery(event);
  const noRedirect = q.redirect === "0" || q.redirect === "false";

  try {
    if (!noRedirect) {
      const url = await signedUploadUrl(row.storage_key);
      return sendRedirect(event, url, 302);
    }

    const data = await readUploadFile(row.storage_key);
    setHeader(event, "Content-Type", row.mime);
    setHeader(
      event,
      "Content-Disposition",
      `inline; filename="${row.file_name.replace(/"/g, "")}"`
    );
    setHeader(event, "Cache-Control", "private, max-age=300");
    return data;
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 503) {
      throw createError({
        statusCode: 503,
        statusMessage: (err as Error).message,
      });
    }
    throw err;
  }
});
