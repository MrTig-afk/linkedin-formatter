import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { CURATED_EMOJI, EMOJI_GROUPS, CURATED_EMOJI_CHARS } from '../../src/lib/emoji';

test('CURATED_EMOJI has between 180 and 220 entries', () => {
  assert.ok(
    CURATED_EMOJI.length >= 180 && CURATED_EMOJI.length <= 220,
    `expected 180-220 entries, got ${CURATED_EMOJI.length}`
  );
});

test('All emoji chars are unique', () => {
  const seen = new Set<string>();
  for (const entry of CURATED_EMOJI) {
    assert.ok(!seen.has(entry.char), `duplicate char found: ${entry.char} (${entry.name})`);
    seen.add(entry.char);
  }
});

test('Every entry has a non-empty char, name, and group', () => {
  for (const entry of CURATED_EMOJI) {
    assert.ok(entry.char.length > 0, `entry has empty char: ${JSON.stringify(entry)}`);
    assert.ok(entry.name.length > 0, `entry has empty name: ${JSON.stringify(entry)}`);
    assert.ok(entry.group.length > 0, `entry has empty group: ${JSON.stringify(entry)}`);
  }
});

test("Every entry's group is one of EMOJI_GROUPS", () => {
  const validGroups = new Set(EMOJI_GROUPS);
  for (const entry of CURATED_EMOJI) {
    assert.ok(
      validGroups.has(entry.group),
      `entry "${entry.name}" has unknown group "${entry.group}"`
    );
  }
});

test('EMOJI_GROUPS has no duplicates', () => {
  const seen = new Set<string>();
  for (const group of EMOJI_GROUPS) {
    assert.ok(!seen.has(group), `duplicate group name: "${group}"`);
    seen.add(group);
  }
});

test('EMOJI_GROUPS is non-empty', () => {
  assert.ok(EMOJI_GROUPS.length > 0, 'EMOJI_GROUPS must not be empty');
});

test('No entry contains a skin-tone modifier (U+1F3FB-U+1F3FF)', () => {
  const skinTones = ['\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];
  for (const entry of CURATED_EMOJI) {
    for (const tone of skinTones) {
      assert.ok(
        !entry.char.includes(tone),
        `entry "${entry.name}" contains skin-tone modifier ${tone}`
      );
    }
  }
});

test('CURATED_EMOJI_CHARS has the same size as CURATED_EMOJI', () => {
  assert.equal(
    CURATED_EMOJI_CHARS.size,
    CURATED_EMOJI.length,
    'CURATED_EMOJI_CHARS size must match CURATED_EMOJI length (no duplicates)'
  );
});

test("CURATED_EMOJI_CHARS contains every entry's char", () => {
  for (const entry of CURATED_EMOJI) {
    assert.ok(
      CURATED_EMOJI_CHARS.has(entry.char),
      `CURATED_EMOJI_CHARS missing char for "${entry.name}"`
    );
  }
});

test('Every name is lowercase', () => {
  for (const entry of CURATED_EMOJI) {
    assert.equal(
      entry.name,
      entry.name.toLowerCase(),
      `name is not lowercase: "${entry.name}"`
    );
  }
});

test('No char or name contains HTML-breaking characters (</script> injection safety)', () => {
  // The emoji-data JSON is injected unescaped into a <script type="application/json"> tag.
  // If any char or name contained <, > or &, it could break out of the tag or corrupt the JSON.
  for (const entry of CURATED_EMOJI) {
    assert.ok(
      !entry.char.includes('<') && !entry.char.includes('>') && !entry.char.includes('&'),
      `char contains HTML-breaking character in entry "${entry.name}"`
    );
    assert.ok(
      !entry.name.includes('<') && !entry.name.includes('>') && !entry.name.includes('&'),
      `name contains HTML-breaking character: "${entry.name}"`
    );
  }
});
