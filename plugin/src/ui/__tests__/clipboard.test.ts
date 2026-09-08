import { describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "../clipboard.js";

describe("copyToClipboard", () => {
  it("uses the Clipboard API when writeText is available and succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const fallbackCopy = vi.fn();

    const outcome = await copyToClipboard("hello", { writeText, fallbackCopy });

    expect(writeText).toHaveBeenCalledWith("hello");
    expect(fallbackCopy).not.toHaveBeenCalled();
    expect(outcome).toEqual({ ok: true, method: "clipboard-api" });
  });

  it("falls back to execCommand when writeText rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    const fallbackCopy = vi.fn().mockReturnValue(true);

    const outcome = await copyToClipboard("hello", { writeText, fallbackCopy });

    expect(fallbackCopy).toHaveBeenCalledWith("hello");
    expect(outcome).toEqual({ ok: true, method: "exec-command" });
  });

  it("reports failure (not a throw) when writeText rejects and no fallback is available", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));

    const outcome = await copyToClipboard("hello", { writeText });

    expect(outcome.ok).toBe(false);
    expect(outcome.method).toBe("clipboard-api");
    expect(outcome.error).toBe("denied");
  });

  it("reports failure when the execCommand fallback itself returns false", async () => {
    const fallbackCopy = vi.fn().mockReturnValue(false);

    const outcome = await copyToClipboard("hello", { fallbackCopy });

    expect(outcome.ok).toBe(false);
    expect(outcome.method).toBe("exec-command");
    expect(outcome.error).toBeTruthy();
  });

  it("reports failure when no clipboard mechanism is available at all", async () => {
    const outcome = await copyToClipboard("hello", {});

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBeTruthy();
  });

  it("uses the fallback directly when writeText is not present", async () => {
    const fallbackCopy = vi.fn().mockReturnValue(true);

    const outcome = await copyToClipboard("hello", { fallbackCopy });

    expect(fallbackCopy).toHaveBeenCalledWith("hello");
    expect(outcome).toEqual({ ok: true, method: "exec-command" });
  });
});
