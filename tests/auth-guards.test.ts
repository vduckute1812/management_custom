import { describe, expect, it } from "vitest";
import { UserRole } from "../types/task";
import {
  requireAdmin,
  requireSuperAdmin,
  requireUser,
} from "../server/utils/authContext";
import { stubH3Event } from "./helpers/h3";

const normal = {
  sub: "u1",
  email: "n@ex.com",
  role: UserRole.Normal,
};
const admin = {
  sub: "u2",
  email: "a@ex.com",
  role: UserRole.Admin,
};
const superadmin = {
  sub: "u3",
  email: "s@ex.com",
  role: UserRole.Superadmin,
};

function statusOf(fn: () => unknown): number | undefined {
  try {
    fn();
    return undefined;
  } catch (err) {
    return (err as { statusCode?: number }).statusCode;
  }
}

describe("auth guards", () => {
  it("requireUser returns claims when present", () => {
    const event = stubH3Event({ user: normal });
    expect(requireUser(event)).toEqual(normal);
  });

  it("requireUser → 401 when missing", () => {
    expect(statusOf(() => requireUser(stubH3Event({})))).toBe(401);
  });

  it("requireAdmin allows admin and superadmin", () => {
    expect(requireAdmin(stubH3Event({ user: admin }))).toEqual(admin);
    expect(requireAdmin(stubH3Event({ user: superadmin }))).toEqual(superadmin);
  });

  it("requireAdmin → 403 for normal users", () => {
    expect(statusOf(() => requireAdmin(stubH3Event({ user: normal })))).toBe(
      403,
    );
  });

  it("requireAdmin → 401 when unauthenticated", () => {
    expect(statusOf(() => requireAdmin(stubH3Event({})))).toBe(401);
  });

  it("requireSuperAdmin only allows superadmin", () => {
    expect(requireSuperAdmin(stubH3Event({ user: superadmin }))).toEqual(
      superadmin,
    );
    expect(
      statusOf(() => requireSuperAdmin(stubH3Event({ user: admin }))),
    ).toBe(403);
    expect(
      statusOf(() => requireSuperAdmin(stubH3Event({ user: normal }))),
    ).toBe(403);
  });
});
