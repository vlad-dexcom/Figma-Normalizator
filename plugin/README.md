# @figma-normalizator/plugin

The Figma plugin (TypeScript) that walks the scene graph, extracts the
Figma Normalizator IR, and shows it — plus hygiene warnings — in a panel a
designer can act on directly.

## Status

- **Extraction** (`src/extractor/`): implemented. See its own PR/task
  (`plugin-extractor`) for details on layout/token/instance/list/overlay
  resolution and the node budget.
- **Panel UI** (`src/ui.ts`/`src/ui.html`, `src/code.ts`): implemented in
  the `plugin-validator-ui` task. See "Using the panel" below.
- **Formal versioned export** (clipboard support, byte-identical repeat
  exports keyed by file key + node id + version): implemented in this task
  (`ir-export`). See "Using the panel", "Export versioning: what `version`
  means", and "Determinism guarantee" below.

## Using the panel

1. Select a frame (or any layer) on the canvas.
2. Run the plugin (**Plugins → Development → Figma Normalizator**). The
   panel shows the currently selected layer's name and type at the top.
3. Click **Extract**. This runs the extractor on the current selection and
   shows:
   - A pretty-printed JSON preview of the extracted IR.
   - A **Warnings** list, grouped by reason (see below), each entry showing
     its detail and Figma node id. Click **Select** on any entry to
     re-select and scroll to that node on the canvas. Click
     **Collapse all** (next to the Warnings heading, only shown when there
     are warnings) to hide individual entries while keeping each group's
     title and count visible — useful on a screen with many
     `unmapped-component` entries (e.g. one with few/no design-system
     components), where the full list would otherwise crowd out the IR
     preview. Click **Expand all** to bring the entries back; the toggle
     persists across re-Extracts of the same panel session.
   - If the selection is too large for the extractor's node budget (see
     `src/extractor/budget.ts`), a visible banner explains extraction was
     stopped rather than silently truncated — reselect a smaller region.
4. Click **Export** to download the extracted IR as
   `{fileKey}_{nodeId}_{version}.ir.json` (a plain browser file download —
   see `src/ui/filename.ts`), or click **Copy to clipboard** to copy the
   same content instead. Both serialize through the same canonical
   (key-order-sorted) JSON step — see "Determinism guarantee" below — so
   the file and the clipboard contents are always identical for the same
   extraction, and re-exporting an unchanged selection produces
   byte-identical output either way.

Selecting a different layer on the canvas at any time updates the header
and re-enables **Extract** for the new selection.

## Export versioning: what `version` means

`Provenance.version` (and the `{version}` segment of the export filename)
is **not** a Figma file/revision version — the Plugin API exposes no
per-node version/revision counter to read. The options actually available,
and why none of them fit directly:

- `node.id` — stable across edits, but for exactly that reason it does
  **not** change when the node's content changes, so it can't answer "did
  this change since I last exported it?".
- File-level version history (`figma.saveVersionHistoryAsync`, the file's
  version list) — a _file_-scoped concept, not readable synchronously for
  an arbitrary node, and would tie a single exported node's version to
  unrelated edits elsewhere in the same file.

**What we ship instead:** `version` is a deterministic content hash
(FNV-1a, 64-bit, formatted as `c1-<16 hex chars>`) computed from the
extracted IR itself, after canonicalizing it (see "Determinism guarantee"
below) — see `src/extractor/versioning.ts`. In practice:

- The same selection, extracted twice with no underlying Figma change,
  gets the same `version` (and therefore the same filename and byte-for-byte
  identical file/clipboard content).
- Any change to a field the extractor actually captures (layout, resolved
  tokens, text, instance props, children, ...) changes the hash.
- A Figma-side edit that does **not** touch anything the IR captures (e.g.
  renaming an unrelated internal layer, or changing geometry/data the
  schema intentionally omits) will **not** change `version` — this is a
  deliberate consequence of "version tracks extracted content, not raw
  Figma state", not a bug, but it is a real limitation worth knowing:
  `version` answers "did the exported IR change", not "did the Figma node
  change at all".
- This is a plain, non-cryptographic hash chosen for determinism and zero
  runtime dependencies (`crypto.subtle` is async and its plugin-sandbox
  availability isn't guaranteed), not for collision-resistance against
  adversarial input. Hash collisions are astronomically unlikely for this
  use case (detecting accidental content drift between two exports, not
  defending against someone deliberately engineering a collision), but they
  are not cryptographically impossible.

Tests may still pass an explicit literal version (`ExtractionSource.version`)
to `extractSelection` when a fixed, human-readable value is more useful for
a fixture/snapshot — see `extractor/types.ts`. Production code (`code.ts`)
never does; it always uses the computed content hash.

**This is a real design decision made under real Plugin API constraints,
not an incidental implementation detail — flagged here explicitly for
review**, since there's no perfect answer available.

## Determinism guarantee

**Exporting the same, unchanged selection twice MUST produce byte-identical
output** (not just deep-equal — the literal file bytes / clipboard string
must match). Two things make this hold:

1. Every extractor function already builds its result objects with a
   fixed, hand-written property order, so a single code path is already
   deterministic key-order-wise for identical input.
2. As defense-in-depth on top of that (and to make it explicit and tested,
   not incidental), both the file download and the clipboard copy in
   `ui.ts` serialize through `canonicalStringify` (`src/extractor/canonical.ts`),
   which recursively sorts every object's keys (array order is untouched —
   array order is meaningful IR content) before `JSON.stringify`-ing. Two
   structurally-identical IR trees built via different code paths would
   still serialize identically through this step even if their construction
   order differed.

