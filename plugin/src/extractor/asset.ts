// Asset detection: vectors, and graphic-only frames/groups/instances, are
// represented as an `asset` node (an export reference) rather than being
// descended into. See concern #6 in the plugin-extractor task description.
import type { AssetNode } from "@figma-normalizator/schema";
import type { FigmaNode } from "./types.js";
import { buildProvenance, type ProvenanceContext } from "./provenance.js";
import { slugify } from "./slug.js";

const VECTOR_LIKE_TYPES = new Set([
  "VECTOR",
  "BOOLEAN_OPERATION",
  "STAR",
  "ELLIPSE",
  "RECTANGLE",
  "LINE",
  "POLYGON",
]);

const CONTAINER_TYPES = new Set(["FRAME", "GROUP", "COMPONENT", "INSTANCE"]);

function isVectorLikeSubtree(node: FigmaNode): boolean {
  if (VECTOR_LIKE_TYPES.has(node.type)) return true;
  if (CONTAINER_TYPES.has(node.type)) {
    const children = node.children ?? [];
    return children.length > 0 && children.every(isVectorLikeSubtree);
  }
  return false;
}

/**
 * True when `node` is effectively just a graphic: a bare vector node, or a
 * frame/group/component/instance whose entire subtree is vector-like shapes
 * (no text, no nested layout-bearing content). Instances of icon components
 * are also treated as assets by name heuristic (see `inferAssetType`) since
 * we don't want to descend into (or component-map-resolve) an icon glyph's
 * internals.
 */
export function isAssetNode(node: FigmaNode): boolean {
  if (node.type === "VECTOR") return true;
  if (node.type === "INSTANCE" && node.name.toLowerCase().includes("icon")) {
    return true;
  }
  if (CONTAINER_TYPES.has(node.type)) {
    const children = node.children ?? [];
    if (children.length === 0) return false;
    return children.every(isVectorLikeSubtree);
  }
  return false;
}

/**
 * Heuristic asset-type classification, deliberately approximate (see
 * plugin-extractor task notes — refining this is a follow-up):
 *   - name contains "icon" (case-insensitive) -> "icon"
 *   - otherwise, a top-level node at least 120x120 -> "illustration"
 *     (large standalone graphics tend to be illustrations/empty-states)
 *   - otherwise -> "image"
 */
export function inferAssetType(node: FigmaNode, isTopLevel: boolean): AssetNode["assetType"] {
  if (node.name.toLowerCase().includes("icon")) return "icon";
  if (isTopLevel && (node.width ?? 0) >= 120 && (node.height ?? 0) >= 120) return "illustration";
  return "image";
}

export function buildAssetNode(
  node: FigmaNode,
  ctx: ProvenanceContext,
  isTopLevel: boolean,
): AssetNode {
  return {
    kind: "asset",
    assetType: inferAssetType(node, isTopLevel),
    exportRef: slugify(node.name),
    width: Math.round(node.width ?? 0),
    height: Math.round(node.height ?? 0),
    source: buildProvenance(node, ctx),
  };
}
