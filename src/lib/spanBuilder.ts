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
 * Build HTML where each visual unit (code point plus any trailing combining
 * marks) is wrapped in a <span> carrying its UTF-16 document offset and
 * UTF-16 length.
 *
 * When `markers` are supplied, a labelled horizontal-rule div is injected
 * between spans at each marker's code-point position. Markers are only
 * injected when the text exceeds the position (there must be content after
 * the cutoff). The marker elements carry no data-offset/data-len attributes
 * and are inert to the toolbar selection logic.
 *
 * @param text - raw document text (NOT pre-escaped)
 * @param markers - optional truncation markers; omitting is backward-compatible
 * @returns HTML string safe for interpolation into the preview body.
 *          Each unit: <span data-offset="N" data-len="L">escaped-text</span>
 *          Empty input returns empty string.
 */
export function buildOffsetSpans(text: string, markers?: TruncationMarker[]): string {
  if (text.length === 0) {
    return '';
  }

  // Fast path: no markers -- run the original loop with no overhead.
  if (!markers || markers.length === 0) {
    let result = '';
    let utf16Offset = 0;
    let unitText = '';
    let unitOffset = 0;
    let unitLen = 0;
    let hasUnit = false;

    for (const ch of text) {
      if (isCombiningMark(ch) && hasUnit) {
        unitText += ch;
        unitLen += ch.length;
      } else {
        if (hasUnit) {
          result += `<span data-offset="${unitOffset}" data-len="${unitLen}">${escapeHtml(unitText)}</span>`;
        }
        unitText = ch;
        unitOffset = utf16Offset;
        unitLen = ch.length;
        hasUnit = true;
      }
      utf16Offset += ch.length;
    }
    if (hasUnit) {
      result += `<span data-offset="${unitOffset}" data-len="${unitLen}">${escapeHtml(unitText)}</span>`;
    }
    return result;
  }

  // Count total code points (text is at most 3,000 chars -- negligible).
  const totalCp = [...text].length;

  // Sort ascending; filter out markers at or beyond the total (marker only
  // shown when text exceeds the position -- there must be content after it).
  const sortedMarkers = markers
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter(m => m.position < totalCp);

  let result = '';
  let utf16Offset = 0;
  let unitText = '';
  let unitOffset = 0;
  let unitLen = 0;
  let hasUnit = false;
  // cpCount tracks how many code points have been placed into units (flushed
  // or the current in-progress unit). It lags behind the loop iterator by one
  // base character so that the marker check fires AFTER the correct unit.
  let cpCount = 0;
  let markerIdx = 0;

  for (const ch of text) {
    if (isCombiningMark(ch) && hasUnit) {
      // Combining mark: append to current unit, count the code point.
      unitText += ch;
      unitLen += ch.length;
      cpCount++;
    } else {
      // Base character: flush the previous unit first (if any), then check
      // whether any marker position has been crossed.
      if (hasUnit) {
        result += `<span data-offset="${unitOffset}" data-len="${unitLen}">${escapeHtml(unitText)}</span>`;
        while (markerIdx < sortedMarkers.length &&
               sortedMarkers[markerIdx].position <= cpCount) {
          result += `<div class="truncation-marker"><span class="truncation-label">${escapeHtml(sortedMarkers[markerIdx].label)}</span></div>`;
          markerIdx++;
        }
      }
      // Start a new unit for this base character.
      unitText = ch;
      unitOffset = utf16Offset;
      unitLen = ch.length;
      hasUnit = true;
      cpCount++;
    }
    utf16Offset += ch.length;
  }

  // Flush the last unit and check for any remaining markers.
  if (hasUnit) {
    result += `<span data-offset="${unitOffset}" data-len="${unitLen}">${escapeHtml(unitText)}</span>`;
    while (markerIdx < sortedMarkers.length &&
           sortedMarkers[markerIdx].position <= cpCount) {
      result += `<div class="truncation-marker"><span class="truncation-label">${escapeHtml(sortedMarkers[markerIdx].label)}</span></div>`;
      markerIdx++;
    }
  }

  return result;
}
