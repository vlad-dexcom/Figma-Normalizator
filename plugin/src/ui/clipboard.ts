// Pure clipboard-copy logic for the export panel, separated from `ui.ts`
// for the same testability reason as `./filename.ts`/`./warnings.ts`: this
// module takes its browser dependencies as arguments instead of touching
// `navigator`/`document` directly, so tests can supply fakes without a DOM.
//
// Figma plugin UI iframes: `navigator.clipboard.writeText` generally works
// there (it's a same-origin, user-gesture-triggered call, which is exactly
// the case Clipboard API permission checks allow), but it is not guaranteed
// on every Figma desktop/browser/OS combination the plugin might run on —
// e.g. older Electron/Chromium builds, or a host that hasn't granted the
// iframe the `clipboard-write` permission. `document.execCommand("copy")`
// via a hidden, focused, selected `<textarea>` is the older but far more
// broadly-supported fallback (it works from a synchronous DOM selection,
// no async permission prompt), so this module tries the modern API first
// and falls back to it rather than failing outright.
export type ClipboardCopyMethod = "clipboard-api" | "exec-command";

export interface ClipboardCopyOutcome {
  ok: boolean;
  method: ClipboardCopyMethod;
  error?: string;
}

export interface ClipboardDeps {
  /** `navigator.clipboard.writeText`, bound — or `undefined` if the API isn't present in this environment. */
  writeText?: (text: string) => Promise<void>;
  /** A synchronous `document.execCommand("copy")`-based fallback. Returns whether the browser reports the copy succeeded. */
  fallbackCopy?: (text: string) => boolean;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Copies `text` to the clipboard, preferring `deps.writeText` (the modern
 * Clipboard API) and falling back to `deps.fallbackCopy` (`execCommand`) if
 * it's unavailable or rejects. Never throws — every failure mode is
 * reported in the returned outcome so the caller can show a visible error
 * rather than fail silently.
 */
export async function copyToClipboard(
  text: string,
  deps: ClipboardDeps,
): Promise<ClipboardCopyOutcome> {
  if (deps.writeText) {
    try {
      await deps.writeText(text);
      return { ok: true, method: "clipboard-api" };
    } catch (error) {
      // Fall through to the execCommand fallback below rather than failing
      // immediately — a permission/environment quirk with the async API
      // shouldn't block the older, more broadly-supported path.
      if (!deps.fallbackCopy) {
        return { ok: false, method: "clipboard-api", error: toErrorMessage(error) };
      }
    }
  }

  if (deps.fallbackCopy) {
    try {
      const ok = deps.fallbackCopy(text);
      return {
        ok,
        method: "exec-command",
        error: ok ? undefined : "document.execCommand('copy') reported failure.",
      };
    } catch (error) {
      return { ok: false, method: "exec-command", error: toErrorMessage(error) };
    }
  }

  return {
    ok: false,
    method: "clipboard-api",
    error: "No clipboard mechanism is available in this environment.",
  };
}
