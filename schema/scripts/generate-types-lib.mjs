// Shared logic for generating the schema/src/generated/ir.ts TypeScript
// types from schema/ir/v1/schema.json. Used by both the `generate:types`
// CLI script and the "generated types are not stale" vitest check, so the
// two can never drift apart from each other.
import { compile } from "json-schema-to-typescript";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const schemaPath = path.join(here, "..", "ir", "v1", "schema.json");
export const generatedFilePath = path.join(here, "..", "src", "generated", "ir.ts");

export const banner = `/**
 * This file was automatically generated from schema/ir/v1/schema.json.
 * DO NOT EDIT MANUALLY — run \`npm run generate:types\` in schema/ to
 * regenerate it, then commit the result.
 */

`;

/** Compiles ir/v1/schema.json into the full generated file contents (banner + TS). */
export async function generateIrTypesFile() {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));

  // json-schema-to-typescript can't compile a root schema that is itself a
  // bare `$ref` into a recursive `$defs` entry (the union IRNode is
  // recursive: layout/overlay/list nodes contain IRNode children). Instead,
  // compile the `$defs.irNode` subschema directly as the root — same object
  // identity as what `children`/`slots`/etc already `$ref` to, so the tool
  // produces a single `IRNode` type instead of a duplicate `IRNode`/`IrNode`
  // pair.
  const root = schema.$defs.irNode;
  root.$defs = schema.$defs;

  const ts = await compile(root, "IRNode", {
    bannerComment: "",
    additionalProperties: false,
    style: { singleQuote: false },
    unreachableDefinitions: false,
    cwd: path.dirname(schemaPath),
  });
  return banner + ts;
}
