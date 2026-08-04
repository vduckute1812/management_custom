import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthOAuthIntent, AuthProvider } from "../types/auth";

const getIdentityByProviderSubject = vi.fn();
const getUserByEmail = vi.fn();
const getUserById = vi.fn();
const linkIdentity = vi.fn();
const createUser = vi.fn();
const markUserEmailVerified = vi.fn();

vi.mock("../server/utils/db", () => ({
  getIdentityByProviderSubject: (...args: unknown[]) =>
    getIdentityByProviderSubject(...args),
  getUserByEmail: (...args: unknown[]) => getUserByEmail(...args),
  getUserById: (...args: unknown[]) => getUserById(...args),
  linkIdentity: (...args: unknown[]) => linkIdentity(...args),
  createUser: (...args: unknown[]) => createUser(...args),
  markUserEmailVerified: (...args: unknown[]) => markUserEmailVerified(...args),
}));

import { resolveGoogleLoginUser } from "../server/utils/googleOAuthUser";

const profile = {
  sub: "google-sub-1",
  email: "victim@example.com",
  emailVerified: true,
  name: "Victim",
};

function user(partial: Record<string, unknown>) {
  return {
    id: "user_1",
    email: "victim@example.com",
    name: "Victim",
    locale: "en",
    moneyCurrency: 1,
    role: 0,
    emailVerified: false,
    passwordHash: "hash",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("resolveGoogleLoginUser account takeover guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getIdentityByProviderSubject.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("refuses to link or verify an unverified password account", async () => {
    getUserByEmail.mockResolvedValue(user({ emailVerified: false }));

    await expect(resolveGoogleLoginUser(profile)).rejects.toMatchObject({
      statusCode: 409,
      data: { code: "unverified" },
    });
    expect(linkIdentity).not.toHaveBeenCalled();
    expect(markUserEmailVerified).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("links Google to an already-verified account with the same email", async () => {
    const verified = user({ emailVerified: true });
    getUserByEmail.mockResolvedValue(verified);
    linkIdentity.mockResolvedValue(undefined);

    const result = await resolveGoogleLoginUser(profile);
    expect(result).toEqual(verified);
    expect(linkIdentity).toHaveBeenCalledWith({
      userId: "user_1",
      provider: AuthProvider.Google,
      providerSubject: "google-sub-1",
      providerEmail: "victim@example.com",
    });
    expect(markUserEmailVerified).not.toHaveBeenCalled();
  });

  it("creates a Google-only user when the email is new", async () => {
    getUserByEmail.mockResolvedValue(null);
    const created = user({
      emailVerified: true,
      passwordHash: null,
    });
    createUser.mockResolvedValue(created);
    linkIdentity.mockResolvedValue(undefined);

    const result = await resolveGoogleLoginUser(profile, "vi");
    expect(result).toEqual(created);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "victim@example.com",
        passwordHash: null,
        emailVerified: true,
        locale: "vi",
      }),
    );
    expect(linkIdentity).toHaveBeenCalled();
  });

  void AuthOAuthIntent;
});
