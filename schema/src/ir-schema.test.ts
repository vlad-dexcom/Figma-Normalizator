import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import {
  generateIrTypesFile,
  generatedFilePath,
  schemaPath,
} from "../scripts/generate-types-lib.mjs";
import { IR_SCHEMA_VERSION, irSchemaV1 } from "./index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "..", "fixtures");

describe("schema package", () => {
  it("exports IR types and the raw v1 schema", async () => {
    const mod = await import("./index.js");
    expect(mod).toBeDefined();
    expect(IR_SCHEMA_VERSION).toBe(1);
    expect(irSchemaV1["$id"]).toBe("https://schemas.figma-normalizator.dev/ir/v1/schema.json");
  });

  it("every fixture validates against ir/v1/schema.json", async () => {
    const ajv = new Ajv2020({ strict: true, allowUnionTypes: true });
    const validate = ajv.compile(irSchemaV1);

    const fixtureFiles = (await readdir(fixturesDir)).filter((f) => f.endsWith(".json"));
    expect(fixtureFiles.length).toBeGreaterThan(0);

    for (const file of fixtureFiles) {
      const contents = JSON.parse(await readFile(path.join(fixturesDir, file), "utf8"));
      const valid = validate(contents);
      if (!valid) {
        throw new Error(
          `${file} failed schema validation: ${JSON.stringify(validate.errors, null, 2)}`,
        );
      }
      expect(valid).toBe(true);
    }
  });

  it("generated types (src/generated/ir.ts) are not stale relative to the schema", async () => {
    const expected = await generateIrTypesFile();
    const actual = await readFile(generatedFilePath, "utf8");
    expect(
      actual,
      "src/generated/ir.ts is stale — run `npm run generate:types` in schema/ and commit the diff",
    ).toBe(expected);
  });

  it("rejects a node with an unknown extra property (additionalProperties: false)", async () => {
    const ajv = new Ajv2020({ strict: true, allowUnionTypes: true });
    const validate = ajv.compile(irSchemaV1);
    const invalid = {
      kind: "asset",
      assetType: "icon",
      exportRef: "ic_test",
      width: 24,
      height: 24,
      unexpectedField: true,
      source: { nodeId: "1:1", fileKey: "abc", version: "1", path: [] },
    };
    expect(validate(invalid)).toBe(false);
  });

  it("schema/ir/v1/schema.json exists at the expected versioned path", async () => {
    await expect(readFile(schemaPath, "utf8")).resolves.toBeTruthy();
  });
});
