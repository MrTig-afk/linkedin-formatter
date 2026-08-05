import type { CombiningMark } from './types';
import { MATH_STYLE_BY_ID } from './styles';
import { NON_MATH_STYLE_BY_ID } from './palettes';
import { COMBINING_MARKS, applyCombiningMark, stripCombiningMark } from './combining';
import { detectFormatting, styledCodePoint, styleBefore, styleAfter } from './convert';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The 11 family ids from PRD appendix E. */
export type FamilyId =
  | 'serif'
  | 'sans-serif'
  | 'script'
  | 'fraktur'
  | 'monospace'
  | 'double-struck'
  | 'circled'
  | 'squared'
  | 'negative-squared'
  | 'fullwidth'
  | 'parenthesized';

/** The two axes a modifier can toggle. */
export type Axis = 'bold' | 'italic';

/** Result of decomposing a style id into family + axes. */
export interface FamilyDecomposition {
  readonly family: FamilyId;
  readonly bold: boolean;
  readonly italic: boolean;
}

/** The four axis slots for a single family row in the matrix. */
export interface FamilySlots {
  readonly regular: string;       // style id or 'plain'
  readonly bold: string | null;
  readonly italic: string | null;
  readonly boldItalic: string | null;
}

// ---------------------------------------------------------------------------
// Data: FAMILY_IDS and FAMILY_MATRIX (verbatim from PRD appendix E)
// ---------------------------------------------------------------------------

/** Ordered list of all 11 family ids, PRD appendix E order. */
export const FAMILY_IDS: readonly FamilyId[] = [
  'serif',
  'sans-serif',
  'script',
  'fraktur',
  'monospace',
  'double-struck',
  'circled',
  'squared',
  'negative-squared',
  'fullwidth',
  'parenthesized',
];

/** The family/axis matrix, verbatim from PRD appendix E. */
/** Human-readable dropdown labels, one per family, same order as FAMILY_IDS. */
export const FAMILY_LABELS: ReadonlyMap<FamilyId, string> = new Map([
  ['serif', 'Serif'],
  ['sans-serif', 'Sans-serif'],
  ['script', 'Script'],
  ['fraktur', 'Fraktur'],
  ['monospace', 'Monospace'],
  ['double-struck', 'Double-struck'],
  ['circled', 'Circled'],
  ['squared', 'Squared'],
  ['negative-squared', 'Negative squared'],
  ['fullwidth', 'Fullwidth'],
  ['parenthesized', 'Parenthesized'],
]);

export const FAMILY_MATRIX: ReadonlyMap<FamilyId, FamilySlots> = new Map([
  ['serif',            { regular: 'plain',            bold: 'bold',               italic: 'italic',              boldItalic: 'bold-italic'           }],
  ['sans-serif',       { regular: 'sans-serif',       bold: 'sans-serif-bold',    italic: 'sans-serif-italic',   boldItalic: 'sans-serif-bold-italic' }],
  ['script',           { regular: 'script',           bold: 'bold-script',        italic: null,                  boldItalic: null                    }],
  ['fraktur',          { regular: 'fraktur',          bold: 'bold-fraktur',       italic: null,                  boldItalic: null                    }],
  ['monospace',        { regular: 'monospace',        bold: null,                 italic: null,                  boldItalic: null                    }],
  ['double-struck',    { regular: 'double-struck',    bold: null,                 italic: null,                  boldItalic: null                    }],
  ['circled',          { regular: 'circled',          bold: null,                 italic: null,                  boldItalic: null                    }],
  ['squared',          { regular: 'squared',          bold: null,                 italic: null,                  boldItalic: null                    }],
  ['negative-squared', { regular: 'negative-squared', bold: null,                 italic: null,                  boldItalic: null                    }],
  ['fullwidth',        { regular: 'fullwidth',        bold: null,                 italic: null,                  boldItalic: null                    }],
  ['parenthesized',    { regular: 'parenthesized',    bold: null,                 italic: null,                  boldItalic: null                    }],
]);

// ---------------------------------------------------------------------------
// Derived: DECOMPOSE_MAP (built at load time by inverting FAMILY_MATRIX)
// PRD S8.3: "Build it by inverting the forward map at load time."
// ---------------------------------------------------------------------------

