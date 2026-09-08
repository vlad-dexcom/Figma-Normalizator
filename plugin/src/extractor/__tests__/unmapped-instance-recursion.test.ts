// Integration test for the "unmapped instances recurse like containers"
// fix (see instance.ts / index.ts): an unmapped instance must not truncate
// the tree — its real children (text, nested mapped instances, assets)
// should still be extracted, with the unmapped-component warning preserved
// alongside them. This exercises the full `extractNode`/`extractSelection`
// orchestration, not just `buildInstanceNode` in isolation (see
// instance.test.ts for that).
import { describe, expect, it } from "vitest";
import { extractSelection } from "../index.js";
import type { InstanceNode as IRInstanceNode, LayoutNode } from "@figma-normalizator/schema";
import {
  mockComponent,
  mockComponentSet,
  mockInstance,
  mockText,
} from "../../test/nodeBuilders.js";
import type { FigmaAPI } from "../types.js";

const noopFigmaAPI = {
  variables: {
    getVariableByIdAsync: async () => null,
    getVariableCollectionByIdAsync: async () => null,
  },
} as unknown as FigmaAPI;

describe("unmapped instance recursion", () => {
  it("recurses into an unmapped instance's real children instead of producing a dead-end node", async () => {
    // "Log" has no component-map.yaml entry (mirrors the real-world report
    // that motivated this fix) but has real content underneath it: a text
    // child and a nested *mapped* Buttons instance.
    const buttonsSet = mockComponentSet({ name: "Buttons" });
    const buttonsMain = mockComponent({ name: "Style=Primary, Size=Large", parent: buttonsSet });
    const nestedButton = mockInstance({
      name: "Buttons",
      mainComponent: buttonsMain,
      componentProperties: {
        Style: { type: "VARIANT", value: "Primary" },
        Size: { type: "VARIANT", value: "Large" },
      },
    });

    const labelText = mockText("Log entry", [
      {
        characters: "Log entry",
        fontSize: 14,
        fontName: { family: "Inter", style: "Regular" },
        fills: [],
      },
    ]);

    const logSet = mockComponentSet({ name: "Log" });
    const logMain = mockComponent({ name: "Default", parent: logSet });
    const logInstance = mockInstance({
      name: "Log",
      mainComponent: logMain,
      layoutMode: "VERTICAL",
      itemSpacing: 8,
      children: [labelText, nestedButton],
    });

    const result = await extractSelection(noopFigmaAPI, [logInstance], {
      fileKey: "fk",
      version: "1",
    });

    // The unmapped "Log" instance must not collapse to a dead-end `instance`
    // node — it falls back to the container path, producing a real `layout`
    // node with its children extracted.
    const root = result.nodes[0] as LayoutNode;
    expect(root.kind).toBe("layout");
    expect(root.children).toHaveLength(2);

    const [textChild, instanceChild] = root.children;
    expect(textChild).toMatchObject({ kind: "text", text: "Log entry" });
    expect(instanceChild).toMatchObject({
      kind: "instance",
      component: "AppButton",
    } satisfies Partial<IRInstanceNode>);

    // The unmapped-component warning for the outer "Log" node is still
    // present in the flattened result, so the hygiene warning isn't lost.
    expect(result.unresolved).toContainEqual(
      expect.objectContaining({ nodeId: logInstance.id, reason: "unmapped-component" }),
    );
  });

  it("still produces a fully opaque node for a mapped instance with children (unaffected by this fix)", async () => {
    const buttonsSet = mockComponentSet({ name: "Buttons" });
    const buttonsMain = mockComponent({ name: "Style=Primary, Size=Large", parent: buttonsSet });
    const nestedText = mockText("should never appear", [
      {
        characters: "should never appear",
        fontSize: 14,
        fontName: { family: "Inter", style: "Regular" },
        fills: [],
      },
    ]);
    const mappedInstance = mockInstance({
      name: "Buttons",
      mainComponent: buttonsMain,
      componentProperties: {
        Style: { type: "VARIANT", value: "Primary" },
        Size: { type: "VARIANT", value: "Large" },
      },
      children: [nestedText],
    });

    const result = await extractSelection(noopFigmaAPI, [mappedInstance], {
      fileKey: "fk",
      version: "1",
    });

    const root = result.nodes[0];
    expect(root).not.toHaveProperty("children");
    expect(root).toMatchObject({ kind: "instance", component: "AppButton" });
    expect(result.unresolved).toEqual([]);
  });
});
