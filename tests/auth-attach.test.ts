import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UserRole } from "../types/task";
import { signAccessToken } from "../server/utils/auth";
import { attachUserFromHeader } from "../server/utils/authContext";
import { ACCESS_COOKIE } from "../server/utils/refreshCookie";
import { stubH3Event } from "./helpers/h3";

const SECRET = "test-jwt-secret-at-least-16";

describe("attachUserFromHeader", () => {
  const prev = process.env.JWT_SECRET;
  let token: string;

  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
    token = signAccessToken({
      sub: "user_attach",
      email: "attach@example.com",
      role: UserRole.Admin,
    });
  });

  afterAll(() => {
    if (prev === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prev;
  });

  it("attaches from Authorization Bearer", () => {
    const event = stubH3Event({
      headers: { authorization: `Bearer ${token}` },
    });
    attachUserFromHeader(event);
    expect(event.context.user?.sub).toBe("user_attach");
    expect(event.context.user?.role).toBe(UserRole.Admin);
  });

  it("attaches from HttpOnly access cookie", () => {
    const event = stubH3Event({
      headers: { cookie: `${ACCESS_COOKIE}=${token}` },
    });
    attachUserFromHeader(event);
    expect(event.context.user?.sub).toBe("user_attach");
  });

  it("accepts ?access_token= on GET /api/uploads/*", () => {
    const event = stubH3Event({
      method: "GET",
      path: `/api/uploads/upl_1?access_token=${token}`,
    });
    attachUserFromHeader(event);
    expect(event.context.user?.sub).toBe("user_attach");
  });

  it("accepts ?access_token= on HEAD /api/uploads/*", () => {
    const event = stubH3Event({
      method: "HEAD",
      path: `/api/uploads/upl_1?access_token=${encodeURIComponent(token)}`,
    });
    attachUserFromHeader(event);
    expect(event.context.user?.sub).toBe("user_attach");
  });

  it("ignores ?access_token= on non-upload routes", () => {
    const event = stubH3Event({
      method: "GET",
      path: `/api/posts?access_token=${token}`,
    });
    attachUserFromHeader(event);
    expect(event.context.user).toBeUndefined();
  });

  it("ignores ?access_token= on POST /api/uploads/*", () => {
    const event = stubH3Event({
      method: "POST",
      path: `/api/uploads?access_token=${token}`,
    });
    attachUserFromHeader(event);
    expect(event.context.user).toBeUndefined();
  });

  it("swallows invalid tokens without throwing", () => {
    const event = stubH3Event({
      headers: { authorization: "Bearer not-a-jwt" },
    });
    expect(() => attachUserFromHeader(event)).not.toThrow();
    expect(event.context.user).toBeUndefined();
  });

  it("prefers Bearer over cookie", () => {
    const other = signAccessToken({
      sub: "user_bearer",
      email: "b@example.com",
      role: UserRole.Normal,
    });
    const event = stubH3Event({
      headers: {
        authorization: `Bearer ${other}`,
        cookie: `${ACCESS_COOKIE}=${token}`,
      },
    });
    attachUserFromHeader(event);
    expect(event.context.user?.sub).toBe("user_bearer");
  });
});
