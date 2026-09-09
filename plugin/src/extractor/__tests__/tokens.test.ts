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

  it("resolves a single-hop VARIABLE_ALIAS to the aliased variable's literal value, keeping the semantic token's name", async () => {
    const figma = mockFigmaAPI(
      {
        "var:semantic": {
          name: "color/surface/tone/emphasis",
          variableCollectionId: "col:1",
          valuesByMode: {
            "mode:light": { type: "VARIABLE_ALIAS", id: "var:primitive" },
            "mode:dark": { type: "VARIABLE_ALIAS", id: "var:primitive" },
          },
        },
        "var:primitive": {
          name: "color/palette/blue/500",
          variableCollectionId: "col:1",
          valuesByMode: {
            "mode:light": { r: 0, g: 0, b: 1 },
            "mode:dark": { r: 0, g: 0, b: 1 },
          },
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
      { fills: [{ type: "VARIABLE_ALIAS", id: "var:semantic" }] },
      "fills",
      "#000000",
    );

    expect(result.unresolved).toEqual([]);
    expect(result.token).toEqual({
      token: "color/surface/tone/emphasis",
      value: "#0000FF",
      modes: { light: "#0000FF", dark: "#0000FF" },
    });
  });

  it("resolves a two-hop VARIABLE_ALIAS chain (A -> B -> C) recursively", async () => {
    const figma = mockFigmaAPI(
      {
        "var:a": {
          name: "spacing/component/gap",
          variableCollectionId: "col:1",
          valuesByMode: { "mode:default": { type: "VARIABLE_ALIAS", id: "var:b" } },
        },
        "var:b": {
          name: "spacing/semantic/md",
          variableCollectionId: "col:1",
          valuesByMode: { "mode:default": { type: "VARIABLE_ALIAS", id: "var:c" } },
        },
        "var:c": {
          name: "spacing/primitive/16",
          variableCollectionId: "col:1",
          valuesByMode: { "mode:default": 16 },
        },
      },
      {
        "col:1": {
          modes: [{ modeId: "mode:default", name: "default" }],
          defaultModeId: "mode:default",
        },
      },
    );

    const result = await resolveTokenValue(
      figma,
      "1:1",
      { itemSpacing: { type: "VARIABLE_ALIAS", id: "var:a" } },
      "itemSpacing",
      16,
    );

    expect(result.unresolved).toEqual([]);
    expect(result.token).toEqual({ token: "spacing/component/gap", value: 16 });
  });

  it("emits an unresolvable-alias-chain UnresolvedEntry for a circular alias chain (A -> B -> A)", async () => {
    const figma = mockFigmaAPI(
      {
        "var:a": {
          name: "color/a",
          variableCollectionId: "col:1",
          valuesByMode: { "mode:default": { type: "VARIABLE_ALIAS", id: "var:b" } },
        },
        "var:b": {
          name: "color/b",
          variableCollectionId: "col:1",
          valuesByMode: { "mode:default": { type: "VARIABLE_ALIAS", id: "var:a" } },
        },
      },
      {
        "col:1": {
          modes: [{ modeId: "mode:default", name: "default" }],
          defaultModeId: "mode:default",
        },
      },
    );

    const result = await resolveTokenValue(
      figma,
      "1:1",
      { fills: [{ type: "VARIABLE_ALIAS", id: "var:a" }] },
      "fills",
      "#000000",
    );

    expect(result.token).toEqual({ token: null, value: "#000000" });
    expect(result.unresolved).toEqual([
      {
        nodeId: "1:1",
        reason: "unresolvable-alias-chain",
        detail: expect.stringContaining("fills"),
      },
    ]);
  });

  it("falls back to the aliased variable's default mode when its collection has no same-named mode (cross-collection alias)", async () => {
    const figma = mockFigmaAPI(
      {
        "var:semantic": {
          name: "color/surface/base",
          variableCollectionId: "col:semantic",
          valuesByMode: {
            "mode:light": { type: "VARIABLE_ALIAS", id: "var:primitive" },
            "mode:dark": { type: "VARIABLE_ALIAS", id: "var:primitive" },
          },
        },
        "var:primitive": {
          name: "color/palette/gray/900",
          variableCollectionId: "col:primitive",
          // This collection only has a single "value" mode, not
          // "light"/"dark" like the semantic collection above.
          valuesByMode: { "mode:value": { r: 0, g: 0, b: 0 } },
        },
      },
      {
        "col:semantic": {
          modes: [
            { modeId: "mode:light", name: "light" },
            { modeId: "mode:dark", name: "dark" },
          ],
          defaultModeId: "mode:light",
        },
        "col:primitive": {
          modes: [{ modeId: "mode:value", name: "value" }],
          defaultModeId: "mode:value",
        },
      },
    );

    const result = await resolveTokenValue(
      figma,
      "1:1",
      { fills: [{ type: "VARIABLE_ALIAS", id: "var:semantic" }] },
      "fills",
      "#000000",
    );

    expect(result.unresolved).toEqual([]);
    expect(result.token).toEqual({
      token: "color/surface/base",
      value: "#000000",
      modes: { light: "#000000", dark: "#000000" },
    });
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
