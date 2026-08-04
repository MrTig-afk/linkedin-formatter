import * as vscode from 'vscode';
import { toggleStyle, snapToCodePointBoundary } from '../lib/toggleStyle';
import { toggleAxis, effectiveFamily, FAMILY_IDS, type FamilyId } from '../lib/family';
import { PreviewPanel } from '../webview/previewPanel';

/**
 * The family Ctrl+B/Ctrl+I act in: the open preview panel's dropdown state
 * wins; otherwise linkedinFormatter.defaultFamily (default serif). (S5.8)
 */
function resolveActiveFamily(): FamilyId {
  const panel = PreviewPanel.current;
  if (panel) { return panel.activeFamily; }
  const configured = vscode.workspace.getConfiguration('linkedinFormatter')
    .get<string>('defaultFamily', 'serif');
  return (FAMILY_IDS as readonly string[]).includes(configured)
    ? configured as FamilyId
    : 'serif';
}

/**
 * v1.2 family-aware keybinding semantics. `kind` keeps the original
 * command ids: bold/italic toggle one axis in the active family,
 * bold-italic toggles both, strikethrough stays a combining mark.
 */
export async function applyStyleToEditorSelection(kind: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { return; }
  if (editor.selection.isEmpty) { return; }         // no-op on empty selection

  const doc = editor.document;
  const fullText = doc.getText();

  const start = snapToCodePointBoundary(fullText, doc.offsetAt(editor.selection.start), 'backward');
  const end   = snapToCodePointBoundary(fullText, doc.offsetAt(editor.selection.end),   'forward');

  const original = fullText.substring(start, end);
  if (original.length === 0) { return; }

  let toggled: string;
  if (kind === 'strikethrough' || kind === 'underline') {
    toggled = toggleStyle(original, kind);
  } else if (kind === 'bold' || kind === 'italic') {
    toggled = toggleAxis(original, kind, effectiveFamily(original, resolveActiveFamily()));
  } else if (kind === 'bold-italic') {
    const family = effectiveFamily(original, resolveActiveFamily());
    toggled = toggleAxis(toggleAxis(original, 'bold', family), 'italic', family);
  } else {
    return;
  }
  if (toggled === original) { return; }             // no-op guard

  const range = new vscode.Range(doc.positionAt(start), doc.positionAt(end));
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, range, toggled);
  await vscode.workspace.applyEdit(edit);
}
