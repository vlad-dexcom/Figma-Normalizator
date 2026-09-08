import { describe, expect, it } from "vitest";
import { buildAssetNode, inferAssetType, isAssetNode } from "../asset.js";
import { mockFrame, mockGroup, mockInstance, mockVector } from "../../test/nodeBuilders.js";
import { slugify } from "../slug.js";

const ctx = { fileKey: "fk", version: "1", ancestorPath: [] };

describe("isAssetNode", () => {
  it("treats a bare VECTOR as an asset", () => {
    expect(isAssetNode(mockVector({ name: "Chevron" }))).toBe(true);
  });

  it("treats a frame containing only vector-like children as an asset", () => {
    const node = mockFrame({
      name: "Icon / Chevron",
      children: [mockVector({ name: "path-1" }), mockVector({ name: "path-2" })],
    });
    expect(isAssetNode(node)).toBe(true);
  });

  it("treats a group of only vectors as an asset, recursively", () => {
    const node = mockGroup({
      name: "Illustration",
      children: [mockGroup({ name: "sub", children: [mockVector({ name: "v" })] })],
    });
    expect(isAssetNode(node)).toBe(true);
  });

  it("does not treat a frame with a text child as an asset", () => {
    const node = mockFrame({
      name: "Card",
      children: [mockVector({ name: "v" }), { id: "t", name: "label", type: "TEXT" } as never],
    });
    expect(isAssetNode(node)).toBe(false);
  });

  it("treats an instance named with 'icon' as an asset", () => {
    expect(isAssetNode(mockInstance({ name: "Icon/Chevron", mainComponent: null }))).toBe(true);
  });

  it("does not treat an empty frame as an asset", () => {
    expect(isAssetNode(mockFrame({ name: "Empty", children: [] }))).toBe(false);
  });
});

describe("inferAssetType", () => {
  it("classifies by name containing 'icon'", () => {
    expect(inferAssetType(mockVector({ name: "Icon/Close" }), false)).toBe("icon");
  });

  it("classifies a large top-level graphic as an illustration", () => {
    expect(inferAssetType(mockFrame({ name: "Empty state", width: 200, height: 200 }), true)).toBe(
      "illustration",
    );
  });

  it("classifies everything else as an image", () => {
    expect(inferAssetType(mockVector({ name: "Photo", width: 40, height: 40 }), false)).toBe(
      "image",
    );
  });
});

describe("buildAssetNode", () => {
  it("derives a deterministic exportRef slug and rounds bounds", () => {
    const node = mockVector({ name: "Icon / Chevron-Right!!", width: 23.6, height: 24.4 });
    const asset = buildAssetNode(node, ctx, false);
    expect(asset.exportRef).toBe(slugify("Icon / Chevron-Right!!"));
    expect(asset.exportRef).toBe("icon_chevron_right");
    expect(asset.width).toBe(24);
    expect(asset.height).toBe(24);
  });
});
