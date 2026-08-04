import { randomBytes } from 'node:crypto';
import { escapeHtml } from '../lib/html';
import { type CounterState } from '../lib/charCount';
import { CURATED_EMOJI } from '../lib/emoji';
import { FAMILY_IDS, FAMILY_LABELS, FAMILY_MATRIX, type FamilyId } from '../lib/family';
import { COMBINING_MARKS } from '../lib/combining';

/**
 * Generate a 32-character hex nonce (128 bits of entropy).
 */
export function getNonce(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Approximate width in pixels of LinkedIn's desktop feed post text column.
 * This is a planning target, not an exact measurement. The CSS file
 * (media/webview.css) uses this value as the card max-width.
 * See T24 for side-by-side tuning against a real LinkedIn post.
 */
export const LINKEDIN_POST_WIDTH_PX = 555;

/**
 * Build the counter HTML fragment.
 *
 * Normal:  <div class="char-counter" id="char-counter">1234 / 3000</div>
 * Warning: <div class="char-counter counter-warning" id="char-counter">2750 / 3000</div>
 * Over:    <div class="char-counter counter-over" id="char-counter">3127 / 3000 (-127)</div>
 *
 * The overage number is -(count - limit), shown as e.g. (-127).
 */
export function buildCounterHtml(
  count: number,
  state: CounterState,
  limit: number,
): string {
  const cls = state === 'warning' ? ' counter-warning'
            : state === 'over'    ? ' counter-over'
            : '';
  const overage = state === 'over' ? ` (-${count - limit})` : '';
  return `<div class="char-counter${cls}" id="char-counter">${count} / ${limit}${overage}</div>`;
}

/** Toolbar axis-button state derived from the current selection. */
export interface AxisState {
  readonly bold: boolean;
  readonly italic: boolean;
  /** False only when the selection's family provably lacks the axis. */
  readonly boldAvailable: boolean;
  readonly italicAvailable: boolean;
  /** True when the selection spans several families (dropdown shows Mixed). */
  readonly mixed: boolean;
}

/**
 * Build the full HTML document for the preview webview.
 *
 * The stylesheet and script are INLINED under the CSP nonce rather than
 * loaded from vscode-resource URIs: a separate fetch can fail or lag during
 * rapid re-renders, leaving the pane as an unstyled white-on-dark wreck.
 * Inlining makes every render self-contained.
 *
 * @param cspSource   - value of webview.cspSource, an opaque origin string
 * @param nonce       - a cryptographically random nonce for this render
 * @param body        - the document text, ALREADY HTML-escaped by the caller
 * @param counterHtml - character counter fragment, placed after the card
 * @param cssText     - contents of media/webview.css, inlined under the nonce
 * @param scriptText  - contents of media/toolbar.js, inlined under the nonce
 * @returns complete HTML document string
 */
export function buildPreviewHtml(
  cspSource: string,
  nonce: string,
  body: string,
  counterHtml: string,
  cssText: string,
  scriptText: string,
  activeFamily: FamilyId = 'serif',
  restoreSelection: { readonly start: number; readonly end: number } | null = null,
  docUri: string = '',
  caretOffset: number | null = null,
  axisState: AxisState | null = null,
  extras: {
    readonly theme?: 'daylight' | 'midnight' | 'dim' | 'editor';
    readonly profileName?: string;
    readonly profileHeadline?: string;
    readonly initials?: string | null;
  } = {},
): string {
  const theme = extras.theme ?? 'daylight';
  const themeClass = theme !== 'daylight' ? ` class="theme-${theme}"` : '';
  const profileName = extras.profileName ?? 'Your Name';
  const profileHeadline = extras.profileHeadline ?? 'Your headline';
  const initials = extras.initials ?? null;
  const avatarHtml = initials
    ? `<div class="avatar avatar-initials" aria-hidden="true">${escapeHtml(initials)}</div>`
    : `<div class="avatar" aria-hidden="true"></div>`;
  const restoreJson = restoreSelection
    ? `  <script type="application/json" id="restore-selection" nonce="${nonce}">${JSON.stringify(restoreSelection)}</script>\n`
    : '';
  const boldPressed = axisState?.bold ? ' active' : '';
  const italicPressed = axisState?.italic ? ' active' : '';
  // Availability: the axis buttons disable only when the selection (or the
  // active family, absent a selection) provably lacks the axis. Baked in
  // server-side so the toolbar is correct from the first paint.
  const activeSlots = FAMILY_MATRIX.get(activeFamily);
  const boldAvail = axisState ? axisState.boldAvailable : activeSlots?.bold !== null;
  const italicAvail = axisState ? axisState.italicAvailable : activeSlots?.italic !== null;
  const boldAttrs = boldAvail
    ? ' title="Bold (Ctrl+B)"'
    : ' disabled title="Unicode has no bold variant here"';
  const italicAttrs = italicAvail
    ? ' title="Italic (Ctrl+I)"'
    : ' disabled title="Unicode has no italic variant here"';
  const mixed = axisState?.mixed === true;
  const familyOptions = (mixed
    ? [`      <option value="" selected disabled hidden>Mixed</option>`]
    : []
  ).concat(FAMILY_IDS
    .map((id) => {
      const slots = FAMILY_MATRIX.get(id);
      const label = FAMILY_LABELS.get(id) ?? id;
      const selected = !mixed && id === activeFamily ? ' selected' : '';
      return `      <option value="${id}" data-bold="${slots?.bold ? '1' : '0'}" data-italic="${slots?.italic ? '1' : '0'}"${selected}>${escapeHtml(label)}</option>`;
    }))
    .join('\n');

  // Plain letters as faces; the strike/underline look comes from CSS
  // text-decoration, which renders far cleaner than combining marks
  // inside a 30px button.
  const markFaces: Record<string, string> = {
    strikethrough: 'S',
    underline: 'U',
  };
  const markBtnHtml = COMBINING_MARKS
    .map(m => `    <button class="mark-btn" data-style-id="${m.id}" title="${escapeHtml(m.label)}">${markFaces[m.id] ?? escapeHtml(m.label)}</button>`)
    .join('\n');

  const emojiDataJson = JSON.stringify(CURATED_EMOJI);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; font-src ${cspSource};">
  <style nonce="${nonce}">${cssText}</style>
  <title>LinkedIn Preview</title>
</head>
<body${themeClass}${docUri ? ` data-doc-uri="${escapeHtml(docUri)}"` : ''}${caretOffset !== null ? ` data-caret-offset="${caretOffset}"` : ''}>
  <div class="toolbar" id="toolbar">
    <select class="family-select" id="family-select" title="Font family">
${familyOptions}
    </select>
    <div class="toolbar-separator"></div>
    <button class="axis-btn${boldPressed}" id="axis-bold" data-axis="bold"${boldAttrs}>&#x1D401;</button>
    <button class="axis-btn${italicPressed}" id="axis-italic" data-axis="italic"${italicAttrs}>&#x1D43C;</button>
    <div class="toolbar-separator"></div>
${markBtnHtml}
    <div class="toolbar-separator"></div>
    <button class="emoji-btn" id="emoji-picker-btn" title="Insert emoji">&#x263A;&#xFE0E;</button>
    <button class="clear-btn" id="clear-formatting-btn" title="Clear formatting"><span class="clear-face">T</span><span class="clear-sub">x</span></button>
  </div>
  <div class="emoji-picker" id="emoji-picker" hidden>
    <div class="emoji-search-wrap">
      <input type="text" class="emoji-search" id="emoji-search"
             placeholder="Search emoji..." autocomplete="off">
    </div>
    <div class="emoji-groups" id="emoji-groups"></div>
  </div>
  <div class="linkedin-card">
    <div class="post-header">
      ${avatarHtml}
      <div class="post-meta">
        <div class="meta-name">${escapeHtml(profileName)} <span class="meta-degree">&#183; You</span></div>
        <div class="meta-headline">${escapeHtml(profileHeadline)}</div>
        <div class="meta-time">Now &#183; <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1.8 8h12.4M8 1.8c2.3 2 2.3 10.4 0 12.4M8 1.8c-2.3 2-2.3 10.4 0 12.4" fill="none" stroke="currentColor" stroke-width="1.2"/></svg></div>
      </div>
      <div class="post-ellipsis" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></div>
    </div>
    <div class="post-body" id="preview-content">${body}</div>
    <div class="post-social" aria-hidden="true">
      <span class="reaction-cluster"><span class="reaction rx-like"></span><span class="reaction rx-praise"></span><span class="reaction rx-love"></span></span>
      <span class="social-count">Dev Community and 128 others</span>
      <span class="social-count social-count-right">24 comments</span>
    </div>
    <div class="post-actions" aria-hidden="true">
      <span class="action"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10.5V20"/><path d="M3 12.5a2 2 0 0 1 2-2h2l3.4-6.1a1.8 1.8 0 0 1 3.3 1.2L13 9.5h5a2 2 0 0 1 2 2.4l-1.3 5.6A3.2 3.2 0 0 1 15.6 20H5a2 2 0 0 1-2-2z"/></svg>Like</span>
      <span class="action"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.5 7.3L3 20l1.2-5.5A8.4 8.4 0 1 1 21 11.5z"/></svg>Comment</span>
      <span class="action"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>Repost</span>
      <span class="action"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7.5 20-3.5-9-9-3.5z"/></svg>Send</span>
    </div>
  </div>
  ${counterHtml}
  <script type="application/json" id="emoji-data" nonce="${nonce}">${emojiDataJson}</script>
${restoreJson}  <script nonce="${nonce}">${scriptText}</script>
</body>
</html>`;
}
