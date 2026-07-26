import type { UploadRecord } from "~/types/post";
import {
  checkUploadMeta,
  type UploadRejectionCode,
} from "~/utils/uploadPolicy";

const REJECTION_CODES: readonly UploadRejectionCode[] = [
  "empty",
  "unsupportedType",
  "tooLarge",
  "nameTooLong",
  "contentMismatch",
];

function isRejectionCode(value: unknown): value is UploadRejectionCode {
  return REJECTION_CODES.includes(value as UploadRejectionCode);
}

export const useUploads = () => {
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const auth = useAuth();

  /**
   * Localized reason this file can't be uploaded, or `null` if it's fine.
   * A convenience only — `/api/uploads` re-checks everything against the
   * received bytes.
   */
  function validateFile(file: File): string | null {
    const rejection = checkUploadMeta({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (!rejection) return null;
    return t(`uploads.errors.${rejection.code}`, rejection.params);
  }

  /** Translate a server rejection, falling back to its English statusMessage. */
  function serverErrorMessage(err: unknown): string {
    const body = (err as { data?: Record<string, unknown> })?.data;
    const detail = body?.data as
      { code?: unknown; params?: Record<string, string | number> } | undefined;

    if (isRejectionCode(detail?.code)) {
      return t(`uploads.errors.${detail.code}`, detail.params ?? {});
    }

    return (
      (body?.statusMessage as string | undefined) ||
      (err as { statusMessage?: string })?.statusMessage ||
      t("toasts.uploadFailed")
    );
  }

  async function uploadFile(file: File): Promise<UploadRecord> {
    const invalid = validateFile(file);
    if (invalid) {
      pushToast(invalid, { tone: "danger" });
      throw new Error(invalid);
    }

    const form = new FormData();
    form.append("file", file, file.name);

    try {
      // Multipart must not set Content-Type manually (boundary).
      const res = await $fetch<{ upload: UploadRecord }>("/api/uploads", {
        method: "POST",
        body: form,
        headers: auth.accessToken.value
          ? { Authorization: `Bearer ${auth.accessToken.value}` }
          : undefined,
      });
      return res.upload;
    } catch (err: unknown) {
      pushToast(serverErrorMessage(err), { tone: "danger" });
      throw err;
    }
  }

  return { uploadFile, validateFile };
};
