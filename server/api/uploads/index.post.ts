import {
  UPLOAD_MAX_BYTES,
  createUpload,
  resolveMime,
} from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const form = await readMultipartFormData(event);
  if (!form?.length) {
    throw createError({ statusCode: 400, statusMessage: "Expected multipart file" });
  }

  const filePart = form.find((p) => p.name === "file" && p.data && p.filename);
  if (!filePart || !filePart.filename) {
    throw createError({ statusCode: 400, statusMessage: "file field is required" });
  }

  if (filePart.data.length > UPLOAD_MAX_BYTES) {
    throw createError({
      statusCode: 400,
      statusMessage: "File must be 10MB or smaller",
    });
  }

  const resolved = resolveMime(filePart.filename, filePart.type);
  if (!resolved) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Unsupported file type. Allowed: jpeg, png, webp, gif, pdf, txt, md, docx",
    });
  }

  const upload = await createUpload({
    userId: user.sub,
    fileName: filePart.filename,
    mime: resolved.mime,
    kind: resolved.kind,
    sizeBytes: filePart.data.length,
    data: filePart.data,
  }).catch((err: unknown) => {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 503) {
      throw createError({
        statusCode: 503,
        statusMessage: (err as Error).message,
      });
    }
    throw err;
  });

  return { upload };
});
