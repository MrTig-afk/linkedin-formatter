import * as vscode from 'vscode';
import { PreviewPanel } from '../webview/previewPanel';

export function openPreview(context: vscode.ExtensionContext): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('Open a file first to preview it.');
    return;
  }
  // An explicit open overrides an earlier user close of the panel.
  PreviewPanel.suppressedThisSession = false;
  PreviewPanel.createOrShow(context, editor);
}
