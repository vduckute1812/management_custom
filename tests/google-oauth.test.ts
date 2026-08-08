import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOAuthState,
  parseOAuthState,
  safeOAuthRedirect,
} from "../server/utils/googleOAuth";
import { AuthOAuthIntent } from "../types/auth";

describe("safeOAuthRedirect", () => {
  it("allows same-origin relative paths", () => {
    expect(safeOAuthRedirect("/settings")).toBe("/settings");
    expect(safeOAuthRedirect("/feed?x=1")).toBe("/feed?x=1");
  });

  it("rejects open redirects", () => {
    expect(safeOAuthRedirect("https://evil.example")).toBe("/");
    expect(safeOAuthRedirect("//evil.example")).toBe("/");
    expect(safeOAuthRedirect("javascript:alert(1)")).toBe("/");
    expect(safeOAuthRedirect(null)).toBe("/");
  });
});

describe("oauth state", () => {
  const prev = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret-at-least-32-chars!!";
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prev;
  });

  it("round-trips a signed login state", () => {
    const { state, nonce } = createOAuthState({
      intent: AuthOAuthIntent.Login,
      redirect: "/tasks",
    });
    const parsed = parseOAuthState(state);
    expect(parsed).not.toBeNull();
    expect(parsed?.intent).toBe(AuthOAuthIntent.Login);
    expect(parsed?.redirect).toBe("/tasks");
    expect(parsed?.nonce).toBe(nonce);
  });

  it("rejects tampered state", () => {
    const { state } = createOAuthState({
      intent: AuthOAuthIntent.Link,
      redirect: "/settings",
      userId: "user_abc",
    });
    const bad = state.replace(/\.$/, "") + "x";
    expect(parseOAuthState(bad)).toBeNull();
    expect(parseOAuthState("not.a.state")).toBeNull();
  });
});
