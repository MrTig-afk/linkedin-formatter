import type { Style, CombiningMark } from './types';
import { MATH_STYLES } from './styles';
import { NON_MATH_STYLES } from './palettes';
import { COMBINING_MARKS } from './combining';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All 18 styles (13 math + 5 non-math). Exported so T07 can iterate all in one loop. */
export const ALL_STYLES: readonly Style[] = [...MATH_STYLES, ...NON_MATH_STYLES];

/**
 * Code point -> CombiningMark lookup. Used by detectFormatting for O(1)
 * combining-mark detection.
 */
const MARK_CODEPOINTS: ReadonlyMap<number, CombiningMark> = new Map(
  COMBINING_MARKS.map(m => [m.codepoint, m])
);

/**
 * Styled code point -> { style, plain ASCII char } lookup.
 * Built at load time by inverting the forward map. PRD S8.3:
 * "Build it by inverting the forward map at load time.
 * Do not hand-write a second table."
 *
 * The !map.has(cp) guard means the first style in ALL_STYLES wins if two
 * styles ever produce the same code point (no collisions exist in practice).
 *
 * styledCodePoint is a function declaration and is hoisted, so it is
 * available when this IIFE runs even though it appears later in the file.
 */
const REVERSE_MAP: ReadonlyMap<number, { style: Style; plain: string }> = (() => {
  const map = new Map<number, { style: Style; plain: string }>();
  for (const style of ALL_STYLES) {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
      const cp = styledCodePoint(ch, style);
      if (cp !== null && !map.has(cp)) {
        map.set(cp, { style, plain: ch });
      }
    }
  }
  return map;
})();

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * Result of detecting formatting on a single logical character
 * (base code point + any trailing combining marks).
 */
export interface DetectedFormat {
  /** The letterform style, or null if the character is plain/unmapped. */
  readonly style: Style | null;
  /** Combining marks present, in the order they appear. May be empty. */
  readonly marks: readonly CombiningMark[];
  /** The plain ASCII character this maps back to, or null if not styled. */
  readonly plain: string | null;
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Map a single plain ASCII character to its styled code point under the given
 * style. Returns the code point (number), or null if the character is not
 * mappable under this style.
 *
 * Lookup order:
 * 1. style.exceptions.get(ch) -- covers italic h, script B, circled digits, etc.
 * 2. A-Z with non-null upperBase
 * 3. a-z with non-null lowerBase
 * 4. 0-9 with non-null digitBase
 * 5. null (fail closed)
 */
export function styledCodePoint(ch: string, style: Style): number | null {
  const exc = style.exceptions.get(ch);
  if (exc !== undefined) {
    return exc;
  }
  const cp = ch.codePointAt(0)!;
  if (cp >= 0x41 && cp <= 0x5A && style.upperBase !== null) {
    return style.upperBase + (cp - 0x41);
  }
  if (cp >= 0x61 && cp <= 0x7A && style.lowerBase !== null) {
    return style.lowerBase + (cp - 0x61);
  }
  if (cp >= 0x30 && cp <= 0x39 && style.digitBase !== null) {
    return style.digitBase + (cp - 0x30);
  }
  return null;
}

/**
 * Convert a plain-text string to a styled string under the given style.
 * Iterates by code point. Unmappable characters pass through unchanged.
 * Does NOT apply combining marks -- those are a separate layer.
 */
export function applyStyle(text: string, style: Style): string {
  let result = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (ch.length === 1 && cp >= 0x20 && cp <= 0x7E) {
      const styled = styledCodePoint(ch, style);
      result += styled !== null ? String.fromCodePoint(styled) : ch;
    } else {
      result += ch;
    }
  }
  return result;
}

/**
 * Remove a specific style from a string, reverting styled characters to plain
 * ASCII. Only characters belonging to the given style are reverted; characters
 * from other styles are left unchanged.
 * Does NOT strip combining marks -- the caller handles that separately.
 */
export function removeStyle(text: string, style: Style): string {
  let result = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const entry = REVERSE_MAP.get(cp);
    if (entry !== undefined && entry.style === style) {
      result += entry.plain;
    } else {
      result += ch;
    }
  }
  return result;
}

/**
 * Detect the letterform style of a single code point.
 * Returns { style, plain } if the code point is in REVERSE_MAP, null otherwise.
 */
export function detectStyle(codePoint: number): { style: Style; plain: string } | null {
  return REVERSE_MAP.get(codePoint) ?? null;
}

/**
 * Detect formatting on an entire string. Returns one DetectedFormat per
 * logical character (base + trailing combining marks = one entry).
 *
 * Detection order (PRD S8.3): combining marks first, then letterform.
 *
 * Edge case: if the base code point is itself a combining mark (orphaned mark),
 * it becomes a standalone entry: style null, plain null, marks [thatMark].
 */
export function detectFormatting(text: string): DetectedFormat[] {
  const chars = Array.from(text);  // code-point array (for...of equivalent with index access)
  const result: DetectedFormat[] = [];
  let i = 0;
  while (i < chars.length) {
    const base = chars[i];
    const baseCp = base.codePointAt(0)!;
    i++;

    const marks: CombiningMark[] = [];

    // Orphaned combining mark: treat the mark itself as the sole mark entry.
    const ownMark = MARK_CODEPOINTS.get(baseCp);
    if (ownMark !== undefined) {
      marks.push(ownMark);
      result.push({ style: null, marks, plain: null });
      continue;
    }

    // Collect any combining marks immediately following the base code point.
    while (i < chars.length) {
      const nextCp = chars[i].codePointAt(0)!;
      const nextMark = MARK_CODEPOINTS.get(nextCp);
      if (nextMark === undefined) {
        break;
      }
      marks.push(nextMark);
      i++;
    }

    // Look up the base in the reverse map.
    const rev = REVERSE_MAP.get(baseCp);
    result.push({
      style: rev?.style ?? null,
      marks,
      plain: rev?.plain ?? null,
    });
  }
  return result;
}

/**
 * The letterform style of the character immediately BEFORE an offset, or null
 * when there is nothing there or it is unstyled ASCII.
 *
 * Reads a whole code point: styled characters are astral (two UTF-16 units),
 * so looking back one unit would see a lone surrogate and detect nothing.
 */
export function styleBefore(fullText: string, offset: number): Style | null {
  if (offset <= 0) { return null; }
  // Take a few units back and pick the last WHOLE code point.
  const window = fullText.slice(Math.max(0, offset - 4), offset);
  const chars = [...window];
  const prev = chars[chars.length - 1];
  if (prev === undefined) { return null; }
  const cp = prev.codePointAt(0);
  if (cp === undefined) { return null; }
  const detected = detectStyle(cp);
  return detected === null ? null : detected.style;
}

/**
 * The letterform style of the character immediately AFTER an offset, or null.
 *
 * Companion to styleBefore. Typing at the very START of a styled run has
 * nothing styled behind it, so the run in front is the better guide: clicking
 * in front of a bold word and typing should continue that word, not start a
 * plain one in the middle of it.
 */
export function styleAfter(fullText: string, offset: number): Style | null {
  if (offset < 0 || offset >= fullText.length) { return null; }
  const next = String.fromCodePoint(fullText.codePointAt(offset) ?? 0);
  const cp = next.codePointAt(0);
  if (cp === undefined) { return null; }
  const detected = detectStyle(cp);
  return detected === null ? null : detected.style;
}
