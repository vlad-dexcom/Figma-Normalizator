// Pure filename-generation logic for the export button. Separate from
// ui.ts for the same testability reason as warnings.ts.
import type { ExportSource } from "../messages.js";

/**
 * Filesystem-unsafe characters that can appear in Figma's own ids/keys
 * (notably `:` in node ids like "123:456"). Replaced with `-` so the
 * generated name is a valid filename on every OS this plugin might run on
 * (Figma desktop targets Windows/macOS/Linux).
 */
const UNSAFE_CHARS = /[\\/:*?"<>|\s]+/g;

function sanitizeSegment(raw: string, fallback: string): string {
  const cleaned = raw.replace(UNSAFE_CHARS, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * Builds the export filename `{fileKey}_{nodeId}_{version}.ir.json`, using
 * the IR schema's own `source.fileKey`/`source.nodeId`/`source.version`
 * fields (per the plugin-validator-ui task's export naming scheme). This is
 * intentionally simple — the full versioned-artifact export mechanics
 * (clipboard support, byte-identical repeat-export guarantees) are a
 * separate `ir-export` task building on top of this.
 */
export function buildExportFilename(source: ExportSource): string {
  const fileKey = sanitizeSegment(source.fileKey, "unknown-file");
  const nodeId = sanitizeSegment(source.nodeId, "unknown-node");
  const version = sanitizeSegment(source.version, "unknown-version");
  return `${fileKey}_${nodeId}_${version}.ir.json`;
}
