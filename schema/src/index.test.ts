import { describe, expect, it } from "vitest";

describe("schema package", () => {
  it("is set up and importable", async () => {
    const mod = await import("../src/index.js");
    expect(mod).toBeDefined();
  });
});
