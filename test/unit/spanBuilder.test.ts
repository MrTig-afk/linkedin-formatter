import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { isCombiningMark, buildOffsetSpans, buildOffsetUnits, type TruncationMarker } from '../../src/lib/spanBuilder';

function parseSpans(html: string): Array<{ offset: number; len: number; content: string }> {
  const spans: Array<{ offset: number; len: number; content: string }> = [];
  const re = /data-offset="(\d+)" data-len="(\d+)">([^]*?)<\/span>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    spans.push({ offset: parseInt(m[1], 10), len: parseInt(m[2], 10), content: m[3] });
  }
  return spans;
}

test('buildOffsetSpans returns empty string for empty input', () => {
  assert.equal(buildOffsetSpans(''), '');
});

test('buildOffsetSpans ASCII text produces correct spans', () => {
  const spans = parseSpans(buildOffsetSpans('Hi'));
  assert.equal(spans.length, 2);
  assert.equal(spans[0].offset, 0);
  assert.equal(spans[0].len, 1);
  assert.equal(spans[0].content, 'H');
  assert.equal(spans[1].offset, 1);
  assert.equal(spans[1].len, 1);
  assert.equal(spans[1].content, 'i');
});

test('buildOffsetSpans astral characters use UTF-16 offsets', () => {
  const spans = parseSpans(buildOffsetSpans('\u{1D400}\u{1D401}'));
  assert.equal(spans.length, 2);
  assert.equal(spans[0].offset, 0);
  assert.equal(spans[0].len, 2);
  assert.equal(spans[1].offset, 2);
  assert.equal(spans[1].len, 2);
});

test('buildOffsetSpans groups combining mark with base char', () => {
  const spans = parseSpans(buildOffsetSpans('a\u{0336}'));
  assert.equal(spans.length, 1);
  assert.equal(spans[0].offset, 0);
  assert.equal(spans[0].len, 2);
});

test('buildOffsetSpans groups combining mark on astral base', () => {
  const spans = parseSpans(buildOffsetSpans('\u{1D400}\u{0336}'));
  assert.equal(spans.length, 1);
  assert.equal(spans[0].offset, 0);
  assert.equal(spans[0].len, 3);
});

test('buildOffsetSpans groups multiple combining marks on one base', () => {
  const spans = parseSpans(buildOffsetSpans('a\u{0336}\u{0332}'));
  assert.equal(spans.length, 1);
  assert.equal(spans[0].offset, 0);
  assert.equal(spans[0].len, 3);
});

test('buildOffsetSpans orphan combining mark at position 0 is its own unit', () => {
  const spans = parseSpans(buildOffsetSpans('\u{0336}a'));
  assert.equal(spans.length, 2);
  assert.equal(spans[0].offset, 0);
  assert.equal(spans[0].len, 1);
  assert.equal(spans[1].offset, 1);
  assert.equal(spans[1].len, 1);
});

test('buildOffsetSpans newlines produce correct offsets', () => {
  const spans = parseSpans(buildOffsetSpans('A\nB'));
  assert.equal(spans.length, 3);
  assert.equal(spans[0].offset, 0);
  assert.equal(spans[0].len, 1);
  assert.equal(spans[1].offset, 1);
  assert.equal(spans[1].len, 1);
  assert.equal(spans[2].offset, 2);
  assert.equal(spans[2].len, 1);
});

test('buildOffsetSpans escapes HTML-special characters inside spans', () => {
  const html = buildOffsetSpans('<');
  const spans = parseSpans(html);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].content, '&lt;');
  // The raw < must not appear in the content position (only in tag structure).
  const afterOpenTag = html.slice(html.indexOf('>') + 1);
  assert.ok(!afterOpenTag.startsWith('<'));
});

test('buildOffsetSpans mixed ASCII + astral + combining offsets chain correctly', () => {
  const spans = parseSpans(buildOffsetSpans('Hi\u{1D400}\u{0336}!'));
  assert.equal(spans.length, 4);
  assert.equal(spans[0].offset, 0); assert.equal(spans[0].len, 1); // H
  assert.equal(spans[1].offset, 1); assert.equal(spans[1].len, 1); // i
  assert.equal(spans[2].offset, 2); assert.equal(spans[2].len, 3); // bold-A + strikethrough
  assert.equal(spans[3].offset, 5); assert.equal(spans[3].len, 1); // !
  // Final offset + len must equal the JS string length of the input.
  const input = 'Hi\u{1D400}\u{0336}!';
  assert.equal(spans[3].offset + spans[3].len, input.length);
});

