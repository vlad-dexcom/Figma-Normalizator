// Overlay handling: within an Auto Layout parent, children with
// `layoutPositioning === "ABSOLUTE"` don't participate in normal flow. They
// are grouped into a single `overlay` node injected into the children array
// at the position they'd otherwise start. See concern #7 in the
// plugin-extractor task description.
import type { IRNode, OverlayNode } from "@figma-normalizator/schema";
import type { FigmaNode } from "./types.js";
import type { ProvenanceContext } from "./provenance.js";
import type { OrderedChild } from "./list.js";

type HorizontalAlign = "start" | "center" | "end";
type VerticalAlign = "start" | "center" | "end";

/**
 * Approximates alignment from the absolutely-positioned child's bounds
 * relative to its parent's bounds: the parent is split into three even
 * bands per axis (start third / middle third / end third) and the child is
 * bucketed by its center point. This is inherently approximate (Figma has
 * no first-class "overlay alignment" concept) — a follow-up could refine
 * this using the child's `constraints` (left/right/center/scale) instead.
 */
export function computeOverlayAlign(
  child: FigmaNode,
  parent: FigmaNode,
): { horizontal: HorizontalAlign; vertical: VerticalAlign } {
  const parentWidth = parent.width ?? 0;
  const parentHeight = parent.height ?? 0;
  const childCenterX = (child.x ?? 0) + (child.width ?? 0) / 2;
  const childCenterY = (child.y ?? 0) + (child.height ?? 0) / 2;

  const bucket = (center: number, total: number): "start" | "center" | "end" => {
    if (total <= 0) return "start";
    const ratio = center / total;
    if (ratio < 1 / 3) return "start";
    if (ratio > 2 / 3) return "end";
    return "center";
  };

  return {
    horizontal: bucket(childCenterX, parentWidth),
    vertical: bucket(childCenterY, parentHeight),
  };
}

/**
 * Reorders `items` (in original sibling order) so that absolutely-positioned
 * children are collapsed into a single trailing-`overlay` node injected at
 * the index where the first absolute child appeared, while normally-flowed
 * children keep their relative order untouched.
 */
export function groupOverlayChildren(
  parent: FigmaNode,
  items: readonly OrderedChild[],
  ctx: ProvenanceContext,
): IRNode[] {
  const normal: IRNode[] = [];
  const overlayChildren: OverlayNode["children"] = [];
  let insertAt = -1;

  for (const item of items) {
    if (item.node.layoutPositioning === "ABSOLUTE") {
      if (insertAt === -1) insertAt = normal.length;
      overlayChildren.push({
        node: item.ir,
        align: computeOverlayAlign(item.node, parent),
        offset: { x: item.node.x ?? 0, y: item.node.y ?? 0 },
      });
    } else {
      normal.push(item.ir);
    }
  }

  if (overlayChildren.length === 0) {
    return normal;
  }

  const overlayNode: OverlayNode = {
    kind: "overlay",
    children: overlayChildren,
    source: {
      // Synthetic id: there is no single Figma node for the overlay group
      // itself, only for the parent it was collected from.
      nodeId: `${parent.id}#overlay`,
      fileKey: ctx.fileKey,
      version: ctx.version,
      path: [...ctx.ancestorPath, parent.name],
    },
  };

  return [...normal.slice(0, insertAt), overlayNode, ...normal.slice(insertAt)];
}
