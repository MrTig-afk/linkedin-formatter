import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  ALL_STYLES,
  applyStyle,
  removeStyle,
  styledCodePoint,
} from '../../src/lib/convert';
import {
  COMBINING_MARKS,
  applyCombiningMark,
  stripCombiningMark,
} from '../../src/lib/combining';

const FULL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// ---------------------------------------------------------------------------
// Group 1: Round-trip letterform styles (18 tests)
// ---------------------------------------------------------------------------

for (const style of ALL_STYLES) {
  test(`round-trip ${style.id}: plain -> styled -> plain`, () => {
    const mappable = [...FULL].filter(ch => styledCodePoint(ch, style) !== null).join('');
    const styled = applyStyle(mappable, style);
    assert.notEqual(styled, mappable, `${style.id}: applyStyle was a no-op`);
    const back = removeStyle(styled, style);
    assert.equal(back, mappable, `${style.id}: round-trip failed`);
  });
}

// ---------------------------------------------------------------------------
// Group 2: Round-trip combining marks (2 tests)
// ---------------------------------------------------------------------------

for (const mark of COMBINING_MARKS) {
  test(`round-trip combining ${mark.id}: apply -> strip`, () => {
    const marked = applyCombiningMark(FULL, mark);
    assert.notEqual(marked, FULL);
    const stripped = stripCombiningMark(marked, mark);
    assert.equal(stripped, FULL);
  });
}

// ---------------------------------------------------------------------------
// Group 3: Round-trip letterform + combining mark layered (2 tests)
// ---------------------------------------------------------------------------

const bold = ALL_STYLES.find(s => s.id === 'bold')!;

for (const mark of COMBINING_MARKS) {
  test(`round-trip bold + ${mark.id}: style+mark -> strip mark -> remove style`, () => {
    const styled = applyStyle(FULL, bold);
    const marked = applyCombiningMark(styled, mark);
    const unmarked = stripCombiningMark(marked, mark);
    const back = removeStyle(unmarked, bold);
    assert.equal(back, FULL);
  });
}

// ---------------------------------------------------------------------------
// Group 4: Toggle -- applyStyle is idempotent on already-styled text (18 tests)
// ---------------------------------------------------------------------------

for (const style of ALL_STYLES) {
  test(`toggle ${style.id}: applyStyle idempotent on styled text`, () => {
    const mappable = [...FULL].filter(ch => styledCodePoint(ch, style) !== null).join('');
    const once = applyStyle(mappable, style);
    const twice = applyStyle(once, style);
    assert.equal(twice, once, `${style.id}: applyStyle double-applied`);
  });
}

// ---------------------------------------------------------------------------
// Group 5: Fail-closed -- unmappable characters pass through unchanged (1 test)
// ---------------------------------------------------------------------------

test('fail-closed: unmappable characters unchanged for every style', () => {
  const unmappable = '!@#$%^&*()_+-=[]{}|;:\'",./<>?`~ \t\n';
  for (const style of ALL_STYLES) {
    assert.equal(applyStyle(unmappable, style), unmappable, `${style.id}`);
  }
});

// ---------------------------------------------------------------------------
// Group 6: Fail-closed -- coverage-limited styles leave out-of-range chars unchanged (1 test)
// ---------------------------------------------------------------------------

test('fail-closed: coverage limits respected', () => {
  const upper  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower  = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';

  // squared (upperOnly): lowercase and digits unchanged
  const squared = ALL_STYLES.find(s => s.id === 'squared')!;
  assert.equal(applyStyle(lower, squared), lower);
  assert.equal(applyStyle(digits, squared), digits);

  // negative-squared (upperOnly): same
  const negSquared = ALL_STYLES.find(s => s.id === 'negative-squared')!;
  assert.equal(applyStyle(lower, negSquared), lower);
  assert.equal(applyStyle(digits, negSquared), digits);

  // parenthesized (lowerOnly, digits 1-9 only): uppercase unchanged, '0' unchanged
  const paren = ALL_STYLES.find(s => s.id === 'parenthesized')!;
  assert.equal(applyStyle(upper, paren), upper);
  assert.equal(applyStyle('0', paren), '0');
});
