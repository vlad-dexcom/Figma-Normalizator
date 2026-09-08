# @figma-normalizator/plugin

The Figma plugin (TypeScript) that will walk the scene graph and emit the
Figma Normalizator IR.

## Status: Stage 1 scaffold only

This package currently contains **only the plugin scaffold**: manifest,
build tooling, a no-op placeholder command, and a headless test harness.
There is **no extraction/traversal logic** yet (layout resolution, token
resolution, instance/component handling, etc.) — that's the separate
`plugin-extractor` task, which depends on this scaffold and on the IR types
from `schema/` (not yet imported here; see the `TODO(plugin-extractor)`
comment in `src/code.ts`).

## Layout

```
manifest.json        # Figma plugin manifest
src/code.ts           # sandboxed plugin-API entry point (no DOM access)
src/ui.html            # placeholder UI shown in the plugin's iframe
src/test/mockFigma.ts   # createMockFigma() helper for headless tests
src/__tests__/          # vitest specs
scripts/build.mjs        # esbuild build script
dist/                     # build output (git-ignored), loaded by Figma
```

## Building

```bash
npm run build
```

Bundles `src/code.ts` with esbuild into `dist/code.js` and copies
`src/ui.html` to `dist/ui.html`. `manifest.json`'s `main` and `ui` fields
point at these built files, not the TypeScript sources.

## Loading the plugin locally in Figma

1. Run `npm run build` in this package (or from the repo root).
2. In the Figma desktop app: **Plugins → Development → Import plugin from
   manifest…**, then select `plugin/manifest.json` in this repo.
3. Run the plugin from **Plugins → Development → Figma Normalizator**. The
   Stage 1 scaffold shows a placeholder UI briefly and closes itself — it
   does not modify or read the document yet.

Note: `manifest.json`'s `id` is a placeholder. It needs to be replaced with
a real plugin id once/if this plugin is published to a Figma org.

## Running the headless test harness

```bash
npm test        # from this package, or `npm test` from the repo root (vitest runs all workspaces)
```

Plugin code runs inside Figma's sandbox, so tests can't use a real `figma`
global. Instead, `src/test/mockFigma.ts` exports `createMockFigma()`, a
minimal stub of the `figma` API surface the plugin code touches (currently
just `showUI` and `closePlugin`). Testable logic in `code.ts` is refactored
into exported pure functions (e.g. `runScaffoldCommand`) that accept a
`figma`-shaped object as a parameter, so tests can inject the mock instead
of relying on the ambient global.

When `plugin-extractor` adds real traversal logic, extend
`createMockFigma()` with more stubbed methods/properties (e.g.
`currentPage`, `root`, `getNodeById`) as needed, following the same pattern.

## Other scripts

- `npm run typecheck` — `tsc --noEmit`, using `@figma/plugin-typings` for
  the Figma plugin API globals (`figma`, `PluginAPI`, node types, etc.).
- `npm run lint` (from the repo root) — ESLint across all packages.
