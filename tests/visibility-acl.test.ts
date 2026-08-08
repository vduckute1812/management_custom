import { describe, expect, it } from "vitest";
import {
  visibilityClause,
  visibilityClauseParams,
} from "../server/db/feed/postQuery/acl";
import { PostVisibility } from "../types/post";

describe("visibilityClause", () => {
  it("includes Public / Shared / Friends visibility", () => {
    const sql = visibilityClause("p", ["friend_1"]);
    expect(sql).toContain(`visibility = ${PostVisibility.Public}`);
    expect(sql).toContain(`visibility = ${PostVisibility.Shared}`);
    expect(sql).toContain(`visibility = ${PostVisibility.Friends}`);
    expect(sql).toContain("id IN (");
    expect(sql).toContain("SELECT a.post_id FROM post_audience a");
    expect(sql).not.toContain("EXISTS");
    expect(sql).toContain("user_id IN (?)");
    expect(sql).not.toContain("friendships");
  });

  it("uses FALSE when the viewer has no friends", () => {
    const sql = visibilityClause("p", []);
    expect(sql).toContain("OR 0");
    expect(sql).not.toContain(`visibility = ${PostVisibility.Friends}`);
    expect((sql.match(/\?/g) ?? []).length).toBe(2);
    expect(visibilityClauseParams("user_abc", [])).toEqual([
      "user_abc",
      "user_abc",
    ]);
  });

  it("binds own + audience + friend ids", () => {
    const friends = ["f1", "f2"];
    const sql = visibilityClause("p", friends);
    expect((sql.match(/\?/g) ?? []).length).toBe(4);
    expect(visibilityClauseParams("user_abc", friends)).toEqual([
      "user_abc",
      "user_abc",
      "f1",
      "f2",
    ]);
  });
});

describe("PostVisibility.Friends", () => {
  it("is the integer 3", () => {
    expect(PostVisibility.Friends).toBe(3);
  });
});
