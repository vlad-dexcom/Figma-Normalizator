# Figma-Normalizator

A Figma plugin + intermediate representation (IR) schema that extracts a
**semantic, platform-neutral** description of a Figma design, for use in
design-to-code pipelines.

## Why this exists

Figma's REST API returns a geometry-first, semantics-free document:

- Absolute coordinates, vector geometry, and low-level Auto Layout enums are
  dumped instead of the layout _intent_ they encode.
- Component instances are inlined as full rendered subtrees (every rectangle,
  text run, and override) instead of something like
  `AppButton, type=Primary`.
- Colors and spacing arrive as literal values with opaque variable ids,
  instead of resolved token names.
- There is no theme/mode information (light/dark, density, etc.).

The Figma **Plugin API**, running inside Figma itself, can see what the REST
API cannot: resolved component properties, styled text segments, and
variable modes. This project resolves all of the above on the Figma side —
where the information actually lives — and emits a clean, versioned IR that a
separate code-generation stage can consume without needing to understand
Figma's internal document model at all.

## Layout

```
schema/     # versioned IR JSON Schema, generated TS types, fixtures
plugin/     # the Figma plugin (TypeScript) that walks the scene graph and
            # emits the IR
mappings/   # Figma component set -> design system component map
fixtures/   # captured real-screen node data + expected IR snapshots, used
            # in tests
```

This is an npm workspaces monorepo. Each package has its own
`package.json` and extends the shared root `tsconfig.json`.

## Status: Stage 1

This repository is being built in stages. **Stage 1 (this stage) covers only
Figma-side extraction**: producing a correct, well-typed IR from a Figma
document. It does _not_ include:

- An MCP server for exposing the IR to external tools/agents.
- Any code generation (e.g. Jetpack Compose).
- Any LLM assistance inside the plugin itself.

Those are later stages, built on top of the IR produced here.

## Development

```bash
npm install        # install all workspace dependencies
npm run lint        # ESLint across all packages
npm run typecheck    # tsc --noEmit in every package
npm test            # vitest, run once
```

CI (`.github/workflows/ci.yml`) runs install, lint, typecheck, and test on
every push and pull request.
