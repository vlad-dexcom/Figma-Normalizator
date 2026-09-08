# @figma-normalizator/plugin

The Figma plugin (TypeScript) that walks the scene graph, extracts the
Figma Normalizator IR, and shows it — plus hygiene warnings — in a panel a
designer can act on directly.

## Status

- **Extraction** (`src/extractor/`): implemented. See its own PR/task
  (`plugin-extractor`) for details on layout/token/instance/list/overlay
  resolution and the node budget.
- **Panel UI** (`src/ui.ts`/`src/ui.html`, `src/code.ts`): implemented in
  this task (`plugin-validator-ui`). See "Using the panel" below.
- **Formal versioned export** (clipboard support, byte-identical repeat
  exports keyed by file key + node id + version): a separate, later task
  (`ir-export`), building on the simple file-download export here.

## Using the panel

1. Select a frame (or any layer) on the canvas.
2. Run the plugin (**Plugins → Development → Figma Normalizator**). The
   panel shows the currently selected layer's name and type at the top.
3. Click **Extract**. This runs the extractor on the current selection and
   shows:
   - A pretty-printed JSON preview of the extracted IR.
   - A **Warnings** list, grouped by reason (see below), each entry showing
     its detail and Figma node id. Click **Select** on any entry to
     re-select and scroll to that node on the canvas.
   - If the selection is too large for the extractor's node budget (see
     `src/extractor/budget.ts`), a visible banner explains extraction was
     stopped rather than silently truncated — reselect a smaller region.
4. Click **Export** to download the extracted IR as
   `{fileKey}_{nodeId}_{version}.ir.json` (a plain browser file download —
   see `src/ui/filename.ts`). This is intentionally minimal; the full
   versioned-artifact export mechanics are the separate `ir-export` task.

Selecting a different layer on the canvas at any time updates the header
and re-enables **Extract** for the new selection.

### Warning reasons

| Reason                   | Emitted by                | Meaning                                                                                                                                                                                                        |
| ------------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unbound-literal`        | extractor (`tokens.ts`)   | A color/spacing/typography value has no bound Figma variable/style.                                                                                                                                            |
| `unmapped-variant`       | extractor (`instance.ts`) | A component's VARIANT property value has no `component-map.yaml` routing.                                                                                                                                      |
| `unmapped-component`     | extractor (`instance.ts`) | A component set has no `component-map.yaml` entry (or no mapped Compose component) at all.                                                                                                                     |
| `missing-main-component` | extractor (`instance.ts`) | An INSTANCE node whose main component couldn't be resolved (deleted, or in an unavailable library). See "Detached instances" below.                                                                            |
| `absolute-positioning`   | extractor (`overlay.ts`)  | Children were grouped into an `overlay` node (absolutely positioned inside an Auto Layout parent). Structurally handled either way — this entry exists so it's also visible to designers in the warnings list. |

Reasons above the line are extractor-emitted (present in `unresolved[]` in
the IR itself); `absolute-positioning` was added in this task as a small,
targeted extractor change (`overlay.ts`) specifically so the UI can surface
it, per the plugin-validator-ui task description.

### Detached instances: a known limitation

The task description asks for a "detached instance" hygiene warning: a
node that used to be a component instance but was disconnected from its
main component (Figma's _Detach Instance_ action). **We do not ship this
detection**, because Figma's plugin API provides no reliable signal for it:
once detached, the node's `type` simply becomes a plain `FRAME`/`GROUP` —
every instance-specific field (`mainComponent`, `componentProperties`,
etc.) is gone along with it, indistinguishable from a `FRAME` that was
never an instance. Any heuristic based on naming conventions or structure
would misfire on ordinary frames and was deliberately not shipped.

The closest thing we _can_ detect with an actual API signal is different:
an **INSTANCE** node whose `getMainComponentAsync()` resolves to `null`
(main component deleted, or from a library the file no longer has access
to) — flagged as `missing-main-component`. This is a real, distinct hygiene
issue worth surfacing, but it is not the same thing as a detached instance,
and designers should not conflate the two.

## Layout

```
manifest.json          # Figma plugin manifest
src/code.ts              # sandboxed plugin-API entry point (no DOM access)
src/ui.ts                 # UI iframe entry point (DOM, no Figma API access)
src/ui.html                 # panel markup; build inlines the bundled ui.ts into it
src/ui/                       # pure, tested UI logic (warning grouping, export filename)
src/messages.ts                # shared code.ts <-> ui.ts message protocol
src/extractor/                   # IR extraction (see plugin-extractor task)
src/test/mockFigma.ts              # createMockFigma() helper for headless tests
src/__tests__/                       # vitest specs for code.ts
scripts/build.mjs                      # esbuild build script
dist/                                     # build output (git-ignored), loaded by Figma
```

## Building

```bash
npm run build
```

Bundles `src/code.ts` with esbuild into `dist/code.js`. Separately bundles
`src/ui.ts` and inlines the result into `dist/ui.html` in place of the
`<!-- BUILD:UI_SCRIPT -->` placeholder in `src/ui.html` — Figma's plugin UI
iframe has no external resource loading (and this manifest declares no
network access), so the UI's JS must live inline in the HTML file it ships
in. `manifest.json`'s `main` and `ui` fields point at these built files, not
the TypeScript sources.

## Loading the plugin locally in Figma

1. Run `npm run build` in this package (or from the repo root).
2. In the Figma desktop app: **Plugins → Development → Import plugin from
   manifest…**, then select `plugin/manifest.json` in this repo.
3. Run the plugin from **Plugins → Development → Figma Normalizator**. See
   "Using the panel" above.

Note: `manifest.json`'s `id` is a placeholder. It needs to be replaced with
a real plugin id once/if this plugin is published to a Figma org.

## Running the headless test harness

```bash
npm test        # from this package, or `npm test` from the repo root (vitest runs all workspaces)
```

Plugin code runs inside Figma's sandbox, so tests can't use a real `figma`
global. Instead, `src/test/mockFigma.ts` exports `createMockFigma()`, a
stub of the `figma` API surface `code.ts` touches (selection,
`selectionchange`/`ui.on("message")` listeners, `getNodeByIdAsync`,
`viewport.scrollAndZoomIntoView`, etc.) — see its `MockFigma` type for the
test-only `triggerSelectionChange`/`triggerUIMessage` helpers used to drive
those listeners from a test.

`ui.ts` itself is deliberately kept thin (mostly DOM wiring) rather than
tested with a headless DOM shim: the substantive logic it depends on
(warning grouping in `src/ui/warnings.ts`, export filename generation in
`src/ui/filename.ts`) is extracted into small pure functions and tested
directly under `src/ui/__tests__/`.

## Other scripts

- `npm run typecheck` — `tsc --noEmit`, using `@figma/plugin-typings` for
  the Figma plugin API globals (`figma`, `PluginAPI`, node types, etc.) and
  the DOM lib for `ui.ts`'s browser APIs.
- `npm run lint` (from the repo root) — ESLint across all packages.
