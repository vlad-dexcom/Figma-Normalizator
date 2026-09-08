// Validates every fixture's frozen IR against schema/ir/v1/schema.json,
// reusing the same ajv-based pattern as schema/src/ir-schema.test.ts. This
// catches a fixture that's internally consistent with extractor output but
// happens to violate the schema (e.g. after a schema change lands without
// updating the extractor to match).
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { irSchemaV1 } from "@figma-normalizator/schema";
import { scenarios } from "../corpus/index.js";
import { expectedIrPath } from "../scenario.js";

describe("fixture corpus schema validation", () => {
  const ajv = new Ajv2020({ strict: true, allowUnionTypes: true });
  const validate = ajv.compile(irSchemaV1);

  for (const scenario of scenarios) {
    it(`${scenario.name}: every root IR node validates against ir/v1/schema.json`, async () => {
      const expected = JSON.parse(await readFile(expectedIrPath(scenario), "utf8")) as {
        nodes: unknown[];
      };
      expect(expected.nodes.length).toBeGreaterThan(0);

      for (const node of expected.nodes) {
        const valid = validate(node);
        if (!valid) {
          throw new Error(
            `${scenario.name}/expected.ir.json failed schema validation: ${JSON.stringify(
              validate.errors,
              null,
              2,
            )}`,
          );
        }
      }
    });
  }
});
