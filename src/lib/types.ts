/**
 * Coverage of a style's character mapping.
 * - full: upper + lower (digits tracked separately by digitBase)
 * - upperOnly: uppercase letters only (e.g. squared)
 * - lowerOnly: lowercase letters only (e.g. parenthesized)
 */
export type Coverage = 'full' | 'upperOnly' | 'lowerOnly';

/**
 * A Unicode letterform style. Shape from PRD section 8.1.
 *
 * upperBase: first code point for uppercase A in this style, or null when the
 * style has no uppercase mapping (e.g. parenthesized).
 *
 * lowerBase: first code point for lowercase a in this style, or null when the
 * style has no lowercase mapping (e.g. squared, negative-squared).
 *
 * digitBase: first code point for digit 0 in this style, or null when the
 * style has no digit mapping (digits are left as plain ASCII).
 *
 * exceptions: per-character overrides where the standard base-offset formula
 * does not apply. Key is the ASCII source character (e.g. 'h' for italic
 * planck constant, or '0'-'9' for styles where the digit formula does not
 * apply). Value is the target code point.
 */
export interface Style {
  readonly id: string;
  readonly label: string;
  readonly upperBase: number | null;
  readonly lowerBase: number | null;
  readonly digitBase: number | null;
  readonly exceptions: ReadonlyMap<string, number>;
  readonly coverage: Coverage;
}

/**
 * A Unicode combining mark style. Shape from PRD section 8.1.
 * Unlike letterform styles, combining marks are inserted after each
 * character rather than replacing it.
 */
export interface CombiningMark {
  readonly id: string;
  readonly label: string;
  readonly codepoint: number;
}
