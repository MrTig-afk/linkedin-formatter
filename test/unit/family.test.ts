import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  FAMILY_IDS,
  FAMILY_MATRIX,
  decompose,
  compose,
  nearestSupported,
  convertFamily,
  toggleAxis,
  summarizeSelection,
  effectiveFamily,
  resolveTypingStyle,
} from '../../src/lib/family';
import {
  ALL_STYLES,
  styledCodePoint,
  applyStyle,
} from '../../src/lib/convert';
import {
  COMBINING_MARKS,
  applyCombiningMark,
  STRIKETHROUGH,
  UNDERLINE,
} from '../../src/lib/combining';
import { MATH_STYLE_BY_ID } from '../../src/lib/styles';
import { NON_MATH_STYLE_BY_ID } from '../../src/lib/palettes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function styledChar(plainChar: string, styleId: string): string {
  const style = MATH_STYLE_BY_ID.get(styleId) ?? NON_MATH_STYLE_BY_ID.get(styleId);
  if (style === undefined) { throw new Error(`unknown style id: ${styleId}`); }
  const cp = styledCodePoint(plainChar, style);
  if (cp === null) { throw new Error(`${styleId} cannot map '${plainChar}'`); }
  return String.fromCodePoint(cp);
}

// ---------------------------------------------------------------------------
// Group 1: FAMILY_MATRIX integrity
// ---------------------------------------------------------------------------

test('FAMILY_MATRIX: has exactly 11 entries', () => {
  assert.equal(FAMILY_MATRIX.size, 11);
  assert.equal(FAMILY_IDS.length, 11);
});

test('FAMILY_MATRIX: every non-null style id resolves to ALL_STYLES or is plain', () => {
  const allStyleIds = new Set(ALL_STYLES.map(s => s.id));
  for (const [family, slots] of FAMILY_MATRIX) {
    assert.ok(
      slots.regular === 'plain' || allStyleIds.has(slots.regular),
      `${family} regular '${slots.regular}' not in ALL_STYLES`,
    );
    if (slots.bold !== null) {
      assert.ok(allStyleIds.has(slots.bold), `${family} bold '${slots.bold}' not in ALL_STYLES`);
    }
    if (slots.italic !== null) {
      assert.ok(allStyleIds.has(slots.italic), `${family} italic '${slots.italic}' not in ALL_STYLES`);
    }
    if (slots.boldItalic !== null) {
      assert.ok(allStyleIds.has(slots.boldItalic), `${family} boldItalic '${slots.boldItalic}' not in ALL_STYLES`);
    }
  }
});

test('FAMILY_MATRIX: every style id in ALL_STYLES appears in exactly one cell', () => {
  const count = new Map<string, number>();
  for (const [, slots] of FAMILY_MATRIX) {
    for (const v of [slots.regular, slots.bold, slots.italic, slots.boldItalic]) {
      if (v !== null && v !== 'plain') {
        count.set(v, (count.get(v) ?? 0) + 1);
      }
    }
  }
  for (const style of ALL_STYLES) {
    assert.equal(count.get(style.id), 1, `${style.id} should appear exactly once in matrix`);
  }
});

test('FAMILY_MATRIX: no regular slot is null or empty', () => {
  for (const [family, slots] of FAMILY_MATRIX) {
    assert.ok(slots.regular.length > 0, `${family} regular slot must be non-empty`);
  }
});

// ---------------------------------------------------------------------------
// Group 2: decompose
// ---------------------------------------------------------------------------

test('decompose: all non-null matrix cells round-trip (19 checks)', () => {
  for (const [family, slots] of FAMILY_MATRIX) {
    assert.deepEqual(decompose(slots.regular), { family, bold: false, italic: false });
    if (slots.bold !== null) {
      assert.deepEqual(decompose(slots.bold), { family, bold: true, italic: false });
    }
    if (slots.italic !== null) {
      assert.deepEqual(decompose(slots.italic), { family, bold: false, italic: true });
    }
    if (slots.boldItalic !== null) {
      assert.deepEqual(decompose(slots.boldItalic), { family, bold: true, italic: true });
    }
  }
});

test("decompose('plain') returns serif/false/false", () => {
  assert.deepEqual(decompose('plain'), { family: 'serif', bold: false, italic: false });
});

test("decompose('strikethrough') returns null", () => {
  assert.equal(decompose('strikethrough'), null);
});

test("decompose('underline') returns null", () => {
  assert.equal(decompose('underline'), null);
});

