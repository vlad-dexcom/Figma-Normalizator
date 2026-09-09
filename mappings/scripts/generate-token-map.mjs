#!/usr/bin/env node
// Generates a mappings/token-map/<name>.token-map.json artifact from a real
// figma-tokens intermediate tokens.json (e.g.
// /path/to/Android_Stelo/tools/figma-tokens/json/tokens.json). See
// mappings/token-map/README.md for what this artifact is and why.
//
// Usage:
//   node scripts/generate-token-map.mjs --input <path-to-tokens.json> --name android-stelo
//
// Do NOT hand-edit the generated file: re-run this script and commit the
// diff. The (large, multi-repo-specific) input tokens.json is never itself
// committed to this repo — only the flattened output artifact is.
import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { generateTokenMapJson, defaultOutputPath } from "./generate-token-map-lib.mjs";

function parseArgs(argv) {
  const args = { collections: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[++i];
    else if (arg === "--name") args.name = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else if (arg === "--collections") args.collections = argv[++i].split(",");
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error(
      "Usage: node scripts/generate-token-map.mjs --input <path-to-tokens.json> --name <output-name> [--output <path>] [--collections base,typography]",
    );
    process.exit(1);
  }
  if (!args.name && !args.output) {
    console.error("Either --name (e.g. android-stelo) or --output <path> is required.");
    process.exit(1);
  }

  const raw = await readFile(args.input, "utf8");
  const tokensJson = JSON.parse(raw);

  const outputPath = args.output ?? defaultOutputPath(args.name);
  const contents = await generateTokenMapJson(tokensJson, {
    collections: args.collections,
    outputPath,
  });

  await writeFile(outputPath, contents);
  console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
