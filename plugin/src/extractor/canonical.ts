// Canonical (key-order-independent) serialization for IR output. Every
// extractor function already builds its result objects with a fixed,
// hand-written property order (see the object literals in index.ts,
// instance.ts, etc.), so `JSON.stringify` on a *freshly extracted* IR tree
// is already deterministic for a given code path. This module exists as an
// explicit, defense-in-depth guarantee on top of that: it normalizes any IR
// value (or arbitrary JSON-like value) to a single canonical form —
// recursively sorting every object's keys — before stringifying, so that
// two structurally-identical IR trees built via different code paths (or a
// future refactor that reorders a literal, or a schema change that assigns
// fields conditionally) still serialize byte-identically. Array order is
// never touched: array order is meaningful IR content (e.g. `children`,
// `path`), not incidental object-literal ordering.
export type JSONValue =
  string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively rebuilds `value`, sorting the keys of every plain object it
 * contains (lexicographically, via `Array.prototype.sort`'s default UTF-16
 * code-unit ordering — stable and locale-independent). Arrays keep their
 * original element order.
 */
export function canonicalize<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const sortedKeys = Object.keys(value).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalize(value[key]);
    }
    return result as unknown as T;
  }
  return value;
}

/**
 * `JSON.stringify(canonicalize(value), null, indent)` — the single
 * serialization step every export path (file download, clipboard, the
 * content-hash version in `versioning.ts`) should go through, so "export
 * twice, diff the files" is guaranteed to succeed for an unchanged
 * selection.
 */
export function canonicalStringify(value: unknown, indent?: number): string {
  return JSON.stringify(canonicalize(value), null, indent);
}
