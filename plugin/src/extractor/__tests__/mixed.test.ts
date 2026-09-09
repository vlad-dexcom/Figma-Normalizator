import { describe, expect, it } from "vitest";
import { findSymbolPath, isMixed } from "../mixed.js";

describe("isMixed", () => {
  it("returns true for a Symbol (figma.mixed is always a Symbol)", () => {
    expect(isMixed(Symbol("figma.mixed"))).toBe(true);
  });

  it("returns false for scalars, objects, arrays, null, and undefined", () => {
    expect(isMixed(4)).toBe(false);
    expect(isMixed("string")).toBe(false);
    expect(isMixed(true)).toBe(false);
    expect(isMixed({})).toBe(false);
    expect(isMixed([])).toBe(false);
    expect(isMixed(null)).toBe(false);
    expect(isMixed(undefined)).toBe(false);
  });
});

describe("findSymbolPath", () => {
  it("returns null for a plain object/array tree with no symbols", () => {
    expect(
      findSymbolPath({
        a: 1,
        b: "text",
        c: [1, 2, { d: null }],
        e: { f: [true, false] },
      }),
    ).toBeNull();
  });

  it("returns an empty path when the top-level value itself is a symbol", () => {
    expect(findSymbolPath(Symbol("mixed"))).toEqual([]);
  });

  it("finds a symbol nested inside a top-level property", () => {
    const value = { cornerRadius: Symbol("mixed"), other: 1 };
    expect(findSymbolPath(value)).toEqual(["cornerRadius"]);
  });

  it("finds a symbol nested inside an array", () => {
    const value = { children: [{ ok: true }, { cornerRadius: Symbol("mixed") }] };
    expect(findSymbolPath(value)).toEqual(["children", "1", "cornerRadius"]);
  });

  it("finds a symbol nested several levels deep", () => {
    const value = {
      nodes: [
        {
          kind: "layout",
          children: [
            {
              kind: "layout",
              background: { token: null, value: Symbol("mixed") },
            },
          ],
        },
      ],
    };
    expect(findSymbolPath(value)).toEqual(["nodes", "0", "children", "0", "background", "value"]);
  });
});
