/**
 * Strips UTM and social sharing query parameters to return a clean canonical Threads URL.
 */
export function cleanThreadsUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl);
    // Remove tracking and session params
    const trackingParams = [
      "s", "utm_source", "utm_medium", "utm_campaign", "utm_term",
      "utm_content", "igshid", "fbclid", "xmt", "mid", "share_id"
    ];
    for (const p of trackingParams) {
      url.searchParams.delete(p);
    }
    // Clean trailing ? if search is empty
    const clean = url.toString().replace(/\?$/, "");
    return clean;
  } catch {
    // If invalid URL, strip query string manually
    return rawUrl.split("?")[0];
  }
}

/**
 * Robust cross-browser clipboard copy with execCommand fallback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try modern Async Clipboard API
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand
    }
  }

  // 2. Fallback using temporary textarea element
  if (typeof document !== "undefined") {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.contain = "strict";
      el.style.position = "absolute";
      el.style.left = "-9999px";
      el.style.fontSize = "12pt"; // Prevent iOS zoom

      const selection = document.getSelection();
      const originalRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

      document.body.appendChild(el);
      el.select();
      el.selectionStart = 0;
      el.selectionEnd = text.length;

      const successful = document.execCommand("copy");
      document.body.removeChild(el);

      if (originalRange && selection) {
        selection.removeAllRanges();
        selection.addRange(originalRange);
      }

      return successful;
    } catch {
      return false;
    }
  }

  return false;
}
