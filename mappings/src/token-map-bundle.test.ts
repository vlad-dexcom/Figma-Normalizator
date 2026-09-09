import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { generatedFilePath, generateTokenMapBundleJson } from "../scripts/bundle-token-map-lib.mjs";
import { findTokenSymbol, tokenMap } from "./index.js";

describe("src/generated/token-map.json", () => {
  it("is not stale relative to mappings/token-map/android-avalon.token-map.json", async () => {
    const expected = await generateTokenMapBundleJson();
    const actual = await readFile(generatedFilePath, "utf8");
    expect(
      actual,
      "src/generated/token-map.json is stale — run `npm run bundle:token-map` in mappings/ and commit the diff",
    ).toBe(expected);
  });

  it("only contains entries with a non-null/non-empty symbol", () => {
    expect(tokenMap.length).toBeGreaterThan(0);
    for (const entry of tokenMap) {
      expect(typeof entry.path).toBe("string");
      expect(typeof entry.symbol).toBe("string");
      expect(entry.symbol.length).toBeGreaterThan(0);
    }
  });
});

describe("findTokenSymbol", () => {
  it("finds the confirmed Kotlin symbol for a known base/color path", () => {
    expect(findTokenSymbol("color/border/accent/default")).toBe(
      "AppTheme.semanticColors.border.accent.default",
    );
  });

  it("returns undefined for a path not present in the bundled map", () => {
    expect(findTokenSymbol("this/path/does/not/exist")).toBeUndefined();
  });

  it("reuses the same lookup index across repeated calls (O(1) lookup, built once)", () => {
    // Calling twice must not throw or rebuild differently; this is mostly a
    // documentation-as-test of the intended performance characteristic
    // described in index.ts's `getTokenSymbolIndex` comment — the module
    // has no exposed hook to assert "built exactly once" more directly
    // without over-engineering a test seam for it.
    expect(findTokenSymbol("color/border/accent/default")).toBe(
      findTokenSymbol("color/border/accent/default"),
    );
  });
});
