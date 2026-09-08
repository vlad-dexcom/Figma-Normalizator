// Extensible stub of the Figma plugin API global, for running plugin logic
// headlessly in vitest without a real Figma sandbox. Extend this as the
// extractor grows to need more of the real `figma` surface.
import { vi } from "vitest";
import type { ExtractFigmaAPI } from "../code.js";
import type { FigmaVariable, FigmaVariableCollection } from "../extractor/types.js";

export interface MockFigmaOptions {
  selection?: ExtractFigmaAPI["currentPage"]["selection"];
  fileKey?: string;
  variables?: Record<string, FigmaVariable>;
  variableCollections?: Record<string, FigmaVariableCollection>;
}

export function createMockFigma(options: MockFigmaOptions = {}): ExtractFigmaAPI {
  const variables = options.variables ?? {};
  const variableCollections = options.variableCollections ?? {};

  return {
    currentPage: { selection: options.selection ?? [] },
    variables: {
      getVariableByIdAsync: vi.fn(async (id: string) => variables[id] ?? null),
      getVariableCollectionByIdAsync: vi.fn(async (id: string) => variableCollections[id] ?? null),
    },
    fileKey: options.fileKey ?? "test-file-key",
    notify: vi.fn(),
    showUI: vi.fn(),
    closePlugin: vi.fn(),
    ui: { postMessage: vi.fn() },
  };
}