const DECOMPOSE_MAP: ReadonlyMap<string, FamilyDecomposition> = (() => {
  const map = new Map<string, FamilyDecomposition>();
  for (const [family, slots] of FAMILY_MATRIX) {
    map.set(slots.regular, { family, bold: false, italic: false });
    if (slots.bold !== null) {
      map.set(slots.bold, { family, bold: true, italic: false });
    }
    if (slots.italic !== null) {
      map.set(slots.italic, { family, bold: false, italic: true });
    }
    if (slots.boldItalic !== null) {
      map.set(slots.boldItalic, { family, bold: true, italic: true });
    }
  }
  return map;
})();

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Look up a style id (or 'plain') in the decompose map.
 * Returns null for unknown inputs (including combining mark ids).
 */
export function decompose(styleIdOrPlain: string): FamilyDecomposition | null {
  return DECOMPOSE_MAP.get(styleIdOrPlain) ?? null;
}

/**
 * Return the style id (or 'plain') for the given family and axis combination.
 * Returns null when the combination does not exist in Unicode.
 */
export function compose(family: FamilyId, bold: boolean, italic: boolean): string | null {
  const slots = FAMILY_MATRIX.get(family);
  if (slots === undefined) {
    return null;
  }
  if (bold && italic) {
    return slots.boldItalic;
  }
  if (bold) {
    return slots.bold;
  }
  if (italic) {
    return slots.italic;
  }
  return slots.regular;
}

/**
 * Find the nearest axis combination the family supports (PRD S5.3.1).
 * Cascade: exact -> drop italic -> drop bold -> drop both.
 * Always succeeds; every family has a regular slot.
 */
export function nearestSupported(
  family: FamilyId,
  bold: boolean,
  italic: boolean,
): { styleIdOrPlain: string; bold: boolean; italic: boolean } {
  // 1. Exact match.
  let result = compose(family, bold, italic);
  if (result !== null) {
    return { styleIdOrPlain: result, bold, italic };
  }
  // 2. Drop italic, keep bold.
  result = compose(family, bold, false);
  if (result !== null) {
    return { styleIdOrPlain: result, bold, italic: false };
  }
  // 3. Drop bold, keep italic.
  result = compose(family, false, italic);
  if (result !== null) {
    return { styleIdOrPlain: result, bold: false, italic };
  }
  // 4. Drop both -- always succeeds (regular slot is always non-null).
  const slots = FAMILY_MATRIX.get(family)!;
  return { styleIdOrPlain: slots.regular, bold: false, italic: false };
}

/** What the toolbar needs to know about the current selection (S5.3.1). */
export interface SelectionSummary {
  /** The single family every letter/digit shares, or null when mixed or none. */
  readonly family: FamilyId | null;
  /** True when every letter in the selection carries the bold axis. */
  readonly bold: boolean;
  /** True when every letter in the selection carries the italic axis. */
  readonly italic: boolean;
}

/**
 * Summarize a selection for toolbar state: which family it is in (plain
 * ASCII counts as serif, the family whose regular slot is 'plain') and
 * whether bold/italic are uniformly applied. Axis flags mirror the
 * toggleAxis direction rule: pressed only when ALL letters carry the axis.
 * Combining marks are ignored.
 */
export function summarizeSelection(text: string): SelectionSummary {
  let markFree = text;
  for (const mark of COMBINING_MARKS) {
    markFree = stripCombiningMark(markFree, mark);
  }

  const detected = detectFormatting(markFree);
  const codePoints = Array.from(markFree);

  const families = new Set<FamilyId>();
  let letterCount = 0;
  let allBold = true;
  let allItalic = true;

  for (let i = 0; i < detected.length; i++) {
    const entry = detected[i];
    const ch = codePoints[i];
    const effectivePlain = entry.plain ?? ch;
    if (!/[A-Za-z0-9]/.test(effectivePlain)) {
      continue;
    }

    let d: FamilyDecomposition | null;
    if (entry.style !== null) {
      d = decompose(entry.style.id);
      if (d === null) { continue; }
    } else {
      d = { family: 'serif', bold: false, italic: false };
    }
    families.add(d.family);

    if (/[A-Za-z]/.test(effectivePlain)) {
      letterCount++;
      allBold = allBold && d.bold;
      allItalic = allItalic && d.italic;
    }
  }

  return {
    family: families.size === 1 ? [...families][0] : null,
    bold: letterCount > 0 && allBold,
    italic: letterCount > 0 && allItalic,
  };
}

