import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  ALL_STYLES,
  styledCodePoint,
  applyStyle,
  removeStyle,
  detectStyle,
  detectFormatting,
  applyStyleForTyping,
} from '../../src/lib/convert';
import type { DetectedFormat } from '../../src/lib/convert';
import { MATH_STYLE_BY_ID } from '../../src/lib/styles';
import { NON_MATH_STYLE_BY_ID } from '../../src/lib/palettes';
import { STRIKETHROUGH, UNDERLINE } from '../../src/lib/combining';

// Style references used across multiple tests.
const bold          = MATH_STYLE_BY_ID.get('bold')!;
const italic        = MATH_STYLE_BY_ID.get('italic')!;
const script        = MATH_STYLE_BY_ID.get('script')!;
const circled       = NON_MATH_STYLE_BY_ID.get('circled')!;
const squared       = NON_MATH_STYLE_BY_ID.get('squared')!;
const parenthesized = NON_MATH_STYLE_BY_ID.get('parenthesized')!;

// Combining-mark characters derived from constants (encoding-safe).
const ST = String.fromCodePoint(STRIKETHROUGH.codepoint); // U+0336
const UL = String.fromCodePoint(UNDERLINE.codepoint);     // U+0332

// ---------------------------------------------------------------------------
// styledCodePoint
// ---------------------------------------------------------------------------

test('bold A maps to 0x1D400', () => {
  assert.equal(styledCodePoint('A', bold), 0x1D400);
});

test('bold z maps to 0x1D433 (lowerBase + 25)', () => {
  assert.equal(styledCodePoint('z', bold), 0x1D41A + 25);
  assert.equal(styledCodePoint('z', bold), 0x1D433);
});

test('italic h maps to 0x210E via exception', () => {
  assert.equal(styledCodePoint('h', italic), 0x210E);
});

test('script B maps to 0x212C via exception', () => {
  assert.equal(styledCodePoint('B', script), 0x212C);
});

test('circled 0 maps to 0x24EA via digit exception', () => {
  assert.equal(styledCodePoint('0', circled), 0x24EA);
});

test('circled 5 maps to 0x2464 via digit exception', () => {
  assert.equal(styledCodePoint('5', circled), 0x2464);
});

test('bold 0 maps to 0x1D7CE via digitBase offset', () => {
  assert.equal(styledCodePoint('0', bold), 0x1D7CE);
});

test('parenthesized 0 maps to null (no exception for zero, digitBase is null)', () => {
  assert.equal(styledCodePoint('0', parenthesized), null);
});

test('squared a maps to null (lowerBase is null for upperOnly coverage)', () => {
  assert.equal(styledCodePoint('a', squared), null);
});

test('parenthesized A maps to null (upperBase is null for lowerOnly coverage)', () => {
  assert.equal(styledCodePoint('A', parenthesized), null);
});

test('non-alphanumeric exclamation mark maps to null for any style', () => {
  assert.equal(styledCodePoint('!', bold), null);
});

test('space maps to null for any style', () => {
  assert.equal(styledCodePoint(' ', bold), null);
});

// ---------------------------------------------------------------------------
// applyStyle
// ---------------------------------------------------------------------------

test('applyStyle Ab1 bold produces three styled code points', () => {
  const result = applyStyle('Ab1', bold);
  const cps = [...result].map(c => c.codePointAt(0));
  assert.deepEqual(cps, [0x1D400, 0x1D41B, 0x1D7CF]);
});

test('applyStyle A b! bold: letters styled, space and punctuation unchanged', () => {
  const result = applyStyle('A b!', bold);
  const cps = [...result].map(c => c.codePointAt(0));
  // bold A, space (0x20), bold b, exclamation (0x21)
  assert.deepEqual(cps, [0x1D400, 0x20, 0x1D41B, 0x21]);
});

test('applyStyle empty string returns empty string', () => {
  assert.equal(applyStyle('', bold), '');
});

test('applyStyle AB bold: two code points despite four UTF-16 units', () => {
  const result = applyStyle('AB', bold);
  assert.equal([...result].length, 2);
});

// ---------------------------------------------------------------------------
// detectStyle (REVERSE_MAP)
// ---------------------------------------------------------------------------

test('detectStyle 0x1D400 returns bold A', () => {
  const found = detectStyle(0x1D400);
  assert.ok(found !== null);
  assert.equal(found.style, bold);
  assert.equal(found.plain, 'A');
});

test('detectStyle 0x210E returns italic h (exception round-trip)', () => {
  const found = detectStyle(0x210E);
  assert.ok(found !== null);
  assert.equal(found.style, italic);
  assert.equal(found.plain, 'h');
});

