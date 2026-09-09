# mappings/token-map

This is a flat, artifact-based map from a Figma variable's path (the same
string the IR's `TokenValue.token` / `TokenRef.token` fields carry, e.g.
`color/surface/action/primary/default`) to:

- its resolved literal value per mode (e.g. `light: "#2B2855"`,
  `dark: "#ACA8E3"`), and
- where confidently derivable, the actual Kotlin call-site symbol a coding
  agent should write (e.g.
  `AppTheme.semanticColors.surface.action.primary.default`).

## Why this exists

Without this map, matching a Figma token to a Kotlin symbol requires
guessing by hex value, which is unreliable: the same hex can legitimately
appear under multiple different semantic token names (e.g. `#2B2855`
appearing as both `icon.hover` and `surface.status.info.subtle`). This
artifact makes the Figma-path -> Kotlin-symbol lookup exact instead of a
guess, and — following this repo's established `unmapped`/`reason`
convention (see `mappings/README.md`) — never silently guesses a symbol it
can't confidently derive: it emits `symbol: null` + a `symbolReason`
instead.

**Scope of this task**: this package only produces the artifact + its
generation script + this documentation. It does **not** wire the map into
`plugin/`'s extractor to populate `TokenValue.symbol`/`TokenRef.symbol` in
real IR output — that's a distinct follow-up.

## What's checked in here

- `README.md` — this file.
- `../scripts/generate-token-map.mjs` — the CLI.
- `../scripts/generate-token-map-lib.mjs` — the shared flattening/derivation
  logic (also used by the vitest suite in
  `../src/token-map/generate.test.ts`, plus the fixture at
  `fixtures/sample-tokens.json`).
- `android-stelo.token-map.json` / `android-avalon.token-map.json` — the
  generated flat artifacts (see "A surprising finding" below for why they
  are currently byte-identical).

The large source `tools/figma-tokens/json/tokens.json` files this script
reads (from Android_Stelo / Android_Avalon checkouts) are **not** committed
here — only the flattened output.

## Regenerating

From `mappings/`:

```sh
node scripts/generate-token-map.mjs \
  --input /path/to/Android_Stelo/tools/figma-tokens/json/tokens.json \
  --name android-stelo
```

- `--input` (required): path to a figma-tokens intermediate `tokens.json`
  (schema documented in
  `tools/figma-tokens/src/figma_tokens/pipeline/intermediate.py` in the
  `DexFigmaPlugin` repo).
- `--name`: used to derive the default output path,
  `token-map/<name>.token-map.json`.
- `--output <path>`: overrides the output path directly.
- `--collections a,b,c`: optional, restricts flattening to specific
  collection names (default: all collections in the input file).

Do not hand-edit the generated `*.token-map.json` files — re-run the
script and commit the diff.

## Investigation notes

### 1. The source artifact, and a deviation from the task's literal ask

The task brief describes flattening each collection's `token_tree` (a
nested object with `_type`/`_doc` leaves). Reading
`intermediate.py`'s own docstring and the real `tokens.json` files first
turned up something better already present in the same file: each
collection also carries a **flat** `tokens` array
(`collections.<name>.tokens`), generated from the exact same
`ResolvedToken[]` as `token_tree` (`_build_token_tree` and
`_serialize_token` in `intermediate.py` are literally two different
serializations of the same input list) — verified against a real
`tokens.json` that both have the same leaf count per collection (e.g.
`base`: 324 in both; `components`: 1318 in both; `primitives`: 332 in
both). Unlike `token_tree`, `tokens[]` entries additionally carry:

- `values.<mode>` — the actual **structured** resolved value per mode
  (`{type: "COLOR", r, g, b, a}` or `{type: "FLOAT"|"STRING"|"BOOLEAN",
value}`), not just a `_doc` comment string,
- `alias_path` / `alias_by_mode` / `alias_source` — where the value comes
  from.

So this script reads `collections[name].tokens`, not `token_tree` — using
`token_tree` at all would mean reimplementing a flattening that
`intermediate.py` already did, just to then throw away the more complete,
structured data sitting right next to it. See
`generate-token-map-lib.mjs`'s module doc comment for this same reasoning
inline with the code.

