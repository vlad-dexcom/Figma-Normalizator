// Guards + diagnostics for Figma's `figma.mixed` sentinel, a JS `Symbol`
// the real Plugin API returns for node properties that vary internally
// within a single node and therefore can't be represented as one scalar
// value (e.g. `cornerRadius` with independent per-corner radii, or `fills`
// when a node has multiple sets of fills). Structured clone — which
// `figma.ui.postMessage` uses under the hood — cannot serialize a `Symbol`,
// so any unguarded raw read of one of these properties that reaches the
// posted IR crashes the whole panel with an opaque "Cannot unwrap symbol"
// error instead of a clear, per-node warning.
//
// This module intentionally does NOT import `@figma/plugin-typings` (or
// reference `PluginAPI["mixed"]` itself): the extractor's own `FigmaNode`/
// `FigmaAPI` types in `types.ts` are a hand-rolled structural subset kept
// deliberately type-agnostic and test-friendly (see that file's header
// comment), and `figma.mixed` is documented to simply be a unique `Symbol`
// value — so a plain `typeof value === "symbol"` check is the correct,
// implementation-independent way to detect it here.

/** True when `value` is Figma's `figma.mixed` sentinel (or any other Symbol). */
export function isMixed(value: unknown): value is symbol {
  return typeof value === "symbol";
}

/**
 * Recursively walks `value` (a plain object/array tree, e.g. the IR about
 * to be posted to the UI) looking for a stray `Symbol` anywhere in it, and
 * returns the path of object keys / array indices leading to it, or `null`
 * if none is found.
 *
 * This is the defense-in-depth safety net for read sites this module (or a
 * future one) doesn't yet know need an `isMixed` guard — the same class of
 * "the real Plugin API misbehaves in a way our types don't capture" bug as
 * the `componentProperties`-getter-throws fix (see `instance.ts`'s
 * `safeReadComponentProperties`). Rather than letting a stray symbol reach
 * `postMessage` and crash with an opaque structured-clone error, callers
 * can use this to identify exactly which property leaked one and turn it
 * into a clear, actionable diagnostic.
 */
export function findSymbolPath(value: unknown, path: string[] = []): string[] | null {
  if (isMixed(value)) return path;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = findSymbolPath(value[i], [...path, String(i)]);
      if (found) return found;
    }
    return null;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const found = findSymbolPath(child, [...path, key]);
      if (found) return found;
    }
    return null;
  }

  return null;
}