test('detectStyle 0x24B6 returns circled A (non-math)', () => {
  const found = detectStyle(0x24B6);
  assert.ok(found !== null);
  assert.equal(found.style, circled);
  assert.equal(found.plain, 'A');
});

test('detectStyle 0x24EA returns circled 0 (digit exception)', () => {
  const found = detectStyle(0x24EA);
  assert.ok(found !== null);
  assert.equal(found.style, circled);
  assert.equal(found.plain, '0');
});

test('detectStyle plain ASCII A (0x41) returns null', () => {
  assert.equal(detectStyle(0x41), null);
});

test('detectStyle space (0x20) returns null', () => {
  assert.equal(detectStyle(0x20), null);
});

// ---------------------------------------------------------------------------
// removeStyle
// ---------------------------------------------------------------------------

test('removeStyle reverts bold A to plain A', () => {
  const boldA = String.fromCodePoint(0x1D400);
  assert.equal(removeStyle(boldA, bold), 'A');
});

test('removeStyle leaves italic A unchanged when removing bold (wrong style)', () => {
  const italicA = String.fromCodePoint(0x1D434);
  assert.equal(removeStyle(italicA, bold), italicA);
});

test('removeStyle mixed string: bold A + space + bold b reverts to A b', () => {
  const boldA = String.fromCodePoint(0x1D400);
  const boldB = String.fromCodePoint(0x1D41B);
  assert.equal(removeStyle(boldA + ' ' + boldB, bold), 'A b');
});

test('removeStyle empty string returns empty string', () => {
  assert.equal(removeStyle('', bold), '');
});

// ---------------------------------------------------------------------------
// detectFormatting
// ---------------------------------------------------------------------------

test('detectFormatting bold A no marks: one entry with style, no marks, correct plain', () => {
  const boldA = String.fromCodePoint(0x1D400);
  const entries: DetectedFormat[] = detectFormatting(boldA);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].style, bold);
  assert.deepEqual(entries[0].marks, []);
  assert.equal(entries[0].plain, 'A');
});

test('detectFormatting bold A + strikethrough: one entry with STRIKETHROUGH mark', () => {
  const boldA = String.fromCodePoint(0x1D400);
  const entries = detectFormatting(boldA + ST);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].style, bold);
  assert.equal(entries[0].marks.length, 1);
  assert.equal(entries[0].marks[0], STRIKETHROUGH);
  assert.equal(entries[0].plain, 'A');
});

test('detectFormatting bold A + strikethrough + underline: one entry with two marks', () => {
  const boldA = String.fromCodePoint(0x1D400);
  const entries = detectFormatting(boldA + ST + UL);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].marks.length, 2);
  assert.equal(entries[0].marks[0], STRIKETHROUGH);
  assert.equal(entries[0].marks[1], UNDERLINE);
});

test('detectFormatting plain hello: five entries all style null marks empty plain null', () => {
  const entries = detectFormatting('hello');
  assert.equal(entries.length, 5);
  for (const entry of entries) {
    assert.equal(entry.style, null);
    assert.deepEqual(entry.marks, []);
    assert.equal(entry.plain, null);
  }
});

test('detectFormatting empty string returns empty array', () => {
  assert.deepEqual(detectFormatting(''), []);
});

test('detectFormatting orphaned combining mark: one entry with style null plain null mark in marks', () => {
  const entries = detectFormatting(ST);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].style, null);
  assert.equal(entries[0].plain, null);
  assert.equal(entries[0].marks.length, 1);
  assert.equal(entries[0].marks[0], STRIKETHROUGH);
});

// ---------------------------------------------------------------------------
// ALL_STYLES coverage
// ---------------------------------------------------------------------------

test('ALL_STYLES contains exactly 18 entries', () => {
  assert.equal(ALL_STYLES.length, 18);
});

test('every style has at least one character that round-trips through detectStyle', () => {
  for (const style of ALL_STYLES) {
    // Pick the first mappable character: uppercase if available, else lowercase.
    const ch = style.upperBase !== null ? 'A' : 'a';
    const cp = styledCodePoint(ch, style);
    if (cp === null) {
      assert.fail(`${style.id}: styledCodePoint('${ch}') returned null`);
    }
    const found = detectStyle(cp);
    if (found === null) {
      assert.fail(`${style.id}: detectStyle(0x${cp.toString(16)}) returned null`);
    }
    assert.equal(found.style, style, `${style.id}: detectStyle returned wrong style`);
  }
});

