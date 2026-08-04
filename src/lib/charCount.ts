/** Counting unit for the character counter. */
export type CountingUnit = 'codepoints' | 'utf16';

/** LinkedIn's hard post limit. */
export const LINKEDIN_POST_LIMIT = 3000;

/**
 * Count the characters in `text` using the given unit.
 *
 * - 'codepoints': iterates code points via for-of. Every code point
 *   counts as 1, including combining marks, CRLF (\r and \n each
 *   count separately), astral characters.
 * - 'utf16': uses text.length (UTF-16 code units). Astral characters
 *   (above U+FFFF) count as 2.
 */
export function countCharacters(text: string, unit: CountingUnit): number {
  if (unit === 'utf16') {
    return text.length;
  }
  // codepoints -- iterate via the string iterator (same code point semantics
  // as for-of) without binding an unused loop variable
  const iter = text[Symbol.iterator]();
  let n = 0;
  while (!iter.next().done) { n++; }
  return n;
}

/** The three visual states of the counter. */
export type CounterState = 'normal' | 'warning' | 'over';

/**
 * Determine the counter state given a count, the limit, and the
 * warning threshold (a count, not a percentage -- caller derives it).
 *
 * - count < warnAt  => 'normal'
 * - count >= warnAt && count <= limit  => 'warning'
 * - count > limit   => 'over'
 */
export function getCounterState(
  count: number,
  limit: number,
  warnAt: number,
): CounterState {
  if (count > limit) { return 'over'; }
  if (count >= warnAt) { return 'warning'; }
  return 'normal';
}
