import * as vscode from 'vscode';
import { PreviewPanel } from '../webview/previewPanel';

export async function copyFormattedPost(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  let text: string | undefined;

  if (editor) {
    text = editor.document.getText();
  } else {
    const panel = PreviewPanel.current;
    if (panel) {
      const doc = vscode.workspace.textDocuments.find(
        d => d.uri.toString() === panel.trackedUri
      );
      if (doc) {
        text = doc.getText();
      }
    }
  }

  if (text === undefined) {
    return;
  }

  await vscode.env.clipboard.writeText(text);
  vscode.window.showInformationMessage('Copied to clipboard.');
}
