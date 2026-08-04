<script setup lang="ts">
import { LegalDocId } from "~/types/legal";
import { LEGAL_DOC_PATHS } from "~/utils/legal";

const props = defineProps<{ docId: LegalDocId }>();

const { t } = useI18n();
const { document, isFallbackLanguage } = useLegalDocument(props.docId);

const otherDocId = computed(() =>
  props.docId === LegalDocId.Privacy ? LegalDocId.Terms : LegalDocId.Privacy,
);
const otherDocPath = computed(() => LEGAL_DOC_PATHS[otherDocId.value]);
const otherDocLabel = computed(() =>
  otherDocId.value === LegalDocId.Privacy
    ? t("legal.seePrivacy")
    : t("legal.seeTerms"),
);

const CONTACT_EMAIL = "ducbkdn95@gmail.com";
</script>

<template>
  <article class="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
    <header>
      <NuxtLink
        to="/"
        class="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline"
      >
        <span aria-hidden="true">←</span>
        {{ $t("legal.backHome") }}
      </NuxtLink>

      <h1
        class="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl"
      >
        {{ document.title }}
      </h1>
      <p class="mt-3 text-base leading-7 text-slate-600">
        {{ document.summary }}
      </p>
      <p class="mt-3 text-xs text-slate-500">
        {{ $t("legal.lastUpdated", { date: document.effectiveDate }) }}
      </p>

      <!--
        The header account menu (and with it the language switcher) only exists
        for signed-in users, so without this control a visitor could never
        reach the Vietnamese text — the version that prevails.
      -->
      <div class="mt-5 flex flex-wrap items-center gap-2">
        <label for="legal-language" class="text-xs text-slate-500">
          {{ $t("legal.readIn") }}
        </label>
        <LanguageSwitcher id="legal-language" variant="select" />
      </div>

      <p
        v-if="isFallbackLanguage"
        class="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800"
      >
        {{ $t("legal.languageFallback") }}
      </p>
      <p class="mt-3 text-xs leading-6 text-slate-500">
        {{ $t("legal.languageNotice") }}
      </p>

      <div class="mt-8 space-y-3">
        <p
          v-for="(paragraph, index) in document.intro"
          :key="index"
          class="text-sm leading-7 text-slate-600"
        >
          {{ paragraph }}
        </p>
      </div>
    </header>

    <nav
      class="mt-10 rounded-2xl border border-slate-200 bg-white p-5"
      :aria-label="$t('legal.contents')"
    >
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {{ $t("legal.contents") }}
      </p>
      <ol class="mt-3 grid gap-1.5 sm:grid-cols-2">
        <li v-for="section in document.sections" :key="section.id">
          <a
            :href="`#${section.id}`"
            class="text-sm text-brand-700 hover:underline"
          >
            {{ section.heading }}
          </a>
        </li>
      </ol>
    </nav>

    <section
      v-for="section in document.sections"
      :id="section.id"
      :key="section.id"
      class="mt-10 scroll-mt-24"
    >
      <h2 class="text-lg font-semibold text-slate-900 sm:text-xl">
        {{ section.heading }}
      </h2>
      <p
        v-for="(paragraph, index) in section.paragraphs"
        :key="index"
        class="mt-3 text-sm leading-7 text-slate-600"
      >
        {{ paragraph }}
      </p>
      <ul
        v-if="section.bullets?.length"
        class="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600"
      >
        <li v-for="(bullet, index) in section.bullets" :key="index">
          {{ bullet }}
        </li>
      </ul>
    </section>

    <footer
      class="mt-12 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
    >
      <h2 class="text-sm font-semibold text-slate-900">
        {{ $t("legal.contactHeading") }}
      </h2>
      <p class="mt-2 text-sm leading-7 text-slate-600">
        <i18n-t keypath="legal.contactBody" tag="span">
          <template #email>
            <a
              :href="`mailto:${CONTACT_EMAIL}`"
              class="font-medium text-brand-700 hover:underline"
            >
              {{ CONTACT_EMAIL }}
            </a>
          </template>
        </i18n-t>
      </p>
      <NuxtLink
        :to="otherDocPath"
        class="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
      >
        {{ otherDocLabel }}
        <span aria-hidden="true">→</span>
      </NuxtLink>
    </footer>
  </article>
</template>
