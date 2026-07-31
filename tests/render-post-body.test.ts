import { describe, expect, it } from "vitest";
import { bodyHasMath, renderPostBody } from "../utils/renderPostBody";

describe("renderPostBody sanitization", () => {
  it("strips script tags from markdown HTML output", async () => {
    const html = await renderPostBody("Hello <script>alert(1)</script> world");
    expect(html).not.toMatch(/<script/i);
    expect(html).toMatch(/Hello/);
  });

  it("does not allow javascript: links", async () => {
    const html = await renderPostBody("[x](javascript:alert(1))");
    expect(html).not.toMatch(/javascript:/i);
  });

  it("renders plain markdown without loading KaTeX", async () => {
    expect(bodyHasMath("Just a **bold** update")).toBe(false);
    const html = await renderPostBody("Just a **bold** update");
    expect(html).toMatch(/<strong>bold<\/strong>/);
    expect(html).not.toMatch(/katex/i);
  });

  it("detects math delimiters", () => {
    expect(bodyHasMath("Energy $E=mc^2$")).toBe(true);
    expect(bodyHasMath("Display $$x$$")).toBe(true);
    expect(bodyHasMath("Price is \\$5")).toBe(false);
  });
});
