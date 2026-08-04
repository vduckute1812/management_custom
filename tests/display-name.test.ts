import { describe, expect, it } from "vitest";
import {
  nameFromEmail,
  normalizeDisplayName,
  resolveDisplayName,
} from "../utils/displayName";

describe("nameFromEmail", () => {
  it("uses the local-part and softens separators", () => {
    expect(nameFromEmail("john.doe@example.com")).toBe("john doe");
    expect(nameFromEmail("ada_lovelace@x.io")).toBe("ada lovelace");
    expect(nameFromEmail("a+tag@x.io")).toBe("a tag");
  });

  it("falls back when the local-part is empty", () => {
    expect(nameFromEmail("@x.io")).toBe("User");
    expect(nameFromEmail("")).toBe("User");
  });
});

describe("resolveDisplayName", () => {
  it("prefers an explicit name", () => {
    expect(resolveDisplayName("Ada", "x@y.com")).toBe("Ada");
    expect(resolveDisplayName("  Ada  ", "x@y.com")).toBe("Ada");
  });

  it("derives from email when missing", () => {
    expect(resolveDisplayName(null, "jane.doe@x.com")).toBe("jane doe");
    expect(resolveDisplayName("   ", "jane.doe@x.com")).toBe("jane doe");
  });
});

describe("normalizeDisplayName", () => {
  it("returns null for empty input", () => {
    expect(normalizeDisplayName(null)).toBeNull();
    expect(normalizeDisplayName("  ")).toBeNull();
  });
});
