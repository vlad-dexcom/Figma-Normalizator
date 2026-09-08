// Sandboxed plugin-API-side entry point (no DOM access — this runs in
// Figma's plugin sandbox, not the UI iframe). Bundled by esbuild into
// `dist/code.js`, which `manifest.json`'s `main` field points at.
//
// Runs the extractor (`./extractor`) against the current selection and
// posts the resulting IR JSON to the UI. There's no real validator UI yet
// (that's a separate later task, `plugin-validator-ui`) — `figma.notify` and
// a `postMessage` are enough to prove the extractor runs end to end.
import { extractSelection, type ExtractionResult, type FigmaNode } from "./extractor/index.js";

/** The minimal slice of the real Figma plugin API this entry point depends on. */
export interface ExtractFigmaAPI {
  currentPage: { selection: readonly FigmaNode[] };
  variables: {
    getVariableByIdAsync: (id: string) => Promise<unknown>;
    getVariableCollectionByIdAsync: (id: string) => Promise<unknown>;
  };
  fileKey?: string;
  notify(message: string): void;
  showUI(html: string, options?: { visible?: boolean; width?: number; height?: number }): void;
  closePlugin(message?: string): void;
  ui: { postMessage(message: unknown): void };
}

/**
 * Extracts the current selection to IR and posts it to the UI.
 *
 * Exported (rather than run as a side effect of module load) so it can be
 * exercised by the headless test harness without a real `figma` global.
 */
export async function runExtractCommand(api: ExtractFigmaAPI): Promise<void> {
  const selection = api.currentPage.selection;

  if (selection.length === 0) {
    api.notify("Figma Normalizator: select at least one layer to extract.");
    api.closePlugin();
    return;
  }

  // `variables` is typed loosely on `ExtractFigmaAPI` above (to keep this
  // file's own API surface small); `extractSelection` wants the narrower
  // shape it actually calls. Real Figma's `variables` API is a structural
  // superset of what we need here.
  const result: ExtractionResult = await extractSelection(
    { variables: api.variables as unknown as Parameters<typeof extractSelection>[0]["variables"] },
    selection,
    { fileKey: api.fileKey ?? "", version: "1" },
  );

  // `__html__` is an ambient global populated by Figma at runtime from
  // manifest.json's `ui` field (see @figma/plugin-typings). It doesn't
  // exist in the headless test environment, so guard with `typeof` rather
  // than referencing it directly (which would throw a ReferenceError).
  const html = typeof __html__ !== "undefined" ? __html__ : "";
  api.showUI(html, { visible: false, width: 240, height: 120 });
  api.ui.postMessage({ type: "figma-normalizator/ir", ir: result });
  api.notify(
    `Figma Normalizator: extracted ${result.nodes.length} node(s), ${result.unresolved.length} unresolved.`,
  );
  api.closePlugin("Figma Normalizator: extraction complete");
}

// Only invoke against the real Figma sandbox when one is present (i.e. not
// when this module is imported by the headless test harness).
if (typeof figma !== "undefined") {
  // Real Figma nodes are a structural superset of this module's `FigmaNode`
  // (see extractor/types.ts) — this is the one place the plugin sandbox API
  // meets the extractor's narrower, more testable node shape.
  void runExtractCommand(figma as unknown as ExtractFigmaAPI);
}
