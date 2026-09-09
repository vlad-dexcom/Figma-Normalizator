import { describe, expect, it } from "vitest";
import { buildWarningsViewModel, groupWarningsByReason, labelForReason } from "../warnings.js";

describe("labelForReason", () => {
  it("returns known human-readable labels for extractor-emitted reasons", () => {
    expect(labelForReason("unbound-literal")).toBe("Unbound literal value");
    expect(labelForReason("unmapped-variant")).toBe("Unmapped variant");
    expect(labelForReason("unmapped-component")).toBe("Unmapped component");
    expect(labelForReason("missing-main-component")).toBe("Missing main component");
    expect(labelForReason("unreadable-component-properties")).toBe(
      "Unreadable component properties",
    );
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

describe("buildWarningsViewModel", () => {
  const entries = [
    { nodeId: "1", reason: "unbound-literal" },
    { nodeId: "2", reason: "unmapped-component" },
    { nodeId: "3", reason: "unmapped-component" },
  ];

  it("reports no warnings and hides the toggle for an empty entry list, regardless of collapsed state", () => {
    expect(buildWarningsViewModel([], false)).toMatchObject({ hasWarnings: false, groups: [] });
    expect(buildWarningsViewModel([], true)).toMatchObject({ hasWarnings: false, groups: [] });
  });

  it("shows entries and offers to collapse when not collapsed", () => {
    const view = buildWarningsViewModel(entries, false);
    expect(view.hasWarnings).toBe(true);
    expect(view.entriesVisible).toBe(true);
    expect(view.toggleLabel).toBe("Collapse all");
  });

  it("hides entries but keeps groups (with their counts) and offers to expand when collapsed", () => {
    const view = buildWarningsViewModel(entries, true);
    expect(view.hasWarnings).toBe(true);
    expect(view.entriesVisible).toBe(false);
    expect(view.toggleLabel).toBe("Expand all");
    // Groups themselves (and their entry counts) are unaffected by the
    // collapsed flag — only whether a caller should render each entry.
    expect(view.groups).toHaveLength(2);
    expect(view.groups[1]?.entries).toHaveLength(2);
  });

  it("groups pass through identically to groupWarningsByReason regardless of collapsed state", () => {
    expect(buildWarningsViewModel(entries, false).groups).toEqual(groupWarningsByReason(entries));
    expect(buildWarningsViewModel(entries, true).groups).toEqual(groupWarningsByReason(entries));
  });
});
