// Shared logic for generating mappings/src/generated/component-map.json from
// mappings/component-map.yaml. Used by both the `generate:map` CLI script and
// the "generated JSON is not stale" vitest check, so the two can never drift
// apart from each other.
//
// Why generate JSON instead of parsing YAML at plugin runtime: the plugin
// bundle runs inside Figma's plugin sandbox (no Node `fs`, and we'd rather
// not ship a YAML parser into the sandboxed bundle just to parse a file that
// never changes at runtime). Parsing once at build time with `js-yaml` (a
// devDependency of this package) and checking in the resulting JSON mirrors
// how `schema/` checks in its generated `ir.ts` — see schema/scripts.
import yaml from "js-yaml";
import prettier from "prettier";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const yamlPath = path.join(here, "..", "component-map.yaml");
export const generatedFilePath = path.join(here, "..", "src", "generated", "component-map.json");

/**
 * Parses component-map.yaml and returns the generated JSON file contents (as
 * a string). Note: this is checked in as plain JSON (no banner comment,
 * since JSON has no comment syntax) — see mappings/README.md and this
 * script's header comment for the "do not hand-edit" note instead.
 */
export async function generateComponentMapJson() {
  const raw = await readFile(yamlPath, "utf8");
  const parsed = yaml.load(raw);
  const json = JSON.stringify(parsed, null, 2) + "\n";
  return await prettier.format(json, { filepath: generatedFilePath });
}