test("decompose('nonexistent') returns null", () => {
  assert.equal(decompose('nonexistent'), null);
});

test("decompose('') returns null", () => {
  assert.equal(decompose(''), null);
});

// ---------------------------------------------------------------------------
// Group 3: compose
// ---------------------------------------------------------------------------

test("compose('serif', false, false) === 'plain'", () => {
  assert.equal(compose('serif', false, false), 'plain');
});

test("compose('serif', true, false) === 'bold'", () => {
  assert.equal(compose('serif', true, false), 'bold');
});

test("compose('serif', false, true) === 'italic'", () => {
  assert.equal(compose('serif', false, true), 'italic');
});

test("compose('serif', true, true) === 'bold-italic'", () => {
  assert.equal(compose('serif', true, true), 'bold-italic');
});

test("compose('sans-serif', false, false) === 'sans-serif'", () => {
  assert.equal(compose('sans-serif', false, false), 'sans-serif');
});

test("compose('sans-serif', true, false) === 'sans-serif-bold'", () => {
  assert.equal(compose('sans-serif', true, false), 'sans-serif-bold');
});

test("compose('sans-serif', false, true) === 'sans-serif-italic'", () => {
  assert.equal(compose('sans-serif', false, true), 'sans-serif-italic');
});

test("compose('sans-serif', true, true) === 'sans-serif-bold-italic'", () => {
  assert.equal(compose('sans-serif', true, true), 'sans-serif-bold-italic');
});

test("compose('script', true, false) === 'bold-script'", () => {
  assert.equal(compose('script', true, false), 'bold-script');
});

test("compose('script', false, true) === null", () => {
  assert.equal(compose('script', false, true), null);
});

test("compose('monospace', true, false) === null", () => {
  assert.equal(compose('monospace', true, false), null);
});

test("compose('squared', false, false) === 'squared'", () => {
  assert.equal(compose('squared', false, false), 'squared');
});

test("compose('squared', true, false) === null", () => {
  assert.equal(compose('squared', true, false), null);
});

// ---------------------------------------------------------------------------
// Group 4: decompose/compose round-trip
// ---------------------------------------------------------------------------

test('decompose/compose round-trip for all 18 styles + plain', () => {
  // All 18 styles in ALL_STYLES.
  for (const style of ALL_STYLES) {
    const d = decompose(style.id);
    assert.notEqual(d, null, `decompose('${style.id}') returned null`);
    assert.equal(
      compose(d!.family, d!.bold, d!.italic),
      style.id,
      `compose(${d!.family}, ${d!.bold}, ${d!.italic}) should equal '${style.id}'`,
    );
  }
  // Plain.
  assert.equal(compose('serif', false, false), 'plain');
  assert.deepEqual(decompose('plain'), { family: 'serif', bold: false, italic: false });
});

// ---------------------------------------------------------------------------
// Group 5: nearestSupported
// ---------------------------------------------------------------------------

test('nearestSupported: exact match serif bold-italic', () => {
  assert.deepEqual(
    nearestSupported('serif', true, true),
    { styleIdOrPlain: 'bold-italic', bold: true, italic: true },
  );
});

test('nearestSupported: drop italic for script (bold-italic -> bold-script)', () => {
  assert.deepEqual(
    nearestSupported('script', true, true),
    { styleIdOrPlain: 'bold-script', bold: true, italic: false },
  );
});

test('nearestSupported: drop both for monospace (bold-italic -> monospace)', () => {
  assert.deepEqual(
    nearestSupported('monospace', true, true),
    { styleIdOrPlain: 'monospace', bold: false, italic: false },
  );
});

test('nearestSupported: drop italic for circled (italic unavailable -> circled)', () => {
  assert.deepEqual(
    nearestSupported('circled', false, true),
    { styleIdOrPlain: 'circled', bold: false, italic: false },
  );
});

// ---------------------------------------------------------------------------
// Group 6: convertFamily
// ---------------------------------------------------------------------------

test("convertFamily: plain 'Hello' to 'sans-serif' -> every letter sans-serif styled", () => {
  const sansSerifStyle = MATH_STYLE_BY_ID.get('sans-serif')!;
  assert.equal(convertFamily('Hello', 'sans-serif'), applyStyle('Hello', sansSerifStyle));
});

test("convertFamily: bold 'Hello' to 'sans-serif' -> sans-serif-bold", () => {
  const boldStyle = MATH_STYLE_BY_ID.get('bold')!;
  const sansSerifBoldStyle = MATH_STYLE_BY_ID.get('sans-serif-bold')!;
  const boldHello = applyStyle('Hello', boldStyle);
  assert.equal(convertFamily(boldHello, 'sans-serif'), applyStyle('Hello', sansSerifBoldStyle));
});

