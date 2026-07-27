<script setup lang="ts">
import type {
  PostFontFamily,
  PostFormat,
  PostTextColor,
  PostVisibility,
} from "~/types/post";

definePageMeta({
  layout: "default",
});

const { t } = useI18n();
const auth = useAuth();
const router = useRouter();
const { createPost } = usePosts();
const { categories, refresh: refreshCategories } = useCategories();

const submitting = ref(false);
const studioRef = ref<{ clear: () => void; focus: () => void } | null>(null);

useSeoMeta({
  title: () => t("seo.manuscriptWrite"),
  description: () => t("seo.manuscriptWriteDescription"),
});

useHead({
  link: [
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&display=swap",
    },
  ],
});

onMounted(async () => {
  if (!auth.isAuthenticated.value) {
    await navigateTo({ path: "/login", query: { redirect: "/feed/write" } });
    return;
  }
  await refreshCategories().catch(() => undefined);
});

async function onPublish(payload: {
  format: PostFormat;
  title: string;
  body: string;
  visibility: PostVisibility;
  audienceUserIds: string[];
  attachmentIds: string[];
  categoryId: string | null;
  fontFamily: PostFontFamily;
  textColor: PostTextColor;
}) {
  submitting.value = true;
  try {
    await createPost({
      format: "manuscript",
      title: payload.title,
      body: payload.body,
      visibility: payload.visibility,
      audienceUserIds: payload.audienceUserIds,
      attachmentIds: payload.attachmentIds,
      categoryId: payload.categoryId,
      fontFamily: payload.fontFamily,
      textColor: payload.textColor,
    });
    studioRef.value?.clear();
    await router.push("/feed");
  } catch {
    // toast from composable
  } finally {
    submitting.value = false;
  }
}

function onCancel() {
  return navigateTo("/feed");
}
</script>

<template>
  <div class="manuscript-page min-h-full px-4 py-6 sm:px-6 sm:py-8">
    <div class="mx-auto max-w-[1100px]">
      <ManuscriptStudio
        v-if="auth.isAuthenticated.value"
        ref="studioRef"
        :submitting="submitting"
        :categories="categories"
        @submit="onPublish"
        @cancel="onCancel"
      />
      <div
        v-else
        class="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-600"
      >
        {{ $t("manuscript.loginRequired") }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.manuscript-page {
  background:
    radial-gradient(circle at top left, rgba(63, 111, 90, 0.08), transparent 42%),
    radial-gradient(circle at 85% 10%, rgba(148, 163, 184, 0.16), transparent 36%),
    linear-gradient(180deg, #eef1ee 0%, #f7f8f6 42%, #f8fafc 100%);
}

html[data-theme="dark"] .manuscript-page {
  background:
    radial-gradient(circle at top left, rgba(134, 180, 154, 0.1), transparent 42%),
    linear-gradient(180deg, #0d110f 0%, #0b1220 100%);
}
</style>
