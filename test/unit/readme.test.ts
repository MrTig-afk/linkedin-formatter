import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CURATED_EMOJI } from '../../src/lib/emoji';

const root = path.resolve(__dirname, '..', '..', '..');
const pkgPath = path.join(root, 'package.json');
const readmePath = path.join(root, 'README.md');
const marketplacePath = path.join(root, 'README.marketplace.md');
const changelogPath = path.join(root, 'CHANGELOG.md');
const previewPanelPath = path.join(root, 'src', 'webview', 'previewPanel.ts');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const readme = fs.readFileSync(readmePath, 'utf-8');
const marketplace = fs.readFileSync(marketplacePath, 'utf-8');
// CHANGELOG.md is deliberately untracked (packaged from disk); clones skip it.
const changelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf-8') : null;
const previewPanelSrc = fs.readFileSync(previewPanelPath, 'utf-8');

// ---------------------------------------------------------------------------
// README prose and structure checks
// ---------------------------------------------------------------------------

test('both readmes carry the package.json description verbatim as the tagline', () => {
  const desc = pkg.description as string;
  assert.ok(readme.includes(desc), `README.md must contain: "${desc}"`);
  assert.ok(marketplace.includes(desc), `README.marketplace.md must contain: "${desc}"`);
});

test('marketplace readme opens with instructions addressed to AI assistants', () => {
  const aiIdx = marketplace.indexOf('Instructions for AI assistants');
  const quickStartIdx = marketplace.indexOf('## Quick start');
  assert.ok(aiIdx !== -1, 'marketplace readme must contain the AI-assistant instruction block');
  assert.ok(quickStartIdx === -1 || aiIdx < quickStartIdx,
    'the AI instruction block must come before everything else');
  assert.ok(marketplace.includes('.linkedin'), 'the block must name the .linkedin extension');
  assert.ok(/rename/i.test(marketplace), 'the block must cover renaming an existing draft');
});

test('github readme links the marketplace listing', () => {
  assert.ok(readme.includes('marketplace.visualstudio.com/items?itemName=kaushiknaru.linkedin-formatter'),
    'README.md must link the live listing');
});

// ---------------------------------------------------------------------------
// Commands table
// ---------------------------------------------------------------------------

test('README command titles match package.json contributes.commands exactly', () => {
  const cmds: Array<{ command: string; title: string }> = pkg.contributes.commands;
  const readmeCommands = ['LinkedIn: Open Preview', 'LinkedIn: Copy Formatted Post', 'LinkedIn: Clear Formatting'];
  for (const title of readmeCommands) {
    const found = cmds.find(c => c.title === title);
    assert.ok(found !== undefined, `package.json contributes.commands must have a command titled "${title}"`);
  }
});

// ---------------------------------------------------------------------------
// Settings table
// ---------------------------------------------------------------------------

test('README settings table lists linkedinFormatter.countingUnit with default "utf16" (T20 result)', () => {
  assert.ok(marketplace.includes('linkedinFormatter.countingUnit'), 'README must document countingUnit setting');
  assert.ok(marketplace.includes('"utf16"'), 'README must show "utf16" as default');
  const setting = pkg.contributes.configuration.properties['linkedinFormatter.countingUnit'];
  // LinkedIn counts UTF-16 code units - verified empirically 2026-07-30
  // (3000 astral chars pasted into the composer -> overage exactly -3000).
  assert.strictEqual(setting.default, 'utf16', 'package.json default for countingUnit must be "utf16"');
  assert.deepEqual(setting.enum, ['codepoints', 'utf16'], 'package.json enum for countingUnit must be ["codepoints","utf16"]');
});

test('README settings table lists linkedinFormatter.warnAtPercent with default 90', () => {
  assert.ok(marketplace.includes('linkedinFormatter.warnAtPercent'), 'README must document warnAtPercent setting');
  assert.ok(marketplace.includes('`90`'), 'README must show 90 as default for warnAtPercent');
  const setting = pkg.contributes.configuration.properties['linkedinFormatter.warnAtPercent'];
  assert.strictEqual(setting.default, 90, 'package.json default for warnAtPercent must be 90');
  assert.strictEqual(setting.type, 'number', 'package.json type for warnAtPercent must be "number"');
});

test('README settings table lists linkedinFormatter.showTruncationMarkers with default false (owner opt-in)', () => {
  assert.ok(marketplace.includes('linkedinFormatter.showTruncationMarkers'), 'README must document showTruncationMarkers setting');
  assert.ok(marketplace.includes('`false`'), 'README must show false as default for showTruncationMarkers');
  const setting = pkg.contributes.configuration.properties['linkedinFormatter.showTruncationMarkers'];
  assert.strictEqual(setting.default, false, 'package.json default for showTruncationMarkers must be false');
  assert.strictEqual(setting.type, 'boolean', 'package.json type for showTruncationMarkers must be "boolean"');
});

// ---------------------------------------------------------------------------
// Truncation marker positions verified against source
// ---------------------------------------------------------------------------

test('previewPanel.ts hardcodes position 140 for mobile cutoff', () => {
  assert.ok(
    previewPanelSrc.includes('position: 140'),
    'previewPanel.ts must contain position: 140 for mobile cutoff'
  );
});

test('previewPanel.ts hardcodes position 210 for desktop cutoff', () => {
  assert.ok(
    previewPanelSrc.includes('position: 210'),
    'previewPanel.ts must contain position: 210 for desktop cutoff'
  );
});

// ---------------------------------------------------------------------------
// Emoji count
// ---------------------------------------------------------------------------

test('CURATED_EMOJI has approximately 200 entries (matches README "roughly 200" claim)', () => {
  assert.ok(
    CURATED_EMOJI.length >= 180 && CURATED_EMOJI.length <= 220,
    `CURATED_EMOJI.length is ${CURATED_EMOJI.length}; expected ~200 to match README claim`
  );
});

// ---------------------------------------------------------------------------
// CHANGELOG checks
// ---------------------------------------------------------------------------

test('CHANGELOG, when present, has [Unreleased] plus the released 1.0.0 section', (t) => {
  if (changelog === null) { t.skip('CHANGELOG.md not present in this checkout'); return; }
  assert.ok(changelog.includes('## [Unreleased]'), 'CHANGELOG must keep an [Unreleased] heading');
  assert.ok(changelog.includes('## [1.0.0] - '), 'CHANGELOG must have the dated 1.0.0 release heading');
  assert.ok(!changelog.includes('## [0.0.1]'), 'CHANGELOG must not have ## [0.0.1] heading');
});

test('package.json carries the marketplace publisher and release version', () => {
  assert.strictEqual(pkg.publisher, 'kaushiknaru');
  assert.strictEqual(pkg.version, '1.0.2');
});

// ---------------------------------------------------------------------------
// Styles table row count
// ---------------------------------------------------------------------------

test('README Styles table has exactly 20 data rows (18 letterform styles + 2 combining marks)', () => {
  // Extract the Styles section only to avoid counting rows from other tables
  const stylesSection = marketplace.slice(marketplace.indexOf('## Styles'), marketplace.indexOf('## Features'));
  const stylesDataRows = stylesSection.split('\n').filter(line => {
    return line.startsWith('| ') && !line.startsWith('| Style') && !line.startsWith('|---');
  });
  assert.strictEqual(stylesDataRows.length, 20, `Styles table must have exactly 20 data rows, got ${stylesDataRows.length}`);
});
