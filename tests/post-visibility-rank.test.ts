import { describe, expect, it } from "vitest";
import { PostVisibility } from "../types/post";
import {
  clampVisibilityToCeiling,
  isVisibilityAtMostAsOpen,
} from "../utils/postVisibilityRank";

describe("postVisibilityRank", () => {
  it("ranks Public as the broadest visibility", () => {
    expect(
      isVisibilityAtMostAsOpen(PostVisibility.Friends, PostVisibility.Public),
    ).toBe(true);
    expect(
      isVisibilityAtMostAsOpen(PostVisibility.Public, PostVisibility.Friends),
    ).toBe(false);
  });

  it("clamps a share request down to the original ceiling", () => {
    expect(
      clampVisibilityToCeiling(PostVisibility.Public, PostVisibility.Friends),
    ).toBe(PostVisibility.Friends);
    expect(
      clampVisibilityToCeiling(PostVisibility.Shared, PostVisibility.Shared),
    ).toBe(PostVisibility.Shared);
    expect(
      clampVisibilityToCeiling(PostVisibility.Private, PostVisibility.Public),
    ).toBe(PostVisibility.Private);
  });
});
