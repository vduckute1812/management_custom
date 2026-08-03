import type { LegalDocId } from "~/types/legal";
import { authoredLegalLocale, legalDocument } from "~/utils/legal";

/**
 * Reactive access to a published legal document in the reader's language.
 *
 * `isFallbackLanguage` is true when the interface language has no authored
 * text yet (today: the two Chinese locales), so the page can say so instead of
 * silently serving English.
 */
export function useLegalDocument(id: LegalDocId) {
  const { locale } = useI18n();

  const authoredLocale = computed(() => authoredLegalLocale(locale.value));
  const document = computed(() => legalDocument(id, locale.value));
  const isFallbackLanguage = computed(
    () => authoredLocale.value !== locale.value,
  );

  return { document, authoredLocale, isFallbackLanguage };
}
