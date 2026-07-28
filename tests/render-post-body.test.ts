import { describe, expect, it } from "vitest";
import { renderPostBody } from "../utils/renderPostBody";

describe("renderPostBody sanitization", () => {
  it("strips script tags from markdown HTML output", () => {
    const html = renderPostBody("Hello <script>alert(1)</script> world");
    expect(html).not.toMatch(/<script/i);
    expect(html).toMatch(/Hello/);
  });

  it("does not allow javascript: links", () => {
    const html = renderPostBody("[x](javascript:alert(1))");
    expect(html).not.toMatch(/javascript:/i);
  });
});
