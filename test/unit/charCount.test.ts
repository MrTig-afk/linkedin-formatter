import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { countCharacters, getCounterState } from '../../src/lib/charCount';

// countCharacters tests

test('countCharacters empty string returns 0 for codepoints', () => {
  assert.equal(countCharacters('', 'codepoints'), 0);
});

test('countCharacters empty string returns 0 for utf16', () => {
  assert.equal(countCharacters('', 'utf16'), 0);
});

test('countCharacters plain ASCII returns correct count for codepoints', () => {
  assert.equal(countCharacters('hello', 'codepoints'), 5);
});

test('countCharacters plain ASCII returns correct count for utf16', () => {
  assert.equal(countCharacters('hello', 'utf16'), 5);
});

test('countCharacters single astral code point counts 1 for codepoints', () => {
  assert.equal(countCharacters('\u{1D400}', 'codepoints'), 1);
});

test('countCharacters single astral code point counts 2 for utf16', () => {
  assert.equal(countCharacters('\u{1D400}', 'utf16'), 2);
});

test('countCharacters multiple astral code points count correctly for codepoints', () => {
  assert.equal(countCharacters('\u{1D400}\u{1D401}\u{1D402}', 'codepoints'), 3);
});

test('countCharacters multiple astral code points count correctly for utf16', () => {
  assert.equal(countCharacters('\u{1D400}\u{1D401}\u{1D402}', 'utf16'), 6);
});

test('countCharacters combining mark counts as 2 code points', () => {
  assert.equal(countCharacters('a\u{0336}', 'codepoints'), 2);
});

test('countCharacters combining mark counts as 2 utf16 code units', () => {
  assert.equal(countCharacters('a\u{0336}', 'utf16'), 2);
});

test('countCharacters CRLF counts as 2 for codepoints', () => {
  assert.equal(countCharacters('\r\n', 'codepoints'), 2);
});

test('countCharacters CRLF counts as 2 for utf16', () => {
  assert.equal(countCharacters('\r\n', 'utf16'), 2);
});

test('countCharacters fully bold string: N codepoints, 2N utf16 on the same input', () => {
  // U+1D400..U+1D404 are Mathematical Bold Capital A-E (astral, each 2 UTF-16 units)
  const bold5 = '\u{1D400}\u{1D401}\u{1D402}\u{1D403}\u{1D404}';
  assert.equal(countCharacters(bold5, 'codepoints'), 5, 'codepoints must count 5 visible characters');
  assert.equal(countCharacters(bold5, 'utf16'), 10, 'utf16 must count 10 code units for 5 astral chars');
});

test('countCharacters combining marks: both units count the mark as a separate unit', () => {
  // 'a' + U+0336 (combining long stroke) = 2 code points, 2 UTF-16 units
  const withMark = 'a\u{0336}';
  assert.equal(countCharacters(withMark, 'codepoints'), 2, 'codepoints counts base + mark as 2');
  assert.equal(countCharacters(withMark, 'utf16'), 2, 'utf16 counts base + mark as 2');
});

test('countCharacters raw text vs HTML-escaped text: raw count is smaller', () => {
  // If the counter were run on the escaped HTML body instead of raw text, it
  // would over-count. Three special chars '<', '>', '&' escape to
  // '&lt;', '&gt;', '&amp;' adding many extra code units.
  const raw = '<>&';
  const escaped = '&lt;&gt;&amp;';
  assert.equal(countCharacters(raw, 'codepoints'), 3, 'raw text: 3 chars');
  assert.equal(countCharacters(escaped, 'codepoints'), 13, 'escaped HTML: 13 chars -- shows counting must happen on raw text');
});

// getCounterState tests

test('getCounterState returns normal for count 0', () => {
  assert.equal(getCounterState(0, 3000, 2700), 'normal');
});

test('getCounterState returns normal for count just below warnAt', () => {
  assert.equal(getCounterState(2699, 3000, 2700), 'normal');
});

test('getCounterState returns warning at warnAt boundary', () => {
  assert.equal(getCounterState(2700, 3000, 2700), 'warning');
});

test('getCounterState returns warning at exact limit', () => {
  assert.equal(getCounterState(3000, 3000, 2700), 'warning');
});

test('getCounterState returns over one above limit', () => {
  assert.equal(getCounterState(3001, 3000, 2700), 'over');
});

test('getCounterState returns over for large overage', () => {
  assert.equal(getCounterState(3127, 3000, 2700), 'over');
});

// Non-default warnAtPercent: 50% => warnAt = Math.floor(3000 * 50 / 100) = 1500

test('getCounterState with 50% warnAt: count below threshold returns normal', () => {
  assert.equal(getCounterState(1499, 3000, 1500), 'normal');
});

test('getCounterState with 50% warnAt: count at threshold returns warning', () => {
  assert.equal(getCounterState(1500, 3000, 1500), 'warning');
});

test('getCounterState with 50% warnAt: count at limit returns warning not over', () => {
  assert.equal(getCounterState(3000, 3000, 1500), 'warning');
});

test('getCounterState with 50% warnAt: count one over limit returns over', () => {
  assert.equal(getCounterState(3001, 3000, 1500), 'over');
});
