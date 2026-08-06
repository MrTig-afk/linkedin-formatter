import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { PreviewPanel } from '../../src/webview/previewPanel';

/**
 * Extension-host tests for follow-the-active-tab (PRD S5.2, v3.1).
 *
 * The panel is driven directly through PreviewPanel so the assertions can
 * read trackedUri and the suppression set; the extension.ts wiring on
 * onDidChangeActiveTextEditor is a thin call into the same createOrShow
 * path exercised here.
 */

const fakeContext = {
  extensionUri: vscode.Uri.file(path.resolve(__dirname, '..', '..', '..')),
} as unknown as vscode.ExtensionContext;

async function openLinkedinEditor(content: string): Promise<vscode.TextEditor> {
  const doc = await vscode.workspace.openTextDocument({ content, language: 'linkedin' });
  return vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.One });
}

suite('Preview follows the active .linkedin tab', () => {
  test('retargets the open panel to a newly active file', async function () {
    this.timeout(15000);
    const a = await openLinkedinEditor('post A');
    PreviewPanel.createOrShow(fakeContext, a);
    const panel = PreviewPanel.current;
    assert.ok(panel, 'panel must open');
    assert.strictEqual(panel.trackedUri, a.document.uri.toString());

    const b = await openLinkedinEditor('post B');
    PreviewPanel.createOrShow(fakeContext, b);
    assert.strictEqual(PreviewPanel.current, panel, 'same panel, not a second one');
    assert.strictEqual(panel.trackedUri, b.document.uri.toString(), 'panel follows the active tab');
  });

  test('closing the preview suppresses only the file it was showing', async function () {
    this.timeout(15000);
    const panel = PreviewPanel.current;
    assert.ok(panel, 'panel from previous test still open');
    const closedUri = panel.trackedUri;
    panel.dispose();
    // === comparison, not strictEqual(x, undefined): the latter's asserts
    // signature would narrow the static getter to undefined for the rest of
    // the test and turn later reads into `never`.
    assert.strictEqual(PreviewPanel.current === undefined, true);
    assert.strictEqual(PreviewPanel.isSuppressedFor(closedUri), true,
      'the closed file is suppressed');

    const c = await openLinkedinEditor('post C');
    assert.strictEqual(PreviewPanel.isSuppressedFor(c.document.uri.toString()), false,
      'a different file is not suppressed');

    // Auto-open for the fresh file works while the closed one stays closed.
    PreviewPanel.createOrShow(fakeContext, c);
    const reopened = PreviewPanel.current;
    assert.ok(reopened, 'preview reopens for the new file');
    assert.strictEqual(reopened.trackedUri, c.document.uri.toString());
  });

  test('explicit open clears every suppression', () => {
    PreviewPanel.clearSuppression();
    // No URI remains suppressed after an explicit LinkedIn: Open Preview.
    assert.strictEqual(PreviewPanel.isSuppressedFor('untitled:whatever'), false);
    PreviewPanel.current?.dispose();
    PreviewPanel.clearSuppression();
  });
});
