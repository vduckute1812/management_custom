<script setup lang="ts">
import { LegalDocId } from "~/types/legal";

const { t } = useI18n();

useSeoMeta({
  title: computed(() => t("seo.terms")),
  description: computed(() => t("seo.termsDescription")),
});
</script>

<template>
  <LegalDocumentView :doc-id="LegalDocId.Terms" />
</template>
