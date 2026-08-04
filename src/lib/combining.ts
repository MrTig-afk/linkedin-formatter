import type { CombiningMark } from './types';

export type { CombiningMark } from './types';

/** All combining marks, PRD appendix A.4. */
export const STRIKETHROUGH: CombiningMark = {
  id: 'strikethrough',
  label: 'Strikethrough',
  codepoint: 0x0336,
};

export const UNDERLINE: CombiningMark = {
  id: 'underline',
  label: 'Underline',
  codepoint: 0x0332,
};

export const COMBINING_MARKS: readonly CombiningMark[] = [STRIKETHROUGH, UNDERLINE];

export const COMBINING_MARK_BY_ID: ReadonlyMap<string, CombiningMark> = new Map(
  COMBINING_MARKS.map(m => [m.id, m])
);

const OWN_MARK_CODEPOINTS: ReadonlySet<number> = new Set(
  COMBINING_MARKS.map(m => m.codepoint)
);

/**
 * Inserts the combining mark after each non-whitespace, non-combining-mark
 * character in text. Iterates by code point so surrogate pairs are preserved.
 */
export function applyCombiningMark(text: string, mark: CombiningMark): string {
  const markChar = String.fromCodePoint(mark.codepoint);
  let result = '';
  for (const ch of text) {                        // code-point iteration
    result += ch;
    const cp = ch.codePointAt(0)!;
    if (/\s/.test(ch) || OWN_MARK_CODEPOINTS.has(cp)) { continue; }
    result += markChar;
  }
  return result;
}

/**
 * Removes every occurrence of the mark's code point from text.
 * Other combining marks are left intact.
 */
export function stripCombiningMark(text: string, mark: CombiningMark): string {
  const markChar = String.fromCodePoint(mark.codepoint);
  return text.replaceAll(markChar, '');
}
