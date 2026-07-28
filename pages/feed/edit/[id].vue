<script setup lang="ts">
import type {
  Post,
  PostAuthor,
  PostFontFamily,
  PostFormat,
  PostTextColor,
  PostVisibility,
  UploadRecord,
} from "~/types/post";

definePageMeta({
  layout: "default",
});

const { t } = useI18n();
const auth = useAuth();
const route = useRoute();
const router = useRouter();
const { getPostForEdit, updatePost } = usePosts();
const { categories, refresh: refreshCategories } = useCategories();
const { pushToast } = useToasts();

const postId = computed(() => String(route.params.id || ""));
const submitting = ref(false);
const loading = ref(true);
const loadError = ref<string | null>(null);
const post = ref<Post | null>(null);
const audience = ref<PostAuthor[]>([]);

useSeoMeta({
  title: () => t("seo.manuscriptEdit"),
  description: () => t("seo.manuscriptEditDescription"),
});

useHead({
  link: [
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&display=swap",
    },
  ],
});

function toUploadRecords(p: Post): UploadRecord[] {
  return (p.attachments ?? []).map((a) => ({
    id: a.uploadId,
    fileName: a.fileName,
    mime: a.mime,
    kind: a.kind,
    sizeBytes: a.sizeBytes,
    url: a.url,
  }));
}

const composerInitial = computed(() => {
  if (!post.value) return undefined;
  return {
    body: post.value.body,
    visibility: post.value.visibility,
    audience: audience.value,
    attachments: toUploadRecords(post.value),
    categoryId: post.value.category?.id ?? null,
    fontFamily: post.value.fontFamily,
    textColor: post.value.textColor,
  };
});

const manuscriptInitial = computed(() => {
  if (!post.value) return undefined;
  return {
    title: post.value.title,
    body: post.value.body,
    visibility: post.value.visibility,
    audience: audience.value,
    attachments: toUploadRecords(post.value),
    categoryId: post.value.category?.id ?? null,
    fontFamily: post.value.fontFamily,
    textColor: post.value.textColor,
  };
});

onMounted(async () => {
  if (!auth.isAuthenticated.value) {
    await navigateTo({
      path: "/login",
      query: { redirect: `/feed/edit/${postId.value}` },
    });
    return;
  }
  await refreshCategories().catch(() => undefined);
  loading.value = true;
  loadError.value = null;
  try {
    const res = await getPostForEdit(postId.value);
    post.value = res.post;
    audience.value = res.audience;
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode;
    const msg =
      (err as { statusMessage?: string })?.statusMessage ||
      t("toasts.couldNotLoadPost");
    loadError.value = msg;
    if (status === 403 || status === 404) {
      pushToast(msg, { tone: "danger" });
    }
  } finally {
    loading.value = false;
  }
});

async function onSave(payload: {
  format?: PostFormat;
  title?: string;
  body: string;
  visibility: PostVisibility;
  audienceUserIds: string[];
  attachmentIds: string[];
  categoryId: string | null;
  fontFamily: PostFontFamily;
  textColor: PostTextColor;
}) {
  if (!post.value) return;
  submitting.value = true;
  try {
    await updatePost(post.value.id, {
      title: payload.title ?? post.value.title,
      body: payload.body,
      visibility: payload.visibility,
      audienceUserIds: payload.audienceUserIds,
      attachmentIds: payload.attachmentIds,
      categoryId: payload.categoryId,
      fontFamily: payload.fontFamily,
      textColor: payload.textColor,
    });
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
  <div class="edit-page min-h-full px-4 py-6 sm:px-6 sm:py-8">
    <div class="mx-auto max-w-[1100px]">
      <div
        v-if="loading"
        class="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-600"
      >
        {{ $t("feed.edit.loading") }}
      </div>
      <div
        v-else-if="loadError || !post"
        class="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-600"
      >
        <p>{{ loadError || $t("toasts.couldNotLoadPost") }}</p>
        <button
          type="button"
          class="mt-4 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
          @click="onCancel"
        >
          {{ $t("manuscript.cancel") }}
        </button>
      </div>

      <ManuscriptStudio
        v-else-if="post.format === 'manuscript'"
        :submitting="submitting"
        :categories="categories"
        :initial="manuscriptInitial"
        editing
        @submit="onSave"
        @cancel="onCancel"
      />

      <div v-else class="mx-auto max-w-2xl space-y-4">
        <header class="space-y-1">
          <p
            class="text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {{ $t("feed.edit.kicker") }}
          </p>
          <h1 class="text-xl font-semibold text-slate-900">
            {{ $t("feed.edit.title") }}
          </h1>
          <p class="text-sm text-slate-600">{{ $t("feed.edit.lede") }}</p>
        </header>
        <PostComposer
          :submitting="submitting"
          :categories="categories"
          :initial="composerInitial"
          :submit-label="$t('feed.edit.save')"
          @submit="onSave"
        />
        <div class="flex justify-end">
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            @click="onCancel"
          >
            {{ $t("feed.post.cancel") }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.edit-page {
  background:
    radial-gradient(
      circle at top left,
      rgba(63, 111, 90, 0.08),
      transparent 42%
    ),
    radial-gradient(
      circle at 85% 10%,
      rgba(148, 163, 184, 0.16),
      transparent 36%
    ),
    linear-gradient(180deg, #eef1ee 0%, #f7f8f6 42%, #f8fafc 100%);
}

html[data-theme="dark"] .edit-page {
  background:
    radial-gradient(
      circle at top left,
      rgba(134, 180, 154, 0.1),
      transparent 42%
    ),
    linear-gradient(180deg, #0d110f 0%, #0b1220 100%);
}
</style>
