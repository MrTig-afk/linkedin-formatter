import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension host smoke test', () => {
  test('VS Code API is available', () => {
    assert.ok(vscode.window);
    assert.ok(vscode.workspace);
  });
});
