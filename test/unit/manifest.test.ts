import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const pkgPath = path.resolve(__dirname, '..', '..', '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

test('contributes.languages registers the linkedin language', () => {
  assert.ok(Array.isArray(pkg.contributes.languages), 'contributes.languages must be an array');
  assert.ok(pkg.contributes.languages.length >= 1, 'contributes.languages must have at least one entry');
  const entry = pkg.contributes.languages.find((l: { id: string }) => l.id === 'linkedin');
  assert.ok(entry !== undefined, 'no language entry with id "linkedin"');
  assert.ok(Array.isArray(entry.extensions) && entry.extensions.includes('.linkedin'), 'extensions must include ".linkedin"');
  assert.ok(Array.isArray(entry.aliases) && entry.aliases.includes('LinkedIn Post'), 'aliases must include "LinkedIn Post"');
});

test('activationEvents contains exactly onLanguage:linkedin and no broad patterns', () => {
  assert.ok(Array.isArray(pkg.activationEvents), 'activationEvents must be an array');
  assert.ok(!pkg.activationEvents.includes('*'), 'activationEvents must not contain "*"');
  assert.ok(!pkg.activationEvents.includes('onStartupFinished'), 'activationEvents must not contain "onStartupFinished"');
  // Language contributions do NOT generate implicit activation events
  // (only commands, views etc. do), so onLanguage must be explicit or the
  // extension never activates on file open (S7.1.2).
  assert.deepEqual(pkg.activationEvents,
    ['onLanguage:linkedin', 'onWebviewPanel:linkedinFormatter.preview']);
});

test('capabilities.untrustedWorkspaces.supported is true', () => {
  assert.strictEqual(pkg.capabilities.untrustedWorkspaces.supported, true);
});

test('.md is not claimed by any language contribution', () => {
  for (const entry of pkg.contributes.languages) {
    if (Array.isArray(entry.extensions)) {
      assert.ok(!entry.extensions.includes('.md'), `language "${entry.id}" must not claim ".md"`);
      assert.ok(!entry.extensions.includes('.markdown'), `language "${entry.id}" must not claim ".markdown"`);
    }
  }
});

test('contributes.commands registers linkedinFormatter.openPreview', () => {
  assert.ok(Array.isArray(pkg.contributes.commands), 'contributes.commands must be an array');
  assert.ok(pkg.contributes.commands.length >= 1, 'contributes.commands must have at least one entry');
  const cmd = pkg.contributes.commands.find(
    (c: { command: string }) => c.command === 'linkedinFormatter.openPreview'
  );
  assert.ok(cmd !== undefined, 'no command entry with id "linkedinFormatter.openPreview"');
  assert.strictEqual(cmd.title, 'LinkedIn: Open Preview', 'command title must be "LinkedIn: Open Preview"');
});

test('contributes.commands registers linkedinFormatter.copyFormattedPost', () => {
  assert.ok(Array.isArray(pkg.contributes.commands), 'contributes.commands must be an array');
  const cmd = pkg.contributes.commands.find(
    (c: { command: string }) => c.command === 'linkedinFormatter.copyFormattedPost'
  );
  assert.ok(cmd !== undefined, 'no command entry with id "linkedinFormatter.copyFormattedPost"');
  assert.strictEqual(cmd.title, 'LinkedIn: Copy Formatted Post', 'command title must be "LinkedIn: Copy Formatted Post"');
});

test('contributes.commands registers linkedinFormatter.clearFormatting', () => {
  assert.ok(Array.isArray(pkg.contributes.commands), 'contributes.commands must be an array');
  const cmd = pkg.contributes.commands.find(
    (c: { command: string }) => c.command === 'linkedinFormatter.clearFormatting'
  );
  assert.ok(cmd !== undefined, 'no command entry with id "linkedinFormatter.clearFormatting"');
  assert.strictEqual(cmd.title, 'LinkedIn: Clear Formatting', 'command title must be "LinkedIn: Clear Formatting"');
});

test('contributes.commands registers linkedinFormatter.toggleBold', () => {
  const cmd = pkg.contributes.commands.find(
    (c: { command: string }) => c.command === 'linkedinFormatter.toggleBold'
  );
  assert.ok(cmd !== undefined);
  assert.strictEqual(cmd.title, 'LinkedIn: Toggle Bold');
});

test('contributes.commands registers linkedinFormatter.toggleItalic', () => {
  const cmd = pkg.contributes.commands.find(
    (c: { command: string }) => c.command === 'linkedinFormatter.toggleItalic'
  );
  assert.ok(cmd !== undefined);
  assert.strictEqual(cmd.title, 'LinkedIn: Toggle Italic');
});

test('contributes.commands registers linkedinFormatter.toggleBoldItalic', () => {
  const cmd = pkg.contributes.commands.find(
    (c: { command: string }) => c.command === 'linkedinFormatter.toggleBoldItalic'
  );
  assert.ok(cmd !== undefined);
  assert.strictEqual(cmd.title, 'LinkedIn: Toggle Bold Italic');
});

test('contributes.commands registers linkedinFormatter.toggleStrikethrough', () => {
  const cmd = pkg.contributes.commands.find(
    (c: { command: string }) => c.command === 'linkedinFormatter.toggleStrikethrough'
  );
  assert.ok(cmd !== undefined);
  assert.strictEqual(cmd.title, 'LinkedIn: Toggle Strikethrough');
});

test('contributes.keybindings has exactly 4 entries', () => {
  assert.ok(Array.isArray(pkg.contributes.keybindings));
  assert.strictEqual(pkg.contributes.keybindings.length, 4);
});

test('every keybinding is scoped to editorTextFocus && editorLangId == linkedin', () => {
  for (const kb of pkg.contributes.keybindings) {
    assert.strictEqual(
      kb.when,
      "editorTextFocus && editorLangId == 'linkedin'",
      `keybinding for ${kb.command} has wrong when clause: ${kb.when}`
    );
  }
});

test('keybinding key assignments are correct', () => {
  const expected: Record<string, { key: string; mac: string }> = {
    'linkedinFormatter.toggleBold':          { key: 'ctrl+b',       mac: 'cmd+b' },
    'linkedinFormatter.toggleItalic':        { key: 'ctrl+i',       mac: 'cmd+i' },
    'linkedinFormatter.toggleBoldItalic':    { key: 'ctrl+shift+b', mac: 'cmd+shift+b' },
    'linkedinFormatter.toggleStrikethrough': { key: 'alt+shift+5',  mac: 'alt+shift+5' },
  };
  for (const kb of pkg.contributes.keybindings) {
    const exp = expected[kb.command];
    assert.ok(exp !== undefined, `unexpected keybinding command: ${kb.command}`);
    assert.strictEqual(kb.key, exp.key, `wrong key for ${kb.command}`);
    assert.strictEqual(kb.mac, exp.mac, `wrong mac for ${kb.command}`);
  }
});

test('keybinding commands match exactly the four toggle commands', () => {
  const cmds = new Set(pkg.contributes.keybindings.map((kb: { command: string }) => kb.command));
  assert.strictEqual(cmds.size, 4);
  assert.ok(cmds.has('linkedinFormatter.toggleBold'));
  assert.ok(cmds.has('linkedinFormatter.toggleItalic'));
  assert.ok(cmds.has('linkedinFormatter.toggleBoldItalic'));
  assert.ok(cmds.has('linkedinFormatter.toggleStrikethrough'));
});

test('configurationDefaults disables unicode highlighting for linkedin files only', () => {
  const defaults = pkg.contributes.configurationDefaults;
  assert.ok(defaults, 'contributes.configurationDefaults must exist');
  const scoped = defaults['[linkedin]'];
  assert.ok(scoped, 'configurationDefaults must be scoped to [linkedin]');
  assert.strictEqual(scoped['editor.unicodeHighlight.ambiguousCharacters'], false);
  assert.strictEqual(scoped['editor.unicodeHighlight.invisibleCharacters'], false);
  assert.strictEqual(scoped['editor.unicodeHighlight.nonBasicASCII'], false);
  assert.strictEqual(Object.keys(defaults).length, 1, 'no global (unscoped) configuration defaults');
});

test('configuration registers linkedinFormatter.defaultFamily with serif default and 11-family enum', () => {
  const prop = pkg.contributes.configuration.properties['linkedinFormatter.defaultFamily'];
  assert.ok(prop, 'defaultFamily setting must exist');
  assert.equal(prop.default, 'serif');
  assert.equal(prop.type, 'string');
  assert.equal(prop.enum.length, 11);
  assert.ok(prop.enum.includes('fraktur') && prop.enum.includes('sans-serif'));
});

test('configuration registers linkedinFormatter.autoOpenPreview defaulting to true', () => {
  const prop = pkg.contributes.configuration.properties['linkedinFormatter.autoOpenPreview'];
  assert.ok(prop, 'autoOpenPreview setting must exist');
  assert.equal(prop.type, 'boolean');
  assert.equal(prop.default, true);
});

test('cardTheme defaults to editor (owner pick, 2026-08-04)', () => {
  const prop = pkg.contributes.configuration.properties['linkedinFormatter.cardTheme'];
  assert.ok(prop, 'cardTheme setting must exist');
  assert.strictEqual(prop.default, 'editor');
  assert.deepStrictEqual(prop.enum, ['daylight', 'midnight', 'dim', 'editor']);
});

// ---------------------------------------------------------------------------
// M4.4 wiring: typed text takes the active family, not the surrounding style
// ---------------------------------------------------------------------------

test('previewPanel converts typed text to the active family', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '..', 'src', 'webview', 'previewPanel.ts'), 'utf-8');
  const idx = src.indexOf("message.type === 'insertText'");
  assert.ok(idx !== -1, "insertText handler not found");
  const block = src.slice(idx, idx + 1200);
  assert.ok(
    block.includes('convertFamily(message.text, this._activeFamily)'),
    'typed text must be converted to the toolbar active family (PRD S7.4 M4.4)'
  );
});
