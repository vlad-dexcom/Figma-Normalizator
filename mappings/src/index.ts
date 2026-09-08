// Public entry point for @figma-normalizator/mappings.
//
// Consumers (the plugin-extractor) should import `componentMap` (the parsed
// component-map.yaml, pre-generated to JSON at build time — see
// scripts/generate-map.mjs) plus the lookup helpers below, rather than
// reading/parsing the YAML themselves.
import componentMapJson from "./generated/component-map.json" with { type: "json" };
import type {
  ComponentMap,
  ComponentMapEntry,
  ComponentMapValueEntry,
  ComponentMapVariantGroup,
} from "./types.js";

export * from "./types.js";

/** The parsed component-map.yaml, pre-generated to JSON at build time. */
export const componentMap = componentMapJson as unknown as ComponentMap;

/** Looks up a component-map entry by its exact Figma component set name. */
export function findComponentMapEntry(figmaComponentSetName: string): ComponentMapEntry | null {
  return (
    componentMap.entries.find((entry) => entry.figmaComponentSet === figmaComponentSetName) ?? null
  );
}

/**
 * Applies any `routing` rules on `entry` given the instance's resolved
 * VARIANT-type property values (Figma property name -> raw variant value,
 * e.g. `{ Type: "Icon Only" }`). Returns the routed-to entry (e.g. Buttons
 * with Type=Icon Only routes to the "Buttons (Type=Icon Only)" entry), or
 * `entry` unchanged if no routing rule matches.
 *
 * `redirectTo` is authored as a human-readable string of the form
 * `"<figmaComponentSet> -> <ComposeComponent>"` (see component-map.yaml); we
 * only need the component set name half to re-look-up the target entry.
 */
export function resolveRouting(
  entry: ComponentMapEntry,
  figmaVariantValues: Record<string, string>,
): ComponentMapEntry {
  for (const rule of entry.routing ?? []) {
    if (figmaVariantValues[rule.when.figmaProperty] === rule.when.figmaValue) {
      const targetSetName = rule.redirectTo.split("->")[0]?.trim();
      const target = targetSetName ? findComponentMapEntry(targetSetName) : null;
      if (target) return target;
    }
  }
  return entry;
}

export type VariantResolution =
  | { status: "mapped"; composeProperty: string; composeValue: string | boolean }
  | { status: "unmapped"; composeProperty?: string; reason: string }
  | { status: "no-mapping" };

/**
 * Resolves a single Figma VARIANT-type property value (e.g.
 * `figmaProperty: "Style", figmaValue: "Primary"`) against a component-map
 * entry's `variants` groups. Never guesses: an unmapped or unknown value
 * always resolves to `{ status: "unmapped" | "no-mapping" }` rather than a
 * fallback value.
 */
export function resolveVariantValue(
  entry: ComponentMapEntry,
  figmaProperty: string,
  figmaValue: string,
): VariantResolution {
  const group: ComponentMapVariantGroup | undefined = entry.variants?.find(
    (v) => v.figmaProperty === figmaProperty,
  );
  if (!group) return { status: "no-mapping" };

  if (group.status === "unmapped") {
    return {
      status: "unmapped",
      composeProperty: group.composeProperty,
      reason: group.reason ?? `No Compose mapping exists for Figma property "${figmaProperty}".`,
    };
  }

  const match: ComponentMapValueEntry | undefined = group.values?.find(
    (v) => v.figmaValue === figmaValue,
  );
  if (!match) return { status: "no-mapping" };

  if (match.status === "unmapped" || match.composeValue === undefined) {
    return {
      status: "unmapped",
      composeProperty: group.composeProperty,
      reason:
        match.reason ??
        `Figma value "${figmaValue}" for property "${figmaProperty}" has no Compose equivalent.`,
    };
  }

  return {
    status: "mapped",
    composeProperty: group.composeProperty ?? figmaProperty,
    composeValue: match.composeValue,
  };
}

/**
 * Resolves a state-based (non-VARIANT-enum) mapping, e.g. Switch's
 * State=On/Off -> checked=true/false.
 */
export function resolveStateValue(
  entry: ComponentMapEntry,
  figmaProperty: string,
  figmaValue: string,
): VariantResolution {
  const group = entry.stateMapping?.find((v) => v.figmaProperty === figmaProperty);
  if (!group) return { status: "no-mapping" };
  const match = group.values.find((v) => v.figmaValue === figmaValue);
  if (!match) return { status: "no-mapping" };
  return {
    status: "mapped",
    composeProperty: group.composeProperty,
    composeValue: match.composeValue,
  };
}
