// Token resolution: turns a raw Figma value (a fill color, a spacing number,
// a corner radius, a typography style) plus its `boundVariables` entry into
// a schema `TokenValue`/`TokenRef`, or a `token: null` literal + an
// UnresolvedEntry with reason "unbound-literal" when there's no bound
// variable. See concern #3 in the plugin-extractor task description.
import type { TokenValue, TokenRef, UnresolvedEntry } from "@figma-normalizator/schema";
import type { FigmaAPI, FigmaPaint, VariableAliasBinding } from "./types.js";
import { isMixed } from "./mixed.js";

export interface TokenResolutionResult<T> {
  token: T;
  unresolved: UnresolvedEntry[];
}

/**
 * Builds the `{ token: null }` + `UnresolvedEntry` shape for a raw Figma
 * value that turned out to be the `figma.mixed` sentinel (see `./mixed.ts`)
 * rather than a scalar — mirroring `resolveTokenValue`'s own `{ token:
 * null, ... }` shape for an unbound literal, but with a distinct
 * `"mixed-value"` reason: this is a value that genuinely has no single
 * representation, not one that merely lacks a bound variable.
 */
export function mixedValueResult<T>(
  nodeId: string,
  detail: string,
): TokenResolutionResult<T | null> {
  return {
    token: null,
    unresolved: [{ nodeId, reason: "mixed-value", detail }],
  };
}

function toHex(component: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(component * 255)));
  return clamped.toString(16).padStart(2, "0").toUpperCase();
}

