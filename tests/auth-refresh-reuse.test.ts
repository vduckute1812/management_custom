import { describe, expect, it } from "vitest";
import {
  REFRESH_REUSE_GRACE_MS,
  shouldRevokeFamilyOnRefreshReuse,
} from "../server/utils/authRefreshReuse";

describe("shouldRevokeFamilyOnRefreshReuse", () => {
  it("skips family revoke inside the grace window (concurrent refresh race)", () => {
    const now = Date.parse("2026-08-08T12:00:00.000Z");
    const revokedAt = new Date(now - 1_000).toISOString();
    expect(shouldRevokeFamilyOnRefreshReuse(revokedAt, now)).toBe(false);
  });

  it("revokes the family after the grace window (reuse / theft)", () => {
    const now = Date.parse("2026-08-08T12:00:00.000Z");
    const revokedAt = new Date(now - REFRESH_REUSE_GRACE_MS - 1).toISOString();
    expect(shouldRevokeFamilyOnRefreshReuse(revokedAt, now)).toBe(true);
  });

  it("revokes when revokedAt is unparseable", () => {
    expect(shouldRevokeFamilyOnRefreshReuse("not-a-date", Date.now())).toBe(
      true,
    );
  });
});
