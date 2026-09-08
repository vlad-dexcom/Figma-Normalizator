// The task's defining acceptance check: extracting the exact same
// (unchanged) mock Figma tree twice must produce byte-identical exported
// JSON, not just deep-equal objects — a key-ordering difference between the
// two runs would pass `toEqual` but fail a real "export twice, diff the
// files" check, so this asserts on the actual serialized *strings*.
import { describe, expect, it } from "vitest";
import { extractSelection, type ExtractionResult } from "../index.js";
import { canonicalStringify } from "../canonical.js";
import { createMockFigma } from "../../test/mockFigma.js";
import {
  resetAutoIds,
  mockFrame,
  mockInstance,
  mockComponent,
  mockComponentSet,
  mockText,
} from "../../test/nodeBuilders.js";

const VARIABLES = {
  "var:gap": {
    name: "spacing/md",
    variableCollectionId: "col:spacing",
    valuesByMode: { m: 16 },
  },
  "var:padding": {
    name: "spacing/lg",
    variableCollectionId: "col:spacing",
    valuesByMode: { m: 24 },
  },
  "var:bg": {
    name: "color/surface/canvas/primary",
    variableCollectionId: "col:color",
    valuesByMode: { light: { r: 1, g: 1, b: 1 }, dark: { r: 0, g: 0, b: 0 } },
  },
};

const VARIABLE_COLLECTIONS = {
  "col:spacing": { modes: [{ modeId: "m", name: "default" }], defaultModeId: "m" },
  "col:color": {
    modes: [
      { modeId: "light", name: "light" },
      { modeId: "dark", name: "dark" },
    ],
    defaultModeId: "light",
  },
};

/**
 * Builds a moderately complex, deterministic Figma mock tree: an Auto
 * Layout screen containing a themed, token-bound body frame with a text
 * child and a mapped component instance sibling. `resetAutoIds()` is called
 * first so the auto-generated node ids are identical (`test:1`, `test:2`,
 * ...) every time this is invoked, which is what makes two independent
 * calls to this function produce genuinely identical input trees rather
 * than differing only by incidental id allocation order.
 */
function buildSelection(label = "Sensor expired"): readonly [ReturnType<typeof mockFrame>] {
  resetAutoIds();

  const componentSet = mockComponentSet({ name: "Buttons" });
  const mainComponent = mockComponent({
    name: "Style=Primary, Size=Large",
    parent: componentSet,
    key: "a91f...",
  });
  const button = mockInstance({
    name: "Buttons",
    mainComponent,
    componentProperties: {
      Style: { type: "VARIANT", value: "Primary" },
      Size: { type: "VARIANT", value: "Large" },
      "✏️ CTA Label#123:1": { type: "TEXT", value: "Start sensor" },
    },
  });

  const text = mockText(label, [
    {
      characters: label,
      fontSize: 16,
      fontName: { family: "Inter", style: "Regular" },
      fills: [{ type: "SOLID", visible: true, color: { r: 0.1, g: 0.1, b: 0.1 } }],
    },
  ]);

  const body = mockFrame({
    name: "Body",
    layoutMode: "VERTICAL",
    itemSpacing: 16,
    paddingTop: 24,
    paddingRight: 24,
    paddingBottom: 24,
    paddingLeft: 24,
    fills: [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }],
    boundVariables: {
      itemSpacing: { type: "VARIABLE_ALIAS", id: "var:gap" },
      paddingTop: { type: "VARIABLE_ALIAS", id: "var:padding" },
      paddingRight: { type: "VARIABLE_ALIAS", id: "var:padding" },
      paddingBottom: { type: "VARIABLE_ALIAS", id: "var:padding" },
      paddingLeft: { type: "VARIABLE_ALIAS", id: "var:padding" },
      fills: [{ type: "VARIABLE_ALIAS", id: "var:bg" }],
    },
    children: [text, button],
  });

  const screen = mockFrame({ name: "Screen", layoutMode: "VERTICAL", children: [body] });

  return [screen] as const;
}

async function extractTwice(): Promise<[ExtractionResult, ExtractionResult]> {
  const runOnce = async () => {
    const selection = buildSelection();
    const mockFigma = createMockFigma({
      selection,
      fileKey: "z4Ns3yQoXwMgjky6H9WYtP",
      variables: VARIABLES,
      variableCollections: VARIABLE_COLLECTIONS,
    });

    return extractSelection(
      {
        variables: mockFigma.variables as unknown as Parameters<
          typeof extractSelection
        >[0]["variables"],
      },
      selection,
      { fileKey: "z4Ns3yQoXwMgjky6H9WYtP" },
    );
  };

  return [await runOnce(), await runOnce()];
}

async function extractSelectionOf(label: string): Promise<ExtractionResult> {
  const selection = buildSelection(label);
  const mockFigma = createMockFigma({
    selection,
    fileKey: "z4Ns3yQoXwMgjky6H9WYtP",
    variables: VARIABLES,
    variableCollections: VARIABLE_COLLECTIONS,
  });

  return extractSelection(
    {
      variables: mockFigma.variables as unknown as Parameters<
        typeof extractSelection
      >[0]["variables"],
    },
    selection,
    { fileKey: "z4Ns3yQoXwMgjky6H9WYtP" },
  );
}

describe("determinism: byte-identical repeat export", () => {
  it("produces exact string-identical JSON.stringify output across two independent extractions of the same tree", async () => {
    const [first, second] = await extractTwice();

    expect(JSON.stringify(first.nodes)).toBe(JSON.stringify(second.nodes));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("produces byte-identical canonical (export-path) serialization, and a matching content-hash version", async () => {
    const [first, second] = await extractTwice();

    expect(canonicalStringify(first, 2)).toBe(canonicalStringify(second, 2));
    expect(first.version).toBe(second.version);
    expect(first.version).toMatch(/^c1-[0-9a-f]{16}$/);
  });

  it("changes the content-hash version when the underlying tree actually changes", async () => {
    const [first] = await extractTwice();
    const changed = await extractSelectionOf("Sensor expired!!");

    expect(changed.version).not.toBe(first.version);
  });
});
