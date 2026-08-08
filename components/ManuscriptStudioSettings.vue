<script setup lang="ts">
import type {
  PostAuthor,
  PostCategory,
  PostFontFamily,
  PostTextColor,
  UploadRecord,
} from "~/types/post";
import { PostVisibility } from "~/types/post";
import { POST_BODY_MAX_MANUSCRIPT } from "~/utils/postBodyLimits";
import type { ContentLocale } from "~/utils/contentLocale";

defineProps<{
  categories?: PostCategory[];
  editing?: boolean;
  translationGroupId?: string | null;
  availableLocales: ContentLocale[];
  attachments: UploadRecord[];
  uploading: boolean;
  audience: PostAuthor[];
  results: PostAuthor[];
  searching: boolean;
  bodyLength: number;
}>();

const contentLocale = defineModel<ContentLocale>("contentLocale", {
  required: true,
});
const categoryId = defineModel<string>("categoryId", { required: true });
const visibility = defineModel<PostVisibility>("visibility", {
  required: true,
});
const fontFamily = defineModel<PostFontFamily>("fontFamily", {
  required: true,
});
const textColor = defineModel<PostTextColor>("textColor", {
  required: true,
});
const audienceQuery = defineModel<string>("audienceQuery", { required: true });

const emit = defineEmits<{
  (e: "insert-latex", block: boolean): void;
  (e: "image-files-selected", event: Event): void;
  (e: "files-selected", event: Event): void;
  (e: "remove-attachment", id: string): void;
  (e: "remove-audience", id: string): void;
  (e: "pick-audience", user: PostAuthor): void;
}>();
</script>

<template>
  <aside
    class="manuscript-studio__rail"
    :aria-label="$t('manuscript.settingsAria')"
  >
    <ManuscriptStudioSettingsFields
      v-model:content-locale="contentLocale"
      v-model:category-id="categoryId"
      v-model:visibility="visibility"
      v-model:font-family="fontFamily"
      v-model:text-color="textColor"
      :categories="categories"
      :editing="editing"
      :translation-group-id="translationGroupId"
      :available-locales="availableLocales"
      :attachments="attachments"
      :uploading="uploading"
      @insert-latex="emit('insert-latex', $event)"
      @image-files-selected="emit('image-files-selected', $event)"
      @files-selected="emit('files-selected', $event)"
      @remove-attachment="emit('remove-attachment', $event)"
    />

    <ManuscriptStudioSettingsAudience
      v-if="visibility === PostVisibility.Shared"
      v-model:audience-query="audienceQuery"
      :audience="audience"
      :results="results"
      :searching="searching"
      @remove-audience="emit('remove-audience', $event)"
      @pick-audience="emit('pick-audience', $event)"
    />

    <p class="text-[11px] tabular-nums text-[color:var(--ms-muted)]">
      {{
        $t("manuscript.charCount", {
          count: bodyLength,
          max: POST_BODY_MAX_MANUSCRIPT,
        })
      }}
    </p>
  </aside>
</template>

<style scoped>
.manuscript-studio__rail {
  display: grid;
  gap: 0.85rem;
}
</style>
