import * as assert from 'assert';
import * as vscode from 'vscode';
import { validateMessage } from '../../src/lib/validateMessage';

/**
 * Extension-host tests for the editing path (PRD S7.4, M4).
 *
 * The unit suite proves the message contract, and a headless-Chrome harness
 * proves the webview behaviour. Neither executes the step in between: taking a
 * validated message and turning it into a real edit on a real TextDocument
 * through the real VS Code API. That is what these cover.
 *
 * They need a display, so they are morning-only and cannot gate an unattended
 * run. They still do not answer "does it feel right to type in" - only a human
 * can.
 */

async function openLinkedinDoc(initial: string): Promise<vscode.TextDocument> {
  const doc = await vscode.workspace.openTextDocument({
    content: initial,
    language: 'linkedin',
  });
  await vscode.window.showTextDocument(doc, { preview: false });
  return doc;
}

/** Apply an insertText the way previewPanel does, via a WorkspaceEdit. */
async function insertAt(doc: vscode.TextDocument, offset: number, text: string): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  edit.insert(doc.uri, doc.positionAt(offset), text);
  const applied = await vscode.workspace.applyEdit(edit);
  assert.ok(applied, 'applyEdit must succeed');
}

/** Apply a replaceText the way previewPanel does. */
async function replaceRange(
  doc: vscode.TextDocument, start: number, end: number, text: string,
): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, new vscode.Range(doc.positionAt(start), doc.positionAt(end)), text);
  const applied = await vscode.workspace.applyEdit(edit);
  assert.ok(applied, 'applyEdit must succeed');
}

suite('Extension host smoke test', () => {
  test('VS Code API is available', () => {
    assert.ok(vscode.window);
    assert.ok(vscode.workspace);
  });

  test('the linkedin language is contributed', async () => {
    const langs = await vscode.languages.getLanguages();
    assert.ok(langs.includes('linkedin'), 'linkedin language id must be registered');
  });

  test('activation is lazy, and every command registers once it fires', async () => {
    // Activation is narrow by design: onLanguage:linkedin and
    // onWebviewPanel, never '*'. So commands do NOT exist until a .linkedin
    // file is opened - that smaller blast radius is the point, and this test
    // originally failed because it assumed eager registration.
    const ext = vscode.extensions.getExtension('kaushiknaru.linkedin-formatter');
    assert.ok(ext, 'extension must be discoverable by its published id');

    await openLinkedinDoc('activate the extension');
    await ext.activate();
    assert.ok(ext.isActive, 'opening a .linkedin file must activate the extension');

    const registered = await vscode.commands.getCommands(true);
    for (const id of [
      'linkedinFormatter.openPreview',
      'linkedinFormatter.copyFormattedPost',
      'linkedinFormatter.clearFormatting',
      'linkedinFormatter.toggleBold',
      'linkedinFormatter.toggleItalic',
      'linkedinFormatter.toggleBoldItalic',
      'linkedinFormatter.toggleStrikethrough',
    ]) {
      assert.ok(registered.includes(id), `command not registered: ${id}`);
    }
  });
});

suite('M4 editing path, end to end on a real document', () => {
  test('a validated insertText produces the right document text', async () => {
    const doc = await openLinkedinDoc('Hello world');

    const result = validateMessage(
      { type: 'insertText', text: 'X', offset: 5 }, doc.getText().length);
    assert.ok(result.valid, 'message must validate');
    const msg = result.message as { offset: number; text: string };

    await insertAt(doc, msg.offset, msg.text);
    assert.strictEqual(doc.getText(), 'HelloX world');
  });

  test('offsets clamp to the document instead of throwing', async () => {
    const doc = await openLinkedinDoc('short');

    // A stale webview offset past the end must clamp, not blow up positionAt.
    const result = validateMessage(
      { type: 'insertText', text: '!', offset: 9999 }, doc.getText().length);
    assert.ok(result.valid);
    const msg = result.message as { offset: number };
    assert.strictEqual(msg.offset, 5, 'offset must clamp to document length');

    await insertAt(doc, msg.offset, '!');
    assert.strictEqual(doc.getText(), 'short!');
  });

  test('a rejected message never reaches the document', async () => {
    const doc = await openLinkedinDoc('untouched');
    const before = doc.getText();

    for (const bad of [
      { type: 'insertText', text: '', offset: 0 },
      { type: 'insertText', text: 'x', offset: -1 },
      { type: 'insertText', text: '\r', offset: 0 },
      { type: 'insertText', text: 'x', offset: 1.5 },
    ]) {
      const result = validateMessage(bad, before.length);
      assert.strictEqual(result.valid, false, `should reject: ${JSON.stringify(bad)}`);
    }
    assert.strictEqual(doc.getText(), before, 'document must be unchanged');
  });

  test('replaceText deletes a range as one edit', async () => {
    const doc = await openLinkedinDoc('Hello brave world');

    const result = validateMessage(
      { type: 'replaceText', start: 5, end: 11, text: '' }, doc.getText().length);
    assert.ok(result.valid);
    const m = result.message as { start: number; end: number; text: string };

    await replaceRange(doc, m.start, m.end, m.text);
    assert.strictEqual(doc.getText(), 'Hello world');
  });

  test('one deletion is ONE undo step, not two', async () => {
    // The whole reason replaceText exists rather than delete-then-insert.
    const doc = await openLinkedinDoc('Hello brave world');
    await replaceRange(doc, 5, 11, '');
    assert.strictEqual(doc.getText(), 'Hello world');

    await vscode.commands.executeCommand('undo');
    assert.strictEqual(doc.getText(), 'Hello brave world',
      'a single undo must restore the whole deletion');
  });

  test('a surrogate pair survives a round trip through the document', async () => {
    const rocket = String.fromCodePoint(0x1F680);
    const doc = await openLinkedinDoc(`a${rocket}b`);
    assert.strictEqual(doc.getText().length, 4, 'precondition: rocket is 2 UTF-16 units');

    // Delete the rocket by its span range, as the webview would.
    await replaceRange(doc, 1, 3, '');
    assert.strictEqual(doc.getText(), 'ab', 'the whole emoji must go, not half of it');
  });

  test('styled Unicode inserts and survives intact', async () => {
    const doc = await openLinkedinDoc('');
    const bold = '\u{1D400}\u{1D401}';   // math bold A, B
    await insertAt(doc, 0, bold);
    assert.strictEqual(doc.getText(), bold);
    assert.strictEqual(doc.getText().length, 4, 'two astral chars = four UTF-16 units');
  });

  test('opening the preview does not throw', async () => {
    await openLinkedinDoc('Preview me');
    await vscode.commands.executeCommand('linkedinFormatter.openPreview');
    // The command resolving without throwing is the assertion; the webview's
    // own behaviour is covered by the headless harness.
    assert.ok(true);
  });
});
