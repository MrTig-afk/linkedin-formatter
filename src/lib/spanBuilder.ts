import { escapeHtml } from './html';

/**
 * Return true if the code point is a Unicode combining mark (General Category M).
 * Used to group combining marks with their preceding base character in the
 * same span, so rendering does not break them apart.
 */
export function isCombiningMark(ch: string): boolean {
  return /^\p{M}/u.test(ch);
}

/**
 * A visual marker injected between spans at a specific code-point position.
 * The marker is labelled and styled as an approximate truncation boundary.
 */
export interface TruncationMarker {
  /** Code-point count after which to inject the marker. */
  position: number;
  /** Label text displayed on the marker (HTML-escaped before interpolation). */
  label: string;
}

/**
 * One item in the rendered stream: either a text unit (a code point plus any
 * trailing combining marks) carrying its UTF-16 document offset and length, or
 * a truncation marker.
 *
 * This is the single source of truth for what the preview shows. The HTML
 * string path and the message path to the webview both derive from it, so
 * the two can never disagree about an offset.
 */
export type RenderUnit =
  | { readonly kind: 'span'; readonly offset: number; readonly len: number; readonly text: string }
  | { readonly kind: 'marker'; readonly label: string };

/**
 * Split text into render units, interleaving truncation markers.
 *
 * @param text    - raw document text (NOT escaped; escaping is the caller's job
 *                  only on the HTML path - the message path never needs it)
 * @param markers - optional truncation markers
 */
export function buildOffsetUnits(text: string, markers?: TruncationMarker[]): RenderUnit[] {
  const units: RenderUnit[] = [];
  if (text.length === 0) { return units; }

  // Markers are only shown when there is content after the cutoff.
  const totalCp = (!markers || markers.length === 0) ? 0 : [...text].length;
  const sortedMarkers = (!markers || markers.length === 0)
    ? []
    : markers.slice().sort((a, b) => a.position - b.position)
        .filter(m => m.position < totalCp);

  let utf16Offset = 0;
  let unitText = '';
  let unitOffset = 0;
  let unitLen = 0;
  let hasUnit = false;
  // cpCount lags the iterator by one base character so a marker fires AFTER
  // the unit it follows, not before it.
  let cpCount = 0;
  let markerIdx = 0;

  const flush = (): void => {
    units.push({ kind: 'span', offset: unitOffset, len: unitLen, text: unitText });
    while (markerIdx < sortedMarkers.length &&
           sortedMarkers[markerIdx].position <= cpCount) {
      units.push({ kind: 'marker', label: sortedMarkers[markerIdx].label });
      markerIdx++;
    }
  };

  for (const ch of text) {
    if (isCombiningMark(ch) && hasUnit) {
      unitText += ch;
      unitLen += ch.length;
      cpCount++;
    } else {
      if (hasUnit) { flush(); }
      unitText = ch;
      unitOffset = utf16Offset;
      unitLen = ch.length;
      hasUnit = true;
      cpCount++;
    }
    utf16Offset += ch.length;
  }
  if (hasUnit) { flush(); }

  return units;
}

/**
 * Build HTML where each visual unit is wrapped in a <span> carrying its UTF-16
 * document offset and length, with labelled truncation markers injected
 * between spans at each marker's code-point position.
 *
 * Serialises buildOffsetUnits. Behaviour is unchanged from before that split.
 *
 * @param text - raw document text (NOT pre-escaped)
 * @param markers - optional truncation markers
 * @returns HTML string safe for interpolation into the preview body.
 *          Each unit: <span data-offset="N" data-len="L">escaped-text</span>
 *          Empty input returns empty string.
 */
export function buildOffsetSpans(text: string, markers?: TruncationMarker[]): string {
  return buildOffsetUnits(text, markers).map(u =>
    u.kind === 'span'
      ? `<span data-offset="${u.offset}" data-len="${u.len}">${escapeHtml(u.text)}</span>`
      : `<div class="truncation-marker"><span class="truncation-label">${escapeHtml(u.label)}</span></div>`
  ).join('');
}
