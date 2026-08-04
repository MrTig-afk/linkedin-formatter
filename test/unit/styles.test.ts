import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { MATH_STYLES, MATH_STYLE_BY_ID } from '../../src/lib/styles';

test('MATH_STYLES contains exactly 13 entries', () => {
  assert.equal(MATH_STYLES.length, 13);
});

test('every style id is unique', () => {
  const ids = MATH_STYLES.map(s => s.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length);
});

test('every MATH_STYLES entry is retrievable from MATH_STYLE_BY_ID as the same reference', () => {
  for (const style of MATH_STYLES) {
    const found = MATH_STYLE_BY_ID.get(style.id);
    assert.ok(found !== undefined, `id '${style.id}' not found in MATH_STYLE_BY_ID`);
    assert.equal(found, style);
  }
});

test('every entry has the correct shape', () => {
  const validCoverage = new Set(['full', 'upperOnly', 'lowerOnly']);
  for (const style of MATH_STYLES) {
    assert.ok(style.upperBase !== null && Number.isInteger(style.upperBase) && style.upperBase > 0,
      `${style.id}: upperBase must be a positive integer`);
    assert.ok(style.lowerBase !== null && Number.isInteger(style.lowerBase) && style.lowerBase > 0,
      `${style.id}: lowerBase must be a positive integer`);
    assert.ok(style.digitBase === null || (Number.isInteger(style.digitBase) && style.digitBase > 0),
      `${style.id}: digitBase must be a positive integer or null`);
    assert.ok(style.exceptions instanceof Map,
      `${style.id}: exceptions must be a Map`);
    for (const [key, value] of style.exceptions) {
      assert.ok(typeof key === 'string' && key.length === 1 && /^[A-Za-z]$/.test(key),
        `${style.id}: exception key '${key}' must be a single ASCII letter`);
      assert.ok(Number.isInteger(value) && value > 0,
        `${style.id}: exception value for '${key}' must be a positive integer`);
    }
    assert.ok(validCoverage.has(style.coverage),
      `${style.id}: coverage must be one of full|upperOnly|lowerOnly`);
  }
});

test('verbatim spot checks against PRD appendix A.1', () => {
  const bold = MATH_STYLE_BY_ID.get('bold');
  assert.ok(bold !== undefined);
  assert.equal(bold.upperBase, 0x1D400);
  assert.equal(bold.lowerBase, 0x1D41A);
  assert.equal(bold.digitBase, 0x1D7CE);

  const monospace = MATH_STYLE_BY_ID.get('monospace');
  assert.ok(monospace !== undefined);
  assert.equal(monospace.upperBase, 0x1D670);
  assert.equal(monospace.lowerBase, 0x1D68A);
  assert.equal(monospace.digitBase, 0x1D7F6);

  const italic = MATH_STYLE_BY_ID.get('italic');
  assert.ok(italic !== undefined);
  assert.equal(italic.digitBase, null);
});

test('all math-alphanumeric styles have coverage full', () => {
  for (const style of MATH_STYLES) {
    assert.equal(style.coverage, 'full',
      `${style.id}: expected coverage 'full'`);
  }
});

test('MATH_STYLE_BY_ID returns undefined for an unknown id', () => {
  assert.equal(MATH_STYLE_BY_ID.get('nonexistent'), undefined);
  assert.equal(MATH_STYLE_BY_ID.get(''), undefined);
  assert.equal(MATH_STYLE_BY_ID.get('Bold'), undefined);
});

test('exception maps are mutable at runtime despite ReadonlyMap type', () => {
  for (const style of MATH_STYLES) {
    const map = style.exceptions as Map<string, number>;
    assert.doesNotThrow(
      () => { map.set('_probe', 0x0041); map.delete('_probe'); },
      `${style.id}: exceptions Map must accept .set() at runtime`
    );
  }
});

