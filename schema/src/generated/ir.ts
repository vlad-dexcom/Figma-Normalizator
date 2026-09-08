/**
 * This file was automatically generated from schema/ir/v1/schema.json.
 * DO NOT EDIT MANUALLY — run `npm run generate:types` in schema/ to
 * regenerate it, then commit the result.
 */

/**
 * The discriminated union of every IR node kind. `kind` selects the variant.
 */
export type IRNode = LayoutNode | TextNode | InstanceNode | AssetNode | OverlayNode | ListNode;
export type LayoutDirection = "row" | "column" | "stack";
export type NullableTokenValue = TokenValue | null;
export type MainAxisAlign = "start" | "center" | "end" | "spaceBetween";
export type CrossAxisAlign = "start" | "center" | "end" | "stretch";
export type SizingMode = "fixed" | "fill" | "hug";
export type NullableTokenRef = TokenRef | null;
/**
 * The resolved value of a single Figma component property, used in instance node `props`.
 */
export type PropValue = TextOrBooleanPropValue | VariantPropValue;

/**
 * An Auto Layout container resolved to intent (direction/alignment/sizing), not raw Figma enums.
 */
export interface LayoutNode {
  kind: "layout";
  direction: LayoutDirection;
  gap: NullableTokenValue;
  padding: Padding;
  mainAxisAlign: MainAxisAlign;
  crossAxisAlign: CrossAxisAlign;
  sizing: Sizing;
  background: NullableTokenValue;
  cornerRadius: NullableTokenValue;
  children: IRNode[];
  source: Provenance;
}
/**
 * A resolved Figma variable/style reference plus its concrete value(s). The optional `symbol` field is reserved for a later stage that will map `token` to a generated design-system symbol name (e.g. "AppTheme.semanticColors.text.base.default"); it is optional and unpopulated in v1 so that adding it later is additive, not a breaking change.
 */
export interface TokenValue {
  /**
   * The raw Figma variable/style path, e.g. "color/text/base/default".
   */
  token: string;
  /**
   * The concrete resolved value for the mode active at extraction time.
   */
  value: string | number;
  /**
   * Present only when the value is theme-dependent. Maps mode name (e.g. "light", "dark") to the resolved value in that mode.
   */
  modes?: {
    [k: string]: string | number;
  };
  /**
   * Reserved for a later stage: the generated design-system symbol name for this token. Optional and unused in v1 (forward-compat placeholder, see schema description).
   */
  symbol?: string;
}
/**
 * Per-side padding. Any side may be omitted (no padding on that side). `all` may be present instead of/alongside explicit sides as a convenience shorthand from the extractor; consumers should treat explicit sides as overriding `all`.
 */
export interface Padding {
  top?: TokenValue;
  right?: TokenValue;
  bottom?: TokenValue;
  left?: TokenValue;
  all?: TokenValue;
}
export interface Sizing {
  width: SizingMode;
  height: SizingMode;
}
/**
 * Origin metadata for a node, used to diff IR across re-exports of the same Figma file.
 */
export interface Provenance {
  /**
   * The Figma node id this IR node was derived from.
   */
  nodeId: string;
  /**
   * The Figma file key the node lives in.
   */
  fileKey: string;
  /**
   * The Figma file version (or version id) the extraction was performed against.
   */
  version: string;
  /**
   * Stable ancestor chain of node names/ids from the nearest meaningful root down to (but not including) this node, used for diffing across re-exports.
   */
  path: string[];
}
/**
 * A text layer. `text` is a plain string for uniformly-styled text, or an array of StyledSegment when getStyledTextSegments reports mixed-style runs.
 */
export interface TextNode {
  kind: "text";
  text: string | StyledSegment[];
  typography: NullableTokenRef;
  color: NullableTokenValue;
  source: Provenance;
}
/**
 * One run of text from Figma's getStyledTextSegments, sharing a single typography/color style.
 */
export interface StyledSegment {
  text: string;
  typography?: TokenRef;
  color?: TokenValue;
}
/**
 * Same shape as TokenValue but for typography tokens, which have no single resolved numeric/string value. The optional `symbol` field carries the same forward-compat intent as TokenValue.symbol.
 */
