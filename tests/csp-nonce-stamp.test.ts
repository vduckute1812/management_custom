import { describe, expect, it } from "vitest";
import { stampScriptNonces } from "../server/utils/cspNonceStamp";
import {
  ADMIN_USERS_SUMMARY_MAX,
  SAVINGS_CONTRIBUTIONS_PAGE_SIZE,
  STORIES_TRAY_MAX,
} from "../server/utils/listLimits";

describe("stampScriptNonces", () => {
  it("adds nonce to script tags that lack one", () => {
    const [out] = stampScriptNonces(
      ["<script>alert(1)</script>", '<script src="/a.js"></script>'],
      "abc+/=",
    );
    expect(out).toBe('<script nonce="abc+/=">alert(1)</script>');
    const [, external] = stampScriptNonces(
      ["<script>alert(1)</script>", '<script src="/a.js"></script>'],
      "abc+/=",
    );
    expect(external).toBe('<script nonce="abc+/=" src="/a.js"></script>');
  });

  it("does not double-stamp an existing nonce", () => {
    const [out] = stampScriptNonces(['<script nonce="keep">x</script>'], "new");
    expect(out).toBe('<script nonce="keep">x</script>');
  });

  it("stamps every fragment independently (no /g lastIndex bleed)", () => {
    const stamped = stampScriptNonces(
      ["<script>a</script>", "<script>b</script>", "<div></div>"],
      "n",
    );
    expect(stamped).toEqual([
      '<script nonce="n">a</script>',
      '<script nonce="n">b</script>',
      "<div></div>",
    ]);
  });
});

describe("listLimits", () => {
  it("keeps story tray and admin summary hard caps sane", () => {
    expect(STORIES_TRAY_MAX).toBeGreaterThanOrEqual(50);
    expect(STORIES_TRAY_MAX).toBeLessThanOrEqual(200);
    expect(ADMIN_USERS_SUMMARY_MAX).toBeGreaterThanOrEqual(100);
    expect(SAVINGS_CONTRIBUTIONS_PAGE_SIZE).toBeGreaterThanOrEqual(20);
  });
});