test("convertFamily: bold-italic 'Hello' to 'script' -> bold-script (italic dropped)", () => {
  const boldItalicStyle = MATH_STYLE_BY_ID.get('bold-italic')!;
  const boldScriptStyle = MATH_STYLE_BY_ID.get('bold-script')!;
  const boldItalicHello = applyStyle('Hello', boldItalicStyle);
  assert.equal(convertFamily(boldItalicHello, 'script'), applyStyle('Hello', boldScriptStyle));
});

test("convertFamily: sans-serif 'Hello' to 'serif' -> plain ASCII", () => {
  const sansSerifStyle = MATH_STYLE_BY_ID.get('sans-serif')!;
  const sansSerifHello = applyStyle('Hello', sansSerifStyle);
  assert.equal(convertFamily(sansSerifHello, 'serif'), 'Hello');
});

test('convertFamily: mixed families convert independently', () => {
  // bold H + fraktur e + plain llo, convert to sans-serif.
  const boldH = styledChar('H', 'bold');
  const frakturE = styledChar('e', 'fraktur');
  const mixed = boldH + frakturE + 'llo';

  // bold H (serif/bold) -> sans-serif-bold H.
  // fraktur e (fraktur/plain) -> sans-serif e.
  // llo (plain) -> sans-serif l, l, o.
  const sansSerifBoldH = styledChar('H', 'sans-serif-bold');
  const sansSerifStyle = MATH_STYLE_BY_ID.get('sans-serif')!;
  const expected = sansSerifBoldH + applyStyle('ello', sansSerifStyle);
  assert.equal(convertFamily(mixed, 'sans-serif'), expected);
});

test("convertFamily: case folding (uppercase-only) -- 'Hello' to 'squared' folds lowercase up", () => {
  // Squared covers A-Z only; lowercase letters fold to their uppercase
  // squared forms rather than passing through as plain (owner decision).
  const expected = ['H', 'E', 'L', 'L', 'O'].map(c => styledChar(c, 'squared')).join('');
  assert.equal(convertFamily('Hello', 'squared'), expected);
});

test("convertFamily: case folding -- whole sentence to 'negative-squared' converts every letter", () => {
  const expected = ['N', 'O', 'P', 'E'].map(c => styledChar(c, 'negative-squared')).join('') + '!';
  assert.equal(convertFamily('nope!', 'negative-squared'), expected);
});

test("convertFamily: case folding (lowercase-only) -- 'ABC' to 'parenthesized' folds down", () => {
  const expected = ['a', 'b', 'c'].map(c => styledChar(c, 'parenthesized')).join('');
  assert.equal(convertFamily('ABC', 'parenthesized'), expected);
});

test('convertFamily: case folding never touches digits or punctuation', () => {
  // Squared has no digit row; digits stay plain ASCII, punctuation untouched.
  const squaredA = styledChar('A', 'squared');
  assert.equal(convertFamily('a1!', 'squared'), squaredA + '1!');
});

test('convertFamily: folding is lossy by design -- back to serif keeps folded case', () => {
  const folded = convertFamily('hello', 'negative-squared');
  assert.equal(convertFamily(folded, 'serif'), 'HELLO');
});

test("convertFamily: coverage limit (digits) -- bold digits to 'script' -> plain '123'", () => {
  // bold-script has no digitBase; digits revert to plain ASCII.
  const boldStyle = MATH_STYLE_BY_ID.get('bold')!;
  const boldDigits = applyStyle('123', boldStyle);
  assert.equal(convertFamily(boldDigits, 'script'), '123');
});

test('convertFamily: combining marks preserved through conversion', () => {
  // bold Hello + strikethrough, convert to script -> bold-script Hello + strikethrough.
  const boldStyle = MATH_STYLE_BY_ID.get('bold')!;
  const boldScriptStyle = MATH_STYLE_BY_ID.get('bold-script')!;
  const boldHello = applyStyle('Hello', boldStyle);
  const boldStrike = applyCombiningMark(boldHello, STRIKETHROUGH);
  const expected = applyCombiningMark(applyStyle('Hello', boldScriptStyle), STRIKETHROUGH);
  assert.equal(convertFamily(boldStrike, 'script'), expected);
});

