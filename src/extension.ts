import * as vscode from 'vscode';
import { openPreview } from './commands/openPreview';
import { PreviewPanel } from './webview/previewPanel';
import { copyFormattedPost } from './commands/copyFormattedPost';
import { clearFormatting } from './commands/clearFormatting';
import { applyStyleToEditorSelection } from './commands/toggleStyleCommand';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'linkedinFormatter.openPreview',
      () => openPreview(context)
    ),
    vscode.commands.registerCommand(
      'linkedinFormatter.copyFormattedPost',
      () => copyFormattedPost()
    ),
    vscode.commands.registerCommand(
      'linkedinFormatter.clearFormatting',
      () => clearFormatting()
    ),
    vscode.commands.registerCommand(
      'linkedinFormatter.toggleBold',
      () => applyStyleToEditorSelection('bold')
    ),
    vscode.commands.registerCommand(
      'linkedinFormatter.toggleItalic',
      () => applyStyleToEditorSelection('italic')
    ),
    vscode.commands.registerCommand(
      'linkedinFormatter.toggleBoldItalic',
      () => applyStyleToEditorSelection('bold-italic')
    ),
    vscode.commands.registerCommand(
      'linkedinFormatter.toggleStrikethrough',
      () => applyStyleToEditorSelection('strikethrough')
    ),
    vscode.window.onDidChangeActiveTextEditor(
      () => { void maybeAutoOpenPreview(context); }
    ),
    // On window startup the active editor is often not yet set when the
    // extension activates; visible-editor changes catch that case so the
    // preview opens without the user having to click into the editor.
    vscode.window.onDidChangeVisibleTextEditors(
      () => { void maybeAutoOpenPreview(context); }
    ),
    vscode.window.registerWebviewPanelSerializer(PreviewPanel.viewType, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown) {
        PreviewPanel.revive(panel, context, state);
      },
    })
  );

  void maybeAutoOpenPreview(context);
}

/**
 * Close editor groups that hold no tabs. VS Code persists the window layout
 * INCLUDING empty groups, so a dead preview group from an old session (any
 * webview without a serializer leaves one) is restored forever after and
 * reads as a ghost third pane. Deleting them here, before the preview
 * opens, keeps the window at exactly two panes with no manual cleanup.
 */
async function purgeEmptyEditorGroups(): Promise<void> {
  const empty = vscode.window.tabGroups.all.filter((g) => g.tabs.length === 0);
  if (empty.length === 0) { return; }
  try {
    await vscode.window.tabGroups.close(empty, true);
  } catch (err) {
    console.warn('[LinkedIn Preview] could not close empty editor group:', err);
  }
}

/**
 * The preview follows the ACTIVE .linkedin editor (S5.2, v3.1). Three cases:
 *
 *   panel open, different .linkedin tab activated -> retarget the panel
 *   no panel, a .linkedin tab activated           -> auto-open, unless the
 *                                                    user closed the preview
 *                                                    for THIS file already
 *   active editor is not a .linkedin file         -> leave the panel alone;
 *                                                    focusing the terminal or
 *                                                    a README must not tear
 *                                                    the card down
 *
 * Respects linkedinFormatter.autoOpenPreview for the auto-open case only;
 * retargeting an already-open panel is not an "open" and always follows.
 */
async function maybeAutoOpenPreview(context: vscode.ExtensionContext): Promise<void> {
  await purgeEmptyEditorGroups();
  const editor =
    (vscode.window.activeTextEditor?.document.languageId === 'linkedin'
      ? vscode.window.activeTextEditor
      : undefined)
    ?? vscode.window.visibleTextEditors.find(
      (e) => e.document.languageId === 'linkedin'
    );
  if (!editor) { return; }

  const current = PreviewPanel.current;
  if (current) {
    if (current.trackedUri !== editor.document.uri.toString()) {
      PreviewPanel.createOrShow(context, editor); // existing-panel path retargets
    }
    return;
  }

  const auto = vscode.workspace.getConfiguration('linkedinFormatter')
    .get<boolean>('autoOpenPreview', true);
  if (!auto) { return; }
  if (PreviewPanel.isSuppressedFor(editor.document.uri.toString())) { return; }
  PreviewPanel.createOrShow(context, editor);
}

export function deactivate(): void {}
