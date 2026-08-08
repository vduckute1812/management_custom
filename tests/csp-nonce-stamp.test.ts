import { describe, expect, it } from "vitest";
import { stampScriptNonces } from "../server/utils/cspNonceStamp";

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
