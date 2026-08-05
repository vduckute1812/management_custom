import { createUpload } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { contentMatchesMime } from "~/server/utils/fileSignature";
import { DomainError, mapDomainError } from "~/server/utils/http";
import {
  UPLOAD_ALLOWED_EXTENSIONS,
  UPLOAD_MAX_BYTES,
  checkUploadMeta,
  formatBytes,
  resolveUploadRule,
  type UploadRejection,
} from "~/utils/uploadPolicy";

/**
 * Slack over the largest allowed file for multipart framing (boundaries, part
 * headers, other fields). Keep the reverse proxy's body limit at or above this.
 */
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

/** English fallback copy; clients translate from `data.code` when they can. */
function rejectionMessage(rejection: UploadRejection): string {
  const p = rejection.params;
  switch (rejection.code) {
    case "empty":
      return "File is empty";
    case "nameTooLong":
      return `File name must be ${p.max} characters or fewer`;
    case "unsupportedType":
      return `Unsupported file type. Allowed: ${p.allowed}`;
    case "tooLarge":
      return `${p.type} files must be ${p.max} or smaller (this one is ${p.size})`;
    case "contentMismatch":
      return "File contents do not match its extension";
  }
}

function reject(rejection: UploadRejection): never {
  throw createError({
    statusCode: 400,
    statusMessage: rejectionMessage(rejection),
    data: { code: rejection.code, params: rejection.params },
  });
}

/** Browsers occasionally send a full path; keep only the final segment. */
function baseName(fileName: string): string {
  return fileName.split(/[\\/]/).pop() || "";
}

export default defineEventHandler(async (event) => {
  try {
    const user = requireUser(event);

    // Refuse oversized bodies from the header before buffering them into memory.
    const declaredLength = Number(
      getRequestHeader(event, "content-length") || 0,
    );
    if (declaredLength > UPLOAD_MAX_BYTES + MULTIPART_OVERHEAD_BYTES) {
      throw createError({
        statusCode: 413,
        statusMessage: `Upload must be ${formatBytes(UPLOAD_MAX_BYTES)} or smaller`,
        data: {
          code: "tooLarge",
          params: { max: formatBytes(UPLOAD_MAX_BYTES) },
        },
      });
    }

    const form = await readMultipartFormData(event);
    if (!form?.length) {
      throw new DomainError(400, "Expected multipart file");
    }

    const filePart = form.find(
      (p) => p.name === "file" && p.data && p.filename,
    );
    if (!filePart || !filePart.filename) {
      throw new DomainError(400, "file field is required");
    }

    const fileName = baseName(filePart.filename);
    if (!fileName) {
      throw new DomainError(400, "Invalid file name");
    }

    const metaRejection = checkUploadMeta({
      name: fileName,
      type: filePart.type,
      size: filePart.data.length,
    });
    if (metaRejection) reject(metaRejection);

    // `checkUploadMeta` already proved a rule exists for this name/type.
    const rule = resolveUploadRule(fileName, filePart.type)!;

    // The extension and declared Content-Type are both client-supplied. Confirm
    // the bytes actually are what we are about to store and later serve back
    // under this MIME, so a renamed executable or script can't slip through.
    if (!contentMatchesMime(filePart.data, rule.mime)) {
      reject({
        code: "contentMismatch",
        params: {
          name: fileName,
          type: rule.label,
          allowed: UPLOAD_ALLOWED_EXTENSIONS.join(", "),
        },
      });
    }

    const upload = await createUpload({
      userId: user.sub,
      fileName,
      mime: rule.mime,
      kind: rule.kind,
      sizeBytes: filePart.data.length,
      data: filePart.data,
    });

    return { upload };
  } catch (err) {
    mapDomainError(err);
  }
});
