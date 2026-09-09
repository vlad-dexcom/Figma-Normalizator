import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildSymbol,
  colorToHex,
  flattenTokensJson,
  generateTokenMapJson,
  parseResolvesToHexFromDescription,
  renderModeValue,
  toCamelCaseSegment,
} from "../../scripts/generate-token-map-lib.mjs";

const fixturePath = fileURLToPath(
  new URL("../../token-map/fixtures/sample-tokens.json", import.meta.url),
);

async function loadFixture() {
  return JSON.parse(await readFile(fixturePath, "utf8"));
}

describe("colorToHex", () => {
  it("converts 0..1 float RGBA to #RRGGBB, matching plugin/src/extractor/tokens.ts", () => {
    expect(
      colorToHex({ r: 0.16862745583057404, g: 0.1568627506494522, b: 0.3333333432674408, a: 1 }),
    ).toBe("#2B2855");
    expect(
      colorToHex({ r: 0.6745098233222961, g: 0.658823549747467, b: 0.8901960849761963, a: 1 }),
    ).toBe("#ACA8E3");
  });

  it("appends alpha only when < 1", () => {
    expect(colorToHex({ r: 1, g: 1, b: 1, a: 0.5 })).toBe("#FFFFFF80");
    expect(colorToHex({ r: 1, g: 1, b: 1, a: 1 })).toBe("#FFFFFF");
  });
});

describe("parseResolvesToHexFromDescription", () => {
  it("extracts the hex a doc comment claims to resolve to", () => {
    expect(
      parseResolvesToHexFromDescription(
        "Semantic surface color — action/primary/default. Resolves to #ACA8E3.",
      ),
    ).toBe("#ACA8E3");
  });

  it("returns null when there is no 'Resolves to' phrase", () => {
    expect(parseResolvesToHexFromDescription("Body text font family.")).toBeNull();
  });

  it("documents the #2B2855 vs #ACA8E3 discrepancy: the doc text only ever names one mode", () => {
    // The doc comment for color/surface/action/primary/default only cites
    // #ACA8E3 (the dark-mode value), but the token's light-mode value is a
    // different literal, #2B2855 — not a different design file/product, a
    // different *mode* of the same token. See README.md.
    const description = "Semantic surface color — action/primary/default. Resolves to #ACA8E3.";
    const docHex = parseResolvesToHexFromDescription(description);
    const structuredLight = colorToHex({
      r: 0.16862745583057404,
      g: 0.1568627506494522,
      b: 0.3333333432674408,
      a: 1,
    });
    const structuredDark = colorToHex({
      r: 0.6745098233222961,
      g: 0.658823549747467,
      b: 0.8901960849761963,
      a: 1,
    });
    expect(docHex).toBe(structuredDark);
    expect(docHex).not.toBe(structuredLight);
  });
});

describe("renderModeValue", () => {
  it("renders a COLOR structured value as hex", () => {
    expect(renderModeValue({ type: "COLOR", r: 1, g: 1, b: 1, a: 1 })).toBe("#FFFFFF");
  });

  it("renders a non-COLOR structured value as its raw value", () => {
    expect(renderModeValue({ type: "FLOAT", value: 0 })).toBe(0);
    expect(renderModeValue({ type: "STRING", value: "Roboto" })).toBe("Roboto");
  });
});

describe("toCamelCaseSegment", () => {
  it("camelCases a hyphenated segment", () => {
    expect(toCamelCaseSegment("border-width")).toBe("borderWidth");
  });

  it("leaves an already-camelCase segment untouched", () => {
    expect(toCamelCaseSegment("default")).toBe("default");
    expect(toCamelCaseSegment("systemBlue")).toBe("systemBlue");
  });

  it("handles a segment with spaces and a percent sign", () => {
    expect(toCamelCaseSegment("black 5%")).toBe("black5");
  });
});

describe("buildSymbol", () => {
  it("resolves a base/color path to AppTheme.semanticColors.*", () => {
    expect(buildSymbol("base", "color/surface/action/primary/default")).toEqual({
      symbol: "AppTheme.semanticColors.surface.action.primary.default",
      reason: undefined,
    });
  });

  it("leaves a base non-color branch unresolved with a reason", () => {
    const result = buildSymbol("base", "border-width/none");
    expect(result.symbol).toBeNull();
    expect(result.reason).toMatch(/AppTheme.opacity\/shapes\/dimensions/);
  });

  it("leaves an uninvestigated collection unresolved with a reason", () => {
    const result = buildSymbol("typography", "body/family");
    expect(result.symbol).toBeNull();
    expect(result.reason).toMatch(/typography/);
  });
});

describe("flattenTokensJson", () => {
  it("flattens every collection's tokens into a flat, path-addressable list", async () => {
    const fixture = await loadFixture();
    const entries = flattenTokensJson(fixture);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.path)).toEqual([
      "border-width/none",
      "color/surface/action/primary/default",
      "body/family",
    ]);
  });

  it("produces a mapped symbol + resolved per-mode hex for the base/color leaf", async () => {
    const fixture = await loadFixture();
    const entries = flattenTokensJson(fixture);
    const entry = entries.find((e) => e.path === "color/surface/action/primary/default")!;
    expect(entry.collection).toBe("base");
    expect(entry.type).toBe("COLOR");
    expect(entry.values).toEqual({ light: "#2B2855", dark: "#ACA8E3" });
    expect(entry.symbol).toBe("AppTheme.semanticColors.surface.action.primary.default");
    expect(entry.symbolReason).toBeUndefined();
    expect(entry.alias!.byMode).toEqual({ dark: "palette/lavender/500" });
  });

  it("produces a null symbol + reason for a non-color base branch", async () => {
    const fixture = await loadFixture();
    const entries = flattenTokensJson(fixture);
    const entry = entries.find((e) => e.path === "border-width/none")!;
    expect(entry.symbol).toBeNull();
    expect(entry.symbolReason).toBeDefined();
    expect(entry.values).toEqual({ light: 0, dark: 0 });
  });

  it("supports filtering to specific collections", async () => {
    const fixture = await loadFixture();
    const entries = flattenTokensJson(fixture, { collections: ["typography"] });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.collection).toBe("typography");
  });
});

describe("generateTokenMapJson", () => {
  it("produces valid, pretty-printed JSON with a stable top-level shape", async () => {
    const fixture = await loadFixture();
    const json = await generateTokenMapJson(fixture);
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.figmaFileKey).toBe("TEST_FILE_KEY");
    expect(Array.isArray(parsed.entries)).toBe(true);
    expect(parsed.entries).toHaveLength(3);
  });
});
