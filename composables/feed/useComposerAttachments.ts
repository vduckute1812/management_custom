import type { UploadRecord } from "~/types/post";
import { UPLOAD_MAX_PER_POST } from "~/utils/uploadPolicy";

/**
 * Composer attachment list + file-input upload flow shared by PostComposer
 * and ManuscriptStudio. Callers that need side effects on remove (e.g.
 * stripping markdown image refs) should wrap `removeAttachment`.
 */
export function useComposerAttachments(initial?: UploadRecord[]) {
  const { t } = useI18n();
  const { uploadFile, validateFile } = useUploads();
  const { pushToast } = useToasts();

  const attachments = ref<UploadRecord[]>([...(initial ?? [])]);
  const uploading = ref(false);
  const fileInput = ref<HTMLInputElement | null>(null);

  /**
   * Validate, enforce per-post cap, upload, and append to `attachments`.
   * Returns records that were successfully uploaded in this call.
   */
  async function uploadFiles(files: File[]): Promise<UploadRecord[]> {
    if (!files.length) return [];

    const accepted: File[] = [];
    for (const file of files) {
      const reason = validateFile(file);
      if (reason) pushToast(reason, { tone: "danger" });
      else accepted.push(file);
    }
    if (!accepted.length) return [];

    const room = Math.max(UPLOAD_MAX_PER_POST - attachments.value.length, 0);
    if (accepted.length > room) {
      pushToast(t("uploads.errors.tooMany", { max: UPLOAD_MAX_PER_POST }), {
        tone: "danger",
      });
    }

    const uploaded: UploadRecord[] = [];
    uploading.value = true;
    try {
      for (const file of accepted.slice(0, room)) {
        const record = await uploadFile(file);
        attachments.value = [...attachments.value, record];
        uploaded.push(record);
      }
    } catch {
      // uploadFile already surfaced a toast.
    } finally {
      uploading.value = false;
    }
    return uploaded;
  }

  async function onFilesSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (!files.length) return;
    await uploadFiles(files);
  }

  function removeAttachment(id: string) {
    attachments.value = attachments.value.filter((a) => a.id !== id);
  }

  function clearAttachments() {
    attachments.value = [];
  }

  return {
    attachments,
    uploading,
    fileInput,
    uploadFiles,
    onFilesSelected,
    removeAttachment,
    clearAttachments,
  };
}