test('isCombiningMark correctly identifies combining marks', () => {
  assert.equal(isCombiningMark('\u{0336}'), true);    // strikethrough
  assert.equal(isCombiningMark('\u{0332}'), true);    // underline
  assert.equal(isCombiningMark('a'), false);
  assert.equal(isCombiningMark('\u{1D400}'), false);  // bold A, not a mark
});

test('buildOffsetSpans sum of all data-len equals text UTF-16 length for mixed content', () => {
  // ASCII + astral math-alphanumeric (surrogate pair, len 2) + combining mark + ASCII + astral + ASCII
  // 'A'=1  \u{1D400}=2  \u{0336}=1(grouped)  'B'=1  \u{1D401}=2  '!'=1  total=8
  const text = 'A\u{1D400}\u{0336}B\u{1D401}!';
  const spans = parseSpans(buildOffsetSpans(text));
  const totalLen = spans.reduce((acc, s) => acc + s.len, 0);
  assert.equal(totalLen, text.length,
    'sum of data-len must equal text.length so document.positionAt offsets land correctly');
});

// --- Truncation marker tests ---

test('buildOffsetSpans injects marker at correct position (ASCII)', () => {
  const text = 'a'.repeat(150);
  const marker: TruncationMarker = { position: 140, label: '~140 mobile cutoff' };
  const output = buildOffsetSpans(text, [marker]);
  assert.ok(output.includes('class="truncation-marker"'), 'marker element must appear in output');
  const spans = parseSpans(output);
  assert.equal(spans.length, 150);
  for (let i = 0; i < 150; i++) {
    assert.equal(spans[i].offset, i);
    assert.equal(spans[i].len, 1);
  }
  // Marker must appear between span offset=139 and span offset=140.
  const idx139 = output.indexOf('data-offset="139"');
  const idxMarker = output.indexOf('class="truncation-marker"');
  const idx140 = output.indexOf('data-offset="140"');
  assert.ok(idx139 < idxMarker, 'marker must come after span 139');
  assert.ok(idxMarker < idx140, 'marker must come before span 140');
});

test('buildOffsetSpans injects marker with astral characters', () => {
  // 139 ASCII + 6 astral = 145 code points; text.length = 139 + 12 = 151
  const text = 'a'.repeat(139) + '\u{1D400}'.repeat(6);
  const output = buildOffsetSpans(text, [{ position: 140, label: '~140 mobile cutoff' }]);
  assert.ok(output.includes('class="truncation-marker"'), 'marker element must appear in output');
  const spans = parseSpans(output);
  assert.equal(spans.length, 145);
  for (let i = 0; i < 139; i++) {
    assert.equal(spans[i].len, 1, `span ${i} should have len 1`);
  }
  for (let i = 139; i < 145; i++) {
    assert.equal(spans[i].len, 2, `span ${i} should have len 2 (astral)`);
  }
  const totalLen = spans.reduce((acc, s) => acc + s.len, 0);
  assert.equal(totalLen, text.length);
  // Marker must appear after the first astral span (offset 139, len 2) and
  // before the second astral span (offset 141).
  const idxFirstAstral = output.indexOf('data-offset="139" data-len="2"');
  const idxMarker = output.indexOf('class="truncation-marker"');
  const idxSecondAstral = output.indexOf('data-offset="141"');
  assert.ok(idxFirstAstral < idxMarker, 'marker must come after first astral span');
  assert.ok(idxMarker < idxSecondAstral, 'marker must come before second astral span');
});