### 2. Path-format reconciliation between the IR and tokens.json: none needed

The task brief anticipated the IR's raw Figma variable name and
`tokens.json`'s `token_tree`/`tokens[].path` segments might differ (e.g.
one side sanitized/camelCased for Kotlin). Checking both actual sources:

- `plugin/src/extractor/tokens.ts`'s `resolveVariable` sets
  `token: variable.name` — the raw, un-sanitized Figma variable name,
  slash-separated (per its own comment: "Figma variable names already use
  `/` as a path separator").
- `tools/figma-tokens/src/figma_tokens/pipeline/resolver.py` line 114 sets
  `path=variable.name` — **the identical raw Figma variable name**, read
  off the same Figma Variables API.

Both sides read `variable.name` straight off the Figma API with no
transformation. Confirmed with real data: paths like
`primitives/palette/neutral/black 5%` (with a literal space and a `%`) and
`base/apple/color/systemBlue` (already mixed-case) appear verbatim in the
real `tokens.json`, i.e. it is not pre-sanitized for Kotlin. **No
reconciliation is needed — a `TokenValue.token`/`TokenRef.token` string and
a `tokens.json` `path` string for the same Figma variable are the same
string**, once the `--input` file's `collections` key you're looking under
is right (this map does not need to know which Figma variable _collection_
an IR token came from; if that's ever ambiguous, cross-check against
`values`/hex, or extend the IR to carry the collection name later).

The sanitization the task brief was picturing is real, but it happens one
level later, only inside the Kotlin **codegen** (`to_camel_case` /
`sanitize_identifier` in `codegen/base.py`), when turning one path
_segment_ into a Kotlin identifier — e.g. `border-width` ->
`borderWidth`. This map reimplements that exact segment-level function
(`toCamelCaseSegment` in `generate-token-map-lib.mjs`, a JS port of
`to_camel_case`) only where it's needed to build a `symbol` (see below) —
the `path` field itself is left untouched/raw so it matches the IR
directly.

### 3. The `#2B2855` vs `#ACA8E3` discrepancy: mode mismatch, not different files

Root-caused directly, not assumed: `color/surface/action/primary/default`
in **the same** `tokens.json` (verified: Android_Avalon's and
Android_Stelo's copies are byte-identical, see below) has:

```json
"values": {
  "light": { "r": 0.1686..., "g": 0.1569..., "b": 0.3333..., "a": 1 },
  "dark":  { "r": 0.6745..., "g": 0.6588..., "b": 0.8902..., "a": 1 }
}
```

Converting each with the same hex algorithm the plugin extractor uses
(`colorToHex`): `light` -> `#2B2855`, `dark` -> `#ACA8E3`. The generated
Kotlin KDoc comment for this token
(`Color.kt`: `@property default Semantic surface color —
action/primary/default. Resolves to #ACA8E3.`) only ever cites the
**dark**-mode value — it does not mention `#2B2855` at all, even though
that's an equally real, live value for the same token in light mode. So:
this is case **(c)** from the task brief — a mode-name mismatch (the doc
text silently picked one mode to describe) — not different design files,
not different products, and not "something genuinely wrong" with the data.
It also concretely demonstrates why this map reads the structured
`values` map (`renderModeValue`/`colorToHex` in `generate-token-map-lib.mjs`)
instead of string-parsing the `description`/`_doc` text
(`parseResolvesToHexFromDescription` is kept only as an exported,
tested, diagnostic cross-check, not the value source) — the doc text is
lossy across modes and would have silently reported only the dark value
here.

### 4. A surprising finding: Android_Avalon's and Android_Stelo's `tokens.json` are currently identical

`md5(Android_Avalon/tools/figma-tokens/json/tokens.json) ==
md5(Android_Stelo/tools/figma-tokens/json/tokens.json)` — byte-for-byte,
including both repos' product-specific `stelo` collection. This means, as
of this snapshot, both repos were synced from the exact same Figma export
run (both reference the same `figma_file_key` and the same per-token
resolved values). Consequently `android-stelo.token-map.json` and
`android-avalon.token-map.json` in this directory are themselves currently
identical too — that's expected, not a bug in the generator. If the two
products' design tokens ever diverge, regenerating from each repo's own
(then-different) `tokens.json` will produce different artifacts
automatically; nothing about the script assumes they stay in sync.

### 5. The wiring layer: `Base.color` -> `AppTheme.semanticColors` is confirmed 1:1; nothing else is

Read in both repos: `app/.../theme/AppTheme.kt`,
`app/.../theme/themedata/DsThemeColors.kt`, and the generated
`platform/design/foundation/.../token/base/Base.kt` / `color/Color.kt`.

- **`base`'s `color` branch (both repos)**: `DsThemeColors.kt` declares
  `typealias SemanticColors = com.dexcom.platform.design.foundation.token.base.color.Color`
  — a direct, un-renamed, un-restructured Kotlin `typealias` of the
  generated `Base.Color` class, in **both** Android_Stelo and
  Android_Avalon. `AppTheme.kt`'s `semanticColors` property returns
  `LocalSemanticColors.current`, which is exactly this type. So
  `Base.color.<rest>` and `AppTheme.semanticColors.<rest>` are the same
  accessor chain, camelCased per path segment — confirmed by directly
  reading the generated `Color.kt`'s nested classes (e.g. `Surface` ->
  `Action` -> `Primary` -> `default`, matching
  `color/surface/action/primary/default` segment-for-segment) and its KDoc
  (`@property default ... action/primary/default. Resolves to #ACA8E3.`
  sitting right on the `Primary` data class). This is the **only** case
  this map derives a `symbol` for
  (`base` collection, path starting with `color/`).
- **`base`'s other branches** (`border-width`, `effect`, `opacity`,
  `radius`, `scale`, `apple`): **not** derivable. `AppTheme.opacity`
  (`AppOpacity`), `AppTheme.shapes` (`AppShapes`), and `AppTheme.dimensions`
  (`AppDimensions`) are hand-authored `data class`es in `themedata/` with
  their own field names (`AppShapes.radius40`, `AppDimensions.extraSmall`,
  …) and hardcoded literal `Dp`/`Float` defaults — not typealiases, not
  generated from `Base`, and not a 1:1 rename of any `Base.*` path. Their
  values are wired up elsewhere at theme-setup time, not through a
  mechanical path transform. Guessing a symbol here would very likely be
  wrong, so this map leaves it `null` with a `symbolReason`.
