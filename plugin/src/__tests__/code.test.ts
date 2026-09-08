import { describe, expect, it } from "vitest";
import { runExtractCommand } from "../code.js";
import { createMockFigma } from "../test/mockFigma.js";
import { mockFrame, mockText } from "../test/nodeBuilders.js";

describe("runExtractCommand", () => {
  it("notifies and closes without extracting when nothing is selected", async () => {
    const mockFigma = createMockFigma({ selection: [] });

    await runExtractCommand(mockFigma);

    expect(mockFigma.notify).toHaveBeenCalledWith(
      "Figma Normalizator: select at least one layer to extract.",
    );
    expect(mockFigma.closePlugin).toHaveBeenCalledTimes(1);
    expect(mockFigma.ui.postMessage).not.toHaveBeenCalled();
  });

  it("extracts the selection and posts the IR to the UI", async () => {
    const selectedText = mockText("Hello", [
      {
        characters: "Hello",
        fontSize: 14,
        fontName: { family: "Inter", style: "Regular" },
        fills: [],
      },
    ]);
    const mockFigma = createMockFigma({ selection: [selectedText] });

    await runExtractCommand(mockFigma);

    expect(mockFigma.showUI).toHaveBeenCalledTimes(1);
    expect(mockFigma.ui.postMessage).toHaveBeenCalledTimes(1);
    const [message] = (mockFigma.ui.postMessage as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0] as [{ type: string; ir: { nodes: unknown[] } }];
    expect(message.type).toBe("figma-normalizator/ir");
    expect(message.ir.nodes).toHaveLength(1);
    expect(mockFigma.closePlugin).toHaveBeenCalledWith("Figma Normalizator: extraction complete");
  });

  it("prunes an empty non-auto-layout frame to no IR nodes", async () => {
    const emptyFrame = mockFrame({ name: "Empty", children: [] });
    const mockFigma = createMockFigma({ selection: [emptyFrame] });

    await runExtractCommand(mockFigma);

    const [message] = (mockFigma.ui.postMessage as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0] as [{ ir: { nodes: unknown[] } }];
    expect(message.ir.nodes).toHaveLength(0);
  });
});
