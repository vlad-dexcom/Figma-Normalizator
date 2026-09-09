import { describe, expect, it } from "vitest";
import {
  colorToHex,
  resolveFillColor,
  resolveTokenValue,
  resolveTypographyToken,
} from "../tokens.js";
import type { FigmaAPI } from "../types.js";

function mockFigmaAPI(
  variables: Record<
    string,
    { name: string; variableCollectionId: string; valuesByMode: Record<string, unknown> }
  >,
  collections: Record<string, { modes: { modeId: string; name: string }[]; defaultModeId: string }>,
): FigmaAPI {
  return {
    variables: {
      getVariableByIdAsync: async (id) => variables[id] ?? null,
      getVariableCollectionByIdAsync: async (id) => collections[id] ?? null,
    },
  };
}

describe("colorToHex", () => {
  it("converts an opaque RGB color to #RRGGBB", () => {
    expect(colorToHex({ r: 1, g: 1, b: 1 })).toBe("#FFFFFF");
    expect(colorToHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
  });

  it("appends alpha for translucent colors", () => {
    expect(colorToHex({ r: 1, g: 0, b: 0, a: 0.5 })).toBe("#FF000080");
  });
});

describe("resolveTokenValue", () => {
  it("resolves a bound variable to its token path and mode values", async () => {
    const figma = mockFigmaAPI(
      {
        "var:1": {
          name: "spacing/md",
          variableCollectionId: "col:1",
          valuesByMode: { "mode:light": 16, "mode:dark": 16 },
        },
      },
      {
        "col:1": {
          modes: [
            { modeId: "mode:light", name: "light" },
            { modeId: "mode:dark", name: "dark" },
          ],
          defaultModeId: "mode:light",
        },
      },
    );

    const result = await resolveTokenValue(
      figma,
      "1:1",
      { itemSpacing: { type: "VARIABLE_ALIAS", id: "var:1" } },
      "itemSpacing",
      16,
    );

    expect(result.token).toEqual({
      token: "spacing/md",
      value: 16,
      modes: { light: 16, dark: 16 },
    });
    expect(result.unresolved).toEqual([]);
  });

  it("includes modes only when there is more than one", async () => {
    const figma = mockFigmaAPI(
      {
        "var:1": {
          name: "color/surface/canvas/primary",
          variableCollectionId: "col:1",
          valuesByMode: { "mode:light": { r: 1, g: 1, b: 1 }, "mode:dark": { r: 0, g: 0, b: 0 } },
        },
      },
      {
        "col:1": {
          modes: [
            { modeId: "mode:light", name: "light" },
            { modeId: "mode:dark", name: "dark" },
          ],
          defaultModeId: "mode:light",
        },
      },
    );

    const result = await resolveTokenValue(
      figma,
      "1:1",
      { fills: [{ type: "VARIABLE_ALIAS", id: "var:1" }] },
      "fills",
      "#FFFFFF",
    );
    expect(result.token).toEqual({
      token: "color/surface/canvas/primary",
      value: "#FFFFFF",
      modes: { light: "#FFFFFF", dark: "#000000" },
    });
  });

  it("emits token:null plus an unbound-literal UnresolvedEntry when there is no binding", async () => {
    const figma = mockFigmaAPI({}, {});
    const result = await resolveTokenValue(figma, "1:1", undefined, "cornerRadius", 4);
    expect(result.token).toEqual({ token: null, value: 4 });
    expect(result.unresolved).toEqual([
      { nodeId: "1:1", reason: "unbound-literal", detail: expect.stringContaining("cornerRadius") },
    ]);
  });

  it("falls back to unbound-literal when a bound variable id can't be resolved", async () => {
    const figma = mockFigmaAPI({}, {});
    const result = await resolveTokenValue(
      figma,
      "1:1",
      { cornerRadius: { type: "VARIABLE_ALIAS", id: "missing" } },
      "cornerRadius",
      4,
    );
    expect(result.token.token).toBeNull();
    expect(result.unresolved[0]?.reason).toBe("unbound-literal");
  });
});

describe("resolveFillColor", () => {
  it("returns null with no unresolved entries when there is no visible solid paint", async () => {
    const figma = mockFigmaAPI({}, {});
    const result = await resolveFillColor(figma, "1:1", [], undefined);
    expect(result).toEqual({ token: null, unresolved: [] });
  });

  it("skips invisible paints", async () => {
    const figma = mockFigmaAPI({}, {});
    const result = await resolveFillColor(
      figma,
      "1:1",
      [{ type: "SOLID", visible: false, color: { r: 1, g: 0, b: 0 } }],
      undefined,
    );
    expect(result.token).toBeNull();
  });

  it("emits token:null plus a mixed-value UnresolvedEntry when fills is the figma.mixed sentinel", async () => {
    const figma = mockFigmaAPI({}, {});
    const result = await resolveFillColor(figma, "1:1", Symbol("figma.mixed"), undefined);
    expect(result.token).toBeNull();
    expect(result.unresolved).toEqual([
      { nodeId: "1:1", reason: "mixed-value", detail: expect.stringContaining("fills") },
    ]);
  });
});

describe("resolveTypographyToken", () => {
  it("emits token:null plus unbound-literal when there is no bound typography variable", async () => {
    const figma = mockFigmaAPI({}, {});
    const result = await resolveTypographyToken(figma, "1:1", undefined);
    expect(result.token).toEqual({ token: null });
    expect(result.unresolved[0]?.reason).toBe("unbound-literal");
  });

  it("resolves a bound typography variable to its token path", async () => {
    const figma = mockFigmaAPI(
      {
        "var:1": {
          name: "typography/body/large",
          variableCollectionId: "col:1",
          valuesByMode: { m: "x" },
        },
      },
      { "col:1": { modes: [{ modeId: "m", name: "default" }], defaultModeId: "m" } },
    );
    const result = await resolveTypographyToken(figma, "1:1", {
      fontName: { type: "VARIABLE_ALIAS", id: "var:1" },
    });
    expect(result.token).toEqual({ token: "typography/body/large" });
    expect(result.unresolved).toEqual([]);
  });
});
