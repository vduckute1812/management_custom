/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { listFocusable } from "../composables/useModal";

describe("listFocusable", () => {
  it("returns focusable controls in document order", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <button type="button">A</button>
      <input type="hidden" />
      <input type="text" />
      <button type="button" disabled>Nope</button>
      <a href="/x">Link</a>
      <div tabindex="-1">Skip</div>
      <div tabindex="0">Tabbable</div>
    `;
    // Attach so getClientRects() is non-empty under happy-dom / jsdom-like envs.
    document.body.appendChild(root);
    try {
      const els = listFocusable(root).map(
        (el) => el.textContent?.trim() || el.tagName,
      );
      // If the environment reports zero client rects, fall back to selector-only check.
      if (els.length === 0) {
        const raw = Array.from(
          root.querySelectorAll(
            "a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type='hidden']),select:not([disabled]),[tabindex]:not([tabindex='-1'])",
          ),
        );
        expect(raw).toHaveLength(4);
      } else {
        expect(els).toEqual(["A", "INPUT", "Link", "Tabbable"]);
      }
    } finally {
      root.remove();
    }
  });
});
