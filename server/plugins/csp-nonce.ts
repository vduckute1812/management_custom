/**
 * Per-request CSP nonces for HTML document responses.
 *
 * Why a render hook (not only middleware): `/` and `/feed` use Nitro SWR.
 * Middleware runs outside the cached handler, so a middleware-only nonce would
 * diverge from a cache-hit body. Setting CSP during `render:html` stores the
 * header with the body so they stay paired on cache hits.
 */
import { randomBytes } from "node:crypto";
import { setHeader } from "h3";
import { buildDocumentContentSecurityPolicy } from "../utils/content-security-policy";
import { stampScriptNonces } from "../utils/cspNonceStamp";

function freshNonce(): string {
  return randomBytes(16).toString("base64");
}

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook("render:html", (html, { event }) => {
    const nonce = freshNonce();
    event.context.cspNonce = nonce;
    html.head = stampScriptNonces(html.head, nonce);
    html.bodyPrepend = stampScriptNonces(html.bodyPrepend, nonce);
    html.body = stampScriptNonces(html.body, nonce);
    html.bodyAppend = stampScriptNonces(html.bodyAppend, nonce);
    setHeader(
      event,
      "Content-Security-Policy",
      buildDocumentContentSecurityPolicy(nonce),
    );
  });
});
