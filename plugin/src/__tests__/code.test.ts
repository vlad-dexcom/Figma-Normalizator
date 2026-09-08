import { describe, expect, it } from "vitest";

import { runScaffoldCommand } from "../code.js";
import { createMockFigma } from "../test/mockFigma.js";

// Note: `__html__` is provided as an ambient global by @figma/plugin-typings
// (populated by Figma at runtime from manifest.json's `ui` field). In the
// headless test environment it's `undefined`, which is fine here since this
// scaffold test only asserts on how the mocked `figma` API is called.

describe("runScaffoldCommand", () => {
  it("shows the placeholder UI and then closes the plugin", () => {
    const mockFigma = createMockFigma();

    runScaffoldCommand(mockFigma);

    expect(mockFigma.showUI).toHaveBeenCalledTimes(1);
    expect(mockFigma.closePlugin).toHaveBeenCalledTimes(1);
    expect(mockFigma.closePlugin).toHaveBeenCalledWith(
      "Figma Normalizator: Stage 1 scaffold ready",
    );
  });
});
