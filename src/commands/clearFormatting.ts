import * as vscode from 'vscode';
import { clearAllFormatting, snapToCodePointBoundary } from '../lib/toggleStyle';

export async function clearFormatting(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { return; }

  const doc = editor.document;
  const fullText = doc.getText();

  let start: number;
  let end: number;

  if (editor.selection.isEmpty) {
    // Whole document
    start = 0;
    end = fullText.length;
  } else {
    // Selection -- snap to code-point boundaries defensively
    start = snapToCodePointBoundary(fullText, doc.offsetAt(editor.selection.start), 'backward');
    end = snapToCodePointBoundary(fullText, doc.offsetAt(editor.selection.end), 'forward');
  }

  const original = fullText.substring(start, end);
  if (original.length === 0) { return; }

  const cleared = clearAllFormatting(original);
  if (cleared === original) { return; }   // no-op guard

  const range = new vscode.Range(doc.positionAt(start), doc.positionAt(end));
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, range, cleared);
  await vscode.workspace.applyEdit(edit);
}
