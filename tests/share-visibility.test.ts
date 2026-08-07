import { describe, expect, it } from "vitest";
import { DomainError } from "../server/utils/http";
import { constrainShareWrapperAccess } from "../server/utils/shareVisibility";
import { PostVisibility } from "../types/post";

describe("constrainShareWrapperAccess", () => {
  it("clamps Public share of a Friends original down to Friends", () => {
    const out = constrainShareWrapperAccess({
      originalVisibility: PostVisibility.Friends,
      originalAudienceIds: [],
      originalAuthorId: "author",
      sharerUserId: "me",
      requestedVisibility: PostVisibility.Public,
      requestedAudienceIds: [],
    });
    expect(out.visibility).toBe(PostVisibility.Friends);
    expect(out.audienceUserIds).toEqual([]);
  });

  it("rejects Private originals", () => {
    expect(() =>
      constrainShareWrapperAccess({
        originalVisibility: PostVisibility.Private,
        originalAudienceIds: [],
        originalAuthorId: "author",
        sharerUserId: "me",
        requestedVisibility: PostVisibility.Friends,
        requestedAudienceIds: [],
      }),
    ).toThrow(DomainError);
  });

  it("keeps Shared audience as a subset of the original audience", () => {
    const out = constrainShareWrapperAccess({
      originalVisibility: PostVisibility.Shared,
      originalAudienceIds: ["a", "b"],
      originalAuthorId: "author",
      sharerUserId: "me",
      requestedVisibility: PostVisibility.Shared,
      requestedAudienceIds: ["b", "intruder"],
    });
    expect(out.visibility).toBe(PostVisibility.Shared);
    expect(out.audienceUserIds).toEqual(["b"]);
  });
});
