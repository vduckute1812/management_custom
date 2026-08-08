<script setup lang="ts">
defineProps<{
  readingMinutes: number;
  wordCount: number;
}>();

const { t } = useI18n();
const auth = useAuth();

const userLabel = computed(
  () => auth.user.value?.name || auth.user.value?.email || t("nav.account"),
);
</script>

<template>
  <div class="manuscript-studio__meta-line">
    <span>{{ userLabel }}</span>
    <span aria-hidden="true">·</span>
    <span>{{ $t("manuscript.readingTime", { count: readingMinutes }) }}</span>
    <span aria-hidden="true">·</span>
    <span>{{ $t("manuscript.wordCount", { count: wordCount }) }}</span>
  </div>
</template>

<style scoped>
.manuscript-studio__meta-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin: 0.85rem 0 1.15rem;
  font-size: 0.75rem;
  color: var(--ms-muted);
}
</style>
