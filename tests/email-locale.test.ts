import { describe, expect, it } from "vitest";
import {
  passwordResetEmailCopy,
  resolveEmailLocale,
  verificationEmailCopy,
} from "../server/utils/emailI18n";
import { APP_LOCALES } from "../types/locale";

describe("email locale catalogs", () => {
  it("falls back unknown locales to English", () => {
    expect(resolveEmailLocale("fr")).toBe("en");
    expect(resolveEmailLocale(null)).toBe("en");
  });

  it("has verification + reset copy for every app locale", () => {
    for (const locale of APP_LOCALES) {
      const verify = verificationEmailCopy(locale);
      const reset = passwordResetEmailCopy(locale);
      expect(verify.subject.length).toBeGreaterThan(3);
      expect(verify.cta.length).toBeGreaterThan(2);
      expect(verify.text).toContain("\n");
      expect(reset.subject.length).toBeGreaterThan(3);
      expect(reset.cta.length).toBeGreaterThan(2);
      expect(reset.expiresHtml).toContain("<strong");
    }
  });

  it("uses Vietnamese subjects for vi", () => {
    expect(verificationEmailCopy("vi").subject).toMatch(/email/i);
    expect(passwordResetEmailCopy("vi").subject).toMatch(/mật khẩu/i);
  });
});
