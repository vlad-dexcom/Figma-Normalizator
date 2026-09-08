import { describe, expect, it } from "vitest";
import { canonicalize, canonicalStringify } from "../canonical.js";

describe("canonicalize", () => {
  it("sorts object keys recursively, regardless of insertion order", () => {
    const a = { b: 1, a: 2, c: { z: 1, y: 2 } };
    const b = { a: 2, c: { y: 2, z: 1 }, b: 1 };

    expect(canonicalize(a)).toEqual(canonicalize(b));
    expect(JSON.stringify(canonicalize(a))).toBe(JSON.stringify(canonicalize(b)));
  });

  it("preserves array element order", () => {
    const value = { list: [{ b: 1, a: 2 }, "x", 3] };
    expect(canonicalize(value)).toEqual({ list: [{ a: 2, b: 1 }, "x", 3] });
  });

  it("leaves primitives and null untouched", () => {
    expect(canonicalize(null)).toBeNull();
    expect(canonicalize(42)).toBe(42);
    expect(canonicalize("hi")).toBe("hi");
    expect(canonicalize(true)).toBe(true);
  });
});

describe("canonicalStringify", () => {
  it("produces byte-identical output for two differently-ordered but equal objects", () => {
    const built1 = { kind: "layout", direction: "row", children: [], gap: null };
    const built2: Record<string, unknown> = {};
    built2.gap = null;
    built2.children = [];
    built2.direction = "row";
    built2.kind = "layout";

    expect(canonicalStringify(built1)).toBe(canonicalStringify(built2));
  });

  it("supports an indent argument like JSON.stringify", () => {
    expect(canonicalStringify({ b: 1, a: 2 }, 2)).toBe('{\n  "a": 2,\n  "b": 1\n}');
  });
});
