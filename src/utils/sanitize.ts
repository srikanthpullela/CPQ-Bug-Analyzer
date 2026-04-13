/**
 * Escape HTML entities to prevent XSS when using dangerouslySetInnerHTML.
 * Call this BEFORE applying any regex-based highlighting.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