test('convertFamily: whitespace, punctuation, emoji pass through unchanged', () => {
  const punct = '!, 🎉';
  assert.equal(convertFamily(punct, 'script'), punct);
});

test('convertFamily: empty string -> empty string', () => {
  assert.equal(convertFamily('', 'sans-serif'), '');
});

// ---------------------------------------------------------------------------
// Group 7: toggleAxis
// ---------------------------------------------------------------------------

test("toggleAxis: add bold to plain 'hello' (activeFamily serif)", () => {
  const boldStyle = MATH_STYLE_BY_ID.get('bold')!;
  assert.equal(toggleAxis('hello', 'bold', 'serif'), applyStyle('hello', boldStyle));
});

test("toggleAxis: remove bold from all-bold 'hello'", () => {
  const boldStyle = MATH_STYLE_BY_ID.get('bold')!;
  const allBold = applyStyle('hello', boldStyle);
  assert.equal(toggleAxis(allBold, 'bold', 'serif'), 'hello');
});

test("toggleAxis: partial bold 'hello' -> add -> all bold", () => {
  const boldStyle = MATH_STYLE_BY_ID.get('bold')!;
  // First two letters bold, rest plain.
  const partial = applyStyle('he', boldStyle) + 'llo';
  assert.equal(toggleAxis(partial, 'bold', 'serif'), applyStyle('hello', boldStyle));
});

test("toggleAxis: add italic to plain 'hello' (activeFamily serif)", () => {
  const italicStyle = MATH_STYLE_BY_ID.get('italic')!;
  assert.equal(toggleAxis('hello', 'italic', 'serif'), applyStyle('hello', italicStyle));
});

test('toggleAxis: round-trip bold -> toggle off -> toggle on', () => {
  const initial = toggleAxis('hello', 'bold', 'serif');
  const toggled = toggleAxis(initial, 'bold', 'serif');
  assert.equal(toggleAxis(toggled, 'bold', 'serif'), initial);
});

test('toggleAxis: per-character family preserved, plain chars adopt activeFamily', () => {
  // sans-serif-bold H + fraktur e + plain llo (activeFamily serif).
  // Not all letters carry bold (fraktur e does not, llo do not) -> add.
  const ssBoldH = styledChar('H', 'sans-serif-bold');
  const frakturE = styledChar('e', 'fraktur');
  const mixed = ssBoldH + frakturE + 'llo';

  const boldFrakturE = styledChar('e', 'bold-fraktur');
  const boldStyle = MATH_STYLE_BY_ID.get('bold')!;
  const expected = ssBoldH + boldFrakturE + applyStyle('llo', boldStyle);
  assert.equal(toggleAxis(mixed, 'bold', 'serif'), expected);
});

test("toggleAxis: plain chars adopt activeFamily 'sans-serif'", () => {
  const sansSerifBoldStyle = MATH_STYLE_BY_ID.get('sans-serif-bold')!;
  assert.equal(toggleAxis('hello', 'bold', 'sans-serif'), applyStyle('hello', sansSerifBoldStyle));
});

test('toggleAxis: axis unavailable for family -> character unchanged (monospace + italic)', () => {
  const monoH = styledChar('h', 'monospace');
  // Toggling italic on monospace: italic slot is null, cascades to monospace.
  assert.equal(toggleAxis(monoH, 'italic', 'serif'), monoH);
});

test('toggleAxis: no letters (bold digits) -> vacuous remove -> plain digits', () => {
  const boldStyle = MATH_STYLE_BY_ID.get('bold')!;
  const boldDigits = applyStyle('123', boldStyle);
  assert.equal(toggleAxis(boldDigits, 'bold', 'serif'), '123');
});

test("toggleAxis: no letters (punctuation only) -> vacuous remove path -> unchanged '!!!'", () => {
  assert.equal(toggleAxis('!!!', 'bold', 'serif'), '!!!');
});

test('toggleAxis: combining marks preserved (bold+strikethrough toggle bold off -> plain+strikethrough)', () => {
  const boldStyle = MATH_STYLE_BY_ID.get('bold')!;
  const boldHello = applyStyle('hello', boldStyle);
  const boldStrike = applyCombiningMark(boldHello, STRIKETHROUGH);
  const plainStrike = applyCombiningMark('hello', STRIKETHROUGH);
  assert.equal(toggleAxis(boldStrike, 'bold', 'serif'), plainStrike);
});

