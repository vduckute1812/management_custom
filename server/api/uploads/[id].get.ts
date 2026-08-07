import {
  resolveUploadForViewer,
  readUploadFile,
  signedUploadUrl,
} from "~/server/utils/db";
import { getOptionalUser } from "~/server/utils/authContext";
import { DomainError, mapDomainError } from "~/server/utils/http";

/**
 * Auth + ACL gate, then 302 to a short-lived Cloudflare R2 signed URL.
 * Public-post attachments are readable without a session.
 * Private media authenticates via the HttpOnly access cookie (or Bearer).
 * Query `?redirect=0` streams through the API instead (debugging).
 */
export default defineEventHandler(async (event) => {
  try {
    const user = getOptionalUser(event);
    const id = getRouterParam(event, "id");
    if (!id) {
      throw new DomainError(400, "Upload id required");
    }

    const row = await resolveUploadForViewer(user?.sub ?? null, id);
    if (!row) {
      throw new DomainError(404, "Upload not found");
    }

    const q = getQuery(event);
    const noRedirect = q.redirect === "0" || q.redirect === "false";

    // Brief private cache: repeat views in a feed avoid re-hitting ACL+sign.
    setHeader(event, "Cache-Control", "private, max-age=60");

    if (!noRedirect) {
      const url = await signedUploadUrl(row.storage_key);
      return sendRedirect(event, url, 302);
    }

    const data = await readUploadFile(row.storage_key);
    setHeader(event, "Content-Type", row.mime);
    setHeader(
      event,
      "Content-Disposition",
      `inline; filename="${row.file_name.replace(/"/g, "")}"`,
    );
    return data;
  } catch (err) {
    mapDomainError(err);
  }
});
