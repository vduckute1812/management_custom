<script setup lang="ts">
import type { Post } from "~/types/post";
import { PostVisibility } from "~/types/post";

const props = defineProps<{
  post: Post;
  manuscript: boolean;
  readingMinutes: number;
}>();

const emit = defineEmits<{
  (e: "delete"): void;
}>();

const { t } = useI18n();

const visibilityBadge = computed(() => {
  if (props.post.visibility === PostVisibility.Private) {
    return t("feed.post.onlyYou");
  }
  if (props.post.visibility === PostVisibility.Shared) {
    return t("feed.post.shared");
  }
  if (props.post.visibility === PostVisibility.Friends) {
    return t("feed.post.friends");
  }
  return t("feed.post.public");
});

function authorLabel(name: string | null, email: string) {
  return name?.trim() || email;
}

function initialOf(name: string | null, email: string) {
  return (name?.trim() || email).charAt(0).toUpperCase() || "?";
}

function formatWhen(iso: string) {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return t("feed.post.justNow");
    if (minutes < 60) return t("feed.post.minutesAgo", { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("feed.post.hoursAgo", { count: hours });
    const days = Math.floor(hours / 24);
    if (days < 7) return t("feed.post.daysAgo", { count: days });
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}
</script>

<template>
  <header class="flex items-start gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
    <div
      class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden text-sm font-bold text-white shadow-sm"
      :class="
        manuscript
          ? 'rounded-xl manuscript-avatar ring-4'
          : post.author.avatarUrl
            ? 'rounded-full bg-slate-200 ring-4 ring-brand-50'
            : 'rounded-full bg-gradient-to-br from-brand-500 to-brand-700 ring-4 ring-brand-50'
      "
      aria-hidden="true"
    >
      <img
        v-if="post.author.avatarUrl"
        :src="post.author.avatarUrl"
        alt=""
        class="h-full w-full object-cover"
      />
      <template v-else>
        {{ initialOf(post.author.name, post.author.email) }}
      </template>
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-baseline gap-2 min-w-0 flex-wrap">
        <p class="text-sm font-semibold text-slate-900 truncate">
          {{ authorLabel(post.author.name, post.author.email) }}
        </p>
        <time
          class="text-[11px] text-slate-400 tabular-nums shrink-0"
          :datetime="post.createdAt"
          :title="post.createdAt"
        >
          {{ formatWhen(post.createdAt) }}
        </time>
        <span
          v-if="manuscript"
          class="manuscript-pill rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        >
          {{ $t("manuscript.badge") }}
        </span>
        <span
          class="text-[10px] font-medium uppercase tracking-wide rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5"
        >
          {{ visibilityBadge }}
        </span>
      </div>
      <p class="text-[11px] text-slate-400 truncate">
        <template v-if="manuscript">
          {{ $t("manuscript.readingTime", { count: readingMinutes }) }}
          <span aria-hidden="true"> · </span>
        </template>
        <template v-if="post.author.title || post.author.job">
          <span v-if="post.author.title">{{ post.author.title }}</span>
          <span v-if="post.author.title && post.author.job"> · </span>
          <span v-if="post.author.job">{{ post.author.job }}</span>
        </template>
        <template v-else>
          {{ post.author.email }}
        </template>
      </p>
    </div>
    <div
      v-if="post.canEdit || post.canDelete"
      class="flex shrink-0 items-center gap-0.5"
    >
      <button
        v-if="post.canEdit"
        type="button"
        class="rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        :title="$t('feed.post.editTitle')"
        @click="navigateTo(`/feed/edit/${post.id}`)"
      >
        {{ $t("feed.post.edit") }}
      </button>
      <button
        v-if="post.canDelete"
        type="button"
        class="rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
        :title="$t('feed.post.deleteTitle')"
        @click="emit('delete')"
      >
        {{ $t("feed.post.delete") }}
      </button>
    </div>
  </header>
</template>
