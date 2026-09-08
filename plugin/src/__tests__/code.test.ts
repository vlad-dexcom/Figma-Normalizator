import { describe, expect, it } from "vitest";
import { handleUIMessage, initializePlugin } from "../code.js";
import { createMockFigma } from "../test/mockFigma.js";
import { mockFrame, mockText } from "../test/nodeBuilders.js";
import { DEFAULT_NODE_BUDGET } from "../extractor/index.js";

describe("initializePlugin", () => {
  it("shows the UI and posts the initial selection on startup", () => {
    const selected = mockFrame({ name: "Screen", children: [] });
    const mockFigma = createMockFigma({ selection: [selected] });

    initializePlugin(mockFigma);

    expect(mockFigma.showUI).toHaveBeenCalledTimes(1);
    expect(mockFigma.ui.postMessage).toHaveBeenCalledWith({
      type: "selection-changed",
      nodeId: selected.id,
      name: "Screen",
      nodeType: "FRAME",
    });
  });

  it("posts selection-changed again whenever the Figma selection changes", () => {
    const mockFigma = createMockFigma({ selection: [] });
    initializePlugin(mockFigma);
    (mockFigma.ui.postMessage as unknown as { mockClear: () => void }).mockClear();

    const selected = mockFrame({ name: "New selection", children: [] });
    mockFigma.currentPage.selection = [selected];
    mockFigma.triggerSelectionChange();

    expect(mockFigma.ui.postMessage).toHaveBeenCalledWith({
      type: "selection-changed",
      nodeId: selected.id,
      name: "New selection",
      nodeType: "FRAME",
    });
  });

  it("routes incoming UI messages to handleUIMessage", async () => {
    const mockFigma = createMockFigma({ selection: [] });
    initializePlugin(mockFigma);

    mockFigma.triggerUIMessage({ type: "extract" });
    // handleUIMessage is invoked fire-and-forget (`void handleUIMessage(...)`); flush microtasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(mockFigma.ui.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", code: "empty-selection" }),
    );
  });
});

describe("handleUIMessage: extract", () => {
  it("posts an error, not a throw, when nothing is selected", async () => {
    const mockFigma = createMockFigma({ selection: [] });

    await handleUIMessage(mockFigma, { type: "extract" });

    expect(mockFigma.ui.postMessage).toHaveBeenCalledWith({
      type: "error",
      message: "Select at least one layer to extract.",
      code: "empty-selection",
    });
  });

  it("extracts the selection and posts the IR + export source to the UI", async () => {
    const selectedText = mockText("Hello", [
      {
        characters: "Hello",
        fontSize: 14,
        fontName: { family: "Inter", style: "Regular" },
        fills: [],
      },
    ]);
    const mockFigma = createMockFigma({ selection: [selectedText], fileKey: "file-abc" });

    await handleUIMessage(mockFigma, { type: "extract" });

    expect(mockFigma.ui.postMessage).toHaveBeenCalledTimes(1);
    const [message] = (mockFigma.ui.postMessage as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0] as [{ type: string; ir: { nodes: unknown[] }; source: Record<string, string> }];
    expect(message.type).toBe("ir-result");
    expect(message.ir.nodes).toHaveLength(1);
    expect(message.source).toEqual({
      fileKey: "file-abc",
      nodeId: selectedText.id,
      version: "1",
    });
  });

  it("prunes an empty non-auto-layout frame to no IR nodes", async () => {
    const emptyFrame = mockFrame({ name: "Empty", children: [] });
    const mockFigma = createMockFigma({ selection: [emptyFrame] });

    await handleUIMessage(mockFigma, { type: "extract" });

    const [message] = (mockFigma.ui.postMessage as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0] as [{ ir: { nodes: unknown[] } }];
    expect(message.ir.nodes).toHaveLength(0);
  });

  it("posts a visible budget-exceeded error instead of throwing when the node budget is hit", async () => {
    // DEFAULT_NODE_BUDGET counts every node visited, including pruned empty
    // frames — build enough flat siblings under an Auto Layout root to
    // exceed it and confirm handleExtract turns the resulting
    // NodeBudgetExceededError into a posted error, not an uncaught
    // rejection.
    const children = Array.from({ length: DEFAULT_NODE_BUDGET + 1 }, (_, i) =>
      mockFrame({ name: `child-${i}`, children: [] }),
    );
    const root = mockFrame({ name: "Root", layoutMode: "VERTICAL", children });
    const mockFigma = createMockFigma({ selection: [root] });

    await handleUIMessage(mockFigma, { type: "extract" });

    expect(mockFigma.ui.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", code: "budget-exceeded" }),
    );
  });
});

describe("handleUIMessage: select-node", () => {
  it("re-selects and scrolls to the node, and posts the updated selection", async () => {
    const target = mockFrame({ name: "Target", children: [] });
    const mockFigma = createMockFigma({ selection: [], nodesById: { [target.id]: target } });

    await handleUIMessage(mockFigma, { type: "select-node", nodeId: target.id });

    expect(mockFigma.currentPage.selection).toEqual([target]);
    expect(mockFigma.viewport?.scrollAndZoomIntoView).toHaveBeenCalledWith([target]);
    expect(mockFigma.ui.postMessage).toHaveBeenCalledWith({
      type: "selection-changed",
      nodeId: target.id,
      name: "Target",
      nodeType: "FRAME",
    });
  });

  it("posts a node-not-found error for an id that no longer resolves", async () => {
    const mockFigma = createMockFigma({ selection: [] });

    await handleUIMessage(mockFigma, { type: "select-node", nodeId: "missing:1" });

    expect(mockFigma.ui.postMessage).toHaveBeenCalledWith({
      type: "error",
      message: "Node missing:1 no longer exists in this document.",
      code: "node-not-found",
    });
  });
});

describe("handleUIMessage: export", () => {
  it("notifies that the export happened", async () => {
    const mockFigma = createMockFigma({ selection: [] });

    await handleUIMessage(mockFigma, {
      type: "export",
      source: { fileKey: "fk", nodeId: "1:1", version: "1" },
    });

    expect(mockFigma.notify).toHaveBeenCalledWith("Figma Normalizator: IR exported.");
  });
});
