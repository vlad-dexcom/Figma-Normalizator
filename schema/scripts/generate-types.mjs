#!/usr/bin/env node
// Regenerates schema/src/generated/ir.ts from schema/ir/v1/schema.json.
//
// Do NOT hand-edit the generated file: run `npm run generate:types` (from
// the schema/ package) after changing the schema, then commit the diff.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { generateIrTypesFile, generatedFilePath } from "./generate-types-lib.mjs";

async function main() {
  const contents = await generateIrTypesFile();
  await writeFile(generatedFilePath, contents);
  console.log(`Wrote ${path.relative(process.cwd(), generatedFilePath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
