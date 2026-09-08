// Sandboxed plugin-API-side entry point (no DOM access — this runs in
// Figma's plugin sandbox, not the UI iframe). Bundled by esbuild into
// `dist/code.js`, which `manifest.json`'s `main` field points at.
//
// TODO(plugin-extractor): This is where the real IR extraction/traversal
// logic will live — walking the Figma scene graph starting from the
// current selection or page, resolving:
//   - layout nodes (Auto Layout intent, not raw coordinates/constraints)
//   - text nodes (resolved styled text segments, not raw character ranges)
//   - instance nodes (component + variant/property resolution, mapped via
//     `mappings/` to design-system components instead of inlined subtrees)
//   - asset nodes (exportable image/vector fills)
//   - overlay nodes (interactions/overlays such as modals, tooltips)
//   - list nodes (repeated/auto-layout-driven collections)
// and emitting the versioned IR defined by `schema/` (not imported yet —
// that package is still in-flight in a parallel task).
//
// Nothing below this comment is extraction logic; it only proves the
// build, manifest, and UI wiring work end to end.

/** Minimal slice of the Figma plugin API this scaffold depends on. */
export type ScaffoldFigmaAPI = Pick<PluginAPI, "showUI" | "closePlugin">;

/**
 * No-op scaffold command. Shows the placeholder UI briefly and then closes
 * the plugin. Exported (rather than run as a side effect of module load) so
 * it can be exercised by the headless test harness without a real `figma`
 * global.
 */
export function runScaffoldCommand(api: ScaffoldFigmaAPI): void {
  // `__html__` is an ambient global populated by Figma at runtime from
  // manifest.json's `ui` field (see @figma/plugin-typings). It doesn't
  // exist in the headless test environment, so guard with `typeof` rather
  // than referencing it directly (which would throw a ReferenceError).
  const html = typeof __html__ !== "undefined" ? __html__ : "";
  api.showUI(html, { visible: false, width: 240, height: 120 });
  api.closePlugin("Figma Normalizator: Stage 1 scaffold ready");
}

// Only invoke against the real Figma sandbox when one is present (i.e. not
// when this module is imported by the headless test harness).
if (typeof figma !== "undefined") {
  runScaffoldCommand(figma);
}