test('toggleAxis: both combining marks preserved', () => {
  // Italic hello + strikethrough + underline: toggle italic off -> plain + both marks.
  const italicStyle = MATH_STYLE_BY_ID.get('italic')!;
  const italicHello = applyStyle('hello', italicStyle);
  let withMarks = applyCombiningMark(italicHello, STRIKETHROUGH);
  withMarks = applyCombiningMark(withMarks, UNDERLINE);

  let plainWithMarks = applyCombiningMark('hello', STRIKETHROUGH);
  plainWithMarks = applyCombiningMark(plainWithMarks, UNDERLINE);

  assert.equal(toggleAxis(withMarks, 'italic', 'serif'), plainWithMarks);
});

test('toggleAxis: empty string -> empty string', () => {
  assert.equal(toggleAxis('', 'bold', 'serif'), '');
});

// Verify COMBINING_MARKS import is exercised (used above; this also documents
// that the test file uses the full combining export surface).
test('COMBINING_MARKS has two entries', () => {
  assert.equal(COMBINING_MARKS.length, 2);
});

// ---------------------------------------------------------------------------
// summarizeSelection: selection-aware toolbar state
// ---------------------------------------------------------------------------

test('summarizeSelection: plain ASCII counts as serif, no axes', () => {
  assert.deepEqual(summarizeSelection('Hello 123'),
    { family: 'serif', bold: false, italic: false });
});

test('summarizeSelection: uniform bold serif reports bold pressed', () => {
  const boldStyle = MATH_STYLE_BY_ID.get('bold')!;
  const text = applyStyle('Hello', boldStyle);
  assert.deepEqual(summarizeSelection(text),
    { family: 'serif', bold: true, italic: false });
});

test('summarizeSelection: monospace text reports monospace, no axes', () => {
  const mono = MATH_STYLE_BY_ID.get('monospace')!;
  assert.deepEqual(summarizeSelection(applyStyle('code', mono)),
    { family: 'monospace', bold: false, italic: false });
});

test('summarizeSelection: mixed bold and plain letters -> bold not pressed', () => {
  const boldStyle = MATH_STYLE_BY_ID.get('bold')!;
  const text = applyStyle('Hel', boldStyle) + 'lo';
  assert.deepEqual(summarizeSelection(text),
    { family: 'serif', bold: false, italic: false });
});

test('summarizeSelection: mixed families -> family null', () => {
  const mono = MATH_STYLE_BY_ID.get('monospace')!;
  const text = applyStyle('a', mono) + 'b';
  const summary = summarizeSelection(text);
  assert.equal(summary.family, null);
});

test('summarizeSelection: sans-serif bold-italic reports both axes', () => {
  const style = MATH_STYLE_BY_ID.get('sans-serif-bold-italic')!;
  assert.deepEqual(summarizeSelection(applyStyle('Hey', style)),
    { family: 'sans-serif', bold: true, italic: true });
});

test('summarizeSelection: combining marks are ignored', () => {
  const boldStyle = MATH_STYLE_BY_ID.get('bold')!;
  const text = applyCombiningMark(applyStyle('Hi', boldStyle), STRIKETHROUGH);
  assert.deepEqual(summarizeSelection(text),
    { family: 'serif', bold: true, italic: false });
});

test('summarizeSelection: whitespace and punctuation only -> null family, no axes', () => {
  assert.deepEqual(summarizeSelection('  ... !?'),
    { family: null, bold: false, italic: false });
});

test('summarizeSelection: digits vote for family but not axes', () => {
  const boldStyle = MATH_STYLE_BY_ID.get('bold')!;
  const text = applyStyle('Hi', boldStyle) + '7';
  assert.deepEqual(summarizeSelection(text),
    { family: 'serif', bold: true, italic: false });
});

test('summarizeSelection: empty string -> null family, no axes', () => {
  assert.deepEqual(summarizeSelection(''),
    { family: null, bold: false, italic: false });
});

test('effectiveFamily: selection family wins over the fallback', () => {
  const mono = MATH_STYLE_BY_ID.get('monospace')!;
  assert.equal(effectiveFamily(applyStyle('code', mono), 'circled'), 'monospace');
});

test('effectiveFamily: plain text resolves to serif, not a stale active family', () => {
  assert.equal(effectiveFamily('plain words', 'circled'), 'serif');
});

test('effectiveFamily: mixed or letterless selections use the fallback', () => {
  const mono = MATH_STYLE_BY_ID.get('monospace')!;
  const boldStyle = MATH_STYLE_BY_ID.get('bold')!;
  const mixed = applyStyle('a', mono) + applyStyle('b', boldStyle);
  assert.equal(effectiveFamily(mixed, 'sans-serif'), 'sans-serif');
  assert.equal(effectiveFamily('... \n', 'fraktur'), 'fraktur');
});

