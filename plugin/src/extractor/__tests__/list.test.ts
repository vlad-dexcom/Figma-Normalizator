import { describe, expect, it } from "vitest";
import { collapseLists } from "../list.js";
import { mockFrame, mockText } from "../../test/nodeBuilders.js";
import type { TextNode as IRTextNode } from "@figma-normalizator/schema";

const ctx = { fileKey: "fk", version: "1", ancestorPath: [] };

function textIr(text: string): IRTextNode {
  return {
    kind: "text",
    text,
    typography: null,
    color: null,
    source: { nodeId: "x", fileKey: "fk", version: "1", path: [] },
  };
}

describe("collapseLists", () => {
  it("collapses 3+ structurally identical consecutive siblings into a list", () => {
    const items = [1, 2, 3].map((n) => ({
      node: mockFrame({ name: `Row ${n}`, children: [mockText(`Item ${n}`, [])] }),
      ir: textIr(`Item ${n}`),
    }));

    const result = collapseLists(items, ctx);
    expect(result).toHaveLength(1);
    expect(result[0]?.ir.kind).toBe("list");
    if (result[0]?.ir.kind === "list") {
      expect(result[0].ir.itemCount).toBe(3);
      expect(result[0].ir.itemTemplate).toEqual(textIr("Item 1"));
    }
  });

  it("does not collapse runs shorter than 3", () => {
    const items = [1, 2].map((n) => ({
      node: mockFrame({ name: `Row ${n}` }),
      ir: textIr(`Item ${n}`),
    }));
    const result = collapseLists(items, ctx);
    expect(result).toHaveLength(2);
  });

  it("does not collapse structurally different siblings", () => {
    const items = [
      { node: mockFrame({ name: "A" }), ir: textIr("a") },
      { node: mockFrame({ name: "B", layoutMode: "HORIZONTAL" }), ir: textIr("b") },
      { node: mockFrame({ name: "C" }), ir: textIr("c") },
    ];
    const result = collapseLists(items, ctx);
    expect(result).toHaveLength(3);
  });

  it("does not merge a run across an absolute/normal positioning boundary", () => {
    const items = [1, 2, 3].map((n) => ({
      node: mockFrame({ name: `Row ${n}`, layoutPositioning: n === 2 ? "ABSOLUTE" : "AUTO" }),
      ir: textIr(`Item ${n}`),
    }));
    const result = collapseLists(items, ctx);
    expect(result).toHaveLength(3);
  });
});
