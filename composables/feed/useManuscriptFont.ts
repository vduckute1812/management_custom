/**
 * Source Serif 4 for manuscript chrome. Loaded deferred so it does not block
 * first paint on Feed / write / edit — Georgia stack renders until the webfont
 * arrives (`display=swap` on the Google CSS).
 */
export const MANUSCRIPT_FONT_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&display=swap";

/** Call from page `<script setup>` to register deferred font links. */
export function useManuscriptFont() {
  useHead({
    link: [
      {
        key: "manuscript-font-preload",
        rel: "preload",
        as: "style",
        href: MANUSCRIPT_FONT_STYLESHEET,
      },
      {
        key: "manuscript-font-stylesheet",
        rel: "stylesheet",
        href: MANUSCRIPT_FONT_STYLESHEET,
        media: "print",
        onload: "this.media='all'",
      },
    ],
    noscript: [
      {
        key: "manuscript-font-noscript",
        innerHTML: `<link rel="stylesheet" href="${MANUSCRIPT_FONT_STYLESHEET}">`,
      },
    ],
  });
}