/**
 * The family a toggle should act in for this selection: the selection's own
 * uniform family, falling back only when it is mixed or has no letters.
 * Prevents a previously active family (e.g. circled) from leaking into a
 * bold toggle on text that is visibly something else.
 */
export function effectiveFamily(text: string, fallback: FamilyId): FamilyId {
  return summarizeSelection(text).family ?? fallback;
}

// ---------------------------------------------------------------------------
// Private helper
// ---------------------------------------------------------------------------

/**
 * Re-style a plain ASCII character under the given style id or 'plain'.
 * Returns the plain char when styleIdOrPlain is 'plain', when the style is
 * unknown, or when styledCodePoint returns null (coverage limit).
 */
function restyled(plainChar: string, styleIdOrPlain: string): string {
  if (styleIdOrPlain === 'plain') {
    return plainChar;
  }
  const style = MATH_STYLE_BY_ID.get(styleIdOrPlain) ?? NON_MATH_STYLE_BY_ID.get(styleIdOrPlain);
  if (style === undefined) {
    return plainChar;
  }
  const cp = styledCodePoint(plainChar, style);
  return cp !== null ? String.fromCodePoint(cp) : plainChar;
}

/**
 * Like restyled, but folds letter case when the target family only covers
 * the opposite case: squared/negative-squared are A-Z only, parenthesized
 * is a-z only. Converting "hello" to negative squared must yield the
 * uppercase forms, not silently pass lowercase through (owner decision,
 * 2026-07-30). Case folding is deliberate and lossy: converting back to a
 * two-case family keeps the folded case. Non-letters never fold.
 */
