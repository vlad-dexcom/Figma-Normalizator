// Public entry point for @figma-normalizator/schema.
//
// Consumers should import IR node types from here, and use
// `irSchemaV1` (the raw JSON Schema document) if they need to validate IR
// documents at runtime (e.g. with ajv). Do not hand-edit `generated/ir.ts` —
// it is produced by `npm run generate:types` from `ir/v1/schema.json`.
import irSchemaV1Json from "../ir/v1/schema.json" with { type: "json" };

export * from "./generated/ir.js";

/** IR schema version implemented by this package's generated types. */
export const IR_SCHEMA_VERSION = 1;

/** The raw IR v1 JSON Schema document, for runtime validation (e.g. ajv). */
export const irSchemaV1 = irSchemaV1Json as Record<string, unknown>;
