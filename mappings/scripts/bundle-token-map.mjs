#!/usr/bin/env node
// Regenerates mappings/src/generated/token-map.json (a trimmed { path,
// symbol }[] array) from mappings/token-map/android-avalon.token-map.json.
//
// Do NOT hand-edit the generated file: run `npm run bundle:token-map` (from
// the mappings/ package) after regenerating android-avalon.token-map.json,
// then commit the diff.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { generateTokenMapBundleJson, generatedFilePath } from "./bundle-token-map-lib.mjs";

async function main() {
  const contents = await generateTokenMapBundleJson();
  await writeFile(generatedFilePath, contents);
  console.log(`Wrote ${path.relative(process.cwd(), generatedFilePath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
