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
 *  - "unresolvable-alias-chain": extractor (tokens.ts) — a bound Figma
 *    variable's value is a VARIABLE_ALIAS chain that is circular, or
 *    exceeds the max alias-hop depth, and so could not be followed to a
 *    literal value.
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
 *  - "unreadable-component-properties": extractor (instance.ts, also
 *    guarded in list.ts) — `node.componentProperties` is a Figma Plugin
 *    API getter that can throw when the underlying component set has
 *    broken/conflicting variant definitions in the Figma file itself.
 *    This is a data-integrity issue in the file, not a plugin bug — fix
 *    it in Figma (Assets panel → repair/republish the component set).
 *  - "mixed-value": extractor (tokens.ts/index.ts) — a property genuinely
 *    varies internally within the node (Figma's `figma.mixed` sentinel),
 *    e.g. independent per-corner radii, and so cannot be represented as a
 *    single token/value. Also a Figma-file-side authoring choice to
 *    reconsider, not a plugin bug.
 *  - "absolute-positioning": extractor (overlay.ts) — children collapsed
 *    into an `overlay` node (absolutely positioned inside an Auto Layout
 *    parent). Structurally handled either way; this entry exists purely so
 *    designers see it surfaced in the warnings list too.
 */
const REASON_LABELS: Record<string, string> = {
  "unbound-literal": "Unbound literal value",
  "unresolvable-alias-chain": "Unresolvable variable alias chain",
  "unmapped-variant": "Unmapped variant",
  "unmapped-component": "Unmapped component",
  "missing-main-component": "Missing main component",
  "unreadable-component-properties": "Unreadable component properties",
  "mixed-value": "Mixed value",
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

/**
 * Render-ready view of the warnings panel for a given `collapsed` toggle
 * state. Kept as a pure function (rather than deciding this inline in
 * `ui.ts`) so the "collapse all" behavior — hide individual entries but
 * keep each group's title + count visible, so a designer still sees *that*
 * there are warnings without the per-entry list crowding the panel (e.g.
 * many `unmapped-component` entries on a screen with few/no design-system
 * components) — is testable headlessly, matching this module's existing
 * DOM-free convention.
 */
export interface WarningsViewModel {
  /** Whether the "Collapse all"/"Expand all" toggle button should be shown at all (no point when there are no warnings). */
  hasWarnings: boolean;
  /** Label for the toggle button, reflecting the *next* state a click would produce. */
  toggleLabel: string;
  /** Whether each group's individual entries should currently be rendered (false while collapsed — group titles/counts still render regardless). */
  entriesVisible: boolean;
  groups: WarningGroup[];
}

export function buildWarningsViewModel(
  entries: readonly UnresolvedEntry[],
  collapsed: boolean,
): WarningsViewModel {
  const groups = groupWarningsByReason(entries);
  return {
    hasWarnings: groups.length > 0,
    toggleLabel: collapsed ? "Expand all" : "Collapse all",
    entriesVisible: !collapsed,
    groups,
  };
}
