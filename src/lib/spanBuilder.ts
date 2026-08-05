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
/**
 * Split text into user-perceived characters (Unicode grapheme clusters).
 *
 * The previous rule - "a code point plus any trailing General_Category=M
 * marks" - handled accents and the combining strike/underline marks, but not
 * the three cases that matter for emoji:
 *
 *   family     U+1F469 ZWJ U+1F469 ZWJ U+1F467 ZWJ U+1F467   -> 7 units
 *   skin tone  U+1F476 U+1F3FE                                -> 2 units
 *   flag       U+1F1EC U+1F1E7                                -> 2 units
 *
 * ZWJ is General_Category=Cf and the modifiers/regional indicators are So,
 * so none of them were grouped. Backspace then deleted one component and
 * left a mangled emoji - the same defect VS Code has carried since 2017.
 *
 * Intl.Segmenter implements UAX #29 properly and ships in every runtime this
 * code targets. The fallback exists only so a missing implementation
 * degrades to the old behaviour rather than throwing.
 */
function graphemes(text: string): string[] {
  const Segmenter = (Intl as { Segmenter?: new (l?: string, o?: { granularity: string }) => {
    segment(s: string): Iterable<{ segment: string }>;
  } }).Segmenter;

  if (typeof Segmenter === 'function') {
    const out: string[] = [];
    for (const { segment } of new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
      out.push(segment);
    }
    return out;
  }

  // Fallback: code point plus trailing combining marks (the old rule).
  const out: string[] = [];
  for (const ch of text) {
    if (out.length > 0 && isCombiningMark(ch)) {
      out[out.length - 1] += ch;
    } else {
      out.push(ch);
    }
  }
  return out;
}

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
  // cpCount counts CODE POINTS placed so far, because truncation marker
  // positions are specified in code points (PRD S5.7), not graphemes or
  // UTF-16 units. Changing that would move the "see more" markers.
  let cpCount = 0;
  let markerIdx = 0;

  for (const cluster of graphemes(text)) {
    units.push({
      kind: 'span',
      offset: utf16Offset,
      len: cluster.length,
      text: cluster,
    });
    utf16Offset += cluster.length;
    cpCount += [...cluster].length;

    while (markerIdx < sortedMarkers.length &&
           sortedMarkers[markerIdx].position <= cpCount) {
      units.push({ kind: 'marker', label: sortedMarkers[markerIdx].label });
      markerIdx++;
    }
  }

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
