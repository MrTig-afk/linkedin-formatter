import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  toggleStyle,
  clearAllFormatting,
  resolveStyleId,
  snapToCodePointBoundary,
} from '../../src/lib/toggleStyle';
import { applyStyle } from '../../src/lib/convert';
import { applyCombiningMark } from '../../src/lib/combining';
import { MATH_STYLE_BY_ID } from '../../src/lib/styles';
import { NON_MATH_STYLE_BY_ID } from '../../src/lib/palettes';
import { COMBINING_MARK_BY_ID, STRIKETHROUGH, UNDERLINE } from '../../src/lib/combining';

// Style references used across tests.
const bold   = MATH_STYLE_BY_ID.get('bold')!;
const italic = MATH_STYLE_BY_ID.get('italic')!;
const script = MATH_STYLE_BY_ID.get('script')!;

// ---------------------------------------------------------------------------
// resolveStyleId
// ---------------------------------------------------------------------------

test('resolveStyleId: known math style id returns { kind: style }', () => {
  const result = resolveStyleId('bold');
  assert.ok(result !== null);
  assert.equal(result.kind, 'style');
  assert.equal(result.style, bold);
});

test('resolveStyleId: known non-math style id returns { kind: style }', () => {
  const circled = NON_MATH_STYLE_BY_ID.get('circled')!;
  const result = resolveStyleId('circled');
  assert.ok(result !== null);
  assert.equal(result.kind, 'style');
  assert.equal(result.style, circled);
});

test('resolveStyleId: known mark id returns { kind: mark }', () => {
  const result = resolveStyleId('strikethrough');
  assert.ok(result !== null);
  assert.equal(result.kind, 'mark');
  assert.equal(result.mark, STRIKETHROUGH);
});

test('resolveStyleId: unknown id returns null', () => {
  assert.equal(resolveStyleId('nonexistent'), null);
  assert.equal(resolveStyleId(''), null);
  assert.equal(resolveStyleId('BOLD'), null);
});

// ---------------------------------------------------------------------------
// toggleStyle -- letterform styles
// ---------------------------------------------------------------------------

test('toggleStyle: apply bold to plain text', () => {
  assert.equal(toggleStyle('hello', 'bold'), applyStyle('hello', bold));
});

test('toggleStyle: toggle bold off when text is entirely bold', () => {
  const boldHello = applyStyle('hello', bold);
  assert.equal(toggleStyle(boldHello, 'bold'), 'hello');
});

test('toggleStyle: replace italic with bold', () => {
  const italicHello = applyStyle('hello', italic);
  assert.equal(toggleStyle(italicHello, 'bold'), applyStyle('hello', bold));
});

test('toggleStyle: mixed selection (half bold, half plain) applies bold to all', () => {
  const mixed = applyStyle('he', bold) + 'llo';
  assert.equal(toggleStyle(mixed, 'bold'), applyStyle('hello', bold));
});

test('toggleStyle: mixed selection (two different styles) applies bold to all', () => {
  const mixed = applyStyle('he', italic) + applyStyle('llo', script);
  assert.equal(toggleStyle(mixed, 'bold'), applyStyle('hello', bold));
});

test('toggleStyle: whitespace and punctuation passed through by applyStyle', () => {
  // applyStyle already passes non-mappable characters through, so the result
  // equals applyStyle on the whole string including space and punctuation.
  assert.equal(
    toggleStyle('hello world!', 'bold'),
    applyStyle('hello world!', bold),
  );
});

test('toggleStyle: combining marks survive style apply', () => {
  const marked = applyCombiningMark('hello', STRIKETHROUGH);
  const result = toggleStyle(marked, 'bold');
  // Result must differ from plain bold (has strikethrough marks).
  assert.notEqual(result, applyStyle('hello', bold));
  // Round-trip: clearing all formatting yields plain 'hello'.
  assert.equal(clearAllFormatting(result), 'hello');
});

test('toggleStyle: toggle bold off strips combining marks (PRD A.4)', () => {
  const boldMarked = applyCombiningMark(applyStyle('hello', bold), STRIKETHROUGH);
  const result = toggleStyle(boldMarked, 'bold');
  assert.equal(result, 'hello');
});

test('toggleStyle: toggle bold off strips underline mark', () => {
  const input = applyCombiningMark(applyStyle('hello', bold), UNDERLINE);
  const result = toggleStyle(input, 'bold');
  assert.equal(result, 'hello');
});

test('toggleStyle: toggle bold off strips both strikethrough and underline', () => {
  const input = applyCombiningMark(applyCombiningMark(applyStyle('hello', bold), STRIKETHROUGH), UNDERLINE);
  const result = toggleStyle(input, 'bold');
  assert.equal(result, 'hello');
});

test('toggleStyle: toggle italic off strips combining marks', () => {
  const input = applyCombiningMark(applyStyle('hello', italic), STRIKETHROUGH);
  const result = toggleStyle(input, 'italic');
  assert.equal(result, 'hello');
});

