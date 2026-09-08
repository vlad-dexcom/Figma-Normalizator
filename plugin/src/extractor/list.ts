// List collapsing: detects runs of 3+ consecutive siblings that are
// structurally identical (ignoring text content) and collapses them into a
// single `list` node. See concern #5 in the plugin-extractor task
// description.
import type { IRNode, ListNode } from "@figma-normalizator/schema";
import type { FigmaNode } from "./types.js";
import { buildProvenance, type ProvenanceContext } from "./provenance.js";

const MIN_RUN_LENGTH = 3;

/**
 * A deterministic structural signature for a node, deliberately excluding
 * anything that carries textual/content differences (names, characters,
 * literal fill colors) so that "same structure, different copy" siblings
 * compare equal. For instances, the signature includes the sorted set of
 * component-property *names* (not values) as a proxy for "same instance
 * component" — two instances of the same component set expose the same
 * property names, without needing an async `getMainComponentAsync` lookup
 * just to compare structure.
 */
function structuralSignature(node: FigmaNode): unknown {
  return {
    type: node.type,
    layoutMode: node.layoutMode,
    componentPropertyNames: node.componentProperties
      ? Object.keys(node.componentProperties).sort()
      : undefined,
    children: (node.children ?? []).map(structuralSignature),
  };
}

function sameStructure(a: FigmaNode, b: FigmaNode): boolean {
  return JSON.stringify(structuralSignature(a)) === JSON.stringify(structuralSignature(b));
}

export interface OrderedChild {
  node: FigmaNode;
  ir: IRNode;
}

/**
 * Scans `items` (in original sibling order) for runs of `MIN_RUN_LENGTH` or
 * more consecutive, structurally-identical, similarly-flowed (both
 * `ABSOLUTE` or both not) siblings, and replaces each such run with one
 * tuple whose `ir` is a `ListNode` (`itemTemplate` = the first item's
 * already-built IR, `itemCount` = the run length). Non-matching runs are
 * passed through unchanged.
 */
export function collapseLists(
  items: readonly OrderedChild[],
  ctx: ProvenanceContext,
): OrderedChild[] {
  const result: OrderedChild[] = [];
  let i = 0;
  while (i < items.length) {
    const current = items[i];
    if (!current) {
      i += 1;
      continue;
    }
    let runEnd = i + 1;
    while (runEnd < items.length) {
      const candidate = items[runEnd];
      if (
        !candidate ||
        candidate.node.layoutPositioning !== current.node.layoutPositioning ||
        !sameStructure(candidate.node, current.node)
      ) {
        break;
      }
      runEnd += 1;
    }
    const runLength = runEnd - i;

    if (runLength >= MIN_RUN_LENGTH) {
      const listNode: ListNode = {
        kind: "list",
        itemTemplate: current.ir,
        itemCount: runLength,
        source: buildProvenance(current.node, ctx),
      };
      result.push({ node: current.node, ir: listNode });
    } else {
      for (let j = i; j < runEnd; j += 1) {
        const item = items[j];
        if (item) result.push(item);
      }
    }

    i = runEnd;
  }
  return result;
}
