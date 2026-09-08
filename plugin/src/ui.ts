// The UI iframe side of the panel — DOM-capable, but no Figma plugin API
// access (see `./code.ts` for that side, and `./messages.ts` for the shared
// protocol). Deliberately kept thin: the only non-trivial logic here
// (warning grouping, export filename generation) lives in pure, tested
// modules under `./ui/` that this file just calls and renders.
import type { ExtractionResult } from "./extractor/index.js";
import type { UnresolvedEntry } from "@figma-normalizator/schema";
import { buildExportFilename } from "./ui/filename.js";
import { groupWarningsByReason } from "./ui/warnings.js";
import type { ExportSource, PluginToUIMessage, UIToPluginMessage } from "./messages.js";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`ui.ts: expected element #${id} to exist in ui.html`);
  return el as T;
}

const selectionNameEl = byId<HTMLDivElement>("selection-name");
const extractButton = byId<HTMLButtonElement>("extract-button");
const exportButton = byId<HTMLButtonElement>("export-button");
const bannerEl = byId<HTMLDivElement>("banner");
const warningsEl = byId<HTMLDivElement>("warnings");
const irPreviewEl = byId<HTMLPreElement>("ir-preview");

/** State needed across messages: the latest extraction result plus enough provenance to name an export. */
let lastResult: ExtractionResult | null = null;
let lastSource: ExportSource | null = null;

function postToPlugin(message: UIToPluginMessage): void {
  parent.postMessage({ pluginMessage: message }, "*");
}

function showBanner(message: string): void {
  bannerEl.textContent = message;
  bannerEl.classList.add("visible");
}

function clearBanner(): void {
  bannerEl.textContent = "";
  bannerEl.classList.remove("visible");
}

function renderSelection(name: string | null, nodeType: string | null): void {
  selectionNameEl.textContent = name
    ? `${name} (${nodeType ?? "unknown type"})`
    : "Nothing selected";
}

function renderIRPreview(result: ExtractionResult): void {
  irPreviewEl.textContent = JSON.stringify(result.nodes, null, 2);
}

function renderWarningEntry(entry: UnresolvedEntry): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "warning-entry";

  const text = document.createElement("div");
  text.className = "text";

  const reason = document.createElement("div");
  reason.textContent = entry.reason;
  text.appendChild(reason);

  if (entry.detail) {
    const detail = document.createElement("div");
    detail.className = "detail";
    detail.textContent = entry.detail;
    text.appendChild(detail);
  }

  const nodeId = document.createElement("div");
  nodeId.className = "node-id";
  nodeId.textContent = entry.nodeId;
  text.appendChild(nodeId);

  row.appendChild(text);

  const selectButton = document.createElement("button");
  selectButton.textContent = "Select";
  selectButton.addEventListener("click", () => {
    postToPlugin({ type: "select-node", nodeId: entry.nodeId });
  });
  row.appendChild(selectButton);

  return row;
}

function renderWarnings(unresolved: readonly UnresolvedEntry[]): void {
  warningsEl.innerHTML = "";

  if (unresolved.length === 0) {
    const empty = document.createElement("p");
    empty.id = "empty-warnings";
    empty.textContent = "No warnings — this selection is fully resolved.";
    warningsEl.appendChild(empty);
    return;
  }

  for (const group of groupWarningsByReason(unresolved)) {
    const groupEl = document.createElement("div");
    groupEl.className = "warning-group";

    const title = document.createElement("div");
    title.className = "warning-group-title";
    title.textContent = `${group.label} (${group.entries.length})`;
    groupEl.appendChild(title);

    for (const entry of group.entries) {
      groupEl.appendChild(renderWarningEntry(entry));
    }

    warningsEl.appendChild(groupEl);
  }
}

function handlePluginMessage(message: PluginToUIMessage): void {
  switch (message.type) {
    case "selection-changed":
      renderSelection(message.name, message.nodeType);
      return;

    case "ir-result": {
      clearBanner();
      lastResult = message.ir;
      lastSource = message.source;
      exportButton.disabled = false;
      renderIRPreview(message.ir);
      renderWarnings(message.ir.unresolved);
      return;
    }

    case "error": {
      lastResult = null;
      lastSource = null;
      exportButton.disabled = true;
      // A budget-exceeded error means extraction was stopped, not silently
      // truncated (see extractor/budget.ts) — this MUST be visible to the
      // designer, not a silently-dropped notification.
      showBanner(message.message);
      return;
    }
  }
}

extractButton.addEventListener("click", () => {
  clearBanner();
  postToPlugin({ type: "extract" });
});

exportButton.addEventListener("click", () => {
  if (!lastResult || !lastSource) return;

  const filename = buildExportFilename(lastSource);
  const blob = new Blob([JSON.stringify(lastResult, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  postToPlugin({ type: "export", source: lastSource });
});

window.onmessage = (event: MessageEvent<{ pluginMessage?: PluginToUIMessage }>) => {
  const message = event.data.pluginMessage;
  if (message) handlePluginMessage(message);
};