test('toggleStyle: style replacement preserves combining marks', () => {
  const input = applyCombiningMark(applyStyle('hello', italic), STRIKETHROUGH);
  const result = toggleStyle(input, 'bold');
  assert.equal(result, applyCombiningMark(applyStyle('hello', bold), STRIKETHROUGH));
});

test('toggleStyle: apply letterform to marked plain text preserves marks', () => {
  const input = applyCombiningMark('hello', STRIKETHROUGH);
  const result = toggleStyle(input, 'bold');
  assert.equal(result, applyCombiningMark(applyStyle('hello', bold), STRIKETHROUGH));
});

test('toggleStyle: round-trip bold+mark -> toggle off -> toggle on', () => {
  const boldMarked = applyCombiningMark(applyStyle('hello', bold), STRIKETHROUGH);
  const off = toggleStyle(boldMarked, 'bold');
  const on  = toggleStyle(off, 'bold');
  assert.equal(off, 'hello');
  assert.equal(on, applyStyle('hello', bold));
});

test('toggleStyle: partial marks in apply path are normalized uniformly (spec edge case 6)', () => {
  // 'hel' has strikethrough, 'lo' does not. Applying bold strips all marks in
  // Step 1, detects no style, applies bold in Steps 2-3, then re-applies the
  // mark uniformly over the whole styled result in Step 4.
  const partial = applyCombiningMark('hel', STRIKETHROUGH) + 'lo';
  const result = toggleStyle(partial, 'bold');
  assert.equal(result, applyCombiningMark(applyStyle('hello', bold), STRIKETHROUGH));
});

test('toggleStyle: style replacement preserves both strikethrough and underline marks', () => {
  // Verifies the mark re-application loop iterates all collected marks, not just one.
  const input = applyCombiningMark(applyCombiningMark(applyStyle('hello', italic), STRIKETHROUGH), UNDERLINE);
  const result = toggleStyle(input, 'bold');
  assert.equal(result, applyCombiningMark(applyCombiningMark(applyStyle('hello', bold), STRIKETHROUGH), UNDERLINE));
});

test('toggleStyle: unknown styleId returns text unchanged', () => {
  assert.equal(toggleStyle('hello', 'nonexistent'), 'hello');
});

test('toggleStyle: empty string with any style returns empty string', () => {
  assert.equal(toggleStyle('', 'bold'), '');
});

// ---------------------------------------------------------------------------
// toggleStyle -- edge cases: unmappable and partial-coverage inputs
// ---------------------------------------------------------------------------

// All-unmappable selection: '!!!' contains no alphanum characters.
// applyStyle('!!!', bold) === '!!!' so the round-trip equality check fires
// (takes the "toggle off" path), but plain === selectedText so the output is
// '!!!' regardless.  No behavioural bug -- correct no-op result.
test('toggleStyle: all-unmappable selection returns text unchanged (bold)', () => {
  assert.equal(toggleStyle('!!!', 'bold'), '!!!');
});

test('toggleStyle: all-unmappable selection returns text unchanged (italic)', () => {
  assert.equal(toggleStyle('???', 'italic'), '???');
});

// Digits-only under a no-digit style: italic has digitBase: null and no digit
// exceptions, so applyStyle('123', italic) === '123'.  The round-trip check
// fires and returns plain = '123' unchanged.  No data-loss: output equals input.
test('toggleStyle: digits-only under no-digit style (italic) is a no-op', () => {
  assert.equal(toggleStyle('123', 'italic'), '123');
});

// Positive counterpart: bold DOES have digitBase, so digits are styled.
test('toggleStyle: digits-only under digit-capable style (bold) applies style', () => {
  assert.equal(toggleStyle('123', 'bold'), applyStyle('123', bold));
});

// Toggle off bold digits: the round-trip check correctly fires and strips.
test('toggleStyle: toggle bold off on digit-only bold text returns plain digits', () => {
  const boldDigits = applyStyle('123', bold);
  assert.equal(toggleStyle(boldDigits, 'bold'), '123');
});

// Mixed italic letters + plain digits: '123abc' where italic applies only to
// letters.  applyStyle('123abc', italic) = '123' + italic_abc. Toggling italic
// off should remove it from the letters; digits were never styled so survive.
test('toggleStyle: toggle italic off selection containing digits and italic letters', () => {
  const mixed = applyStyle('123abc', italic); // '123' + italic_a + italic_b + italic_c
  assert.equal(toggleStyle(mixed, 'italic'), '123abc');
});

// Uppercase-only style (squared) on lowercase input: lowerBase is null, so
// applyStyle('hello', squared) === 'hello'.  Round-trip fires, output unchanged.
test('toggleStyle: uppercase-only style (squared) on lowercase input is a no-op', () => {
  const squared = NON_MATH_STYLE_BY_ID.get('squared')!;
  assert.equal(toggleStyle('hello', 'squared'), 'hello');
  // Confirm squared DOES apply to uppercase.
  assert.equal(toggleStyle('HELLO', 'squared'), applyStyle('HELLO', squared));
});

