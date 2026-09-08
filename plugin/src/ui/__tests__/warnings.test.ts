import { describe, expect, it } from "vitest";
import { groupWarningsByReason, labelForReason } from "../warnings.js";

describe("labelForReason", () => {
  it("returns known human-readable labels for extractor-emitted reasons", () => {
    expect(labelForReason("unbound-literal")).toBe("Unbound literal value");
    expect(labelForReason("unmapped-variant")).toBe("Unmapped variant");
    expect(labelForReason("unmapped-component")).toBe("Unmapped component");
    expect(labelForReason("missing-main-component")).toBe("Missing main component");
    expect(labelForReason("absolute-positioning")).toBe("Absolute positioning inside Auto Layout");
  });

  it("title-cases unknown reasons as a forward-compat fallback", () => {
    expect(labelForReason("some-new-reason")).toBe("Some New Reason");
  });
});

describe("groupWarningsByReason", () => {
  it("groups entries by reason in order of first appearance", () => {
    const entries = [
      { nodeId: "1", reason: "unbound-literal" },
      { nodeId: "2", reason: "unmapped-component" },
      { nodeId: "3", reason: "unbound-literal" },
    ];

    const groups = groupWarningsByReason(entries);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.reason).toBe("unbound-literal");
    expect(groups[0]?.label).toBe("Unbound literal value");
    expect(groups[0]?.entries).toHaveLength(2);
    expect(groups[0]?.entries.map((e) => e.nodeId)).toEqual(["1", "3"]);
    expect(groups[1]?.reason).toBe("unmapped-component");
    expect(groups[1]?.entries).toHaveLength(1);
  });

  it("returns an empty array for no entries", () => {
    expect(groupWarningsByReason([])).toEqual([]);
  });

  it("preserves each group's entries in original relative order", () => {
    const entries = [
      { nodeId: "a", reason: "x" },
      { nodeId: "b", reason: "x", detail: "second" },
      { nodeId: "c", reason: "x" },
    ];
    const groups = groupWarningsByReason(entries);
    expect(groups[0]?.entries.map((e) => e.nodeId)).toEqual(["a", "b", "c"]);
  });
});
