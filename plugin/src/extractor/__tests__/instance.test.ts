import { describe, expect, it } from "vitest";
import { buildInstanceNode } from "../instance.js";
import { mockComponent, mockComponentSet, mockInstance } from "../../test/nodeBuilders.js";

const ctx = { fileKey: "fk", version: "1", ancestorPath: [] };

function buttonsInstance(overrides: Omit<Parameters<typeof mockInstance>[0], "mainComponent">) {
  const componentSet = mockComponentSet({ name: "Buttons" });
  const main = mockComponent({ name: "Style=Primary, Size=Large", parent: componentSet });
  return mockInstance({ mainComponent: main, ...overrides });
}

describe("buildInstanceNode", () => {
  it("resolves a mapped Buttons instance to AppButton with variant + text props", async () => {
    const node = buttonsInstance({
      name: "Buttons",
      componentProperties: {
        Style: { type: "VARIANT", value: "Primary" },
        Size: { type: "VARIANT", value: "Large" },
        "✏️ CTA Label#123:1": { type: "TEXT", value: "Start sensor" },
      },
    });

    const { node: ir, unresolved } = await buildInstanceNode(node, undefined, ctx);
    expect(ir.component).toBe("AppButton");
    expect(ir.figmaComponentSetName).toBe("Buttons");
    expect(ir.props.type).toEqual({ variant: "Primary", from: "Style=Primary" });
    expect(ir.props.size).toEqual({ variant: "Large", from: "Size=Large" });
    expect(ir.props.text).toEqual({ value: "Start sensor" });
    expect(unresolved).toEqual([]);
  });

  it("stops at the instance boundary: the built node has no descended children", async () => {
    const node = buttonsInstance({ name: "Buttons", componentProperties: {} });
    const { node: ir } = await buildInstanceNode(node, undefined, ctx);
    expect(ir).not.toHaveProperty("children");
  });

  it("routes Buttons Type=Icon Only to AppIconButton, keeping the raw figmaComponentSetName", async () => {
    const node = buttonsInstance({
      name: "Buttons",
      componentProperties: {
        Style: { type: "VARIANT", value: "Primary" },
        Type: { type: "VARIANT", value: "Icon Only" },
      },
    });

    const { node: ir } = await buildInstanceNode(node, undefined, ctx);
    expect(ir.component).toBe("AppIconButton");
    expect(ir.figmaComponentSetName).toBe("Buttons");
  });

  it("flags an unmapped variant value with reason unmapped-variant and a null variant", async () => {
    const node = buttonsInstance({
      name: "Buttons",
      componentProperties: {
        Style: { type: "VARIANT", value: "Elevated Action" },
      },
    });

    const { node: ir, unresolved } = await buildInstanceNode(node, undefined, ctx);
    expect(ir.props.type).toEqual({ variant: null, from: "Style=Elevated Action" });
    expect(unresolved).toEqual([
      expect.objectContaining({ nodeId: node.id, reason: "unmapped-variant" }),
    ]);
  });

  it("flags a fully unmapped component set (Accordions) with component: null", async () => {
    const componentSet = mockComponentSet({ name: "Accordions" });
    const main = mockComponent({ name: "Type=Primary, Expanded=No", parent: componentSet });
    const node = mockInstance({ name: "Accordions", mainComponent: main, componentProperties: {} });

    const { node: ir, unresolved } = await buildInstanceNode(node, undefined, ctx);
    expect(ir.component).toBeNull();
    expect(unresolved).toEqual([
      expect.objectContaining({ nodeId: node.id, reason: "unmapped-component" }),
    ]);
  });

  it("flags a component set with no component-map entry at all", async () => {
    const componentSet = mockComponentSet({ name: "Some Unknown Set" });
    const main = mockComponent({ name: "Default", parent: componentSet });
    const node = mockInstance({ name: "Unknown", mainComponent: main });

    const { node: ir, unresolved } = await buildInstanceNode(node, undefined, ctx);
    expect(ir.component).toBeNull();
    expect(unresolved[0]?.reason).toBe("unmapped-component");
  });

  it("resolves Switch's state-based checked prop", async () => {
    const componentSet = mockComponentSet({ name: "Switch" });
    const main = mockComponent({ name: "State=On", parent: componentSet });
    const node = mockInstance({
      name: "Switch",
      mainComponent: main,
      componentProperties: { State: { type: "VARIANT", value: "On" } },
    });

    const { node: ir } = await buildInstanceNode(node, undefined, ctx);
    expect(ir.component).toBe("AppSwitch");
    expect(ir.props.checked).toEqual({ value: true });
  });
});
