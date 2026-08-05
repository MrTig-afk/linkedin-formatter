import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { validateMessage } from '../../src/lib/validateMessage';
import { VALID_FORMAT_IDS } from '../../src/lib/messageContract';
import { CURATED_EMOJI } from '../../src/lib/emoji';

const DOC_LEN = 10;

// ---------------------------------------------------------------------------
// Shape rejection
// ---------------------------------------------------------------------------

test('rejects null', () => {
  const result = validateMessage(null, DOC_LEN);
  assert.equal(result.valid, false);
});

test('rejects undefined', () => {
  const result = validateMessage(undefined, DOC_LEN);
  assert.equal(result.valid, false);
});

test('rejects number primitive', () => {
  const result = validateMessage(42, DOC_LEN);
  assert.equal(result.valid, false);
});

test('rejects string primitive', () => {
  const result = validateMessage('applyStyle', DOC_LEN);
  assert.equal(result.valid, false);
});

test('rejects boolean', () => {
  const result = validateMessage(true, DOC_LEN);
  assert.equal(result.valid, false);
});

test('rejects array', () => {
  const result = validateMessage([], DOC_LEN);
  assert.equal(result.valid, false);
});

test('rejects empty object (no type)', () => {
  const result = validateMessage({}, DOC_LEN);
  assert.equal(result.valid, false);
});

test('rejects unknown type string', () => {
  const result = validateMessage({ type: 'unknown' }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('rejects non-string type', () => {
  const result = validateMessage({ type: 42 }, DOC_LEN);
  assert.equal(result.valid, false);
});

// ---------------------------------------------------------------------------
// applyStyle -- valid
// ---------------------------------------------------------------------------

test('applyStyle: valid basic message', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'strikethrough', start: 0, end: 5 }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'applyStyle', styleId: 'strikethrough', start: 0, end: 5 });
  }
});

test('applyStyle: valid empty selection (start === end === 0)', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'strikethrough', start: 0, end: 0 }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'applyStyle', styleId: 'strikethrough', start: 0, end: 0 });
  }
});

test('applyStyle: valid at documentLength boundary', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'strikethrough', start: 0, end: 10 }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'applyStyle', styleId: 'strikethrough', start: 0, end: 10 });
  }
});

test('applyStyle: valid zero-length selection in middle', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'strikethrough', start: 5, end: 5 }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'applyStyle', styleId: 'strikethrough', start: 5, end: 5 });
  }
});

test('applyStyle: extra properties are ignored and not in result', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'strikethrough', start: 0, end: 5, extra: true }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'applyStyle', styleId: 'strikethrough', start: 0, end: 5 });
    assert.ok(!Object.prototype.hasOwnProperty.call(result.message, 'extra'));
  }
});

test('applyStyle: both combining mark IDs are accepted (v1.2 narrowed contract)', () => {
  for (const id of ['strikethrough', 'underline']) {
    const result = validateMessage({ type: 'applyStyle', styleId: id, start: 0, end: 5 }, DOC_LEN);
    assert.equal(result.valid, true, `expected valid for styleId '${id}'`);
  }
});

test('applyStyle: letterform style IDs are rejected (v1.2 narrowed contract)', () => {
  for (const id of VALID_FORMAT_IDS) {
    if (id === 'strikethrough' || id === 'underline') { continue; }
    const result = validateMessage({ type: 'applyStyle', styleId: id, start: 0, end: 5 }, DOC_LEN);
    assert.equal(result.valid, false, `expected rejection for letterform styleId '${id}'`);
  }
});

// ---------------------------------------------------------------------------
// applyStyle -- clamping
// ---------------------------------------------------------------------------

test('applyStyle: clamps end when it exceeds documentLength', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'strikethrough', start: 0, end: 15 }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'applyStyle', styleId: 'strikethrough', start: 0, end: 10 });
  }
});

test('applyStyle: clamps both start and end when both exceed documentLength', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'strikethrough', start: 12, end: 15 }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'applyStyle', styleId: 'strikethrough', start: 10, end: 10 });
  }
});

test('applyStyle: clamps to 0 on empty document', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'strikethrough', start: 0, end: 100 }, 0);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'applyStyle', styleId: 'strikethrough', start: 0, end: 0 });
  }
});

// ---------------------------------------------------------------------------
// applyStyle -- rejection
// ---------------------------------------------------------------------------

