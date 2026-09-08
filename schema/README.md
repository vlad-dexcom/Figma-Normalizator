# @figma-normalizator/schema

Versioned IR (Intermediate Representation) JSON Schema, generated TypeScript
types, and fixtures shared between the Figma plugin (which produces IR) and
any future consumer of that IR (a later stage — e.g. a Compose code-gen
pipeline).

## Layout

```
schema/
  ir/v1/schema.json      # the versioned JSON Schema — source of truth
  src/generated/ir.ts    # TypeScript types generated FROM schema.json
  src/index.ts           # public entry point (re-exports types + raw schema)
  scripts/               # the generator (generate-types.mjs / -lib.mjs)
  fixtures/               # hand-written example IR documents
```

`ir/v1/schema.json` is the only hand-maintained source of truth for node
shapes. `src/generated/ir.ts` is generated from it — **never hand-edit it**.

## Versioning

The schema is versioned by directory/`$id` path segment: this is
**IR schema v1**, living at `schema/ir/v1/schema.json` with
`$id: https://schemas.figma-normalizator.dev/ir/v1/schema.json`. A
backwards-incompatible change to any node shape must land as a new
`schema/ir/v2/schema.json` (with its own generated types), not a mutation of
v1. Additive, backwards-compatible changes (e.g. a new optional field) may be
made in place within v1. `IR_SCHEMA_VERSION` (exported from `src/index.ts`)
mirrors the current version for consumers that want a runtime check.

## Regenerating types

```bash
cd schema
npm run generate:types
```

This reads `ir/v1/schema.json` and rewrites `src/generated/ir.ts` using
`json-schema-to-typescript`. Run it after every schema change and commit the
diff. `npm test` (via `schema/src/ir-schema.test.ts`) fails CI if the
generated file is stale relative to the schema, so this can't silently drift.

## Node kind contract

Every IR node shares a common envelope:

- `kind`: discriminant — one of `layout | text | instance | asset | overlay | list`.
- `source`: a `Provenance` block — `{ nodeId, fileKey, version, path }`, where
  `path` is the stable ancestor chain of node names/ids. Used to diff IR
  across re-exports of the same Figma file.
- Any children array is always named `children`.

| kind       | summary                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout`   | An Auto Layout container resolved to **intent**, not raw Figma enums: `direction` (`row \| column \| stack`), `gap`/`padding`/`background`/`cornerRadius` as `TokenValue`s, `mainAxisAlign`/`crossAxisAlign`, and `sizing` (`fixed \| fill \| hug` per axis). Contains `children: IRNode[]`.                                                                                                                                                                        |
| `text`     | A text layer. `text` is a plain `string`, or a `StyledSegment[]` when Figma's `getStyledTextSegments` reports mixed-style runs within one text node. `typography` (`TokenRef \| null`) and `color` (`TokenValue \| null`).                                                                                                                                                                                                                                          |
| `instance` | A component instance. **Opaque past this boundary** — its internal children are never included. Carries the mapped design-system `component` name (or `null` if unmapped), `props` (resolved TEXT/BOOLEAN/VARIANT component properties), `slots` (named slot content, e.g. `leadingIcon`/`trailingIcon`, for INSTANCE_SWAP or boolean-gated children), a partial `layout` for call-site-only sizing/spacing, and `unresolved` for anything that couldn't be mapped. |
| `asset`    | A vector or image, represented as an `exportRef` (a deterministic suggested filename/drawable name) plus logical `width`/`height` — **never** inline path/geometry data.                                                                                                                                                                                                                                                                                            |
| `overlay`  | Absolutely positioned `children` inside an otherwise auto-layout parent. Each child carries its own `align` (`horizontal`/`vertical`) and optional pixel `offset`.                                                                                                                                                                                                                                                                                                  |
| `list`     | N identical/near-identical siblings collapsed to a single `itemTemplate: IRNode`, with `itemCount` recorded for information only (not a rendering directive).                                                                                                                                                                                                                                                                                                       |

### Shared value types

- **`TokenValue`**: `{ token, value, modes?, symbol? }` — a resolved Figma
  variable/style, its concrete value, and (only when the value is
  theme-dependent) a `modes` map (e.g. `{ light: "#FFF", dark: "#000" }`).
- **`TokenRef`**: `{ token, symbol? }` — the `TokenValue` shape without a
  resolved `value`, used for typography tokens.
- **`UnresolvedEntry`**: `{ nodeId, reason, detail? }` — see below.

## The `unresolved[]` convention

Whenever the plugin cannot resolve a value — a missing variable binding, an
unmapped component variant from the component-map, etc. — it must **never**
silently substitute a literal or omit the field. Instead it emits an
`UnresolvedEntry { nodeId, reason, detail? }` into the nearest `unresolved[]`
array (currently only present on `instance` nodes, since that's where
variant/property mapping happens). This keeps IR generation total: every
input node produces _some_ IR, and anything uncertain is flagged rather than
guessed at.

## Determinism requirement

**IR produced from the same input Figma node MUST always be byte-identical.**
No timestamps, no random ids, no non-deterministic key/array ordering. This
is why there is deliberately no top-level `generatedAt` (or similar) field
anywhere in the schema — adding one would make this guarantee impossible to
satisfy. This will be enforced by fixture/snapshot tests in a later task; the
schema itself is designed so nothing in it could violate the guarantee.

## Forward-compat plan: adding `symbol` later

A later stage will map each `TokenValue`/`TokenRef.token` (a raw Figma
variable/style path, e.g. `"color/text/base/default"`) to a generated
design-system symbol name (e.g. `"AppTheme.semanticColors.text.base.default"`).
To make that additive rather than breaking:

- Both `TokenValue` and `TokenRef` already declare an **optional** `symbol`
  field in v1, even though nothing populates it yet.
- Because it's optional, no existing IR document needs to change shape when
  a producer starts populating it, and no consumer that ignores unknown
  optional fields needs to change either.
- This means the token-to-symbol mapping stage does not require a v2 schema
  bump — only new logic in the plugin (and typed consumption on the reader
  side, since the generated `TokenValue`/`TokenRef` TypeScript types already
  include `symbol?: string`).

## Fixtures

`schema/fixtures/*.json` are hand-written, schema-valid example IR
documents used both as living documentation and as the input to the
"every fixture validates" test:

- `button-instance.json` — an `instance` node (`AppButton`) with TEXT and
  VARIANT props and empty slots.
- `container-with-text.json` — a `layout` node with themed
  background/spacing tokens containing a single `text` child with
  light/dark mode color.
