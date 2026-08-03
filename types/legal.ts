/**
 * Published legal documents (privacy policy, terms of service).
 *
 * The documents are authored as data rather than markup so the same structure
 * can render a page, a table of contents, and a structural parity test across
 * languages. Document ids are integer consts per the repo's integer-enum rule;
 * the authored-language keys stay BCP-47 tags because a locale tag is a tag,
 * not a closed enum domain.
 */
export const LegalDocId = {
  Privacy: 0,
  Terms: 1,
} as const;
export type LegalDocId = (typeof LegalDocId)[keyof typeof LegalDocId];
export const LEGAL_DOC_IDS = [LegalDocId.Privacy, LegalDocId.Terms] as const;

/** Languages the legal text is authored in; every other UI locale reads `en`. */
export const LEGAL_LOCALES = ["en", "vi"] as const;
export type LegalLocale = (typeof LEGAL_LOCALES)[number];

export interface LegalSection {
  /** Stable anchor + table-of-contents key, identical in every language. */
  id: string;
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalDocument {
  title: string;
  summary: string;
  /**
   * ISO `YYYY-MM-DD`, rendered verbatim: a locale-formatted date would differ
   * between the SSR pass (Day.js still on `en`) and the hydrated client.
   */
  effectiveDate: string;
  intro: string[];
  sections: LegalSection[];
}

/** One authored document per language. */
export type LegalDocumentSet = Record<LegalLocale, LegalDocument>;
