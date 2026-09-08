import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

const componentMapPath = fileURLToPath(new URL("../component-map.yaml", import.meta.url));

describe("component-map.yaml", () => {
  it("parses as valid YAML and contains entries", () => {
    const raw = readFileSync(componentMapPath, "utf8");
    const parsed = yaml.load(raw) as Record<string, unknown>;

    expect(parsed).toBeDefined();
    expect(Array.isArray(parsed.entries)).toBe(true);
    expect((parsed.entries as unknown[]).length).toBeGreaterThan(0);
  });

  it("gives every entry a figmaComponentSet name and a mapped/unmapped status", () => {
    const raw = readFileSync(componentMapPath, "utf8");
    const parsed = yaml.load(raw) as { entries: Array<Record<string, unknown>> };

    for (const entry of parsed.entries) {
      expect(typeof entry.figmaComponentSet).toBe("string");
      expect(["mapped", "unmapped"]).toContain(entry.status);
    }
  });
});
