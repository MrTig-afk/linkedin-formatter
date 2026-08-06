import * as vscode from 'vscode';
import { PreviewPanel } from '../webview/previewPanel';

export function openPreview(context: vscode.ExtensionContext): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('Open a file first to preview it.');
    return;
  }
  // An explicit open overrides every earlier user close of the panel.
  PreviewPanel.clearSuppression();
  PreviewPanel.createOrShow(context, editor);
}