test('applyStyle: rejects missing styleId', () => {
  const result = validateMessage({ type: 'applyStyle', start: 0, end: 5 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('applyStyle: rejects empty string styleId', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: '', start: 0, end: 5 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('applyStyle: rejects unknown styleId', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'unknown-style', start: 0, end: 5 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('applyStyle: rejects numeric styleId', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 123, start: 0, end: 5 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('applyStyle: rejects string start', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'strikethrough', start: '0', end: 5 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('applyStyle: rejects non-integer start (1.5)', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'strikethrough', start: 1.5, end: 5 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('applyStyle: rejects NaN start', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'strikethrough', start: NaN, end: 5 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('applyStyle: rejects Infinity start', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'strikethrough', start: Infinity, end: 5 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('applyStyle: rejects -Infinity start', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'strikethrough', start: -Infinity, end: 5 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('applyStyle: rejects negative start', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'strikethrough', start: -1, end: 5 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('applyStyle: rejects null end', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'strikethrough', start: 0, end: null }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('applyStyle: rejects undefined end', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'strikethrough', start: 0, end: undefined }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('applyStyle: rejects start > end', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'strikethrough', start: 5, end: 3 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('applyStyle: rejects missing start', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'strikethrough', end: 5 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('applyStyle: rejects missing end', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'strikethrough', start: 0 }, DOC_LEN);
  assert.equal(result.valid, false);
});

// ---------------------------------------------------------------------------
// clearFormatting -- valid
// ---------------------------------------------------------------------------

test('clearFormatting: valid basic message', () => {
  const result = validateMessage({ type: 'clearFormatting', start: 0, end: 10 }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'clearFormatting', start: 0, end: 10 });
  }
});

test('clearFormatting: clamps end when it exceeds documentLength', () => {
  const result = validateMessage({ type: 'clearFormatting', start: 0, end: 15 }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'clearFormatting', start: 0, end: 10 });
  }
});

// ---------------------------------------------------------------------------
// clearFormatting -- rejection
// ---------------------------------------------------------------------------

test('clearFormatting: rejects string start', () => {
  const result = validateMessage({ type: 'clearFormatting', start: '0', end: 5 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('clearFormatting: rejects start > end', () => {
  const result = validateMessage({ type: 'clearFormatting', start: 5, end: 3 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('clearFormatting: rejects missing start', () => {
  const result = validateMessage({ type: 'clearFormatting', end: 5 }, DOC_LEN);
  assert.equal(result.valid, false);
});

// ---------------------------------------------------------------------------
// cursorSync -- valid
// ---------------------------------------------------------------------------

test('cursorSync: valid offset', () => {
  const result = validateMessage({ type: 'cursorSync', offset: 5 }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'cursorSync', offset: 5 });
  }
});

test('cursorSync: valid offset at zero boundary', () => {
  const result = validateMessage({ type: 'cursorSync', offset: 0 }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'cursorSync', offset: 0 });
  }
});

test('cursorSync: valid offset at documentLength boundary', () => {
  const result = validateMessage({ type: 'cursorSync', offset: 10 }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'cursorSync', offset: 10 });
  }
});

test('cursorSync: clamps offset when it exceeds documentLength', () => {
  const result = validateMessage({ type: 'cursorSync', offset: 15 }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'cursorSync', offset: 10 });
  }
});

// ---------------------------------------------------------------------------
// cursorSync -- rejection
// ---------------------------------------------------------------------------

test('cursorSync: rejects string offset', () => {
  const result = validateMessage({ type: 'cursorSync', offset: '5' }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('cursorSync: rejects negative offset', () => {
  const result = validateMessage({ type: 'cursorSync', offset: -1 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('cursorSync: rejects non-integer offset (1.5)', () => {
  const result = validateMessage({ type: 'cursorSync', offset: 1.5 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('cursorSync: rejects missing offset', () => {
  const result = validateMessage({ type: 'cursorSync' }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('cursorSync: rejects NaN offset', () => {
  const result = validateMessage({ type: 'cursorSync', offset: NaN }, DOC_LEN);
  assert.equal(result.valid, false);
});

// ---------------------------------------------------------------------------
// Prototype pollution defense
// ---------------------------------------------------------------------------

test('applyStyle: __proto__ key in input does not propagate to result', () => {
  // Object literal with __proto__ sets the object's prototype, not an own property.
  // The result must be a fresh literal with only contract fields.
  const raw = { type: 'applyStyle', styleId: 'strikethrough', start: 0, end: 5 };
  Object.setPrototypeOf(raw, { admin: true });
  const result = validateMessage(raw, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.ok(!('admin' in result.message), 'poisoned prototype property must not appear in result');
    assert.equal(Object.getPrototypeOf(result.message), Object.prototype);
  }
});

test('applyStyle: constructor own property in input does not propagate to result', () => {
  const raw = { type: 'applyStyle', styleId: 'strikethrough', start: 0, end: 5, constructor: {} };
  const result = validateMessage(raw, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.ok(!Object.prototype.hasOwnProperty.call(result.message, 'constructor'),
      'constructor own property must not appear in result');
  }
});

test('result object has no own __proto__ or constructor beyond Object.prototype defaults', () => {
  const result = validateMessage({ type: 'applyStyle', styleId: 'strikethrough', start: 0, end: 5 }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    const keys = Object.keys(result.message);
    assert.ok(!keys.includes('__proto__'));
    assert.ok(!keys.includes('constructor'));
    assert.equal(Object.getPrototypeOf(result.message), Object.prototype);
  }
});

// ---------------------------------------------------------------------------
// VALID_FORMAT_IDS set
// ---------------------------------------------------------------------------

test('VALID_FORMAT_IDS has exactly 20 entries', () => {
  assert.equal(VALID_FORMAT_IDS.size, 20);
});

test('VALID_FORMAT_IDS contains all 18 letterform style IDs', () => {
  const letterforms = [
    'bold', 'italic', 'bold-italic', 'script', 'bold-script', 'fraktur',
    'double-struck', 'bold-fraktur', 'sans-serif', 'sans-serif-bold',
    'sans-serif-italic', 'sans-serif-bold-italic', 'monospace',
    'circled', 'squared', 'negative-squared', 'fullwidth', 'parenthesized',
  ];
  for (const id of letterforms) {
    assert.ok(VALID_FORMAT_IDS.has(id), `expected VALID_FORMAT_IDS to contain '${id}'`);
  }
});

test('VALID_FORMAT_IDS contains both combining mark IDs', () => {
  assert.ok(VALID_FORMAT_IDS.has('strikethrough'));
  assert.ok(VALID_FORMAT_IDS.has('underline'));
});

// ---------------------------------------------------------------------------
// Adversarial: huge-but-safe integers
// Number.MAX_SAFE_INTEGER passes isValidOffset (safe integer, >= 0) and must
// clamp to documentLength via Math.min.
// ---------------------------------------------------------------------------

test('applyStyle: Number.MAX_SAFE_INTEGER end clamped to documentLength', () => {
  const result = validateMessage(
    { type: 'applyStyle', styleId: 'strikethrough', start: 0, end: Number.MAX_SAFE_INTEGER },
    DOC_LEN
  );
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'applyStyle', styleId: 'strikethrough', start: 0, end: 10 });
  }
});

test('clearFormatting: Number.MAX_SAFE_INTEGER end clamped to documentLength', () => {
  const result = validateMessage(
    { type: 'clearFormatting', start: 0, end: Number.MAX_SAFE_INTEGER },
    DOC_LEN
  );
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'clearFormatting', start: 0, end: 10 });
  }
});

test('cursorSync: Number.MAX_SAFE_INTEGER offset clamped to documentLength', () => {
  const result = validateMessage(
    { type: 'cursorSync', offset: Number.MAX_SAFE_INTEGER },
    DOC_LEN
  );
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'cursorSync', offset: 10 });
  }
});

// ---------------------------------------------------------------------------
// Adversarial: documentLength = 0 for cursorSync and clearFormatting
// applyStyle with docLen=0 is already covered; these complete the picture.
// ---------------------------------------------------------------------------

test('cursorSync: offset=0 valid on empty document (documentLength=0)', () => {
  const result = validateMessage({ type: 'cursorSync', offset: 0 }, 0);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'cursorSync', offset: 0 });
  }
});

test('cursorSync: positive offset clamped to 0 on empty document', () => {
  const result = validateMessage({ type: 'cursorSync', offset: 5 }, 0);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'cursorSync', offset: 0 });
  }
});

test('clearFormatting: both offsets clamped to 0 on empty document', () => {
  const result = validateMessage({ type: 'clearFormatting', start: 0, end: 5 }, 0);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'clearFormatting', start: 0, end: 0 });
  }
});

// ---------------------------------------------------------------------------
// Adversarial: fractional documentLength
// text.length is always an integer, so fractional documentLength is a caller
// error. When the offset is below the fractional threshold, Math.min returns
// the offset unchanged (an integer). The validator does not validate its own
// parameters; this test documents the safe case.
// ---------------------------------------------------------------------------

test('fractional documentLength: in-range offset passes through unchanged as integer', () => {
  // Math.min(5, 10.5) = 5 -- no clamping, integer preserved.
  const result = validateMessage({ type: 'cursorSync', offset: 5 }, 10.5);
  assert.equal(result.valid, true);
  if (result.valid) {
    // deepEqual confirms the offset is exactly 5 (an integer, not fractional).
    assert.deepEqual(result.message, { type: 'cursorSync', offset: 5 });
  }
});

// ---------------------------------------------------------------------------
// insertEmoji
// ---------------------------------------------------------------------------

test('insertEmoji: valid emoji accepted', () => {
  const result = validateMessage({ type: 'insertEmoji', emoji: CURATED_EMOJI[0].char }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'insertEmoji', emoji: CURATED_EMOJI[0].char });
  }
});

test('insertEmoji: rejects emoji not in curated set', () => {
  // Smiley with skin-tone modifier: not in the curated set.
  const result = validateMessage({ type: 'insertEmoji', emoji: '\u{1F600}\u{1F3FB}' }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('insertEmoji: rejects non-string emoji (number)', () => {
  const result = validateMessage({ type: 'insertEmoji', emoji: 42 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('insertEmoji: rejects non-string emoji (null)', () => {
  const result = validateMessage({ type: 'insertEmoji', emoji: null }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('insertEmoji: rejects non-string emoji (undefined / missing)', () => {
  const result = validateMessage({ type: 'insertEmoji' }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('insertEmoji: rejects empty string', () => {
  const result = validateMessage({ type: 'insertEmoji', emoji: '' }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('insertEmoji: rejects object emoji', () => {
  const result = validateMessage({ type: 'insertEmoji', emoji: {} }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('insertEmoji: rejects long arbitrary string', () => {
  const result = validateMessage({ type: 'insertEmoji', emoji: 'hello world' }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('insertEmoji: extra properties do not propagate to result', () => {
  const result = validateMessage(
    { type: 'insertEmoji', emoji: CURATED_EMOJI[0].char, extra: 'hack' },
    DOC_LEN
  );
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.ok(!Object.prototype.hasOwnProperty.call(result.message, 'extra'));
  }
});

test('insertEmoji: result has no prototype pollution', () => {
  const raw = { type: 'insertEmoji', emoji: CURATED_EMOJI[0].char };
  Object.setPrototypeOf(raw, { admin: true });
  const result = validateMessage(raw, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.ok(!('admin' in result.message), 'poisoned prototype property must not appear in result');
    assert.equal(Object.getPrototypeOf(result.message), Object.prototype);
  }
});

test('insertEmoji: rejects multi-emoji string (two curated chars concatenated)', () => {
  // Concatenation of two valid set members is NOT itself in the set.
  const twoEmoji = CURATED_EMOJI[0].char + CURATED_EMOJI[1].char;
  const result = validateMessage({ type: 'insertEmoji', emoji: twoEmoji }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('insertEmoji: rejects emoji plus text string', () => {
  // An emoji followed by plain text is not in the curated set.
  const emojiPlusText = CURATED_EMOJI[0].char + ' hello';
  const result = validateMessage({ type: 'insertEmoji', emoji: emojiPlusText }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('insertEmoji: rejects ZWJ recombination of set members', () => {
  // Two curated emoji joined by U+200D (ZWJ) form a sequence not in the set.
  const zwjSequence = CURATED_EMOJI[0].char + '‍' + CURATED_EMOJI[1].char;
  const result = validateMessage({ type: 'insertEmoji', emoji: zwjSequence }, DOC_LEN);
  assert.equal(result.valid, false);
});

// ---------------------------------------------------------------------------
// v1.2 family messages: setFamily, convertFamily, toggleAxis
// ---------------------------------------------------------------------------

test('setFamily: valid family accepted, fresh object returned', () => {
  const raw = { type: 'setFamily', family: 'fraktur', extra: 'x' };
  Object.setPrototypeOf(raw, { admin: true });
  const result = validateMessage(raw, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'setFamily', family: 'fraktur' });
    assert.ok(!('admin' in result.message));
  }
});

test('setFamily: all 11 family IDs accepted', () => {
  const families = ['serif', 'sans-serif', 'script', 'fraktur', 'monospace',
    'double-struck', 'circled', 'squared', 'negative-squared', 'fullwidth',
    'parenthesized'];
  for (const family of families) {
    const result = validateMessage({ type: 'setFamily', family }, DOC_LEN);
    assert.equal(result.valid, true, `expected valid for family '${family}'`);
  }
});

test('setFamily: rejects unknown family', () => {
  assert.equal(validateMessage({ type: 'setFamily', family: 'comic-sans' }, DOC_LEN).valid, false);
});

test('setFamily: rejects a style id that is not a family id', () => {
  assert.equal(validateMessage({ type: 'setFamily', family: 'bold' }, DOC_LEN).valid, false);
});

test('setFamily: rejects non-string family', () => {
  assert.equal(validateMessage({ type: 'setFamily', family: 3 }, DOC_LEN).valid, false);
  assert.equal(validateMessage({ type: 'setFamily' }, DOC_LEN).valid, false);
});

test('convertFamily: valid message with clamping', () => {
  const result = validateMessage(
    { type: 'convertFamily', family: 'sans-serif', start: 0, end: 99 }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message,
      { type: 'convertFamily', family: 'sans-serif', start: 0, end: 10 });
  }
});

test('convertFamily: rejects unknown family', () => {
  assert.equal(validateMessage(
    { type: 'convertFamily', family: 'nope', start: 0, end: 5 }, DOC_LEN).valid, false);
});

test('convertFamily: rejects bad offsets', () => {
  assert.equal(validateMessage(
    { type: 'convertFamily', family: 'serif', start: '0', end: 5 }, DOC_LEN).valid, false);
  assert.equal(validateMessage(
    { type: 'convertFamily', family: 'serif', start: 5, end: 3 }, DOC_LEN).valid, false);
  assert.equal(validateMessage(
    { type: 'convertFamily', family: 'serif', start: -1, end: 3 }, DOC_LEN).valid, false);
  assert.equal(validateMessage(
    { type: 'convertFamily', family: 'serif', start: 1.5, end: 3 }, DOC_LEN).valid, false);
});

test('toggleAxis: valid bold and italic messages with clamping', () => {
  for (const axis of ['bold', 'italic']) {
    const result = validateMessage({ type: 'toggleAxis', axis, start: 2, end: 50 }, DOC_LEN);
    assert.equal(result.valid, true, `expected valid for axis '${axis}'`);
    if (result.valid) {
      assert.deepEqual(result.message, { type: 'toggleAxis', axis, start: 2, end: 10 });
    }
  }
});

test('toggleAxis: rejects unknown axis', () => {
  assert.equal(validateMessage(
    { type: 'toggleAxis', axis: 'underline', start: 0, end: 5 }, DOC_LEN).valid, false);
  assert.equal(validateMessage(
    { type: 'toggleAxis', axis: 7, start: 0, end: 5 }, DOC_LEN).valid, false);
  assert.equal(validateMessage(
    { type: 'toggleAxis', start: 0, end: 5 }, DOC_LEN).valid, false);
});

test('toggleAxis: rejects bad offsets', () => {
  assert.equal(validateMessage(
    { type: 'toggleAxis', axis: 'bold', start: NaN, end: 5 }, DOC_LEN).valid, false);
  assert.equal(validateMessage(
    { type: 'toggleAxis', axis: 'bold', start: 6, end: 5 }, DOC_LEN).valid, false);
});

test('undo/redo: accepted as bare messages, fresh objects', () => {
  for (const type of ['undo', 'redo']) {
    const raw = { type, extra: 'x' };
    const result = validateMessage(raw, DOC_LEN);
    assert.equal(result.valid, true, `expected valid for '${type}'`);
    if (result.valid) {
      assert.deepEqual(result.message, { type });
    }
  }
});

// ---------------------------------------------------------------------------
// selectionState -- acceptance and rejection
// ---------------------------------------------------------------------------

test('selectionState: valid range is accepted', () => {
  const result = validateMessage({ type: 'selectionState', start: 2, end: 8 }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'selectionState', start: 2, end: 8 });
  }
});

test('selectionState: start === end is accepted (selection cleared)', () => {
  const result = validateMessage({ type: 'selectionState', start: 0, end: 0 }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'selectionState', start: 0, end: 0 });
  }
});

test('selectionState: clamps offsets to documentLength', () => {
  const result = validateMessage({ type: 'selectionState', start: 5, end: 99 }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(result.message, { type: 'selectionState', start: 5, end: 10 });
  }
});

test('selectionState: rejects start > end', () => {
  const result = validateMessage({ type: 'selectionState', start: 8, end: 2 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('selectionState: rejects negative start', () => {
  const result = validateMessage({ type: 'selectionState', start: -1, end: 2 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('selectionState: rejects non-numeric offsets', () => {
  const result = validateMessage({ type: 'selectionState', start: '2', end: 8 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('selectionState: rejects missing fields', () => {
  const result = validateMessage({ type: 'selectionState' }, DOC_LEN);
  assert.equal(result.valid, false);
});

// ---------------------------------------------------------------------------
// insertText (M4.1, PRD S7.4)
// ---------------------------------------------------------------------------

test('insertText: accepts a single printable character', () => {
  const result = validateMessage({ type: 'insertText', text: 'a', offset: 3 }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.message.type, 'insertText');
    assert.equal((result.message as { text: string }).text, 'a');
    assert.equal((result.message as { offset: number }).offset, 3);
  }
});

test('insertText: clamps an offset past the end of the document', () => {
  const result = validateMessage({ type: 'insertText', text: 'x', offset: DOC_LEN + 500 }, DOC_LEN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal((result.message as { offset: number }).offset, DOC_LEN);
  }
});

test('insertText: accepts offset 0', () => {
  const result = validateMessage({ type: 'insertText', text: 'x', offset: 0 }, DOC_LEN);
  assert.equal(result.valid, true);
});

test('insertText: accepts a surrogate pair (one astral character)', () => {
  const result = validateMessage({ type: 'insertText', text: '\u{1F680}', offset: 1 }, DOC_LEN);
  assert.equal(result.valid, true);
});

test('insertText: accepts newline and tab', () => {
  assert.equal(validateMessage({ type: 'insertText', text: '\n', offset: 1 }, DOC_LEN).valid, true);
  assert.equal(validateMessage({ type: 'insertText', text: '\t', offset: 1 }, DOC_LEN).valid, true);
});

test('insertText: rejects empty text', () => {
  const result = validateMessage({ type: 'insertText', text: '', offset: 1 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('insertText: rejects non-string text', () => {
  assert.equal(validateMessage({ type: 'insertText', text: 5, offset: 1 }, DOC_LEN).valid, false);
  assert.equal(validateMessage({ type: 'insertText', text: null, offset: 1 }, DOC_LEN).valid, false);
  assert.equal(validateMessage({ type: 'insertText', offset: 1 }, DOC_LEN).valid, false);
});

test('insertText: rejects a carriage return (would desync the offset map)', () => {
  const result = validateMessage({ type: 'insertText', text: '\r', offset: 1 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('insertText: rejects C0 control characters and DEL', () => {
  for (const ch of ['\u0000', '\u0007', '\u001B', '\u007F']) {
    const result = validateMessage({ type: 'insertText', text: ch, offset: 1 }, DOC_LEN);
    assert.equal(result.valid, false, `expected rejection for ${JSON.stringify(ch)}`);
  }
});

test('insertText: refuses an oversized paste rather than truncating it', () => {
  const huge = 'a'.repeat(10_001);
  const result = validateMessage({ type: 'insertText', text: huge, offset: 1 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('insertText: accepts text exactly at the length limit', () => {
  const atLimit = 'a'.repeat(10_000);
  const result = validateMessage({ type: 'insertText', text: atLimit, offset: 1 }, DOC_LEN);
  assert.equal(result.valid, true);
});

test('insertText: rejects a negative offset', () => {
  const result = validateMessage({ type: 'insertText', text: 'a', offset: -1 }, DOC_LEN);
  assert.equal(result.valid, false);
});

test('insertText: rejects a non-integer offset', () => {
  assert.equal(validateMessage({ type: 'insertText', text: 'a', offset: 1.5 }, DOC_LEN).valid, false);
  assert.equal(validateMessage({ type: 'insertText', text: 'a', offset: '3' }, DOC_LEN).valid, false);
  assert.equal(validateMessage({ type: 'insertText', text: 'a' }, DOC_LEN).valid, false);
});
