// Minimal esbuild build script for the plugin package. Bundles the
// sandboxed plugin-API entry point into `dist/code.js`, and separately
// bundles the DOM-capable UI entry point and inlines it into
// `dist/ui.html` (Figma's plugin UI iframe has no external resource
// loading — see the `<!-- BUILD:UI_SCRIPT -->` comment in src/ui.html).
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const uiBundle = await build({
  entryPoints: [join(root, "src/ui.ts")],
  bundle: true,
  platform: "browser",
  target: "es2017",
  format: "iife",
  write: false,
  logLevel: "info",
});

const uiScript = uiBundle.outputFiles[0]?.text ?? "";
const uiHtmlTemplate = readFileSync(join(root, "src/ui.html"), "utf8");
const uiHtml = uiHtmlTemplate.replace("<!-- BUILD:UI_SCRIPT -->", `<script>${uiScript}</script>`);

if (uiHtml === uiHtmlTemplate) {
  throw new Error("build.mjs: src/ui.html is missing the <!-- BUILD:UI_SCRIPT --> placeholder");
}

writeFileSync(join(distDir, "ui.html"), uiHtml);
