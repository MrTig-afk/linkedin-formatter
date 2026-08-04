import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { NON_MATH_STYLES, NON_MATH_STYLE_BY_ID } from '../../src/lib/palettes';
import { MATH_STYLE_BY_ID } from '../../src/lib/styles';

test('NON_MATH_STYLES contains exactly 5 entries', () => {
  assert.equal(NON_MATH_STYLES.length, 5);
});

test('every non-math style id is unique', () => {
  const ids = NON_MATH_STYLES.map(s => s.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length);
});

test('no non-math id collides with a math style id', () => {
  for (const style of NON_MATH_STYLES) {
    assert.ok(
      !MATH_STYLE_BY_ID.has(style.id),
      `id '${style.id}' collides with a math style id`
    );
  }
});

test('every NON_MATH_STYLES entry is retrievable from NON_MATH_STYLE_BY_ID as the same reference', () => {
  for (const style of NON_MATH_STYLES) {
    const found = NON_MATH_STYLE_BY_ID.get(style.id);
    assert.ok(found !== undefined, `id '${style.id}' not found in NON_MATH_STYLE_BY_ID`);
    assert.equal(found, style);
  }
});

test('every entry has the correct shape', () => {
  const validCoverage = new Set(['full', 'upperOnly', 'lowerOnly']);
  for (const style of NON_MATH_STYLES) {
    assert.ok(
      style.upperBase === null || (Number.isInteger(style.upperBase) && style.upperBase > 0),
      `${style.id}: upperBase must be a positive integer or null`
    );
    assert.ok(
      style.lowerBase === null || (Number.isInteger(style.lowerBase) && style.lowerBase > 0),
      `${style.id}: lowerBase must be a positive integer or null`
    );
    assert.ok(
      style.digitBase === null || (Number.isInteger(style.digitBase) && style.digitBase > 0),
      `${style.id}: digitBase must be a positive integer or null`
    );
    assert.ok(validCoverage.has(style.coverage),
      `${style.id}: coverage must be one of full|upperOnly|lowerOnly`);
    assert.ok(style.exceptions instanceof Map,
      `${style.id}: exceptions must be a Map`);
    for (const [key, value] of style.exceptions) {
      assert.ok(
        typeof key === 'string' && key.length === 1 && /^[A-Za-z0-9]$/.test(key),
        `${style.id}: exception key '${key}' must be a single ASCII letter or digit`
      );
      assert.ok(Number.isInteger(value) && value > 0,
        `${style.id}: exception value for '${key}' must be a positive integer`);
    }
  }
});

test('coverage consistency: upperOnly => lowerBase null, lowerOnly => upperBase null, full => both non-null', () => {
  for (const style of NON_MATH_STYLES) {
    if (style.coverage === 'upperOnly') {
      assert.equal(style.lowerBase, null,
        `${style.id}: coverage 'upperOnly' requires lowerBase === null`);
    } else if (style.coverage === 'lowerOnly') {
      assert.equal(style.upperBase, null,
        `${style.id}: coverage 'lowerOnly' requires upperBase === null`);
    } else {
      assert.ok(style.upperBase !== null && style.upperBase > 0,
        `${style.id}: coverage 'full' requires non-null positive upperBase`);
      assert.ok(style.lowerBase !== null && style.lowerBase > 0,
        `${style.id}: coverage 'full' requires non-null positive lowerBase`);
    }
  }
});

test('verbatim spot checks against PRD appendix A.3', () => {
  const circled = NON_MATH_STYLE_BY_ID.get('circled');
  assert.ok(circled !== undefined);
  assert.equal(circled.upperBase, 0x24B6);
  assert.equal(circled.lowerBase, 0x24D0);

  const squared = NON_MATH_STYLE_BY_ID.get('squared');
  assert.ok(squared !== undefined);
  assert.equal(squared.upperBase, 0x1F130);
  assert.equal(squared.lowerBase, null);

  const negativeSquared = NON_MATH_STYLE_BY_ID.get('negative-squared');
  assert.ok(negativeSquared !== undefined);
  assert.equal(negativeSquared.upperBase, 0x1F170);
  assert.equal(negativeSquared.lowerBase, null);

  const fullwidth = NON_MATH_STYLE_BY_ID.get('fullwidth');
  assert.ok(fullwidth !== undefined);
  assert.equal(fullwidth.upperBase, 0xFF21);
  assert.equal(fullwidth.lowerBase, 0xFF41);
  assert.equal(fullwidth.digitBase, 0xFF10);

  const parenthesized = NON_MATH_STYLE_BY_ID.get('parenthesized');
  assert.ok(parenthesized !== undefined);
  assert.equal(parenthesized.upperBase, null);
  assert.equal(parenthesized.lowerBase, 0x249C);
});

test('circled digit exceptions: 10 entries, spot checks 0/1/9', () => {
  const circled = NON_MATH_STYLE_BY_ID.get('circled')!;
  assert.equal(circled.exceptions.size, 10);
  assert.equal(circled.exceptions.get('0'), 0x24EA);
  assert.equal(circled.exceptions.get('1'), 0x2460);
  assert.equal(circled.exceptions.get('9'), 0x2468);
});

test('parenthesized digit exceptions: 9 entries (1-9, no 0), spot checks 1/9', () => {
  const parenthesized = NON_MATH_STYLE_BY_ID.get('parenthesized')!;
  assert.equal(parenthesized.exceptions.size, 9);
  assert.equal(parenthesized.exceptions.get('1'), 0x2474);
  assert.equal(parenthesized.exceptions.get('9'), 0x247C);
  assert.equal(parenthesized.exceptions.has('0'), false);
});

test('squared, negative-squared, and fullwidth have empty exception maps', () => {
  assert.equal(NON_MATH_STYLE_BY_ID.get('squared')!.exceptions.size, 0);
  assert.equal(NON_MATH_STYLE_BY_ID.get('negative-squared')!.exceptions.size, 0);
  assert.equal(NON_MATH_STYLE_BY_ID.get('fullwidth')!.exceptions.size, 0);
});

test('NON_MATH_STYLE_BY_ID returns undefined for an unknown id', () => {
  assert.equal(NON_MATH_STYLE_BY_ID.get('nonexistent'), undefined);
  assert.equal(NON_MATH_STYLE_BY_ID.get(''), undefined);
  assert.equal(NON_MATH_STYLE_BY_ID.get('Circled'), undefined);
});
