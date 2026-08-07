/**
 * Stamp a CSP nonce onto `<script>` opening tags that lack one.
 * Kept free of Nitro so unit tests can cover the HTML transform.
 */
export function stampScriptNonces(
  fragments: string[],
  nonce: string,
): string[] {
  // Fresh regex per call — avoid /g lastIndex bleed across fragments.
  const re = /<script(?![^>]*\bnonce=)(?=[\s>])/gi;
  return fragments.map((html) => html.replace(re, `<script nonce="${nonce}"`));
}
