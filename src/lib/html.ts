const ESCAPES: ReadonlyMap<string, string> = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
]);

/**
 * Escape text for interpolation into webview HTML. Post content is
 * untrusted input: a post containing <script> is ordinary user text
 * and must render as text.
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ESCAPES.get(ch) as string);
}
