import type { UploadRecord } from "~/types/post";

export const useUploads = () => {
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const auth = useAuth();

  async function uploadFile(file: File): Promise<UploadRecord> {
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
      const msg =
        (err as { data?: { statusMessage?: string }; statusMessage?: string })
          ?.data?.statusMessage ||
        (err as { statusMessage?: string })?.statusMessage ||
        t("toasts.uploadFailed");
      pushToast(msg, { tone: "danger" });
      throw err;
    }
  }

  return { uploadFile };
};
