import type { H3Event } from "h3";
import type { AccessTokenClaims } from "../../server/utils/auth";

type StubHeaders = Record<string, string>;

/**
 * Minimal H3Event shape for unit-testing auth helpers without spinning Nitro.
 * Satisfies getRequestHeader / getCookie / getQuery from `h3`.
 */
export function stubH3Event(opts: {
  method?: string;
  path?: string;
  headers?: StubHeaders;
  user?: AccessTokenClaims;
}): H3Event {
  const method = opts.method ?? "GET";
  const path = opts.path ?? "/";
  const headers: StubHeaders = {};
  for (const [key, value] of Object.entries(opts.headers ?? {})) {
    headers[key.toLowerCase()] = value;
  }
  return {
    method,
    path,
    context: { user: opts.user },
    node: {
      req: {
        method,
        url: path,
        headers,
      },
      res: {
        getHeader() {
          return undefined;
        },
        setHeader() {},
      },
    },
  } as unknown as H3Event;
}
