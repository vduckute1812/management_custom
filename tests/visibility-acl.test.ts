import { describe, expect, it } from "vitest";
import {
  visibilityClause,
  visibilityClauseParams,
} from "../server/db/postQuery/acl";
import { FriendshipStatus } from "../types/friendship";
import { PostVisibility } from "../types/post";

describe("visibilityClause", () => {
  it("includes Friends visibility and Accepted friendship status", () => {
    const sql = visibilityClause("p");
    expect(sql).toContain(`visibility = ${PostVisibility.Public}`);
    expect(sql).toContain(`visibility = ${PostVisibility.Shared}`);
    expect(sql).toContain(`visibility = ${PostVisibility.Friends}`);
    expect(sql).toContain(`status = ${FriendshipStatus.Accepted}`);
    expect(sql).toContain("friendships");
  });

  it("binds four viewerId placeholders", () => {
    const sql = visibilityClause("p");
    const placeholders = (sql.match(/\?/g) ?? []).length;
    expect(placeholders).toBe(4);
    expect(visibilityClauseParams("user_abc")).toEqual([
      "user_abc",
      "user_abc",
      "user_abc",
      "user_abc",
    ]);
  });
});

describe("PostVisibility.Friends", () => {
  it("is the integer 3", () => {
    expect(PostVisibility.Friends).toBe(3);
  });
});