// ---------------------------------------------------------------------------
// Reverse-map collision safety (Letterlike Symbols block)
// The spec notes that script, fraktur, and double-struck all borrow exception
// code points from U+2100-U+214F. None may collide with each other.
// ---------------------------------------------------------------------------

test('script B exception 0x212C detects as script, not italic or fraktur', () => {
  const found = detectStyle(0x212C);
  assert.ok(found !== null);
  assert.equal(found.style, script);
  assert.equal(found.plain, 'B');
});

test('fraktur C exception 0x212D detects as fraktur, not script or double-struck', () => {
  const fraktur = MATH_STYLE_BY_ID.get('fraktur')!;
  const found = detectStyle(0x212D);
  assert.ok(found !== null);
  assert.equal(found.style, fraktur);
  assert.equal(found.plain, 'C');
});

test('double-struck C exception 0x2102 detects as double-struck, not script or fraktur', () => {
  const doubleStruck = MATH_STYLE_BY_ID.get('double-struck')!;
  const found = detectStyle(0x2102);
  assert.ok(found !== null);
  assert.equal(found.style, doubleStruck);
  assert.equal(found.plain, 'C');
});

test('no reverse-map collision: every styled code point is unique across all 18 styles', () => {
  // If two (style, char) pairs produce the same code point, seen.size < total.
  const seen = new Set<number>();
  let total = 0;
  for (const style of ALL_STYLES) {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
      const cp = styledCodePoint(ch, style);
      if (cp !== null) {
        seen.add(cp);
        total++;
      }
    }
  }
  assert.equal(seen.size, total, 'duplicate styled code point found across styles');
});

// ---------------------------------------------------------------------------
// Astral-plane safety
// Chars above U+FFFF have ch.length === 2 in JavaScript (surrogate pair).
// applyStyle must not attempt styledCodePoint on them.
// ---------------------------------------------------------------------------

test('applyStyle passes emoji through unchanged (astral-plane, ch.length > 1)', () => {
  const emoji = '\u{1F600}'; // U+1F600 GRINNING FACE, ch.length === 2
  assert.equal(applyStyle(emoji, bold), emoji);
});

test('applyStyle leaves already-styled bold A unchanged when applying italic', () => {
  const boldA = String.fromCodePoint(0x1D400); // ch.length === 2, not single ASCII
  assert.equal(applyStyle(boldA, italic), boldA);
});

// ---------------------------------------------------------------------------
// removeStyle only reverts the named style (exception code points)
// ---------------------------------------------------------------------------

test('removeStyle reverts script B exception but leaves adjacent fraktur C exception styled', () => {
  const fraktur = MATH_STYLE_BY_ID.get('fraktur')!;
  const scriptB  = String.fromCodePoint(0x212C); // Letterlike Symbol, script B
  const frakturC = String.fromCodePoint(0x212D); // Letterlike Symbol, fraktur C
  assert.equal(removeStyle(scriptB + frakturC, script),  'B' + frakturC);
  assert.equal(removeStyle(scriptB + frakturC, fraktur), scriptB + 'C');
});

// ---------------------------------------------------------------------------
// detectFormatting: exception code point with combining mark
// ---------------------------------------------------------------------------

test('detectFormatting italic h exception 0x210E with underline mark: style italic, mark UNDERLINE, plain h', () => {
  const italicH = String.fromCodePoint(0x210E); // italic h via exception
  const entries = detectFormatting(italicH + UL);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].style, italic);
  assert.equal(entries[0].marks.length, 1);
  assert.equal(entries[0].marks[0], UNDERLINE);
  assert.equal(entries[0].plain, 'h');
});

// ---------------------------------------------------------------------------
// applyStyleForTyping: typing case-folds where the style demands it
// ---------------------------------------------------------------------------

test('typing lowercase into an uppercase-only style folds up, not through', () => {
  const squared = NON_MATH_STYLE_BY_ID.get('squared')!;
  const out = applyStyleForTyping('abc', squared);
  assert.equal(out, applyStyle('ABC', squared),
    'lowercase typed in a squared run must become squared capitals');
  assert.ok(!/[a-z]/.test(out), 'no plain lowercase may leak through');
});

test('typing uppercase into parenthesized (lowercase-only) folds down', () => {
  const par = NON_MATH_STYLE_BY_ID.get('parenthesized')!;
  assert.equal(applyStyleForTyping('ABC', par), applyStyle('abc', par));
});

test('full-coverage styles keep the typed case exactly', () => {
  const bold = MATH_STYLE_BY_ID.get('bold')!;
  assert.equal(applyStyleForTyping('AbC', bold), applyStyle('AbC', bold));
});
