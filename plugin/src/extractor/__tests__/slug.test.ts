import { describe, expect, it } from "vitest";
import { slugify } from "../slug.js";

describe("slugify", () => {
  it("lowercases and replaces spaces/slashes with underscores", () => {
    expect(slugify("Icon / Chevron Right")).toBe("icon_chevron_right");
  });

  it("strips characters that aren't valid in a filename", () => {
    expect(slugify("Icon/Close!!")).toBe("icon_close");
  });

  it("collapses repeated underscores and trims leading/trailing ones", () => {
    expect(slugify("  Icon -- Close  ")).toBe("icon_close");
  });
});
