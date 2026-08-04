import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetRateLimitStoreForTests,
  checkRateLimit,
  clientIp,
  rateLimitAccountKey,
  rateLimitKey,
  rateLimitScope,
  resolveAccountPolicy,
  resolvePolicy,
} from "../server/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    _resetRateLimitStoreForTests();
  });

  it("allows requests within the limit", async () => {
    const opts = { limit: 3, windowMs: 60_000 };
    expect((await checkRateLimit("test-a", opts)).allowed).toBe(true);
    expect((await checkRateLimit("test-a", opts)).allowed).toBe(true);
    expect((await checkRateLimit("test-a", opts)).allowed).toBe(true);
    expect((await checkRateLimit("test-a", opts)).allowed).toBe(false);
  });

  it("tracks separate keys independently", async () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect((await checkRateLimit("test-b", opts)).allowed).toBe(true);
    expect((await checkRateLimit("test-b", opts)).allowed).toBe(false);
    expect((await checkRateLimit("test-c", opts)).allowed).toBe(true);
  });

  it("reports remaining correctly", async () => {
    const opts = { limit: 2, windowMs: 60_000 };
    expect((await checkRateLimit("test-remain", opts)).remaining).toBe(1);
    expect((await checkRateLimit("test-remain", opts)).remaining).toBe(0);
    const third = await checkRateLimit("test-remain", opts);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });
});

describe("rateLimitScope / rateLimitKey", () => {
  it("shares a global bucket for ordinary APIs", () => {
    expect(rateLimitScope("/api/tasks")).toBe("global");
    expect(rateLimitScope("/api/posts/post_abc")).toBe("global");
    expect(rateLimitKey("1.2.3.4", "/api/tasks")).toBe("1.2.3.4:global");
  });

  it("isolates strict auth/upload paths", () => {
    expect(rateLimitScope("/api/auth/login")).toBe("/api/auth/login");
    expect(rateLimitKey("1.2.3.4", "/api/auth/signup")).toBe(
      "1.2.3.4:/api/auth/signup",
    );
    expect(rateLimitScope("/api/uploads")).toBe("/api/uploads");
    expect(rateLimitScope("/api/uploads/upl_abc")).toBe("/api/uploads");
  });

  it("builds a separate account-scoped key", () => {
    expect(rateLimitAccountKey("a@b.co", "/api/auth/login")).toBe(
      "account:a@b.co:/api/auth/login",
    );
  });
});

describe("resolvePolicy", () => {
  it("applies strict auth/upload limits", () => {
    expect(resolvePolicy("/api/auth/login")).toEqual({
      limit: 10,
      windowMs: 60_000,
    });
    expect(resolvePolicy("/api/auth/signup")).toEqual({
      limit: 5,
      windowMs: 60_000,
    });
    expect(resolvePolicy("/api/uploads")).toEqual({
      limit: 30,
      windowMs: 60_000,
    });
  });

  it("defaults other APIs to 120/min", () => {
    expect(resolvePolicy("/api/tasks")).toEqual({
      limit: 120,
      windowMs: 60_000,
    });
  });

  it("exposes matching account policies for credential endpoints", () => {
    expect(resolveAccountPolicy("/api/auth/login")).toEqual({
      limit: 10,
      windowMs: 60_000,
    });
    expect(resolveAccountPolicy("/api/auth/signup")).toEqual({
      limit: 5,
      windowMs: 60_000,
    });
    expect(resolveAccountPolicy("/api/auth/forgot-password")).toEqual({
      limit: 5,
      windowMs: 60_000,
    });
    expect(resolveAccountPolicy("/api/auth/account")).toEqual({
      limit: 5,
      windowMs: 60_000,
    });
    expect(resolvePolicy("/api/auth/account")).toEqual({
      limit: 5,
      windowMs: 60_000,
    });
    expect(resolveAccountPolicy("/api/tasks")).toBeNull();
  });
});

describe("clientIp", () => {
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

  it("prefers CF-Connecting-IP over every other signal when peer is trusted", () => {
    process.env.TRUSTED_PROXY_IPS = "10.0.0.9";
    expect(
      clientIp(
        event({
          "cf-connecting-ip": "203.0.113.10",
          "x-real-ip": "10.0.0.1",
          "x-forwarded-for": "1.2.3.4, 10.0.0.1",
        }),
      ),
    ).toBe("203.0.113.10");
  });

  it("falls back to X-Real-IP (nginx-set) when CF is absent", () => {
    process.env.TRUSTED_PROXY_IPS = "10.0.0.9";
    expect(
      clientIp(
        event({
          "x-real-ip": "10.0.0.1",
          "x-forwarded-for": "1.2.3.4, 10.0.0.1",
        }),
      ),
    ).toBe("10.0.0.1");
  });

  it("ignores a spoofed first X-Forwarded-For hop", () => {
    // The previous implementation took XFF[0], so rotating this header
    // minted a fresh bucket per request and bypassed the auth budgets.
    expect(
      clientIp(
        event({
          "x-forwarded-for": "198.51.100.1, 10.0.0.1",
        }),
      ),
    ).toBe("10.0.0.9");
  });

  it("falls back to the socket address", () => {
    expect(clientIp(event({}))).toBe("10.0.0.9");
  });
});