test('verbatim digit base spot checks for remaining styles against PRD appendix A.1', () => {
  const doubleStruck = MATH_STYLE_BY_ID.get('double-struck');
  assert.ok(doubleStruck !== undefined);
  assert.equal(doubleStruck.upperBase, 0x1D538);
  assert.equal(doubleStruck.lowerBase, 0x1D552);
  assert.equal(doubleStruck.digitBase, 0x1D7D8);

  const sansSerif = MATH_STYLE_BY_ID.get('sans-serif');
  assert.ok(sansSerif !== undefined);
  assert.equal(sansSerif.upperBase, 0x1D5A0);
  assert.equal(sansSerif.lowerBase, 0x1D5BA);
  assert.equal(sansSerif.digitBase, 0x1D7E2);

  const sansSerifBold = MATH_STYLE_BY_ID.get('sans-serif-bold');
  assert.ok(sansSerifBold !== undefined);
  assert.equal(sansSerifBold.upperBase, 0x1D5D4);
  assert.equal(sansSerifBold.lowerBase, 0x1D5EE);
  assert.equal(sansSerifBold.digitBase, 0x1D7EC);
});

test('exception map sizes match PRD appendix A.2', () => {
  const expected: Record<string, number> = {
    'bold': 0, 'italic': 1, 'bold-italic': 0,
    'script': 11, 'bold-script': 0,
    'fraktur': 5, 'double-struck': 7,
    'bold-fraktur': 0, 'sans-serif': 0, 'sans-serif-bold': 0,
    'sans-serif-italic': 0, 'sans-serif-bold-italic': 0, 'monospace': 0,
  };
  for (const style of MATH_STYLES) {
    assert.equal(style.exceptions.size, expected[style.id],
      `${style.id}: wrong exception count`);
  }
});

test('italic exception: h -> U+210E', () => {
  const italic = MATH_STYLE_BY_ID.get('italic')!;
  assert.equal(italic.exceptions.get('h'), 0x210E);
});

test('script exceptions verbatim from PRD appendix A.2', () => {
  const script = MATH_STYLE_BY_ID.get('script')!;
  assert.equal(script.exceptions.get('B'), 0x212C);
  assert.equal(script.exceptions.get('E'), 0x2130);
  assert.equal(script.exceptions.get('F'), 0x2131);
  assert.equal(script.exceptions.get('H'), 0x210B);
  assert.equal(script.exceptions.get('I'), 0x2110);
  assert.equal(script.exceptions.get('L'), 0x2112);
  assert.equal(script.exceptions.get('M'), 0x2133);
  assert.equal(script.exceptions.get('R'), 0x211B);
  assert.equal(script.exceptions.get('e'), 0x212F);
  assert.equal(script.exceptions.get('g'), 0x210A);
  assert.equal(script.exceptions.get('o'), 0x2134);
});

test('fraktur exceptions verbatim from PRD appendix A.2', () => {
  const fraktur = MATH_STYLE_BY_ID.get('fraktur')!;
  assert.equal(fraktur.exceptions.get('C'), 0x212D);
  assert.equal(fraktur.exceptions.get('H'), 0x210C);
  assert.equal(fraktur.exceptions.get('I'), 0x2111);
  assert.equal(fraktur.exceptions.get('R'), 0x211C);
  assert.equal(fraktur.exceptions.get('Z'), 0x2128);
});

test('double-struck exceptions verbatim from PRD appendix A.2', () => {
  const ds = MATH_STYLE_BY_ID.get('double-struck')!;
  assert.equal(ds.exceptions.get('C'), 0x2102);
  assert.equal(ds.exceptions.get('H'), 0x210D);
  assert.equal(ds.exceptions.get('N'), 0x2115);
  assert.equal(ds.exceptions.get('P'), 0x2119);
  assert.equal(ds.exceptions.get('Q'), 0x211A);
  assert.equal(ds.exceptions.get('R'), 0x211D);
  assert.equal(ds.exceptions.get('Z'), 0x2124);
});

test('exception maps contain only the expected keys', () => {
  const expectedKeys: Record<string, string[]> = {
    'italic': ['h'],
    'script': ['B','E','F','H','I','L','M','R','e','g','o'],
    'fraktur': ['C','H','I','R','Z'],
    'double-struck': ['C','H','N','P','Q','R','Z'],
  };
  for (const [id, keys] of Object.entries(expectedKeys)) {
    const style = MATH_STYLE_BY_ID.get(id)!;
    const actual = [...style.exceptions.keys()].sort();
    assert.deepEqual(actual, [...keys].sort(),
      `${id}: unexpected keys in exception map`);
  }
});
