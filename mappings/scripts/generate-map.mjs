#!/usr/bin/env node
// Regenerates mappings/src/generated/component-map.json from
// mappings/component-map.yaml.
//
// Do NOT hand-edit the generated file: run `npm run generate:map` (from the
// mappings/ package) after changing component-map.yaml, then commit the diff.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { generateComponentMapJson, generatedFilePath } from "./generate-map-lib.mjs";

async function main() {
  const contents = await generateComponentMapJson();
  await writeFile(generatedFilePath, contents);
  console.log(`Wrote ${path.relative(process.cwd(), generatedFilePath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
