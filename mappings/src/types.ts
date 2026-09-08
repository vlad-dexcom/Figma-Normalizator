// Typed shape of the parsed component-map.yaml / generated component-map.json.
// Kept intentionally close to the YAML shape documented in
// mappings/README.md rather than a bespoke normalized model, so a human
// reading component-map.yaml can map fields 1:1 onto these types.

export interface ComponentMapValueEntry {
  figmaValue?: string | null;
  composeValue?: string | boolean;
  status?: "mapped" | "unmapped";
  reason?: string;
  notes?: string;
}

export interface ComponentMapVariantGroup {
  figmaProperty: string;
  composeProperty?: string;
  composeEnum?: string;
  status?: "unmapped";
  reason?: string;
  mappingRule?: string;
  notes?: string;
  values?: ComponentMapValueEntry[];
  figmaValues?: string[];
}

export interface ComponentMapRoutingRule {
  when: { figmaProperty: string; figmaValue: string };
  redirectTo: string;
  note?: string;
}

export interface ComponentMapStateMapping {
  figmaProperty: string;
  composeProperty: string;
  composeType?: string;
  values: { figmaValue: string; composeValue: boolean | string }[];
}

export interface ComponentMapEntry {
  figmaComponentSet: string;
  figmaNodeId: string | null;
  status: "mapped" | "unmapped";
  mappingKind?: string;
  compose: { component: string; package: string } | null;
  routing?: ComponentMapRoutingRule[];
  variants?: ComponentMapVariantGroup[];
  stateMapping?: ComponentMapStateMapping[];
  reason?: string;
  notes?: string;
}

export interface ComponentMap {
  version: number;
  figma: { fileKey: string; fileName: string };
  entries: ComponentMapEntry[];
}
