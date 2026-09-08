// Pure warning-grouping logic for the panel's warnings list. Kept separate
// from `ui.ts` (which only does DOM wiring) so it's testable headlessly
// without a browser/jsdom environment — see plugin-validator-ui task notes
// on why ui.ts itself stays thin.
import type { UnresolvedEntry } from "@figma-normalizator/schema";

/**
 * Human-readable labels for every `UnresolvedEntry.reason` the extractor (or
 * this UI layer, for reasons it derives itself — see below) currently
 * emits. Kept as a lookup rather than a switch so adding a new reason is a
 * one-line change.
 *
 * Provenance of each reason:
 *  - "unbound-literal": extractor (tokens.ts) — a color/spacing/typography
 *    value with no bound Figma variable/style.
 *  - "unmapped-variant": extractor (instance.ts) — a VARIANT property value
 *    with no component-map.yaml routing.
 *  - "unmapped-component": extractor (instance.ts) — a component set with no
 *    component-map.yaml entry (or no mapped Compose component) at all.
 *  - "missing-main-component": extractor (instance.ts) — an INSTANCE node
 *    whose `getMainComponentAsync()` resolved to null (main component
 *    deleted, or from an unavailable library). This is the closest
 *    API-level signal to "detached instance" that Figma's plugin API
 *    actually exposes; a true detached instance has no distinguishing
 *    signal at all (its type becomes plain FRAME) — see README/PR notes.
 *  - "absolute-positioning": extractor (overlay.ts) — children collapsed
 *    into an `overlay` node (absolutely positioned inside an Auto Layout
 *    parent). Structurally handled either way; this entry exists purely so
 *    designers see it surfaced in the warnings list too.
 */
const REASON_LABELS: Record<string, string> = {
  "unbound-literal": "Unbound literal value",
  "unmapped-variant": "Unmapped variant",
  "unmapped-component": "Unmapped component",
  "missing-main-component": "Missing main component",
  "absolute-positioning": "Absolute positioning inside Auto Layout",
};

/** Falls back to a title-cased rendering of the raw reason code for forward-compat with reasons this UI doesn't know about yet. */
export function labelForReason(reason: string): string {
  const known = REASON_LABELS[reason];
  if (known) return known;
  return reason
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export interface WarningGroup {
  reason: string;
  label: string;
  entries: UnresolvedEntry[];
}

/**
 * Groups a flat `unresolved[]` list by `reason`, in order of first
 * appearance, with each group's entries kept in their original relative
 * order. Deterministic given the same input (no re-sorting by count/label)
 * so grouping output is stable across re-exports of the same IR.
 */
export function groupWarningsByReason(entries: readonly UnresolvedEntry[]): WarningGroup[] {
  const order: string[] = [];
  const byReason = new Map<string, UnresolvedEntry[]>();

  for (const entry of entries) {
    if (!byReason.has(entry.reason)) {
      order.push(entry.reason);
      byReason.set(entry.reason, []);
    }
    byReason.get(entry.reason)?.push(entry);
  }

  return order.map((reason) => ({
    reason,
    label: labelForReason(reason),
    entries: byReason.get(reason) ?? [],
  }));
}