export interface TokenRef {
  /**
   * The raw Figma typography style path, e.g. "typography/body/large".
   */
  token: string;
  /**
   * Reserved for a later stage: the generated design-system symbol name for this token. Optional and unused in v1.
   */
  symbol?: string;
}
/**
 * A component instance. Opaque past this boundary: the instance's internal children are NEVER included, only its resolved properties, named slot content, and call-site layout.
 */
export interface InstanceNode {
  kind: "instance";
  /**
   * The mapped design-system component name (e.g. "AppButton"), or null if this component set has no mapping yet.
   */
  component: string | null;
  figmaComponentSetName: string;
  figmaComponentKey: string;
  /**
   * Resolved component properties keyed by Figma property name.
   */
  props: {
    [k: string]: PropValue;
  };
  /**
   * Named slot content for INSTANCE_SWAP or boolean-gated optional children (e.g. leadingIcon/trailingIcon). A null value means the slot exists but is empty/hidden.
   */
  slots: {
    [k: string]: IRNode | null;
  };
  layout: LayoutFieldsPartial;
  unresolved: UnresolvedEntry[];
  source: Provenance;
}
/**
 * For TEXT and BOOLEAN component properties.
 */
export interface TextOrBooleanPropValue {
  value: string | number | boolean;
}
/**
 * For VARIANT component properties. `from` is the raw Figma variant property value (e.g. "Style=Primary") kept for traceability back to the source.
 */
export interface VariantPropValue {
  variant: string;
  from: string;
}
/**
 * The subset of layout node fields relevant to an instance's call-site layout (sizing, spacing, etc as needed) — NOT the internal styling of the component. Every field is optional; only fields actually relevant at the call site are present.
 */
export interface LayoutFieldsPartial {
  direction?: LayoutDirection;
  gap?: NullableTokenValue;
  padding?: Padding;
  mainAxisAlign?: MainAxisAlign;
  crossAxisAlign?: CrossAxisAlign;
  sizing?: SizingPartial;
  background?: NullableTokenValue;
  cornerRadius?: NullableTokenValue;
}
/**
 * Like Sizing, but either axis may be omitted when only one axis is relevant at a call site (e.g. an instance's layout override).
 */
export interface SizingPartial {
  width?: SizingMode;
  height?: SizingMode;
}
/**
 * Records a value that could not be resolved during extraction (a missing token, an unmapped component variant/property, etc). Every unresolvable value MUST produce one of these rather than a silent substitution or omission.
 */
export interface UnresolvedEntry {
  /**
   * The Figma node id where the unresolved value was encountered.
   */
  nodeId: string;
  /**
   * A short, stable machine-readable reason code/summary, e.g. "missing-variable-binding" or "unmapped-variant".
   */
  reason: string;
  /**
   * Optional free-form human-readable detail for debugging.
   */
  detail?: string;
}
/**
 * A vector or image, represented as an export reference — never inline geometry/path data.
 */
export interface AssetNode {
  kind: "asset";
  assetType: "icon" | "image" | "illustration";
  /**
   * Suggested filename/drawable name, deterministic from the node name.
   */
  exportRef: string;
  /**
   * Logical width; no path data.
   */
  width: number;
  /**
   * Logical height; no path data.
   */
  height: number;
  source: Provenance;
}
/**
 * Absolutely positioned children inside an otherwise auto-layout parent.
 */
export interface OverlayNode {
  kind: "overlay";
  children: {
    node: IRNode;
    align: {
      horizontal: "start" | "center" | "end";
      vertical: "start" | "center" | "end";
    };
    offset?: {
      x: number;
      y: number;
    };
  }[];
  source: Provenance;
}
/**
 * N identical/near-identical siblings collapsed to one template.
 */
export interface ListNode {
  kind: "list";
  itemTemplate: IRNode;
  /**
   * Count observed in the design; informational only, not a rendering directive.
   */
  itemCount: number;
  source: Provenance;
}
