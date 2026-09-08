#!/usr/bin/env node
// Regenerates `expected.ir.json` for every scenario in `src/corpus/`, by
// running the real extractor against each scenario's mock tree and freezing
// its output. This is for *deliberate* use only — after intentionally
// changing extractor behavior and reviewing the new output for
// correctness — never run automatically in CI. See fixtures/README.md.
//
// Usage: npm run fixtures:update -w fixtures
import { writeFile } from "node:fs/promises";
import prettier from "prettier";
import { scenarios } from "../src/corpus/index.js";
import { expectedIrPath } from "../src/scenario.js";
import { runScenario } from "../src/runScenario.js";

async function main(): Promise<void> {
  for (const scenario of scenarios) {
    const result = await runScenario(scenario);
    const path = expectedIrPath(scenario);
    const config = await prettier.resolveConfig(path);
    const formatted = await prettier.format(JSON.stringify(result), {
      ...config,
      parser: "json",
      filepath: path,
    });
    await writeFile(path, formatted, "utf8");
    console.log(`wrote ${scenario.name}/expected.ir.json`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
