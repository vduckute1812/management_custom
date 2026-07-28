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

/** Loose row fragment: contains a cell delimiter (wrapped thesis tables). */
function isPipeFragment(line: string): boolean {
  const t = line.trim();
  if (!t || t.startsWith("```") || t.startsWith("#")) return false;
  return t.includes("|");
}

function splitCells(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((c) => c.trim());
}

function isSeparatorRow(line: string): boolean {
  const cells = splitCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function columnCount(line: string): number {
  return splitCells(line).length;
}

function makeSeparator(cols: number): string {
  return `|${Array.from({ length: cols }, () => " --- ").join("|")}|`;
}

function formatRow(cells: string[]): string {
  return `| ${cells.map((c) => c.trim()).join(" | ")} |`;
}

function isTableBreakLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.startsWith("#")) return true;
  if (t.startsWith("```")) return true;
  if (/^(?:[-*+]|\d+\.)\s+/.test(t) && !t.includes("|")) return true;
  return false;
}

function rowIsOpen(line: string): boolean {
  return !line.trim().endsWith("|");
}

/**
 * Merge physically wrapped table rows until each logical row has `cols` cells.
 *
 *   | Điện trở | $R=...$
 *   (note) | $\frac{1}{R}=...$
 *   (note) |
 */
function coalesceWrappedRows(rawRows: string[], cols: number): string[] {
  const out: string[] = [];
  let cells: string[] = [];

  const flush = () => {
    if (!cells.length) return;
    while (cells.length < cols) cells.push("");
    out.push(formatRow(cells.slice(0, cols)));
    cells = [];
  };

  for (const line of rawRows) {
    const part = splitCells(line);
    if (!cells.length) {
      cells = part;
    } else if (line.trim().startsWith("|")) {
      flush();
      cells = part;
    } else {
      const [first, ...rest] = part;
      if (first) {
        const last = cells.length - 1;
        cells[last] = `${cells[last] ?? ""} ${first}`.trim();
      } else if (rest.length === 0 && line.trim().endsWith("|")) {
        // Trailing-only "|" continuation — just closes the row.
      }
      cells.push(...rest);
    }

    if (cells.length > cols) {
      const extra = cells.slice(cols);
      cells = cells.slice(0, cols);
      flush();
      cells = extra;
    } else if (cells.length >= cols && line.trim().endsWith("|")) {
      flush();
    }
  }
  flush();
  return out;
}

/**
 * Repair pasted GFM tables:
 * - drop blank lines inside a table
 * - insert a missing separator row
 * - join rows that were soft-wrapped across lines (common in luận văn paste)
 */
export function normalizeMarkdownTables(src: string): string {
  const lines = src.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const start = lines[i]!;
    if (!(start.trim().startsWith("|") && isPipeFragment(start))) {
      out.push(start);
      i += 1;
      continue;
    }

    const physical: string[] = [];
    let j = i;

    while (j < lines.length) {
      const line = lines[j]!;
      const trimmed = line.trim();

      if (!trimmed) {
        let k = j + 1;
        while (k < lines.length && !lines[k]!.trim()) k += 1;
        const next = lines[k];
        if (
          next == null ||
          isTableBreakLine(next) ||
          !(
            isPipeFragment(next) ||
            (physical.length > 0 && rowIsOpen(physical[physical.length - 1]!))
          )
        ) {
          break;
        }
        j = k;
        continue;
      }

      if (isTableBreakLine(line)) break;

      if (isPipeFragment(line)) {
        physical.push(line);
        j += 1;
        continue;
      }

      // Text continuation of an open row (no leading pipe on this line).
      if (physical.length > 0 && rowIsOpen(physical[physical.length - 1]!)) {
        physical.push(line);
        j += 1;
        continue;
      }

      break;
    }

    if (physical.length < 2) {
      out.push(...physical);
      i = Math.max(j, i + 1);
      continue;
    }

    const headerCells = splitCells(physical[0]!);
    const cols = Math.max(1, headerCells.length);
    const bodyStart = isSeparatorRow(physical[1]!) ? 2 : 1;
    const body = coalesceWrappedRows(physical.slice(bodyStart), cols);

    out.push(formatRow(headerCells), makeSeparator(cols), ...body);
    i = j;
  }

  return out.join("\n");
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
  text = normalizeMarkdownTables(text);

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
