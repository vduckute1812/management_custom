import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "../types/auth";
import {
  requireAdmin,
  requireSuperAdmin,
  requireUser,
} from "../server/utils/authContext";
import { stubH3Event } from "./helpers/h3";

const getUserById = vi.fn();

vi.mock("../server/db/users", () => ({
  getUserById: (...args: unknown[]) => getUserById(...args),
}));

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

async function statusOfAsync(
  fn: () => Promise<unknown>,
): Promise<number | undefined> {
  try {
    await fn();
    return undefined;
  } catch (err) {
    return (err as { statusCode?: number }).statusCode;
  }
}

describe("auth guards", () => {
  beforeEach(() => {
    getUserById.mockReset();
  });

  it("requireUser returns claims when present", () => {
    const event = stubH3Event({ user: normal });
    expect(requireUser(event)).toEqual(normal);
  });

  it("requireUser → 401 when missing", () => {
    expect(statusOf(() => requireUser(stubH3Event({})))).toBe(401);
  });

  it("requireAdmin allows admin and superadmin (fresh DB role)", async () => {
    getUserById.mockImplementation(async (id: string) => {
      if (id === admin.sub) return { id, role: UserRole.Admin };
      if (id === superadmin.sub) return { id, role: UserRole.Superadmin };
      return null;
    });
    expect(await requireAdmin(stubH3Event({ user: admin }))).toEqual(admin);
    expect(await requireAdmin(stubH3Event({ user: superadmin }))).toEqual(
      superadmin,
    );
  });

  it("requireAdmin → 403 when JWT says admin but DB was demoted", async () => {
    getUserById.mockResolvedValue({ id: admin.sub, role: UserRole.Normal });
    expect(
      await statusOfAsync(() => requireAdmin(stubH3Event({ user: admin }))),
    ).toBe(403);
  });

  it("requireAdmin → 403 for normal users", async () => {
    getUserById.mockResolvedValue({ id: normal.sub, role: UserRole.Normal });
    expect(
      await statusOfAsync(() => requireAdmin(stubH3Event({ user: normal }))),
    ).toBe(403);
  });

  it("requireAdmin → 401 when unauthenticated", async () => {
    expect(await statusOfAsync(() => requireAdmin(stubH3Event({})))).toBe(401);
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
