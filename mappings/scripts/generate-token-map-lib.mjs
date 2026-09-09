// Shared logic for generating a mappings/token-map/*.token-map.json artifact
// from a figma-tokens intermediate "tokens.json" (see
// tools/figma-tokens/src/figma_tokens/pipeline/intermediate.py in
// DexFigmaPlugin for the authoring schema). Used by both the
// `generate:token-map` CLI script and the vitest suite, so the two can never
// drift apart. See mappings/token-map/README.md for the full investigation
// this is based on.
//
// Why we read `collections[name].tokens` (the flat, per-collection token
// list) instead of walking `collections[name].token_tree`: both are
// generated from the same `ResolvedToken[]` (see `_build_token_tree` and
// `_serialize_token` in intermediate.py) and cover the exact same set of
// leaves (verified against a real tokens.json: e.g. the `base` collection
// has 324 entries in both `tokens` and as leaves of `token_tree`). But
// `tokens` additionally carries the *structured*, resolved per-mode value
// (`values.<mode> = {type, r, g, b, a}` for COLOR, or `{type, value}` for
// everything else) plus `alias_path`/`alias_by_mode`/`alias_source`, none of
// which `token_tree` exposes (its leaves are just `{_type, _ref?, _doc?}`).
// Since the resolved literal value is exactly what this artifact needs, and
// string-parsing the free-text "Resolves to #HEX" doc comment is lossy (see
// below), `tokens` is the strictly better source — flattening `token_tree`
// ourselves would just be reimplementing something already flattened.
import path from "node:path";
import prettier from "prettier";

/**
 * Converts a Figma-resolved 0..1 float RGBA color to a `#RRGGBB`/`#RRGGBBAA`
 * hex string. Deliberately mirrors `colorToHex` in
 * `plugin/src/extractor/tokens.ts` (rounding, clamping, uppercase, alpha
 * only appended when < 1) so a token-map hex value and an IR-extracted hex
 * value for the same underlying color always agree.
 */