// ---------------------------------------------------------------------------
// resolveTypingStyle: the Word model for what typing produces
//
// One pure function decides it, shared by the insert path and the toolbar
// display, so the lit B button and the character that appears cannot
// disagree. pending=null means follow the text; true/false is an explicit
// Ctrl+B/I override at this caret.
// ---------------------------------------------------------------------------

const styleById = (id: string) => ALL_STYLES.find(s => s.id === id)!;
const boldText = (t: string) => applyStyle(t, styleById('bold'));

test('typing in plain text with nothing pending stays plain', () => {
  assert.equal(resolveTypingStyle('hello ', 6, null, null, 'serif'), 'plain');
});

test('typing at the end of a bold run continues bold', () => {
  const doc = boldText('bold');
  assert.equal(resolveTypingStyle(doc, doc.length, null, null, 'serif'), 'bold');
});

test('inheritance survives a space and a newline', () => {
  const sp = boldText('bold') + ' ';
  assert.equal(resolveTypingStyle(sp, sp.length, null, null, 'serif'), 'bold');
  const nl = boldText('bold') + '\n';
  assert.equal(resolveTypingStyle(nl, nl.length, null, null, 'serif'), 'bold');
});

test('pending bold=false UN-bolds typing inside a bold run', () => {
  // The case an absolute sticky toggle cannot express.
  const doc = boldText('bold');
  assert.equal(resolveTypingStyle(doc, doc.length, false, null, 'serif'), 'plain');
});

test('pending bold=true bolds typing in plain text', () => {
  assert.equal(resolveTypingStyle('plain ', 6, true, null, 'serif'), 'bold');
});

test('pending italic layers onto an inherited bold run', () => {
  const doc = boldText('bold');
  assert.equal(resolveTypingStyle(doc, doc.length, null, true, 'serif'), 'bold-italic');
});

test('inherited family carries: typing after script with pending bold gives bold script', () => {
  const doc = applyStyle('fancy', styleById('script'));
  assert.equal(resolveTypingStyle(doc, doc.length, true, null, 'serif'), 'bold-script');
});

test('a dropdown family pick overrides inheritance for the next typing run', () => {
  // The reported bug: Enter onto a fresh line, pick fullwidth, type - the
  // empty line inherited plain from the paragraph above and the pick was
  // silently ignored.
  const doc = 'plain paragraph\n';
  assert.equal(
    resolveTypingStyle(doc, doc.length, null, null, 'serif', 'fullwidth'),
    'fullwidth');
  // It also beats a styled inheritance, not just plain.
  const bold = boldText('bold');
  assert.equal(
    resolveTypingStyle(bold, bold.length, null, null, 'serif', 'fullwidth'),
    'fullwidth');
});

test('a pending family keeps inherited axes when the target supports them', () => {
  const doc = boldText('bold');
  assert.equal(
    resolveTypingStyle(doc, doc.length, null, null, 'serif', 'sans-serif'),
    'sans-serif-bold');
});

test('no pending family leaves the resolver exactly as before', () => {
  const doc = boldText('bold');
  assert.equal(resolveTypingStyle(doc, doc.length, null, null, 'serif', null), 'bold');
});

test('the sparse matrix cascades: pending bold in a monospace run stays monospace', () => {
  const doc = applyStyle('code', styleById('monospace'));
  assert.equal(resolveTypingStyle(doc, doc.length, true, null, 'serif'), 'monospace');
});

test('empty document falls back to the toolbar family', () => {
  assert.equal(resolveTypingStyle('', 0, null, null, 'script'), 'script');
  assert.equal(resolveTypingStyle('', 0, null, null, 'serif'), 'plain');
});

test('typing at the START of a styled run inherits from the run ahead', () => {
  const doc = boldText('bold');
  assert.equal(resolveTypingStyle(doc, 0, null, null, 'serif'), 'bold');
});

test('uppercase-only families inherit: typing after squared stays squared', () => {
  // The reported bug: inheritance detected squared but the old typing path
  // used strictly-fail-closed applyStyle, so lowercase typed into a squared
  // run came out plain while the toolbar path case-folded. One resolver now.
  const doc = applyStyle('HELLO', styleById('squared'));
  assert.equal(resolveTypingStyle(doc, doc.length, null, null, 'serif'), 'squared');
});
