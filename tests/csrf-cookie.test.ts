import { afterEach, describe, expect, it } from "vitest";
import { clientIp, isTrustedProxy } from "../server/rate-limit/clientIp";
import {
  assertSameOriginForCookieAuth,
  requireOriginForCookieAuth,
} from "../server/utils/refreshCookie";
import { stubH3Event } from "./helpers/h3";

describe("clientIp trusted proxies", () => {
  const prevLan = process.env.LAN_IP;
  const prevTrusted = process.env.TRUSTED_PROXY_IPS;

  afterEach(() => {
    if (prevLan === undefined) delete process.env.LAN_IP;
    else process.env.LAN_IP = prevLan;
    if (prevTrusted === undefined) delete process.env.TRUSTED_PROXY_IPS;
    else process.env.TRUSTED_PROXY_IPS = prevTrusted;
  });

  function event(
    headers: Record<string, string | string[] | undefined>,
    remoteAddress = "10.0.0.9",
  ) {
    return {
      node: {
        req: {
          headers,
          socket: { remoteAddress },
        },
      },
    };
  }

  it("ignores forged CF-Connecting-IP on a direct (untrusted) peer", () => {
    process.env.LAN_IP = "192.168.1.4";
    expect(
      clientIp(
        event(
          {
            "cf-connecting-ip": "203.0.113.10",
            "x-real-ip": "10.0.0.1",
          },
          "198.51.100.50",
        ),
      ),
    ).toBe("198.51.100.50");
  });

  it("trusts CF-Connecting-IP when the peer is LAN_IP (nginx)", () => {
    process.env.LAN_IP = "192.168.1.4";
    expect(
      clientIp(
        event(
          {
            "cf-connecting-ip": "203.0.113.10",
            "x-real-ip": "10.0.0.1",
          },
          "192.168.1.4",
        ),
      ),
    ).toBe("203.0.113.10");
  });

  it("trusts loopback peers", () => {
    expect(isTrustedProxy("127.0.0.1")).toBe(true);
    expect(isTrustedProxy("::ffff:127.0.0.1")).toBe(true);
    expect(clientIp(event({ "x-real-ip": "203.0.113.9" }, "127.0.0.1"))).toBe(
      "203.0.113.9",
    );
  });
});

describe("assertSameOriginForCookieAuth", () => {
  const prevCsrf = process.env.CSRF_REQUIRE_ORIGIN;
  const prevSecure = process.env.COOKIE_SECURE;
  const prevNode = process.env.NODE_ENV;

  afterEach(() => {
    if (prevCsrf === undefined) delete process.env.CSRF_REQUIRE_ORIGIN;
    else process.env.CSRF_REQUIRE_ORIGIN = prevCsrf;
    if (prevSecure === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = prevSecure;
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
  });

  it("allows missing Origin in local HTTP", () => {
    process.env.CSRF_REQUIRE_ORIGIN = "0";
    process.env.COOKIE_SECURE = "false";
    const event = stubH3Event({
      headers: { host: "localhost:3000" },
    });
    expect(() => assertSameOriginForCookieAuth(event, true)).not.toThrow();
    expect(requireOriginForCookieAuth()).toBe(false);
  });

  it("rejects missing Origin when CSRF_REQUIRE_ORIGIN=1", () => {
    process.env.CSRF_REQUIRE_ORIGIN = "1";
    const event = stubH3Event({
      headers: { host: "dntechx.com" },
    });
    expect(() => assertSameOriginForCookieAuth(event, true)).toThrow(
      expect.objectContaining({ statusCode: 403 }),
    );
  });

  it("accepts a matching Origin", () => {
    process.env.CSRF_REQUIRE_ORIGIN = "1";
    const event = stubH3Event({
      headers: {
        host: "dntechx.com",
        origin: "https://dntechx.com",
      },
    });
    expect(() => assertSameOriginForCookieAuth(event, true)).not.toThrow();
  });

  it("rejects a cross-site Origin", () => {
    process.env.CSRF_REQUIRE_ORIGIN = "1";
    const event = stubH3Event({
      headers: {
        host: "dntechx.com",
        origin: "https://evil.example",
      },
    });
    expect(() => assertSameOriginForCookieAuth(event, true)).toThrow(
      expect.objectContaining({ statusCode: 403 }),
    );
  });
});
