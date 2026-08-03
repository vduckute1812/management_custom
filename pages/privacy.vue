<script setup lang="ts">
import { LegalDocId } from "~/types/legal";

const { t } = useI18n();

useSeoMeta({
  title: computed(() => t("seo.privacy")),
  description: computed(() => t("seo.privacyDescription")),
});
</script>

<template>
  <LegalDocumentView :doc-id="LegalDocId.Privacy" />
</template>
