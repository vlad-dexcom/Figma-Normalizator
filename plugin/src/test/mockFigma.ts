// Minimal, extensible stub of the Figma plugin API global, for running
// plugin logic headlessly in vitest without a real Figma sandbox.
//
// Add more stubbed `figma` methods/properties here as later tasks
// (`plugin-extractor`) need them — e.g. `currentPage`, `root`, `getNodeById`.
import { vi } from "vitest";

import type { ScaffoldFigmaAPI } from "../code.js";

export function createMockFigma(): ScaffoldFigmaAPI {
  return {
    showUI: vi.fn(),
    closePlugin: vi.fn(),
  };
}
