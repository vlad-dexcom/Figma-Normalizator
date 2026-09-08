// Snapshot test: runs every fixture scenario's mock tree through the real
// extractor and asserts the result deep-equals its frozen
// `expected.ir.json`. This is the corpus's main regression guard — any
// unintended change to extractor output fails here with a clear diff.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { scenarios } from "../corpus/index.js";
import { expectedIrPath } from "../scenario.js";
import { runScenario } from "../runScenario.js";

describe("fixture corpus snapshots", () => {
  for (const scenario of scenarios) {
    it(`${scenario.name}: matches its frozen expected.ir.json (${scenario.description})`, async () => {
      const actual = await runScenario(scenario);
      const expected = JSON.parse(await readFile(expectedIrPath(scenario), "utf8"));
      expect(actual).toEqual(expected);
    });
  }
});
