import { describe, expect, it } from "vitest";
import { buildExportFilename } from "../filename.js";

describe("buildExportFilename", () => {
  it("builds {fileKey}_{nodeId}_{version}.ir.json from the IR source fields", () => {
    expect(buildExportFilename({ fileKey: "abc123", nodeId: "42:7", version: "3" })).toBe(
      "abc123_42-7_3.ir.json",
    );
  });

  it("sanitizes filesystem-unsafe characters (colons, slashes, spaces)", () => {
    expect(
      buildExportFilename({ fileKey: "file/key with spaces", nodeId: "1:2", version: "v1" }),
    ).toBe("file-key-with-spaces_1-2_v1.ir.json");
  });

  it("falls back to placeholder segments when a field is empty", () => {
    expect(buildExportFilename({ fileKey: "", nodeId: "", version: "" })).toBe(
      "unknown-file_unknown-node_unknown-version.ir.json",
    );
  });
});