- **Every other collection** (`components`, `layout`, `primitives`,
  `typography`, and product collections like `stelo`): out of scope for
  this task (color was the explicit priority) and not investigated for
  wiring; also left `null` with a `symbolReason`.

### Result: derivable vs. not, in numbers

Generated from the real `Android_Stelo`/`Android_Avalon` `tokens.json`
(2,371 total flattened tokens across all 6 collections): **246** entries
(all `base`/`color/...`) get a confidently-derived `symbol`; the remaining
2,125 are explicit `symbol: null` + `symbolReason`.

## Entry shape

```jsonc
{
  "collection": "base", // which tokens.json collection this came from
  "path": "color/surface/action/primary/default", // == IR's TokenValue.token / TokenRef.token
  "type": "COLOR", // COLOR | FLOAT | STRING | BOOLEAN
  "values": { "light": "#2B2855", "dark": "#ACA8E3" }, // resolved literal per mode
  "alias": { "path": null, "byMode": { "dark": "palette/lavender/500" }, "source": "primitives" }, // or null
  "description": "Semantic surface color — action/primary/default. Resolves to #ACA8E3.",
  "symbol": "AppTheme.semanticColors.surface.action.primary.default", // or null
  "symbolReason": "...", // present only when symbol is null
}
```

## What a human should double-check

- Whether `AppTheme.opacity`/`shapes`/`dimensions` should eventually get
  their own hand-authored mapping table (they're not mechanically
  derivable from `Base.*`, per the investigation above) — that's a
  design-system-owner decision, not something this script should guess at.
- Whether Android_Stelo and Android_Avalon's tokens are expected to stay
  in lockstep long-term (see finding #4) — if not, both
  `*.token-map.json` files should be regenerated and reviewed whenever
  either product's `tokens.json` changes, not assumed identical forever.
