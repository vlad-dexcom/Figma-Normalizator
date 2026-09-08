// Deterministic filename-safe slug derivation, used for asset `exportRef`s.

/**
 * Converts a Figma node name into a deterministic, filename-safe slug:
 * lowercase, spaces/slashes/hyphens become underscores, and anything that
 * isn't `[a-z0-9_]` is stripped. Collapses repeated underscores and trims
 * leading/trailing ones so e.g. "Icon / Chevron-Right!!" -> "icon_chevron_right".
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s/-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}
