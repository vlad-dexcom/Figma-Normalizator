// Builds the `source` (Provenance) field attached to every IR node.
import type { Provenance } from "@figma-normalizator/schema";
import type { FigmaNode } from "./types.js";

export interface ProvenanceContext {
  fileKey: string;
  version: string;
  /** Ancestor chain of node names, NOT including the node currently being processed (its own name is appended by `buildProvenance`/`withDescendant`). */
  ancestorPath: readonly string[];
}

export function buildProvenance(node: FigmaNode, ctx: ProvenanceContext): Provenance {
  return {
    nodeId: node.id,
    fileKey: ctx.fileKey,
    version: ctx.version,
    path: [...ctx.ancestorPath, node.name],
  };
}

/**
 * Returns a new context for descending into `node`'s children: `node.name`
 * is appended to the ancestor path (this is the same append `buildProvenance`
 * performs for `node`'s own `source.path` — see the fixtures in
 * schema/fixtures/, whose `path` arrays end with the node's own name, not
 * just its ancestors' names).
 */
export function withDescendant(ctx: ProvenanceContext, node: FigmaNode): ProvenanceContext {
  return { ...ctx, ancestorPath: [...ctx.ancestorPath, node.name] };
}
