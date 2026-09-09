// Shared logic for generating mappings/src/generated/token-map.json (the
// plugin-bundled symbol lookup table) from
// mappings/token-map/android-avalon.token-map.json. Used by both the
// `bundle:token-map` CLI script and the "generated JSON is not stale"
// vitest check, so the two can never drift apart from each other.
//
// Why Android_Avalon and not Android_Stelo: this repo has no existing
// concept of "which product/consumer am I exporting for" anywhere in
// plugin/ or mappings/ (the plugin is a single generic export, not
// product-specific), and README.md's stated first consumer is
// Android_Avalon. So Avalon's token-map is bundled as the sole default for
// now. This is a known limitation, not a permanent design: once multiple
// product targets are actually in scope, this should grow a real
// product-selection mechanism instead of guessing — see mappings/README.md
// and plugin/README.md's "Symbol resolution (token-map)" section.
//
// Why bundle a trimmed { path, symbol }[] instead of the full
// token-map/*.token-map.json entry shape: the plugin only ever needs a
// token path -> Kotlin symbol lookup (see `resolveVariable` in
// plugin/src/extractor/tokens.ts) and, per that lookup's own contract, an
// entry with `symbol: null` is treated *identically* to no entry at all
// (both leave the IR's `symbol` field absent, with no warning) — so
// entries with a null symbol carry no information this bundle needs to
// preserve. Dropping them (2,371 -> 246 entries, as of this snapshot) plus
// the unused `values`/`alias`/`description`/`symbolReason` fields keeps the
// bundle small without changing behavior. Do NOT hand-edit the generated
// file: run `npm run bundle:token-map` (from the mappings/ package) after
// regenerating android-avalon.token-map.json, then commit the diff.
import prettier from "prettier";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const sourceTokenMapPath = path.join(
  here,
  "..",
  "token-map",
  "android-avalon.token-map.json",
);
export const generatedFilePath = path.join(here, "..", "src", "generated", "token-map.json");

/**
 * Reads android-avalon.token-map.json and returns the trimmed, generated
 * JSON file contents (as a string): a `{ path, symbol }[]` array containing
 * only the entries that have a non-null `symbol`.
 */
export async function generateTokenMapBundleJson() {
  const raw = await readFile(sourceTokenMapPath, "utf8");
  const parsed = JSON.parse(raw);
  const trimmed = parsed.entries
    .filter((entry) => entry.symbol !== null && entry.symbol !== undefined)
    .map((entry) => ({ path: entry.path, symbol: entry.symbol }));
  const json = JSON.stringify(trimmed, null, 2) + "\n";
  return await prettier.format(json, { filepath: generatedFilePath });
}