test('buildOffsetSpans injects marker after combining-mark unit at boundary', () => {
  // 139 ASCII + 'b' + combining-mark + 10 ASCII = 151 code points
  // marker at 140 fires after the combined unit 'b\u{0336}' (offset 139, len 2)
  const text = 'a'.repeat(139) + 'b\u{0336}' + 'c'.repeat(10);
  const output = buildOffsetSpans(text, [{ position: 140, label: '~140 mobile cutoff' }]);
  assert.ok(output.includes('class="truncation-marker"'), 'marker element must appear in output');
  // Marker must appear after the combined-unit span (offset 139, len 2).
  const idxCombined = output.indexOf('data-offset="139" data-len="2"');
  const idxMarker = output.indexOf('class="truncation-marker"');
  // First 'c' is at UTF-16 offset 141 (139 ASCII * 1 + 'b'=1 + '\u{0336}'=1).
  const idxNextSpan = output.indexOf('data-offset="141"');
  assert.ok(idxCombined < idxMarker, 'marker must come after combined unit span');
  assert.ok(idxMarker < idxNextSpan, 'marker must come before the next span');
});

test('buildOffsetSpans injects both markers (140 and 210)', () => {
  const text = 'a'.repeat(220);
  const output = buildOffsetSpans(text, [
    { position: 140, label: '~140' },
    { position: 210, label: '~210' },
  ]);
  const firstIdx = output.indexOf('class="truncation-marker"');
  const lastIdx = output.lastIndexOf('class="truncation-marker"');
  assert.ok(firstIdx !== -1, 'at least one marker must appear');
  assert.ok(firstIdx < lastIdx, 'two distinct markers must appear (140 before 210)');
});

test('buildOffsetSpans shows no marker when text is too short', () => {
  const output = buildOffsetSpans('a'.repeat(100), [{ position: 140, label: '~140' }]);
  assert.ok(!output.includes('truncation-marker'), 'no marker for text shorter than position');
});

test('buildOffsetSpans shows no marker when text length equals position exactly', () => {
  const output = buildOffsetSpans('a'.repeat(140), [{ position: 140, label: '~140' }]);
  assert.ok(!output.includes('truncation-marker'), 'no marker when text length equals position');
});

test('buildOffsetSpans shows no marker when markers array is empty', () => {
  const output = buildOffsetSpans('a'.repeat(200), []);
  assert.ok(!output.includes('truncation-marker'), 'no marker with empty markers array');
});

test('buildOffsetSpans backward compatible with no second argument', () => {
  const expected =
    '<span data-offset="0" data-len="1">a</span>' +
    '<span data-offset="1" data-len="1">b</span>' +
    '<span data-offset="2" data-len="1">c</span>';
  assert.equal(buildOffsetSpans('abc'), expected);
});

test('buildOffsetSpans span offsets unaffected by markers', () => {
  const text = 'a'.repeat(220);
  const output = buildOffsetSpans(text, [
    { position: 140, label: '~140' },
    { position: 210, label: '~210' },
  ]);
  const spans = parseSpans(output);
  assert.equal(spans.length, 220);
  for (let i = 1; i < spans.length; i++) {
    assert.equal(
      spans[i].offset, spans[i - 1].offset + spans[i - 1].len,
      `offset chain broken at index ${i}`
    );
  }
  const totalLen = spans.reduce((acc, s) => acc + s.len, 0);
  assert.equal(totalLen, text.length);
});

test('buildOffsetSpans label text is present in output', () => {
  const output = buildOffsetSpans('a'.repeat(10), [{ position: 5, label: '~5 test cutoff' }]);
  assert.ok(output.includes('~5 test cutoff'), 'label text must appear in output');
});

test('buildOffsetSpans label is HTML-escaped', () => {
  const output = buildOffsetSpans('a'.repeat(10), [{ position: 5, label: '<b>test</b>' }]);
  assert.ok(output.includes('&lt;b&gt;test&lt;/b&gt;'), 'label must be HTML-escaped');
  assert.ok(!output.includes('<b>test</b>'), 'raw label HTML must not appear in output');
});

test('buildOffsetSpans shows only mobile marker when text is between 141 and 209 chars', () => {
  // text = 200 code points: 140 < 200 so mobile marker fires; 210 < 200 is false so desktop does not.
  const text = 'a'.repeat(200);
  const output = buildOffsetSpans(text, [
    { position: 140, label: '~140 mobile cutoff' },
    { position: 210, label: '~210 desktop cutoff' },
  ]);
  const firstIdx = output.indexOf('class="truncation-marker"');
  const lastIdx = output.lastIndexOf('class="truncation-marker"');
  assert.ok(firstIdx !== -1, 'mobile marker must appear');
  assert.equal(firstIdx, lastIdx, 'only one marker must appear (no desktop marker for 200-char text)');
  assert.ok(output.includes('~140 mobile cutoff'), 'mobile label must be present');
  assert.ok(!output.includes('~210 desktop cutoff'), 'desktop label must not appear');
});

