import { describe, expect, it } from "vitest";
import {
  LEGAL_DOC_IDS,
  LEGAL_LOCALES,
  LegalDocId,
  type LegalDocument,
} from "../types/legal";
import {
  LEGAL_DOCUMENTS,
  LEGAL_DOC_PATHS,
  authoredLegalLocale,
  legalDocument,
} from "../utils/legal";

function sectionIds(doc: LegalDocument): string[] {
  return doc.sections.map((section) => section.id);
}

describe("legal documents", () => {
  it("publishes every document in every authored language", () => {
    for (const id of LEGAL_DOC_IDS) {
      for (const locale of LEGAL_LOCALES) {
        const doc = LEGAL_DOCUMENTS[id][locale];
        expect(doc.title.length).toBeGreaterThan(0);
        expect(doc.summary.length).toBeGreaterThan(0);
        expect(doc.intro.length).toBeGreaterThan(0);
        expect(doc.sections.length).toBeGreaterThan(0);
        expect(doc.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("keeps the same section structure across languages", () => {
    for (const id of LEGAL_DOC_IDS) {
      const reference = LEGAL_DOCUMENTS[id].en;
      for (const locale of LEGAL_LOCALES) {
        const doc = LEGAL_DOCUMENTS[id][locale];
        expect(sectionIds(doc)).toEqual(sectionIds(reference));
        expect(doc.effectiveDate).toBe(reference.effectiveDate);
      }
    }
  });

  it("uses unique anchors and never ships an empty section", () => {
    for (const id of LEGAL_DOC_IDS) {
      for (const locale of LEGAL_LOCALES) {
        const doc = LEGAL_DOCUMENTS[id][locale];
        const ids = sectionIds(doc);
        expect(new Set(ids).size).toBe(ids.length);

        for (const section of doc.sections) {
          expect(section.id).toMatch(/^[a-z][a-z0-9-]*$/);
          expect(section.heading.trim().length).toBeGreaterThan(0);
          const blocks = [
            ...(section.paragraphs ?? []),
            ...(section.bullets ?? []),
          ];
          expect(blocks.length).toBeGreaterThan(0);
          for (const block of blocks) {
            expect(block.trim().length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("names the contact address in both documents", () => {
    for (const id of LEGAL_DOC_IDS) {
      for (const locale of LEGAL_LOCALES) {
        const doc = LEGAL_DOCUMENTS[id][locale];
        const text = JSON.stringify(doc);
        expect(text).toContain("ducbkdn95@gmail.com");
      }
    }
  });

  it("resolves the reader's language with an English fallback", () => {
    expect(authoredLegalLocale("vi")).toBe("vi");
    expect(authoredLegalLocale("en")).toBe("en");
    expect(authoredLegalLocale("zh-CN")).toBe("en");
    expect(authoredLegalLocale("zh-TW")).toBe("en");

    expect(legalDocument(LegalDocId.Privacy, "vi").title).toBe(
      "Chính sách bảo mật",
    );
    expect(legalDocument(LegalDocId.Terms, "zh-TW").title).toBe(
      "Terms of Service",
    );
  });

  it("publishes each document at a public route", () => {
    expect(LEGAL_DOC_PATHS[LegalDocId.Privacy]).toBe("/privacy");
    expect(LEGAL_DOC_PATHS[LegalDocId.Terms]).toBe("/terms");
  });
});
