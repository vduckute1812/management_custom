import { describe, expect, it } from "vitest";
import {
  accountEmailMatches,
  canConfirmAccountDeletion,
} from "../utils/accountDeletion";
import { emailConfirmationMatches } from "../server/utils/auth";
import { deleteAccountBodySchema } from "../server/schemas/auth";

const base = {
  typedEmail: "dana@example.com",
  accountEmail: "dana@example.com",
  requiresPassword: true,
  password: "hunter2",
  busy: false,
};

describe("account deletion — typed confirmation", () => {
  it("accepts the account address regardless of case or padding", () => {
    for (const typed of [
      "dana@example.com",
      "Dana@Example.com",
      "  dana@example.com  ",
      "DANA@EXAMPLE.COM",
    ]) {
      expect(accountEmailMatches(typed, "dana@example.com")).toBe(true);
      expect(emailConfirmationMatches(typed, "dana@example.com")).toBe(true);
    }
  });

  it("rejects a different address, a prefix, and an empty field", () => {
    for (const typed of ["", "   ", "dan@example.com", "dana@example.co"]) {
      expect(accountEmailMatches(typed, "dana@example.com")).toBe(false);
      expect(emailConfirmationMatches(typed, "dana@example.com")).toBe(false);
    }
  });

  it("rejects non-string input on the server helper", () => {
    expect(emailConfirmationMatches(undefined, "dana@example.com")).toBe(false);
    expect(emailConfirmationMatches("dana@example.com", null)).toBe(false);
  });
});

describe("account deletion — client submit gate", () => {
  it("allows submission once the address and password are present", () => {
    expect(canConfirmAccountDeletion(base)).toBe(true);
  });

  it("blocks a wrong address even when a password is typed", () => {
    expect(
      canConfirmAccountDeletion({ ...base, typedEmail: "wrong@example.com" }),
    ).toBe(false);
  });

  it("blocks an empty password for password accounts", () => {
    expect(canConfirmAccountDeletion({ ...base, password: "" })).toBe(false);
  });

  it("needs no password for Google-only accounts", () => {
    expect(
      canConfirmAccountDeletion({
        ...base,
        requiresPassword: false,
        password: "",
      }),
    ).toBe(true);
  });

  it("blocks while a request is in flight", () => {
    expect(canConfirmAccountDeletion({ ...base, busy: true })).toBe(false);
  });
});

describe("deleteAccountBodySchema", () => {
  it("requires the typed email and trims it", () => {
    const parsed = deleteAccountBodySchema.parse({
      email: "  dana@example.com ",
      password: "hunter2",
    });
    expect(parsed).toEqual({ email: "dana@example.com", password: "hunter2" });
  });

  it("leaves the password optional for Google-only accounts", () => {
    expect(
      deleteAccountBodySchema.parse({ email: "dana@example.com" }),
    ).toEqual({ email: "dana@example.com" });
  });

  it("rejects a blank email and a blank password", () => {
    expect(deleteAccountBodySchema.safeParse({ email: "   " }).success).toBe(
      false,
    );
    expect(
      deleteAccountBodySchema.safeParse({
        email: "dana@example.com",
        password: "",
      }).success,
    ).toBe(false);
  });
});