/** Converts a Figma `RGB`/`RGBA` paint color to a `#RRGGBB` (or `#RRGGBBAA`) hex string. */
export function colorToHex(color: { r: number; g: number; b: number; a?: number }): string {
  const hex = `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
  if (color.a !== undefined && color.a < 1) {
    return hex + toHex(color.a);
  }
  return hex;
}

/**
 * Resolves a single bound variable id to a `TokenValue`-shaped
 * `{ token, value, modes? }`, reading `variable.name` verbatim as the token
 * path (Figma variable names already use `/` as a path separator) and
 * `valuesByMode` + the owning collection's mode names for `modes`.
 */
export async function resolveVariable(
  figma: FigmaAPI,
  variableId: string,
): Promise<{ token: string; value: string | number; modes?: Record<string, string | number> }> {
  const variable = await figma.variables.getVariableByIdAsync(variableId);
  if (!variable) {
    // A bound variable id that no longer resolves (deleted/inaccessible
    // variable). Treated the same as "no binding" by the caller.
    throw new Error(`Variable ${variableId} could not be resolved`);
  }

  const collection = await figma.variables.getVariableCollectionByIdAsync(
    variable.variableCollectionId,
  );

  const modeEntries = Object.entries(variable.valuesByMode) as [string, unknown][];
  const modeNameById = new Map((collection?.modes ?? []).map((m) => [m.modeId, m.name]));

  const resolveModeValue = (raw: unknown): string | number => {
    if (typeof raw === "number") return raw;
    if (typeof raw === "string") return raw;
    if (raw && typeof raw === "object" && "r" in raw) {
      return colorToHex(raw as { r: number; g: number; b: number; a?: number });
    }
    return String(raw);
  };

  const modes: Record<string, string | number> = {};
  for (const [modeId, raw] of modeEntries) {
    const modeName = modeNameById.get(modeId) ?? modeId;
    modes[modeName] = resolveModeValue(raw);
  }

  const modeNames = Object.keys(modes);
  const defaultModeId = collection?.defaultModeId;
  const defaultModeName = defaultModeId
    ? (modeNameById.get(defaultModeId) ?? defaultModeId)
    : undefined;
  const value =
    (defaultModeName && modes[defaultModeName] !== undefined
      ? modes[defaultModeName]
      : undefined) ??
    modes[modeNames[0] ?? ""] ??
    "";

  return {
    token: variable.name,
    value,
    modes: modeNames.length > 1 ? modes : undefined,
  };
}

/** Extracts the single bound-variable id for `field`, if any (never an array field). */
function singleBinding(
  boundVariables:
    Record<string, VariableAliasBinding | VariableAliasBinding[] | undefined> | undefined,
  field: string,
): string | undefined {
  const binding = boundVariables?.[field];
  if (!binding) return undefined;
  if (Array.isArray(binding)) return binding[0]?.id;
  return binding.id;
}

/**
 * Resolves a scalar (color/spacing/radius) value to a `TokenValue`. If
 * `boundVariables[field]` has no binding, emits `{ token: null, value:
 * rawValue }` plus an `unbound-literal` UnresolvedEntry rather than
 * inventing a token path.
 */
export async function resolveTokenValue(
  figma: FigmaAPI,
  nodeId: string,
  boundVariables:
    Record<string, VariableAliasBinding | VariableAliasBinding[] | undefined> | undefined,
  field: string,
  rawValue: string | number,
): Promise<TokenResolutionResult<TokenValue>> {
  const variableId = singleBinding(boundVariables, field);
  if (!variableId) {
    return {
      token: { token: null, value: rawValue },
      unresolved: [
        {
          nodeId,
          reason: "unbound-literal",
          detail: `Field "${field}" has no bound variable; using raw literal value.`,
        },
      ],
    };
  }

  try {
    const resolved = await resolveVariable(figma, variableId);
    return { token: resolved, unresolved: [] };
  } catch {
    return {
      token: { token: null, value: rawValue },
      unresolved: [
        {
          nodeId,
          reason: "unbound-literal",
          detail: `Field "${field}" is bound to variable ${variableId}, but it could not be resolved.`,
        },
      ],
    };
  }
}

/**
 * Resolves a fill/paint array's first visible SOLID paint to a `TokenValue`.
 * Returns `null` (not an unresolved entry) when there is no visible solid
 * paint at all — that's "no color", not "an unresolved color".
 */
export async function resolveFillColor(
  figma: FigmaAPI,
  nodeId: string,
  fills: readonly FigmaPaint[] | symbol | undefined,
  boundVariables:
    Record<string, VariableAliasBinding | VariableAliasBinding[] | undefined> | undefined,
): Promise<TokenResolutionResult<TokenValue | null>> {
  if (isMixed(fills)) {
    // The node has multiple sets of fills (e.g. per-character text fills
    // observed at the node level) — there is no single fill color to
    // resolve, so surface a clear warning rather than passing a `Symbol`
    // into `colorToHex`/onward toward `postMessage`.
    return mixedValueResult(
      nodeId,
      'Field "fills" is mixed (this node has multiple sets of fills) and cannot be represented as a single color; consider using a uniform fill or documenting the intended per-fill values separately.',
    );
  }
  const paint = (fills ?? []).find((f) => f.type === "SOLID" && f.visible !== false);
  if (!paint || !paint.color) {
    return { token: null, unresolved: [] };
  }
  return resolveTokenValue(figma, nodeId, boundVariables, "fills", colorToHex(paint.color));
}

/**
 * Resolves a typography style to a `TokenRef`. `boundVariables` here is
 * expected to come from a single styled text segment (see
 * `getStyledTextSegments`); the segment's `fontName`/`fontSize` bindings
 * (or lack thereof) determine whether this resolves to a named style or a
 * `token: null` unbound literal.
 */
export async function resolveTypographyToken(
  figma: FigmaAPI,
  nodeId: string,
  boundVariables:
    Record<string, VariableAliasBinding | VariableAliasBinding[] | undefined> | undefined,
): Promise<TokenResolutionResult<TokenRef>> {
  const variableId =
    singleBinding(boundVariables, "fontName") ?? singleBinding(boundVariables, "fontSize");
  if (!variableId) {
    return {
      token: { token: null },
      unresolved: [
        {
          nodeId,
          reason: "unbound-literal",
          detail: "Text style has no bound typography variable; using raw literal font.",
        },
      ],
    };
  }
  try {
    const resolved = await resolveVariable(figma, variableId);
    return { token: { token: resolved.token }, unresolved: [] };
  } catch {
    return {
      token: { token: null },
      unresolved: [
        {
          nodeId,
          reason: "unbound-literal",
          detail: `Typography is bound to variable ${variableId}, but it could not be resolved.`,
        },
      ],
    };
  }
}
