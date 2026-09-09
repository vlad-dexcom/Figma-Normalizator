// Shared message protocol between `code.ts` (the plugin-sandbox side, no
// DOM access) and `ui.ts` (the UI iframe, DOM-capable but no Figma API
// access). Both sides import this module so the discriminated unions below
// are the single source of truth for what can be sent in each direction —
// deliberately kept as plain types (no Figma or DOM imports) so either side
// can depend on it without pulling in the other's runtime environment.
import type { ExtractionResult } from "./extractor/index.js";

/** Minimal identity of the current Figma selection, shown at the top of the panel. */
export interface SelectionSummary {
  nodeId: string | null;
  name: string | null;
  nodeType: string | null;
}

/** Enough provenance to name an exported IR file, per the plugin task's export naming scheme. */
export interface ExportSource {
  fileKey: string;
  nodeId: string;
  version: string;
}

/** A stable, machine-readable reason an operation requested by the UI didn't succeed. */
export type PluginErrorCode =
  | "empty-selection"
  | "budget-exceeded"
  | "node-not-found"
  | "unsupported"
  | "unknown"
  | "symbol-leak";

/** Messages the plugin sandbox (`code.ts`) posts to the UI iframe (`ui.ts`). */
export type PluginToUIMessage =
  | ({ type: "selection-changed" } & SelectionSummary)
  | { type: "ir-result"; ir: ExtractionResult; source: ExportSource }
  | { type: "error"; message: string; code: PluginErrorCode };

/** Messages the UI iframe (`ui.ts`) posts to the plugin sandbox (`code.ts`). */
export type UIToPluginMessage =
  | { type: "extract" }
  | { type: "select-node"; nodeId: string }
  /**
   * The actual file download happens entirely in the UI (only it has DOM
   * access to build a Blob + anchor click) — this message exists so the
   * plugin-sandbox side still observes the export (e.g. to `figma.notify`)
   * and so the later `ir-export` task has a hook to intercept/extend export
   * behavior without touching `ui.ts`.
   */
  | { type: "export"; source: ExportSource };
