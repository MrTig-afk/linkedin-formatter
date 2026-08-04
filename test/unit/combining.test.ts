import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  COMBINING_MARKS,
  COMBINING_MARK_BY_ID,
  STRIKETHROUGH,
  UNDERLINE,
  applyCombiningMark,
  stripCombiningMark,
} from '../../src/lib/combining';
import { MATH_STYLE_BY_ID } from '../../src/lib/styles';
import { NON_MATH_STYLE_BY_ID } from '../../src/lib/palettes';

// Derive mark characters from the constants under test so expected values are
// unambiguous regardless of source-file encoding.
const ST = String.fromCodePoint(STRIKETHROUGH.codepoint); // U+0336
const UL = String.fromCodePoint(UNDERLINE.codepoint);     // U+0332

// ---------------------------------------------------------------------------
// Data tests
// ---------------------------------------------------------------------------

test('COMBINING_MARKS contains exactly 2 entries', () => {
  assert.equal(COMBINING_MARKS.length, 2);
});

test('every combining mark id is unique', () => {
  const ids = COMBINING_MARKS.map(m => m.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length);
});

test('no combining mark id collides with a math or non-math style id', () => {
  for (const mark of COMBINING_MARKS) {
    assert.ok(
      !MATH_STYLE_BY_ID.has(mark.id),
      `id '${mark.id}' collides with a math style id`
    );
    assert.ok(
      !NON_MATH_STYLE_BY_ID.has(mark.id),
      `id '${mark.id}' collides with a non-math style id`
    );
  }
});

test('every COMBINING_MARKS entry is retrievable from COMBINING_MARK_BY_ID as the same reference', () => {
  for (const mark of COMBINING_MARKS) {
    const found = COMBINING_MARK_BY_ID.get(mark.id);
    assert.ok(found !== undefined, `id '${mark.id}' not found in COMBINING_MARK_BY_ID`);
    assert.equal(found, mark);
  }
});

test('every entry has correct shape', () => {
  for (const mark of COMBINING_MARKS) {
    assert.ok(typeof mark.id === 'string' && mark.id.length > 0,
      `${mark.id}: id must be a non-empty string`);
    assert.ok(typeof mark.label === 'string' && mark.label.length > 0,
      `${mark.id}: label must be a non-empty string`);
    assert.ok(Number.isInteger(mark.codepoint) && mark.codepoint > 0,
      `${mark.id}: codepoint must be a positive integer`);
  }
});

test('verbatim code points from PRD appendix A.4', () => {
  assert.equal(STRIKETHROUGH.codepoint, 0x0336);
  assert.equal(UNDERLINE.codepoint, 0x0332);
});

test('COMBINING_MARK_BY_ID returns undefined for unknown id', () => {
  assert.equal(COMBINING_MARK_BY_ID.get('nonexistent'), undefined);
  assert.equal(COMBINING_MARK_BY_ID.get(''), undefined);
  assert.equal(COMBINING_MARK_BY_ID.get('Strikethrough'), undefined);
});

// ---------------------------------------------------------------------------
// applyCombiningMark tests
// ---------------------------------------------------------------------------

test('inserts mark after each character', () => {
  assert.equal(
    applyCombiningMark('abc', STRIKETHROUGH),
    'a' + ST + 'b' + ST + 'c' + ST
  );
});

test('skips space characters', () => {
  assert.equal(
    applyCombiningMark('a b', STRIKETHROUGH),
    'a' + ST + ' ' + 'b' + ST
  );
});

test('skips newlines and tabs', () => {
  assert.equal(
    applyCombiningMark('a\nb\tc', STRIKETHROUGH),
    'a' + ST + '\n' + 'b' + ST + '\t' + 'c' + ST
  );
});

test('handles empty string', () => {
  assert.equal(applyCombiningMark('', STRIKETHROUGH), '');
});

test('all-whitespace string unchanged', () => {
  assert.equal(applyCombiningMark('  \n', STRIKETHROUGH), '  \n');
});

test('works with math-alphanumeric characters above U+FFFF', () => {
  // U+1D400 = bold A, U+1D41A = bold a (each is a surrogate pair in UTF-16).
  // A UTF-16-unit loop would corrupt surrogate pairs; for...of yields the full
  // code point as a single iteration.
  const input = '\u{1D400}\u{1D41A}';
  const expected = '\u{1D400}' + ST + '\u{1D41A}' + ST;
  assert.equal(applyCombiningMark(input, STRIKETHROUGH), expected);
});

test('works with emoji above U+FFFF', () => {
  // U+1F600 = 😀 (surrogate pair in UTF-16). Mark inserted after the full emoji
  // code point; for...of iteration yields it as one unit, not two halves.
  // This is a separate case from math-alphanumeric: emoji are above U+FFFF and
  // not whitespace, so the mark IS inserted after them.
  const input = '\u{1F600}';
  const expected = '\u{1F600}' + ST;
  assert.equal(applyCombiningMark(input, STRIKETHROUGH), expected);
});

test('skips non-breaking space (U+00A0)', () => {
  // PRD appendix A.4: skip whitespace so the mark does not render as a
  // floating dash. NBSP (U+00A0) is matched by /\s/ in JavaScript.
  const nbsp = ' ';
  assert.equal(
    applyCombiningMark('a' + nbsp + 'b', STRIKETHROUGH),
    'a' + ST + nbsp + 'b' + ST
  );
});

test('skips existing combining marks during layering', () => {
  // Input: 'a' + ST + 'b' + ST  (strikethrough already applied)
  // Algorithm: 'a' is a base char -> emit 'a', then emit UL.
  //            ST is an OWN_MARK -> emit ST, skip (no second mark after it).
  //            'b' is a base char -> emit 'b', then emit UL.
  //            ST is an OWN_MARK -> emit ST, skip.
  // Result: 'a' + UL + ST + 'b' + UL + ST
  const withStrikethrough = 'a' + ST + 'b' + ST;
  const expected = 'a' + UL + ST + 'b' + UL + ST;
  assert.equal(applyCombiningMark(withStrikethrough, UNDERLINE), expected);
});

test('applies to digits and punctuation', () => {
  assert.equal(
    applyCombiningMark('1!', UNDERLINE),
    '1' + UL + '!' + UL
  );
});

// ---------------------------------------------------------------------------
// stripCombiningMark tests
// ---------------------------------------------------------------------------

test('strips all instances of the mark', () => {
  const input = 'a' + ST + 'b' + ST + 'c' + ST;
  assert.equal(stripCombiningMark(input, STRIKETHROUGH), 'abc');
});

test('leaves other marks intact', () => {
  // 'a' + UL + ST + 'b' + UL + ST: strip strikethrough, underline survives.
  const input = 'a' + UL + ST + 'b' + UL + ST;
  assert.equal(stripCombiningMark(input, STRIKETHROUGH), 'a' + UL + 'b' + UL);
});

test('no-op on string without the mark', () => {
  assert.equal(stripCombiningMark('abc', STRIKETHROUGH), 'abc');
});

test('handles empty string', () => {
  assert.equal(stripCombiningMark('', STRIKETHROUGH), '');
});

test('works with math-alphanumeric characters above U+FFFF', () => {
  const input = '\u{1D400}' + ST;
  assert.equal(stripCombiningMark(input, STRIKETHROUGH), '\u{1D400}');
});
