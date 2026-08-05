<script setup lang="ts">
import type {
  PostFontFamily,
  PostTextColor,
  PostVisibility,
} from "~/types/post";
import { PostFormat } from "~/types/post";
import {
  CONTENT_LOCALES,
  isContentLocale,
  type ContentLocale,
} from "~/utils/contentLocale";

definePageMeta({
  layout: "default",
});

const { t, locale } = useI18n();
const auth = useAuth();
const router = useRouter();
const route = useRoute();
const { createPost, getPost } = usePosts();
const { categories, refresh: refreshCategories } = useCategories();

const submitting = ref(false);
const studioRef = ref<{ clear: () => void; focus: () => void } | null>(null);
const translationGroupId = ref<string | null>(null);
const existingLocales = ref<string[]>([]);
const initialLocale = ref<ContentLocale | null>(null);

useSeoMeta({
  title: () => t("seo.manuscriptWrite"),
  description: () => t("seo.manuscriptWriteDescription"),
});

useManuscriptFont();

async function loadTranslationContext() {
  const group =
    typeof route.query.group === "string" ? route.query.group.trim() : "";
  const from =
    typeof route.query.from === "string" ? route.query.from.trim() : "";
  const wantLocale =
    typeof route.query.locale === "string" &&
    isContentLocale(route.query.locale)
      ? route.query.locale
      : null;

  if (wantLocale) initialLocale.value = wantLocale;
  else if ((CONTENT_LOCALES as readonly string[]).includes(locale.value)) {
    initialLocale.value = locale.value as ContentLocale;
  } else {
    initialLocale.value = "vi";
  }

  if (!group && !from) {
    translationGroupId.value = null;
    existingLocales.value = [];
    return;
  }

  try {
    let groupId = group || null;
    if (!groupId && from) {
      const source = await getPost(from);
      groupId = source.translationGroupId;
      existingLocales.value = [
        ...new Set([
          source.contentLocale,
          ...source.translations.map((tr) => tr.locale),
        ]),
      ].filter((l) => l && l !== "und");
    }
    if (groupId) {
      translationGroupId.value = groupId;
      // Prefer translations from the source post when available; otherwise
      // leave empty and let create reject duplicates.
      if (!existingLocales.value.length && from) {
        const source = await getPost(from);
        existingLocales.value = [
          ...new Set([
            source.contentLocale,
            ...source.translations.map((tr) => tr.locale),
          ]),
        ].filter((l) => l && l !== "und");
      }
    }
  } catch {
    translationGroupId.value = null;
    existingLocales.value = [];
  }
}

onMounted(async () => {
  if (!auth.isAuthenticated.value) {
    await navigateTo({ path: "/login", query: { redirect: "/feed/write" } });
    return;
  }
  await Promise.all([
    refreshCategories().catch(() => undefined),
    loadTranslationContext(),
  ]);
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
  contentLocale: ContentLocale;
  translationGroupId: string | null;
}) {
  submitting.value = true;
  try {
    await createPost({
      format: PostFormat.Manuscript,
      title: payload.title,
      body: payload.body,
      visibility: payload.visibility,
      audienceUserIds: payload.audienceUserIds,
      attachmentIds: payload.attachmentIds,
      categoryId: payload.categoryId,
      fontFamily: payload.fontFamily,
      textColor: payload.textColor,
      contentLocale: payload.contentLocale,
      translationGroupId: payload.translationGroupId,
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
      <LazyManuscriptStudio
        v-if="auth.isAuthenticated.value"
        ref="studioRef"
        :submitting="submitting"
        :categories="categories"
        :translation-group-id="translationGroupId"
        :existing-locales="existingLocales"
        :initial-locale="initialLocale"
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
    radial-gradient(
      1200px 500px at 10% -10%,
      rgba(63, 111, 90, 0.1),
      transparent 55%
    ),
    linear-gradient(180deg, #f3f5f2 0%, #eef1ed 48%, #f7f8f6 100%);
}

html[data-theme="dark"] .manuscript-page {
  background:
    radial-gradient(
      1000px 420px at 12% -8%,
      rgba(63, 111, 90, 0.18),
      transparent 55%
    ),
    linear-gradient(180deg, #0f1412 0%, #121816 100%);
}
</style>