function restyledFolded(plainChar: string, styleIdOrPlain: string): string {
  const first = restyled(plainChar, styleIdOrPlain);
  if (first !== plainChar || styleIdOrPlain === 'plain') { return first; }
  const swapped = plainChar === plainChar.toUpperCase()
    ? plainChar.toLowerCase()
    : plainChar.toUpperCase();
  if (swapped === plainChar) { return plainChar; }
  const second = restyled(swapped, styleIdOrPlain);
  return second !== swapped ? second : plainChar;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Convert every character in text to targetFamily, preserving supported axes.
 *
 * Unrepresentable characters (coverage limit or no slot) revert to plain ASCII.
 * Combining marks are stripped before conversion and re-applied uniformly after.
 */
export function convertFamily(text: string, targetFamily: FamilyId): string {
  // Step 1: Strip combining marks, record which were present.
  let markFree = text;
  const marksPresent: CombiningMark[] = [];
  for (const mark of COMBINING_MARKS) {
    const stripped = stripCombiningMark(markFree, mark);
    if (stripped !== markFree) {
      marksPresent.push(mark);
      markFree = stripped;
    }
  }

  // Step 2: Detect formatting on mark-free text.
  const detected = detectFormatting(markFree);
  const codePoints = Array.from(markFree);

  // Step 3: Rebuild character by character.
  let result = '';
  for (let i = 0; i < detected.length; i++) {
    const entry = detected[i];
    const ch = codePoints[i];

    if (entry.style !== null && entry.plain !== null) {
      // Styled character: decompose, find nearest supported, restyle.
      const d = decompose(entry.style.id);
      if (d === null) {
        result += ch;
      } else {
        const target = nearestSupported(targetFamily, d.bold, d.italic);
        result += restyledFolded(entry.plain, target.styleIdOrPlain);
      }
    } else if (entry.style === null && entry.plain === null && /[A-Za-z0-9]/.test(ch)) {
      // Plain ASCII letter or digit: treat as serif/not-bold/not-italic.
      const target = nearestSupported(targetFamily, false, false);
      result += restyledFolded(ch, target.styleIdOrPlain);
    } else {
      // Whitespace, punctuation, emoji, non-ASCII: emit unchanged.
      result += ch;
    }
  }

  // Step 4: Re-apply combining marks.
  for (const mark of marksPresent) {
    result = applyCombiningMark(result, mark);
  }
  return result;
}

/**
 * Toggle the bold or italic axis on every character in text.
 *
 * Toggle rule (PRD S5.3.1): if every letter already carries the axis, remove
 * it; otherwise add it. Digits and punctuation do not participate in the
 * toggle decision. Each character keeps its own family; plain characters adopt
 * activeFamily. Combining marks are always preserved.
 */
export function toggleAxis(text: string, axis: Axis, activeFamily: FamilyId): string {
  // Step 1: Strip combining marks, record which were present.
  let markFree = text;
  const marksPresent: CombiningMark[] = [];
  for (const mark of COMBINING_MARKS) {
    const stripped = stripCombiningMark(markFree, mark);
    if (stripped !== markFree) {
      marksPresent.push(mark);
      markFree = stripped;
    }
  }

  // Step 2: Detect formatting on mark-free text.
  const detected = detectFormatting(markFree);
  const codePoints = Array.from(markFree);

  // Step 3: First pass -- decide toggle direction.
  // Default 'remove' (vacuous: no letters present).
  // For a styled char, check entry.plain (the plain ASCII char it maps back to).
  // For an unstyled char, check the raw code point.
  let direction: 'add' | 'remove' = 'remove';
  for (let i = 0; i < detected.length; i++) {
    const entry = detected[i];
    const ch = codePoints[i];
    const effectivePlain = entry.plain ?? ch;
    if (!/[A-Za-z]/.test(effectivePlain)) {
      continue;
    }

    let carriesAxis: boolean;
    if (entry.style !== null) {
      const d = decompose(entry.style.id);
      carriesAxis = d !== null && (axis === 'bold' ? d.bold : d.italic);
    } else {
      // Plain letter: treated as {activeFamily, false, false} -- no axis.
      carriesAxis = false;
    }

    if (!carriesAxis) {
      direction = 'add';
      break;
    }
  }

  // Step 4: Second pass -- apply per character.
  let result = '';
  for (let i = 0; i < detected.length; i++) {
    const entry = detected[i];
    const ch = codePoints[i];
    const effectivePlain = entry.plain ?? ch;

    if (!/[A-Za-z0-9]/.test(effectivePlain)) {
      // Not a letter or digit: emit unchanged.
      result += ch;
      continue;
    }

    // Determine current decomposition and plain char for re-styling.
    let family: FamilyId;
    let bold: boolean;
    let italic: boolean;
    let plainChar: string;

    if (entry.style !== null && entry.plain !== null) {
      const d = decompose(entry.style.id);
      if (d === null) {
        result += ch;
        continue;
      }
      family = d.family;
      bold = d.bold;
      italic = d.italic;
      plainChar = entry.plain;
    } else {
      family = activeFamily;
      bold = false;
      italic = false;
      plainChar = ch;
    }

    // Modify the axis per toggle direction.
    if (axis === 'bold') {
      bold = direction === 'add';
    } else {
      italic = direction === 'add';
    }

    // Find nearest supported style for this character's family and restyle.
    const target = nearestSupported(family, bold, italic);
    result += restyled(plainChar, target.styleIdOrPlain);
  }

  // Step 5: Re-apply combining marks.
  for (const mark of marksPresent) {
    result = applyCombiningMark(result, mark);
  }
  return result;
}

/**
 * What style should text TYPED at `offset` receive?
 *
 * The Word model, made explicit:
 *
 *   1. Formatting follows the run being typed into. The character before the
 *      caret decides (skipping whitespace); at the start of a run, the
 *      character after it does.
 *   2. A pending axis override - the user pressed Ctrl+B at this caret -
 *      beats inheritance for that axis only. Pressing bold inside a bold run
 *      turns typing plain; pressing it in plain text turns typing bold.
 *   3. With nothing to inherit and nothing pending, the toolbar family is
 *      the fallback.
 *
 * Returns a style id, or 'plain'. Pure, so the whole matrix is unit-testable
 * without a webview or an editor.
 */
export function resolveTypingStyle(
  fullText: string,
  offset: number,
  pendingBold: boolean | null,
  pendingItalic: boolean | null,
  fallbackFamily: FamilyId,
): string {
  const inherited = styleBefore(fullText, offset) ?? styleAfter(fullText, offset);
  const base = inherited !== null ? decompose(inherited.id) : null;

  const family = base !== null ? base.family : fallbackFamily;
  const bold = pendingBold ?? (base !== null ? base.bold : false);
  const italic = pendingItalic ?? (base !== null ? base.italic : false);

  return nearestSupported(family, bold, italic).styleIdOrPlain;
}
