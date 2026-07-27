import katex from "katex";
import { marked, Renderer } from "marked";
import DOMPurify from "isomorphic-dompurify";

const renderer = new Renderer();
const baseLink = renderer.link.bind(renderer);
renderer.link = (token) => {
  const html = baseLink(token);
  return html.replace(/^<a /, '<a target="_blank" rel="noopener noreferrer" ');
};

marked.setOptions({
  gfm: true,
  breaks: true,
  renderer,
});

const MATH_TOKEN = (i: number) => `%%MDMATH${i}%%`;
const MATH_RESTORE = /%%MDMATH(\d+)%%/g;

type MathSlot = { display: boolean; tex: string };

function renderKatex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode, throwOnError: false });
  } catch {
    return escapeHtml(tex);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Protect \$ so markdown/math scanners skip them. */
function stashEscapedDollars(input: string): {
  text: string;
  restore: (s: string) => string;
} {
  const parts: string[] = [];
  const text = input.replace(/\\\$/g, () => {
    const i = parts.length;
    parts.push("$");
    return `%%DOLLAR${i}%%`;
  });
  return {
    text,
    restore: (s) =>
      s.replace(/%%DOLLAR(\d+)%%/g, (_, n) => parts[Number(n)] ?? "$"),
  };
}

/**
 * Render post body: GitHub-flavored Markdown + KaTeX ($…$ / $$…$$).
 * Output is sanitized HTML safe for v-html.
 */
export function renderPostBody(raw: string): string {
  if (!raw) return "";

  const dollars = stashEscapedDollars(raw);
  let text = dollars.text;
  const slots: MathSlot[] = [];

  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) => {
    const i = slots.length;
    slots.push({ display: true, tex: tex.trim() });
    return MATH_TOKEN(i);
  });

  text = text.replace(/\$([^$\n]+?)\$/g, (_, tex: string) => {
    const i = slots.length;
    slots.push({ display: false, tex: tex.trim() });
    return MATH_TOKEN(i);
  });

  text = dollars.restore(text);

  let html = marked.parse(text, { async: false }) as string;

  html = html.replace(MATH_RESTORE, (_m, n: string) => {
    const slot = slots[Number(n)];
    if (!slot) return "";
    return renderKatex(slot.tex, slot.display);
  });

  // Keep real table layout; scroll wide tables via a wrapper (not display:block on <table>).
  html = html.replace(
    /<table\b[\s\S]*?<\/table>/gi,
    (table) => `<div class="md-table-wrap">${table}</div>`,
  );

  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: [
      "math",
      "annotation",
      "semantics",
      "mrow",
      "mi",
      "mo",
      "mn",
      "msup",
      "msub",
      "msubsup",
      "mfrac",
      "msqrt",
      "mroot",
      "mtable",
      "mtr",
      "mtd",
      "mtext",
      "mspace",
      "menclose",
      "mstyle",
      "mpadded",
      "mphantom",
      "mmultiscripts",
      "munderover",
      "munder",
      "mover",
      "mlabeledtr",
      "maction",
      "none",
      "mprescripts",
    ],
    ADD_ATTR: [
      "class",
      "style",
      "href",
      "target",
      "rel",
      "colspan",
      "rowspan",
      "align",
      "mathvariant",
      "encoding",
      "xmlns",
      "aria-hidden",
      "focusable",
      "role",
      "viewBox",
      "width",
      "height",
      "preserveAspectRatio",
      "stretchy",
      "fence",
      "separator",
      "lspace",
      "rspace",
      "symmetric",
      "maxsize",
      "minsize",
      "accent",
      "movablelimits",
      "form",
      "largeop",
      "display",
      "displaystyle",
      "scriptlevel",
    ],
  });
}

/** @deprecated Prefer renderPostBody */
export const renderPostBodyHtml = renderPostBody;