test('buildOffsetSpans shows no desktop marker when text length equals 210 exactly', () => {
  // At exactly 210 code points, position 210 is not < totalCp (210), so the marker is filtered out.
  // Text must EXCEED the position for the marker to appear.
  const output = buildOffsetSpans('a'.repeat(210), [{ position: 210, label: '~210 desktop cutoff' }]);
  assert.ok(!output.includes('truncation-marker'), 'no marker when text length equals marker position exactly');
});

test('buildOffsetSpans marker divs carry no data-offset or data-len (inert for clicks)', () => {
  const text = 'a'.repeat(150);
  const output = buildOffsetSpans(text, [{ position: 140, label: '~140' }]);
  const markerStart = output.indexOf('<div class="truncation-marker"');
  assert.ok(markerStart !== -1, 'marker div must exist in output');
  const markerEnd = output.indexOf('</div>', markerStart);
  const markerHtml = output.slice(markerStart, markerEnd + 6);
  assert.ok(!markerHtml.includes('data-offset'), 'marker div must not carry data-offset attribute');
  assert.ok(!markerHtml.includes('data-len'), 'marker div must not carry data-len attribute');
});

// ---------------------------------------------------------------------------
// Grapheme clusters (UAX #29)
//
// A span is one USER-PERCEIVED character. Deletion and arrow motion both use
// span ranges, so a span that splits an emoji lets backspace destroy half of
// it - the defect VS Code has carried since 2017 (microsoft/vscode#22486).
// ---------------------------------------------------------------------------

const spansOf = (text: string) =>
  buildOffsetUnits(text).filter(u => u.kind === 'span');

test('a ZWJ emoji family is ONE span, not seven', () => {
  const family = '\u{1F469}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F467}';
  const spans = spansOf(family);
  assert.equal(spans.length, 1, `family split into ${spans.length} spans`);
  assert.equal((spans[0] as { text: string }).text, family);
  assert.equal((spans[0] as { len: number }).len, family.length);
});

test('a skin-tone modifier stays with its base emoji', () => {
  const baby = '\u{1F476}\u{1F3FE}';
  assert.equal(spansOf(baby).length, 1);
});

test('a regional-indicator flag is one span', () => {
  const flag = '\u{1F1EC}\u{1F1E7}';
  assert.equal(spansOf(flag).length, 1);
});

test('combining marks still group with their base (no regression)', () => {
  assert.equal(spansOf('e\u0301').length, 1, 'e + acute');
  assert.equal(spansOf('a\u0336b\u0336').length, 2, 'struck a, struck b');
});

test('styled astral characters remain one span each', () => {
  assert.equal(spansOf('\u{1D400}\u{1D401}').length, 2, 'math bold A, B');
});

test('offsets stay exact UTF-16 positions and reconstruct the input', () => {
  const text = 'ab' + '\u{1F469}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F467}' + 'cd';
  const spans = spansOf(text) as Array<{ offset: number; len: number; text: string }>;
  assert.equal(spans.map(s => s.text).join(''), text, 'must reconstruct exactly');
  let expected = 0;
  for (const s of spans) {
    assert.equal(s.offset, expected, 'offset must be the running UTF-16 position');
    assert.equal(s.len, s.text.length);
    expected += s.len;
  }
  assert.equal(expected, text.length);
});

test('every span boundary is a valid grapheme boundary', () => {
  // The invariant deletion and arrow motion depend on: no span may start or
  // end inside a user-perceived character.
  const text = 'Hi ' + '\u{1F469}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F467}' + ' \u{1F476}\u{1F3FE} e\u0301 \u{1D400} done';
  const spans = spansOf(text) as Array<{ text: string }>;
  const seg = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)]
    .map(x => x.segment);
  assert.deepEqual(spans.map(s => s.text), seg);
});
