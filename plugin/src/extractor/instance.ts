// Instance resolution: maps a Figma component instance to a design-system
// component + resolved props/slots via mappings/component-map.yaml, and
// stops recursion at the instance boundary. See concern #4 in the
// plugin-extractor task description.
import type {
  InstanceNode as IRInstanceNode,
  PropValue,
  UnresolvedEntry,
} from "@figma-normalizator/schema";
import {
  findComponentMapEntry,
  resolveRouting,
  resolveStateValue,
  resolveVariantValue,
} from "@figma-normalizator/mappings";
import type { ComponentMapEntry } from "@figma-normalizator/mappings";
import type { FigmaComponentPropertyValue, FigmaNode } from "./types.js";
import { buildProvenance, type ProvenanceContext } from "./provenance.js";
import { resolveSizing } from "./layout.js";

/** Strips Figma's `#<uniqueId>` suffix (present on non-VARIANT component property names). */
function stripSuffix(rawName: string): string {
  return rawName.replace(/#[^#]*$/, "");
}

/**
 * Converts a raw Figma property name (which may start with emoji/punctuation,
 * e.g. "✏️ CTA Label") into a camelCase compose parameter name, e.g.
 * "leadingIcon", "hasLabel". Used for TEXT/BOOLEAN/INSTANCE_SWAP properties,
 * which component-map.yaml deliberately doesn't cover (see mappings/README.md)
 * — that mapping is documented there as this extractor's job.
 */
function toCamelCase(rawName: string): string {
  const stripped = stripSuffix(rawName).replace(/^[^\p{L}\p{N}]+/u, "");
  const words = stripped.split(/[\s_-]+/).filter(Boolean);
  return words
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

/** Walks up from a main component to find its owning ComponentSetNode's name, falling back to the component's own name for componentless-variant components. */
function resolveComponentSetName(mainComponent: FigmaNode): string {
  let ancestor = mainComponent.parent ?? null;
  while (ancestor) {
    if (ancestor.type === "COMPONENT_SET") return ancestor.name;
    ancestor = ancestor.parent ?? null;
  }
  return mainComponent.name;
}

function buildInstanceLayoutFields(node: FigmaNode, parent: FigmaNode | undefined) {
  const sizing = resolveSizing(node, parent);
  const partial: IRInstanceNode["layout"] = {};
  const sizingPartial: NonNullable<IRInstanceNode["layout"]["sizing"]> = {};
  if (sizing.width !== "fixed") sizingPartial.width = sizing.width;
  if (sizing.height !== "fixed") sizingPartial.height = sizing.height;
  if (Object.keys(sizingPartial).length > 0) partial.sizing = sizingPartial;
  return partial;
}

export async function buildInstanceNode(
  node: FigmaNode,
  parent: FigmaNode | undefined,
  ctx: ProvenanceContext,
): Promise<{ node: IRInstanceNode; unresolved: UnresolvedEntry[] }> {
  const unresolved: UnresolvedEntry[] = [];

  const mainComponent = node.getMainComponentAsync ? await node.getMainComponentAsync() : null;
  const figmaComponentSetName = mainComponent ? resolveComponentSetName(mainComponent) : node.name;
  const figmaComponentKey = mainComponent?.key ?? mainComponent?.id ?? node.id;

  // `getMainComponentAsync()` resolving to null (main component deleted, or
  // from a library that isn't available) is the closest signal Figma's
  // plugin API exposes to a "detached instance". A *true* detached instance
  // (Right-click > Detach Instance) is structurally indistinguishable from
  // any other FRAME once detached — its type simply stops being INSTANCE
  // and every instance-specific field (including this one) disappears
  // along with it, so there's no reliable way to flag that case from here
  // or anywhere else in this extractor. See plugin/README.md and the PR
  // description for the full explanation of this limitation.
  if (node.getMainComponentAsync && !mainComponent) {
    unresolved.push({
      nodeId: node.id,
      reason: "missing-main-component",
      detail:
        "This instance's main component could not be resolved (deleted, or in a library that isn't available).",
    });
  }

  const entry: ComponentMapEntry | null = findComponentMapEntry(figmaComponentSetName);

  const componentProperties = node.componentProperties ?? {};
  const variantRawValues: Record<string, string> = {};
  for (const [rawName, prop] of Object.entries(componentProperties)) {
    if (prop.type === "VARIANT") {
      variantRawValues[stripSuffix(rawName)] = String(prop.value);
    }
  }

  const routedEntry = entry ? resolveRouting(entry, variantRawValues) : null;
  const component = routedEntry?.compose?.component ?? null;

  if (!entry) {
    unresolved.push({
      nodeId: node.id,
      reason: "unmapped-component",
      detail: `No component-map entry exists for Figma component set "${figmaComponentSetName}".`,
    });
  } else if (!routedEntry?.compose) {
    unresolved.push({
      nodeId: node.id,
      reason: "unmapped-component",
      detail:
        entry.reason ??
        `Figma component set "${figmaComponentSetName}" has no Compose component mapped yet.`,
    });
  }

  const props: Record<string, PropValue> = {};
  const slots: Record<string, IRInstanceNode["slots"][string]> = {};

  const textProperties: [string, FigmaComponentPropertyValue][] = [];

  for (const [rawName, prop] of Object.entries(componentProperties)) {
    const base = stripSuffix(rawName);
    if (prop.type === "VARIANT") {
      if (!routedEntry) continue; // unmapped-component already flagged above.

      const stateResult = resolveStateValue(routedEntry, base, String(prop.value));
      if (stateResult.status === "mapped") {
        props[stateResult.composeProperty] = { value: stateResult.composeValue };
        continue;
      }

      const variantResult = resolveVariantValue(routedEntry, base, String(prop.value));
      if (variantResult.status === "no-mapping") {
        // Not a design-system-facing property at all (e.g. a pure routing
        // switch like Buttons' "Type"), not an omission — nothing to flag.
        continue;
      }
      if (variantResult.status === "mapped") {
        props[variantResult.composeProperty] = {
          variant: variantResult.composeValue as string,
          from: `${base}=${String(prop.value)}`,
        };
      } else {
        const key = variantResult.composeProperty ?? toCamelCase(base);
        props[key] = { variant: null, from: `${base}=${String(prop.value)}` };
        unresolved.push({
          nodeId: node.id,
          reason: "unmapped-variant",
          detail: variantResult.reason,
        });
      }
    } else if (prop.type === "TEXT") {
      textProperties.push([rawName, prop]);
    } else if (prop.type === "BOOLEAN") {
      props[toCamelCase(base)] = { value: prop.value };
    } else if (prop.type === "INSTANCE_SWAP") {
      // Resolving the swapped-in component's own content is deferred (see
      // PR description) — we surface the slot's existence, always empty for
      // now, rather than guessing at its content.
      slots[toCamelCase(base)] = null;
    }
  }

  // A single TEXT property is, by far-and-away Figma convention, the
  // component's primary label/content — surface it as `text`. Multiple TEXT
  // properties (rare) fall back to their own camelCase names.
  if (textProperties.length === 1) {
    const only = textProperties[0];
    if (only) props.text = { value: only[1].value };
  } else {
    for (const [rawName, prop] of textProperties) {
      props[toCamelCase(rawName)] = { value: prop.value };
    }
  }

  return {
    node: {
      kind: "instance",
      component,
      figmaComponentSetName,
      figmaComponentKey,
      props,
      slots,
      layout: buildInstanceLayoutFields(node, parent),
      unresolved,
      source: buildProvenance(node, ctx),
    },
    unresolved,
  };
}
