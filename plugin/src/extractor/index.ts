// Extractor orchestration: recursively walks a Figma node tree (starting
// from the current selection) and produces IR nodes conforming to
// schema/ir/v1/schema.json. Ties together layout normalization, text
// extraction, token resolution, instance resolution, list collapsing,
// asset detection, and overlay grouping (concerns #1-#7 in the
// plugin-extractor task description).
//
// Deferred (see PR description): Dev Mode annotations / `getPluginData`
// hints (concern #8) — the current IR schema has no channel for "inferred
// hint, never authoritative" metadata, and inventing one wasn't in scope
// for this task.
import type { IRNode, LayoutNode, Padding, UnresolvedEntry } from "@figma-normalizator/schema";
import { DEFAULT_NODE_BUDGET, NodeBudget } from "./budget.js";
import { isAssetNode, buildAssetNode } from "./asset.js";
import { buildInstanceNode } from "./instance.js";
import { buildTextNode } from "./text.js";
import {
  resolveCrossAxisAlign,
  resolveDirection,
  resolveMainAxisAlign,
  resolveSizing,
  buildPaddingRaw,
  isUniformPadding,
} from "./layout.js";
import { resolveFillColor, resolveTokenValue } from "./tokens.js";
import { buildProvenance, withDescendant, type ProvenanceContext } from "./provenance.js";
import { collapseLists, type OrderedChild } from "./list.js";
import { groupOverlayChildren } from "./overlay.js";
import type { ExtractionSource, FigmaAPI, FigmaNode } from "./types.js";

export { DEFAULT_NODE_BUDGET, NodeBudgetExceededError } from "./budget.js";
export type { FigmaAPI, FigmaNode, ExtractionSource } from "./types.js";

export interface ExtractionResult {
  nodes: IRNode[];
  /**
   * Every UnresolvedEntry produced anywhere in the tree, flattened. Instance
   * nodes also carry their own subset locally (`InstanceNode.unresolved`,
   * required by the schema); this is the convenient "everything, in one
   * place" view for layout/text/asset-adjacent issues that the current
   * schema has no dedicated per-node channel for.
   */
  unresolved: UnresolvedEntry[];
}

interface NodeResult {
  ir: IRNode | null;
  unresolved: UnresolvedEntry[];
}

const CONTAINER_TYPES = new Set([
  "FRAME",
  "COMPONENT",
  "COMPONENT_SET",
  "GROUP",
  "BOOLEAN_OPERATION",
  "SECTION",
]);

function hasAutoLayout(node: FigmaNode): boolean {
  return node.layoutMode === "HORIZONTAL" || node.layoutMode === "VERTICAL";
}

async function resolvePadding(
  figma: FigmaAPI,
  node: FigmaNode,
): Promise<{ padding: Padding; unresolved: UnresolvedEntry[] }> {
  if (!hasAutoLayout(node)) return { padding: {}, unresolved: [] };

  const raw = buildPaddingRaw(node);
  const unresolved: UnresolvedEntry[] = [];

  if (isUniformPadding(raw)) {
    const all = await resolveTokenValue(
      figma,
      node.id,
      node.boundVariables,
      "paddingLeft",
      raw.left,
    );
    unresolved.push(...all.unresolved);
    return { padding: { all: all.token }, unresolved };
  }

  const [top, right, bottom, left] = await Promise.all([
    resolveTokenValue(figma, node.id, node.boundVariables, "paddingTop", raw.top),
    resolveTokenValue(figma, node.id, node.boundVariables, "paddingRight", raw.right),
    resolveTokenValue(figma, node.id, node.boundVariables, "paddingBottom", raw.bottom),
    resolveTokenValue(figma, node.id, node.boundVariables, "paddingLeft", raw.left),
  ]);
  unresolved.push(...top.unresolved, ...right.unresolved, ...bottom.unresolved, ...left.unresolved);

  return {
    padding: { top: top.token, right: right.token, bottom: bottom.token, left: left.token },
    unresolved,
  };
}