`src/extractor/__tests__/determinism.test.ts` is the primary test for this
guarantee: it builds the same mock Figma tree twice (independently, with a
`resetAutoIds()` reset in between so even node-id allocation is identical)
and asserts `JSON.stringify(result1) === JSON.stringify(result2)` —
byte-for-byte string equality, not `toEqual` — plus the same check through
`canonicalStringify` and matching content-hash `version`s.

## Clipboard export

Figma's plugin UI panel is a same-origin sandboxed iframe. `src/ui/clipboard.ts`
implements `copyToClipboard`, which:

1. Tries `navigator.clipboard.writeText` first (the modern Clipboard API) —
   this generally works from the panel iframe because the copy is
   synchronously triggered by a real user gesture (a click), which is
   exactly the case Clipboard API permission checks are designed to allow.
   It is not, however, guaranteed on every Figma desktop/browser/OS
   combination the plugin might run on (older Chromium/Electron builds, a
   host that hasn't granted the iframe `clipboard-write`, etc).
2. Falls back to the older, far more broadly-supported
   `document.execCommand("copy")` (via a hidden, focused, selected
   `<textarea>`) if the modern API is unavailable or rejects.
3. If both fail, returns a descriptive error — `ui.ts` shows this visibly
   as inline status text next to the button (auto-clearing after a few
   seconds), the same "never fail silently" principle the extraction
   budget-exceeded banner already follows. It never throws or drops the
   failure.

`copyToClipboard` takes its browser dependencies (`writeText`/`fallbackCopy`)
as arguments rather than touching `navigator`/`document` directly, so it's
fully unit-testable without a DOM — see `src/ui/__tests__/clipboard.test.ts`.
`ui.ts` wires the real browser APIs via `buildClipboardDeps()`.

### Warning reasons

| Reason                            | Emitted by                                           | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unbound-literal`                 | extractor (`tokens.ts`)                              | A color/spacing/typography value has no bound Figma variable/style.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `unmapped-variant`                | extractor (`instance.ts`)                            | A component's VARIANT property value has no `component-map.yaml` routing.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `unmapped-component`              | extractor (`instance.ts`)                            | A component set has no `component-map.yaml` entry (or no mapped Compose component) at all. The instance's real children are still recursed into and extracted (see "Instance boundary" below) — this is a hygiene warning, not a truncation.                                                                                                                                                                                                                                                                                  |
| `missing-main-component`          | extractor (`instance.ts`)                            | An INSTANCE node whose main component couldn't be resolved (deleted, or in an unavailable library). See "Detached instances" below.                                                                                                                                                                                                                                                                                                                                                                                           |
| `unreadable-component-properties` | extractor (`instance.ts`, also guarded in `list.ts`) | `node.componentProperties` is a Figma Plugin API getter that threw — the underlying component set has broken/conflicting variant definitions **in the Figma file itself**. This is a data-integrity issue in the design file, not a plugin bug, and can't be fixed by re-exporting or updating the plugin — repair it in Figma (Assets panel → find the component set → fix/republish its conflicting variant definitions). The instance's real children are still recursed into and extracted, same as `unmapped-component`. |
| `mixed-value`                     | extractor (`tokens.ts`, `index.ts`)                  | A property genuinely varies internally within the node — Figma's real Plugin API returns the `figma.mixed` sentinel (a `Symbol`) instead of a scalar value for it, e.g. a rectangle/frame with independent per-corner radii, or a node with multiple sets of fills. This can't be represented as a single token/value. This is a Figma-file-side authoring choice to potentially reconsider (e.g. use a uniform radius), not a plugin bug, similar in spirit to `unreadable-component-properties` above.                      |
| `absolute-positioning`            | extractor (`overlay.ts`)                             | Children were grouped into an `overlay` node (absolutely positioned inside an Auto Layout parent). Structurally handled either way — this entry exists so it's also visible to designers in the warnings list.                                                                                                                                                                                                                                                                                                                |

Reasons above the line are extractor-emitted (present in `unresolved[]` in
the IR itself); `absolute-positioning` was added in this task as a small,
targeted extractor change (`overlay.ts`) specifically so the UI can surface
it, per the plugin-validator-ui task description.

### Instance boundary: opaque only when mapped

An INSTANCE node is only treated as opaque (its own `instance` IR node,
zero descended children) when it resolves to a real, mapped design-system
composable — the whole point of that opacity is that the composable call
is strictly better information than reconstructing its Figma-side internals
(rectangles, text nodes, icons), which a consumer must not act on anyway.

An **unmapped** instance (no `component-map.yaml` entry, or an entry that
resolves to `status: unmapped`/no compose component) has no composable to
protect, so there is no upside to stopping recursion there — it falls back
to the same container-handling path a plain FRAME would take (`instance.ts`

- `index.ts`), recursing into its real children (text, nested mapped
  instances, assets, plain layout) instead of discarding them. The
  `unmapped-component`/`missing-main-component` warning is still emitted for
  the node so the hygiene signal isn't lost — only the truncation is fixed.

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
src/ui/                       # pure, tested UI logic (warning grouping, export filename, clipboard)
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
