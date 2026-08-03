import {
  LegalDocId,
  type LegalDocument,
  type LegalDocumentSet,
  type LegalLocale,
} from "~/types/legal";
import { privacyPolicy } from "~/utils/legal/privacy";
import { termsOfService } from "~/utils/legal/terms";

export const LEGAL_DOCUMENTS: Record<LegalDocId, LegalDocumentSet> = {
  [LegalDocId.Privacy]: privacyPolicy,
  [LegalDocId.Terms]: termsOfService,
};

/** Route each document is published at. */
export const LEGAL_DOC_PATHS: Record<LegalDocId, string> = {
  [LegalDocId.Privacy]: "/privacy",
  [LegalDocId.Terms]: "/terms",
};

/** UI locales beyond `vi` read the English text until a translation exists. */
export function authoredLegalLocale(uiLocale: string): LegalLocale {
  return uiLocale === "vi" ? "vi" : "en";
}

export function legalDocument(id: LegalDocId, uiLocale: string): LegalDocument {
  return LEGAL_DOCUMENTS[id][authoredLegalLocale(uiLocale)];
}
