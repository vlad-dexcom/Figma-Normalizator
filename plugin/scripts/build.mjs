// Minimal esbuild build script for the plugin package. Bundles the
// sandboxed plugin-API entry point into `dist/code.js` and copies the
// placeholder UI HTML into `dist/ui.html` unmodified (it's plain, dependency
// free markup — no need to bundle it).
import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const distDir = join(root, "dist");

mkdirSync(distDir, { recursive: true });

await build({
  entryPoints: [join(root, "src/code.ts")],
  outfile: join(distDir, "code.js"),
  bundle: true,
  platform: "browser",
  target: "es2017",
  format: "iife",
  logLevel: "info",
});

copyFileSync(join(root, "src/ui.html"), join(distDir, "ui.html"));
