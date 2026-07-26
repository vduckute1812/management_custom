import katex from "katex";

/**
 * Escape HTML, then render `$inline$` / `$$block$$` LaTeX via KaTeX.
 * Returns safe HTML suitable for `v-html` after escaping the non-math parts.
 */
export function renderPostBodyHtml(raw: string): string {
  if (!raw) return "";

  const parts: string[] = [];
  // Block first ($$...$$), then inline ($...$). Non-greedy, no nested delimiters.
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(raw)) !== null) {
    parts.push(escapeHtml(raw.slice(last, match.index)));
    const isBlock = match[1] != null;
    const tex = (isBlock ? match[1] : match[2]) ?? "";
    try {
      parts.push(
        katex.renderToString(tex.trim(), {
          displayMode: isBlock,
          throwOnError: false,
          strict: "ignore",
        })
      );
    } catch {
      parts.push(escapeHtml(match[0]));
    }
    last = match.index + match[0].length;
  }
  parts.push(escapeHtml(raw.slice(last)));

  // Preserve newlines as <br> outside of KaTeX HTML.
  return parts
    .join("")
    .replace(/\r\n|\n|\r/g, "<br>");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
