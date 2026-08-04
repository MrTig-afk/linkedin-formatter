import type { Style, CombiningMark } from './types';
import { detectFormatting, applyStyle, removeStyle } from './convert';
import { COMBINING_MARKS, applyCombiningMark, stripCombiningMark, COMBINING_MARK_BY_ID } from './combining';
import { MATH_STYLE_BY_ID } from './styles';
import { NON_MATH_STYLE_BY_ID } from './palettes';

/**
 * Resolve a styleId string to either a letterform Style or a CombiningMark.
 * Checks MATH_STYLE_BY_ID, then NON_MATH_STYLE_BY_ID, then COMBINING_MARK_BY_ID.
 * Returns null for unknown ids.
 */
export function resolveStyleId(
  styleId: string,
): { kind: 'style'; style: Style } | { kind: 'mark'; mark: CombiningMark } | null {
  const mathStyle = MATH_STYLE_BY_ID.get(styleId);
  if (mathStyle !== undefined) {
    return { kind: 'style', style: mathStyle };
  }
  const nonMathStyle = NON_MATH_STYLE_BY_ID.get(styleId);
  if (nonMathStyle !== undefined) {
    return { kind: 'style', style: nonMathStyle };
  }
  const mark = COMBINING_MARK_BY_ID.get(styleId);
  if (mark !== undefined) {
    return { kind: 'mark', mark };
  }
  return null;
}

/**
 * Toggle a letterform style or combining mark on selectedText.
 *
 * For letterform styles (PRD S5.3, A.4):
 *   Step 1 -- Strip all combining marks from selectedText, recording which
 *     marks were present. Output: markFree (no marks) + marksPresent list.
 *   Steps 2-3 -- Detect/strip all letterform styles from markFree to reach
 *     plain text, then apply the requested style to plain → fullyStyled.
 *     Both operations run on mark-free text so comparisons are unambiguous.
 *   Step 4 -- Compare fullyStyled against markFree (both mark-free):
 *     - Equal: selection was already entirely in the requested style →
 *       toggle off. Return plain (marks stripped per PRD A.4).
 *     - Not equal: apply path. Return fullyStyled with original marks
 *       re-applied uniformly over the newly styled text.
 *
 * For combining marks (PRD S5.3):
 *   - Uses strip/re-apply comparison to decide: uniform → remove, else apply.
 *   - Underlying letterform style is preserved.
 *
 * Returns selectedText unchanged for unknown styleIds.
 */
export function toggleStyle(selectedText: string, styleId: string): string {
  const resolved = resolveStyleId(styleId);
  if (resolved === null) {
    return selectedText;
  }

  if (resolved.kind === 'style') {
    const requestedStyle = resolved.style;

    // Step 1: Strip all combining marks from selectedText.
    let markFree = selectedText;
    const marksPresent: CombiningMark[] = [];
    for (const mark of COMBINING_MARKS) {
      const stripped = stripCombiningMark(markFree, mark);
      if (stripped !== markFree) {
        marksPresent.push(mark);
        markFree = stripped;
      }
    }

    // Step 2: Detect and strip letterform styles from markFree.
    const detected = detectFormatting(markFree);
    const stylesPresent = new Set<Style>();
    for (const entry of detected) {
      if (entry.style !== null) {
        stylesPresent.add(entry.style);
      }
    }
    let plain = markFree;
    for (const style of stylesPresent) {
      plain = removeStyle(plain, style);
    }

    // Step 3: Apply the requested style to plain text.
    const fullyStyled = applyStyle(plain, requestedStyle);

    // Step 4: Compare on mark-free strings and decide.
    if (fullyStyled === markFree) {
      // Toggle off. Return plain -- marks already absent (PRD A.4).
      return plain;
    }

    // Apply: re-apply original marks over the newly styled text.
    let result = fullyStyled;
    for (const mark of marksPresent) {
      result = applyCombiningMark(result, mark);
    }
    return result;
  }

  // kind === 'mark': combining mark toggle using strip/re-apply comparison.
  const mark = resolved.mark;
  const stripped = stripCombiningMark(selectedText, mark);
  if (stripped === selectedText) {
    // Mark not present at all → apply.
    return applyCombiningMark(selectedText, mark);
  }
  const reapplied = applyCombiningMark(stripped, mark);
  if (reapplied === selectedText) {
    // Mark is uniformly present → remove (toggle off).
    return stripped;
  }
  // Partial presence → strip and re-apply uniformly.
  return reapplied;
}

/**
 * Remove all combining marks and all letterform styles from text.
 * Returns plain ASCII (plus any unmappable characters unchanged).
 */
export function clearAllFormatting(text: string): string {
  let result = text;
  for (const mark of COMBINING_MARKS) {
    result = stripCombiningMark(result, mark);
  }
  const detected = detectFormatting(result);
  const styles = new Set<Style>();
  for (const entry of detected) {
    if (entry.style !== null) { styles.add(entry.style); }
  }
  for (const style of styles) {
    result = removeStyle(result, style);
  }
  return result;
}

/**
 * Defense-in-depth: snap an offset to a code-point boundary.
 * The webview resolves offsets to span boundaries (always code-point-aligned),
 * so this cannot be triggered from the UI. Protects against a validator that
 * clamps to document length but not to surrogate boundaries.
 *
 * direction='backward': if offset lands on a low surrogate, move to offset - 1.
 * direction='forward':  if offset lands on a low surrogate, move to offset + 1.
 */
export function snapToCodePointBoundary(
  text: string,
  offset: number,
  direction: 'backward' | 'forward',
): number {
  if (offset <= 0) { return 0; }
  if (offset >= text.length) { return text.length; }
  const code = text.charCodeAt(offset);
  // Low surrogate (trail surrogate): 0xDC00-0xDFFF
  if (code >= 0xDC00 && code <= 0xDFFF) {
    return direction === 'backward' ? offset - 1 : offset + 1;
  }
  return offset;
}