async function buildLayoutNode(
  figma: FigmaAPI,
  node: FigmaNode,
  parent: FigmaNode | undefined,
  ctx: ProvenanceContext,
  budget: NodeBudget,
  source: ExtractionSource,
): Promise<NodeResult> {
  const unresolved: UnresolvedEntry[] = [];
  const autoLayout = hasAutoLayout(node);

  const direction = resolveDirection(node);
  const mainAxisAlign = autoLayout ? resolveMainAxisAlign(node) : "start";
  const crossAxisAlign = autoLayout ? resolveCrossAxisAlign(node) : "start";

  const gap = autoLayout
    ? await resolveTokenValue(
        figma,
        node.id,
        node.boundVariables,
        "itemSpacing",
        node.itemSpacing ?? 0,
      )
    : { token: null, unresolved: [] as UnresolvedEntry[] };
  unresolved.push(...gap.unresolved);

  const { padding, unresolved: paddingUnresolved } = await resolvePadding(figma, node);
  unresolved.push(...paddingUnresolved);

  const background = await resolveFillColor(figma, node.id, node.fills, node.boundVariables);
  unresolved.push(...background.unresolved);

  const cornerRadius =
    node.cornerRadius !== undefined
      ? await resolveTokenValue(
          figma,
          node.id,
          node.boundVariables,
          "cornerRadius",
          node.cornerRadius,
        )
      : { token: null, unresolved: [] as UnresolvedEntry[] };
  unresolved.push(...cornerRadius.unresolved);

  const sizing = resolveSizing(node, parent);

  const childCtx = withDescendant(ctx, node);
  const childItems: OrderedChild[] = [];
  for (const child of node.children ?? []) {
    const result = await extractNode(figma, child, node, childCtx, budget, source, false);
    unresolved.push(...result.unresolved);
    if (result.ir) childItems.push({ node: child, ir: result.ir });
  }

  const collapsed = collapseLists(childItems, childCtx);
  const children = groupOverlayChildren(node, collapsed, childCtx);

  const layoutNode: LayoutNode = {
    kind: "layout",
    direction,
    gap: gap.token,
    padding,
    mainAxisAlign,
    crossAxisAlign,
    sizing,
    background: background.token,
    cornerRadius: cornerRadius.token,
    children,
    source: buildProvenance(node, ctx),
  };

  return { ir: layoutNode, unresolved };
}

async function extractNode(
  figma: FigmaAPI,
  node: FigmaNode,
  parent: FigmaNode | undefined,
  ctx: ProvenanceContext,
  budget: NodeBudget,
  source: ExtractionSource,
  isTopLevel: boolean,
): Promise<NodeResult> {
  await budget.tick();

  if (node.visible === false) {
    return { ir: null, unresolved: [] };
  }

  if (isAssetNode(node)) {
    return { ir: buildAssetNode(node, ctx, isTopLevel), unresolved: [] };
  }

  if (node.type === "INSTANCE") {
    const result = await buildInstanceNode(node, parent, ctx);
    return { ir: result.node, unresolved: result.unresolved };
  }

  if (node.type === "TEXT") {
    const result = await buildTextNode(figma, node, ctx);
    return { ir: result.node, unresolved: result.unresolved };
  }

  if (CONTAINER_TYPES.has(node.type)) {
    const children = node.children ?? [];

    if (children.length === 0 && !hasAutoLayout(node)) {
      // An empty, non-auto-layout frame carries no structural information.
      return { ir: null, unresolved: [] };
    }

    if (children.length === 1 && !hasAutoLayout(node)) {
      // Transparent wrapper: a plain frame around a single child adds no
      // layout intent of its own — recurse straight through to the child
      // rather than emitting a meaningless nested `layout` node. The
      // wrapper's own name is still pushed onto the ancestor path (see
      // provenance.ts) so identity/traceability through re-exports isn't
      // affected by whether we chose to emit an IR node for it.
      const onlyChild = children[0];
      if (onlyChild) {
        return extractNode(
          figma,
          onlyChild,
          node,
          withDescendant(ctx, node),
          budget,
          source,
          isTopLevel,
        );
      }
    }

    return buildLayoutNode(figma, node, parent, ctx, budget, source);
  }

  // Unknown/unsupported node type (e.g. a stray SLICE or an unrecognized
  // future node kind): nothing meaningful to extract.
  return { ir: null, unresolved: [] };
}

export async function extractSelection(
  figma: FigmaAPI,
  selection: readonly FigmaNode[],
  source: ExtractionSource,
  nodeBudget = DEFAULT_NODE_BUDGET,
): Promise<ExtractionResult> {
  const budget = new NodeBudget(nodeBudget);
  const ctx: ProvenanceContext = {
    fileKey: source.fileKey,
    version: source.version,
    ancestorPath: [],
  };

  const nodes: IRNode[] = [];
  const unresolved: UnresolvedEntry[] = [];

  for (const node of selection) {
    const result = await extractNode(figma, node, undefined, ctx, budget, source, true);
    unresolved.push(...result.unresolved);
    if (result.ir) nodes.push(result.ir);
  }

  return { nodes, unresolved };
}