// ---------------------------------------------------------------------------
// toggleStyle -- combining marks
// ---------------------------------------------------------------------------

test('toggleStyle: apply strikethrough to plain text', () => {
  assert.equal(
    toggleStyle('hello', 'strikethrough'),
    applyCombiningMark('hello', STRIKETHROUGH),
  );
});

test('toggleStyle: toggle strikethrough off when fully marked', () => {
  const allMarked = applyCombiningMark('hello', STRIKETHROUGH);
  assert.equal(toggleStyle(allMarked, 'strikethrough'), 'hello');
});

test('toggleStyle: partial strikethrough applies uniformly', () => {
  // Only 'hel' has the mark; 'lo' does not.
  const partial = applyCombiningMark('hel', STRIKETHROUGH) + 'lo';
  const result = toggleStyle(partial, 'strikethrough');
  assert.equal(result, applyCombiningMark('hello', STRIKETHROUGH));
});

test('toggleStyle: strikethrough on bold text preserves bold', () => {
  const boldText = applyStyle('hello', bold);
  const result = toggleStyle(boldText, 'strikethrough');
  assert.equal(result, applyCombiningMark(applyStyle('hello', bold), STRIKETHROUGH));
});

test('toggleStyle: toggle strikethrough off bold+strikethrough yields bold only', () => {
  const boldStrike = applyCombiningMark(applyStyle('hello', bold), STRIKETHROUGH);
  const result = toggleStyle(boldStrike, 'strikethrough');
  assert.equal(result, applyStyle('hello', bold));
});

// Verify underline from COMBINING_MARK_BY_ID is reachable.
test('toggleStyle: apply underline via COMBINING_MARK_BY_ID id', () => {
  const ul = COMBINING_MARK_BY_ID.get('underline')!;
  assert.equal(
    toggleStyle('hi', 'underline'),
    applyCombiningMark('hi', UNDERLINE),
  );
  assert.equal(ul, UNDERLINE);
});

// ---------------------------------------------------------------------------
// clearAllFormatting
// ---------------------------------------------------------------------------

test('clearAllFormatting: bold text reverts to plain', () => {
  assert.equal(clearAllFormatting(applyStyle('hello', bold)), 'hello');
});

test('clearAllFormatting: bold + strikethrough reverts to plain', () => {
  const boldStrike = applyCombiningMark(applyStyle('hello', bold), STRIKETHROUGH);
  assert.equal(clearAllFormatting(boldStrike), 'hello');
});

test('clearAllFormatting: plain text is unchanged', () => {
  assert.equal(clearAllFormatting('hello world'), 'hello world');
});

test('clearAllFormatting: mixed styles all become plain', () => {
  const mixed = applyStyle('he', italic) + applyStyle('llo', script);
  assert.equal(clearAllFormatting(mixed), 'hello');
});

test('clearAllFormatting: empty string returns empty string', () => {
  assert.equal(clearAllFormatting(''), '');
});

test('clearAllFormatting: multi-line document preserves newlines and clears all formatting', () => {
  // Simulates the whole-document path: start=0, end=fullText.length.
  // Newlines are plain ASCII and must survive; formatted characters become plain.
  const line1 = applyStyle('hello', bold);
  const line2 = applyStyle('world', italic);
  const multiLine = line1 + '\n' + line2 + '\n' + 'plain';
  assert.equal(clearAllFormatting(multiLine), 'hello\nworld\nplain');
});

// ---------------------------------------------------------------------------
// snapToCodePointBoundary
// ---------------------------------------------------------------------------

test('snapToCodePointBoundary: BMP character offset is unchanged', () => {
  // 'hello'[2] = 'l', a regular BMP char; offset returned as-is.
  assert.equal(snapToCodePointBoundary('hello', 2, 'backward'), 2);
  assert.equal(snapToCodePointBoundary('hello', 2, 'forward'), 2);
});

test('snapToCodePointBoundary: low surrogate backward moves to offset - 1', () => {
  // Bold A (U+1D400) = '𝐀': length 2.
  // 'A' + boldA: indices 0='A', 1='\uD835'(high), 2='\uDC00'(low).
  const boldA = String.fromCodePoint(0x1D400);
  const text = 'A' + boldA;
  assert.equal(snapToCodePointBoundary(text, 2, 'backward'), 1);
});

test('snapToCodePointBoundary: low surrogate forward moves to offset + 1', () => {
  const boldA = String.fromCodePoint(0x1D400);
  const text = 'A' + boldA;
  assert.equal(snapToCodePointBoundary(text, 2, 'forward'), 3);
});

test('snapToCodePointBoundary: offset 0 returns 0 regardless of direction', () => {
  assert.equal(snapToCodePointBoundary('hello', 0, 'backward'), 0);
  assert.equal(snapToCodePointBoundary('hello', 0, 'forward'), 0);
});

test('snapToCodePointBoundary: offset at text.length returns text.length', () => {
  assert.equal(snapToCodePointBoundary('hello', 5, 'backward'), 5);
  assert.equal(snapToCodePointBoundary('hello', 5, 'forward'), 5);
});
