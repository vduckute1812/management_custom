import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "../utils/apiErrorMessage";

describe("apiErrorMessage", () => {
  it("prefers nested data.statusMessage", () => {
    expect(
      apiErrorMessage(
        { data: { statusMessage: "From body" }, statusMessage: "Top" },
        "fallback",
      ),
    ).toBe("From body");
  });

  it("falls back to statusMessage then default", () => {
    expect(apiErrorMessage({ statusMessage: "Top" }, "fallback")).toBe("Top");
    expect(apiErrorMessage({}, "fallback")).toBe("fallback");
  });
});