export function colorToHex(color) {
  const toHex = (component) => {
    const clamped = Math.max(0, Math.min(255, Math.round(component * 255)));
    return clamped.toString(16).padStart(2, "0").toUpperCase();
  };
  const hex = `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
  if (color.a !== undefined && color.a < 1) {
    return hex + toHex(color.a);
  }
  return hex;
}

/**
 * Extracts the hex color a free-text token description claims to resolve
 * to (e.g. `"...Resolves to #ACA8E3."` -> `"#ACA8E3"`), or `null` if the
 * description doesn't contain that phrase. This is a diagnostic/cross-check
 * helper only — see the module doc comment and README for why the
 * structured `values` map (via `colorToHex`) is the value source this
 * script actually uses, not this string parse. Kept and exported because
 * it is exactly how the `#2B2855` vs `#ACA8E3` discrepancy in the task
 * brief was root-caused: the doc text only ever cites *one* mode's
 * resolution (empirically, the collection's non-default mode in the one
 * real case we found), so comparing it against every mode's structured
 * value is what surfaces the mismatch instead of hiding it.
 */
export function parseResolvesToHexFromDescription(description) {
  if (!description) return null;
  const match = /Resolves to (#[0-9A-Fa-f]{3,8})/.exec(description);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Renders one mode's structured token value (as found in
 * `tokens[].values.<mode>`) to a plain JS value for the flat artifact:
 * a hex string for COLOR, otherwise the raw `value`.
 */
export function renderModeValue(structuredValue) {
  if (!structuredValue || typeof structuredValue !== "object") return structuredValue;
  if (structuredValue.type === "COLOR") {
    return colorToHex(structuredValue);
  }
  return structuredValue.value;
}

/**
 * JS port of `to_camel_case` in
 * `tools/figma-tokens/src/figma_tokens/codegen/base.py`: this is the exact
 * function the Kotlin generator uses to turn one raw Figma path segment
 * (e.g. `"border-width"`, `"black 5%"`) into the Kotlin property/class name
 * for that segment (e.g. `"borderWidth"`, `"black5"`). Reimplemented here
 * (not imported — this is a Node/TS repo, the source is Python) so
 * `buildSymbol` below can reconstruct the exact accessor chain a human
 * would type, not merely lowerCamelCase the segment naively.
 */
export function toCamelCaseSegment(name) {
  const clean = name.replace(/[^A-Za-z0-9 _-]/g, "").trim();
  if (!clean) return "_empty";
  const parts = clean.split(/[\s_-]+/).filter(Boolean);
  const titled = parts.map((part, i) =>
    i === 0 ? part[0].toLowerCase() + part.slice(1) : part[0].toUpperCase() + part.slice(1),
  );
  let result = "";
  let prevNumeric = false;
  for (let i = 0; i < parts.length; i++) {
    const numeric = /^[0-9]+$/.test(parts[i]);
    if (result && prevNumeric && numeric) result += "_";
    result += titled[i];
    prevNumeric = numeric;
  }
  return /^[0-9]/.test(result) ? `_${result}` : result;
}

/**
 * Attempts to derive the real Kotlin call-site accessor (e.g.
 * `AppTheme.semanticColors.surface.action.primary.default`) for one
 * `(collection, path)` pair.
 *
 * Per the investigation in mappings/token-map/README.md, this is only
 * confidently derivable today for the `base` collection's `color` branch,
 * in both Android_Stelo and Android_Avalon:
 * `themedata/DsThemeColors.kt` in both repos declares
 * `typealias SemanticColors = ...token.base.color.Color` — a direct,
 * un-renamed, un-restructured alias of the generated `Base.Color` class —
 * and `AppTheme.semanticColors` (`AppTheme.kt` in both repos) exposes it
 * verbatim. So `Base.color.<rest of path>` (camelCased per segment) IS
 * `AppTheme.semanticColors.<rest of path>` with no further reconciliation.
 *
 * Every other `base` branch (`border-width`, `effect`, `opacity`, `radius`,
 * `scale`, `apple`) and every other collection (`components`, `layout`,
 * `primitives`, `typography`, and product collections like `stelo`) is
 * intentionally left unresolved (`symbol: null` + a `reason`): the
 * `AppOpacity`/`AppShapes`/`AppDimensions` types that back `AppTheme.opacity`
 * / `AppTheme.shapes` / `AppTheme.dimensions` are hand-authored composition
 * locals with their own field names and hardcoded literal defaults (see
 * `themedata/AppOpacity.kt`, `AppShapes.kt`, `AppDimensions.kt`) — there is
 * no mechanical rename from a `Base.*` path to one of their fields, so
 * guessing a symbol for them would silently be wrong more often than not.
 */
export function buildSymbol(collection, tokenPath) {
  const segments = tokenPath.split("/");
  if (collection === "base" && segments[0] === "color" && segments.length > 1) {
    const accessor = segments.slice(1).map(toCamelCaseSegment).join(".");
    return { symbol: `AppTheme.semanticColors.${accessor}`, reason: undefined };
  }

  if (collection === "base") {
    return {
      symbol: null,
      reason:
        `No confirmed 1:1 wiring from "Base.${toCamelCaseSegment(segments[0])}" to an AppTheme ` +
        `accessor exists. Only Base.color is a direct 1:1 alias of AppTheme.semanticColors ` +
        `(see themedata/DsThemeColors.kt); AppTheme.opacity/shapes/dimensions are hand-authored ` +
        "types with their own field names and literal defaults, not derived from this token " +
        "tree. See mappings/token-map/README.md.",
    };
  }

  return {
    symbol: null,
    reason:
      `The AppTheme wiring for the "${collection}" collection was not investigated as part of ` +
      "this task (only base's color branch was confirmed). See mappings/token-map/README.md.",
  };
}

/**
 * Flattens every collection's `tokens` array in a parsed tokens.json into a
 * flat list of token-map entries. `token.path` is passed through verbatim:
 * it is the raw Figma variable name (see `path=variable.name` in
 * `pipeline/resolver.py`), which is exactly the same raw string
 * `plugin/src/extractor/tokens.ts`'s `resolveVariable` reads off
 * `variable.name` into the IR's `TokenValue.token`/`TokenRef.token` — so no
 * path-format reconciliation is needed between the two (see README).
 */
export function flattenTokensJson(tokensJson, { collections } = {}) {
  const entries = [];
  const collectionNames = collections ?? Object.keys(tokensJson.collections ?? {});

  for (const collectionName of collectionNames) {
    const collection = tokensJson.collections?.[collectionName];
    if (!collection) continue;

    for (const token of collection.tokens ?? []) {
      const values = {};
      for (const [mode, structuredValue] of Object.entries(token.values ?? {})) {
        values[mode] = renderModeValue(structuredValue);
      }

      const alias =
        token.alias_path || token.alias_by_mode || token.alias_source
          ? {
              path: token.alias_path ?? null,
              ...(token.alias_by_mode ? { byMode: token.alias_by_mode } : {}),
              ...(token.alias_source ? { source: token.alias_source } : {}),
            }
          : null;

      const { symbol, reason } = buildSymbol(collectionName, token.path);

      entries.push({
        collection: collectionName,
        path: token.path,
        type: token.type,
        values,
        alias,
        description: token.description ?? null,
        symbol,
        ...(reason ? { symbolReason: reason } : {}),
      });
    }
  }

  // Deterministic ordering: collection, then path. Both are already stable
  // per-collection insertion order from the source file, but sorting makes
  // the generated JSON's diff stable across regenerations from a
  // differently-ordered (but content-identical) source.
  entries.sort((a, b) => {
    if (a.collection !== b.collection) return a.collection < b.collection ? -1 : 1;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });

  return entries;
}

/**
 * Builds the full token-map artifact document (metadata + flat entries) and
 * formats it with prettier, mirroring generate-map-lib.mjs's
 * `generateComponentMapJson` pattern.
 */
export async function generateTokenMapJson(tokensJson, { collections, outputPath } = {}) {
  const entries = flattenTokensJson(tokensJson, { collections });
  const doc = {
    schemaVersion: 1,
    figmaFileKey: tokensJson.figma_file_key ?? null,
    generatedFrom: "tools/figma-tokens intermediate tokens.json (schema_version 1)",
    entries,
  };
  const json = JSON.stringify(doc, null, 2) + "\n";
  return prettier.format(json, { filepath: outputPath ?? "token-map.json" });
}

export function defaultOutputPath(name) {
  const here = path.dirname(new URL(import.meta.url).pathname);
  return path.join(here, "..", "token-map", `${name}.token-map.json`);
}
