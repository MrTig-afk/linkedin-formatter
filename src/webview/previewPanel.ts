import * as vscode from 'vscode';
import * as fs from 'node:fs';
import { buildOffsetSpans, buildOffsetUnits, type TruncationMarker } from '../lib/spanBuilder';
import { buildPreviewHtml, getNonce, buildCounterHtml, type AxisState } from './html';
import { validateMessage } from '../lib/validateMessage';
import type { WebviewMessage } from '../lib/messageContract';
import { toggleStyle, clearAllFormatting, snapToCodePointBoundary } from '../lib/toggleStyle';
import { convertFamily, toggleAxis, summarizeSelection, effectiveFamily, nearestSupported, FAMILY_IDS, FAMILY_MATRIX, type FamilyId } from '../lib/family';
import { ALL_STYLES, applyStyle, styleBefore, styleAfter } from '../lib/convert';
import { countCharacters, getCounterState, LINKEDIN_POST_LIMIT, type CountingUnit } from '../lib/charCount';
import { parseGitConfig, initialsOf, type GitIdentity } from '../lib/identity';
import * as os from 'node:os';
import * as path from 'node:path';

export class PreviewPanel {
  public static readonly viewType = 'linkedinFormatter.preview';

  private static currentPanel: PreviewPanel | undefined;

  /**
   * Set when the user closes the panel; auto-open respects it for the rest
   * of the session so a deliberately closed preview does not keep coming
   * back. An explicit LinkedIn: Open Preview clears it.
   */
  public static suppressedThisSession = false;

  public static get current(): PreviewPanel | undefined {
    return PreviewPanel.currentPanel;
  }

  public get trackedUri(): string {
    return this._trackedUri;
  }

  private readonly _panel: vscode.WebviewPanel;
  private readonly _cssText: string;
  private readonly _scriptText: string;
  private _trackedUri: string;
  private _activeFamily: FamilyId;
  /**
   * The selection to keep highlighted in the card. Persistent, not
   * one-shot: the caret-mirror re-render that follows every toolbar edit
   * used to wipe a one-shot restore, collapsing the selection after a
   * single edit. Cleared when the document changes underneath us (typing,
   * undo) or the user collapses the selection in the card.
   */
  private _restoreSelection: { start: number; end: number } | null = null;
  /** Document changes caused by our own applyEdit; they keep the restore. */
  private _selfEditsInFlight = 0;
  private _lastCaretOffset: number | null = null;
  /**
   * M4.2: whether a full document has been assigned to the webview yet, and
   * the key of everything that is baked into that document rather than sent
   * as an update (theme, identity, toolbar structure).
   *
   * Reassigning webview.html tears the page down and reloads ~52KB, which
   * costs ~25ms and destroys focus and the caret. A document edit therefore
   * goes out as a message to the page already running; only a structural
   * change rebuilds.
   */
  private _hasRendered = false;
  private _lastStructuralKey = '';
  /**
   * M4.5: the next render was caused by an edit we did NOT make - an AI CLI
   * writing to the file, an undo, or the user typing in the left editor.
   *
   * The webview advances its caret optimistically while typing, because the
   * document round trip is slower than a keystroke. An external edit moves the
   * text underneath that assumption, so the offset it holds is no longer
   * trustworthy and typing must disarm rather than insert somewhere wrong.
   */
  private _pendingExternal = false;
  /**
   * Issue #2: bold/italic held as a MODE for typing, not just an action on a
   * selection. Clicking B with nothing selected latches it; typing then
   * arrives bold.
   *
   * The latched value is INTENT and is kept even when the active family
   * cannot express it - monospace has no bold. nearestSupported() resolves
   * intent to what the family actually has at insert time, so switching from
   * monospace back to serif restores the bold the user asked for rather than
   * having silently discarded it.
   */
  /**
   * The card caret, owned HERE rather than in the webview.
   *
   * The webview cannot know how long an inserted character will be: it
   * sends "a", and styling turns that into a two-unit astral character. It
   * used to advance its own caret by the raw length, drifting one unit per
   * keystroke, so every insert after the first landed INSIDE the previous
   * styled character and split it into orphaned surrogates.
   *
   * Only this side knows the styled length, so only this side can advance
   * the caret correctly. The webview keeps a copy purely to draw with, and
   * is corrected by the caret echoed back on every render.
   */
  private _cardCaret: number | null = null;
  private _activeBold = false;
  private _activeItalic = false;
  /** Toolbar state (family|bold|italic) as of the last render. */
  private _lastToolbarKey = '';
  /** ~/.gitconfig identity, read once per panel; nulls when unavailable. */
  private readonly _gitIdentity: GitIdentity;
  private _disposables: vscode.Disposable[] = [];

  /** The family Ctrl+B/Ctrl+I act in while this panel is open. */
  public get activeFamily(): FamilyId {
    return this._activeFamily;
  }

  public static createOrShow(
    context: vscode.ExtensionContext,
    editor: vscode.TextEditor
  ): void {
    if (PreviewPanel.currentPanel) {
      // Reveal in place; passing a column here could drag the panel around.
      PreviewPanel.currentPanel._panel.reveal(undefined, true);
      PreviewPanel.currentPanel._trackedUri = editor.document.uri.toString();
      PreviewPanel.currentPanel.update(editor.document);
      return;
    }

    // Open in the column NEXT TO THE EDITOR, not Beside-the-active-group:
    // after a window restore the active group can be an empty husk left by
    // the unrestorable webview, and Beside would then spawn a third group.
    // Targeting editor.viewColumn + 1 reuses that husk instead.
    const targetColumn = editor.viewColumn !== undefined
      ? editor.viewColumn + 1
      : vscode.ViewColumn.Beside;

    const panel = vscode.window.createWebviewPanel(
      PreviewPanel.viewType,
      'LinkedIn Preview',
      { viewColumn: targetColumn, preserveFocus: true },
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'media'),
        ],
      }
    );

    const { cssText, scriptText } = PreviewPanel.readWebviewSources(context);
    PreviewPanel.currentPanel = new PreviewPanel(
      panel,
      cssText,
      scriptText,
      editor.document.uri.toString()
    );
    PreviewPanel.currentPanel.update(editor.document);
  }

  /**
   * Revive a preview persisted in the window layout (S5.3). Without this,
   * every window restore leaves a dead empty editor group where the
   * preview used to live.
   */
  public static revive(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    state: unknown,
  ): void {
    if (PreviewPanel.currentPanel) {
      // Auto-open already created a live preview; drop the revived shell.
      panel.dispose();
      return;
    }
    const stateUri = (typeof state === 'object' && state !== null &&
      typeof (state as Record<string, unknown>)['uri'] === 'string')
      ? (state as Record<string, string>)['uri']
      : undefined;
    const uri = stateUri ?? vscode.window.visibleTextEditors.find(
      (e) => e.document.languageId === 'linkedin'
    )?.document.uri.toString();
    if (!uri) {
      panel.dispose();
      return;
    }
    const { cssText, scriptText } = PreviewPanel.readWebviewSources(context);
    PreviewPanel.currentPanel = new PreviewPanel(panel, cssText, scriptText, uri);
    const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri);
    if (doc) {
      PreviewPanel.currentPanel.update(doc);
    } else {
      vscode.workspace.openTextDocument(vscode.Uri.parse(uri)).then(
        (d) => PreviewPanel.currentPanel?.update(d),
        () => PreviewPanel.currentPanel?.dispose(),
      );
    }
  }

  /**
   * Read the stylesheet and script ONCE per panel and inline them into
   * every render: a vscode-resource fetch can fail or lag during rapid
   * re-renders, leaving the pane unstyled (white boxes on dark).
   */
  private static readWebviewSources(
    context: vscode.ExtensionContext,
  ): { cssText: string; scriptText: string } {
    return {
      cssText: fs.readFileSync(
        vscode.Uri.joinPath(context.extensionUri, 'media', 'webview.css').fsPath, 'utf-8'),
      scriptText: fs.readFileSync(
        vscode.Uri.joinPath(context.extensionUri, 'media', 'toolbar.js').fsPath, 'utf-8'),
    };
  }

  private constructor(
    panel: vscode.WebviewPanel,
    cssText: string,
    scriptText: string,
    documentUri: string
  ) {
    this._panel = panel;
    this._cssText = cssText;
    this._scriptText = scriptText;
    this._trackedUri = documentUri;
    let gitIdentity: GitIdentity = { name: null, email: null };
    try {
      gitIdentity = parseGitConfig(
        fs.readFileSync(path.join(os.homedir(), '.gitconfig'), 'utf-8'));
    } catch { /* no gitconfig: placeholders stay */ }
    this._gitIdentity = gitIdentity;

    const configured = vscode.workspace.getConfiguration('linkedinFormatter')
      .get<string>('defaultFamily', 'serif');
    this._activeFamily = (FAMILY_IDS as readonly string[]).includes(configured)
      ? configured as FamilyId
      : 'serif';
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== this._trackedUri) { return; }
      // Metadata-only events (save, dirty-state, EOL) carry no content
      // changes. Auto-save fires one about a second after every edit;
      // treating it as typing wiped the restored selection and re-rendered
      // for nothing.
      if (event.contentChanges.length === 0) { return; }
      if (this._selfEditsInFlight > 0) {
        this._selfEditsInFlight--;
      } else {
        // External change (typing, undo): the stored offsets are stale.
        this._restoreSelection = null;
        this._pendingExternal = true;
        // Someone else moved the text; our offset means nothing now.
        this._cardCaret = null;
      }
      this.update(event.document);
    }, null, this._disposables);

    // Mirror the left editor's caret into the card so the insertion point
    // (typing, emoji) is visible. Re-render only when the caret moved.
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.textEditor.document.uri.toString() !== this._trackedUri) { return; }
      const offset = event.textEditor.document.offsetAt(event.selections[0].active);
      if (offset === this._lastCaretOffset) { return; }
      this.update(event.textEditor.document);
    }, null, this._disposables);

    this._panel.webview.onDidReceiveMessage((raw: unknown) => {
      const doc = vscode.workspace.textDocuments.find(
        d => d.uri.toString() === this._trackedUri
      );
      if (!doc) { return; }
      const result = validateMessage(raw, doc.getText().length);
      if (!result.valid) {
        console.warn('[LinkedIn Preview] Rejected webview message:', result.reason);
        return;
      }
      this.handleValidMessage(result.message, doc);
    }, null, this._disposables);
  }

  private handleValidMessage(message: WebviewMessage, doc: vscode.TextDocument): void {
    if (message.type === 'applyStyle') {
      this.applyEdit(doc, message.start, message.end, (text) =>
        toggleStyle(text, message.styleId),
      );
      return;
    }

    if (message.type === 'clearFormatting') {
      this.applyEdit(doc, message.start, message.end, clearAllFormatting);
      return;
    }

    if (message.type === 'setFamily') {
      this._activeFamily = message.family;
      return;
    }

    if (message.type === 'convertFamily') {
      this._activeFamily = message.family;
      this.applyEdit(doc, message.start, message.end, (text) =>
        convertFamily(text, message.family),
      );
      return;
    }

    if (message.type === 'toggleAxis') {
      // A collapsed range carries no text to restyle, so it means the user
      // clicked B or I with nothing selected: latch the mode instead.
      if (message.start === message.end) {
        if (message.axis === 'bold') {
          this._activeBold = !this._activeBold;
        } else {
          this._activeItalic = !this._activeItalic;
        }
        this.update(doc);   // re-render so the button shows as latched
        return;
      }
      this.applyEdit(doc, message.start, message.end, (text) =>
        toggleAxis(text, message.axis, effectiveFamily(text, this._activeFamily)),
      );
      return;
    }

    if (message.type === 'undo' || message.type === 'redo') {
      const command = message.type;
      // Undo acts on the focused editor, so focus the tracked one first.
      const editor = vscode.window.visibleTextEditors.find(
        e => e.document.uri.toString() === this._trackedUri
      );
      if (!editor) { return; }
      // Undo has to run against the focused editor, so focus is taken away
      // from the card for the duration. Give it back afterwards and put the
      // caret where the undo left the editor, otherwise the caret simply
      // vanishes and the user has lost their place in the card.
      void vscode.window.showTextDocument(editor.document, {
        viewColumn: editor.viewColumn,
        preserveFocus: false,
      }).then(
        () => vscode.commands.executeCommand(command),
        (err) => console.error('[LinkedIn Preview] undo/redo failed:', err),
      ).then(() => {
        const after = vscode.window.visibleTextEditors.find(
          e => e.document.uri.toString() === this._trackedUri);
        if (after) {
          this._cardCaret = after.document.offsetAt(after.selection.active);
        }
        this._panel.reveal(undefined, false);   // focus returns to the card
      }, () => { /* focus restore is best effort */ });
      return;
    }

    if (message.type === 'selectionState') {
      // The card's live selection: keep it highlighted across re-renders
      // and reflect its family/axes in the toolbar. start === end clears.
      this._restoreSelection = message.start < message.end
        ? { start: message.start, end: message.end }
        : null;
      // Re-render only when the toolbar would actually look different.
      // The selection itself is already live in the webview; swapping the
      // HTML for nothing flashes the pane and costs the perceived speed.
      const { displayFamily, axisState } = this.toolbarStateFor(doc.getText());
      const key = `${displayFamily}|${JSON.stringify(axisState)}`;
      if (key !== this._lastToolbarKey) {
        this.update(doc);
      }
      return;
    }

    if (message.type === 'cursorSync') {
      this._restoreSelection = null;
      // A click is the user stating where the caret is; trust it.
      this._cardCaret = message.offset;
      const editor = vscode.window.visibleTextEditors.find(
        e => e.document.uri.toString() === this._trackedUri
      );
      if (!editor) { return; }

      const pos = editor.document.positionAt(message.offset);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(
        new vscode.Range(pos, pos),
        vscode.TextEditorRevealType.InCenterIfOutsideViewport
      );
      return;
    }

    if (message.type === 'insertText') {
      // M4.1: typing in the card. The offset is already validated and clamped
      // to the document by validateMessage, so positionAt cannot throw here.
      // The message offset is advisory: it is what the webview believed
      // when the key was pressed. Our own caret wins whenever we have one,
      // because during a fast burst the webview is a keystroke behind.
      const insertAt = this._cardCaret ?? message.offset;
      const position = doc.positionAt(insertAt);
      // M4.4 + issue #2: typed text takes the toolbar's active family AND
      // whichever axes are latched. nearestSupported cascades when the
      // family cannot express the intent (monospace has no bold): exact ->
      // drop italic -> drop bold -> regular. It always resolves.
      // Continue the run being typed into: the style of the character before
      // the caret wins, so typing at the end of a bold word stays bold and
      // typing inside script stays script.
      //
      // The toolbar is the FALLBACK, not the override - it applies at the
      // start of a document, after plain text, or wherever there is nothing to
      // inherit. Otherwise picking a family would silently re-style text the
      // user is only appending to.
      const full = doc.getText();
      // Clicking the right half of a styled character yields an offset INSIDE
      // a surrogate pair. Inserting there would split the character; reading
      // back from there sees a lone surrogate and detects no style at all.
      // Snap backward to the start of the character first.
      const safeOffset = snapToCodePointBoundary(full, insertAt, 'backward');

      // Inherit from the character before the caret; if that is plain (or the
      // caret is at the very start of a styled run), try the character after,
      // so clicking at the front of a bold word and typing still gives bold.
      const inherited = styleBefore(full, safeOffset) ?? styleAfter(full, safeOffset);
      const resolved = nearestSupported(
        this._activeFamily, this._activeBold, this._activeItalic);
      const style = inherited ?? ALL_STYLES.find(s => s.id === resolved.styleIdOrPlain);
      const styled = style === undefined
        ? message.text                       // regular serif IS plain ASCII
        : applyStyle(message.text, style);
      const edit = new vscode.WorkspaceEdit();
      edit.insert(doc.uri, position, styled);
      // Advance by what was ACTUALLY inserted, not by what was typed.
      this._cardCaret = insertAt + styled.length;
      // Mark as ours so the resulting change is not mistaken for an external
      // edit, which would clear the selection restore.
      this._selfEditsInFlight += 1;
      vscode.workspace.applyEdit(edit).then(
        undefined,
        (err) => {
          this._selfEditsInFlight = Math.max(0, this._selfEditsInFlight - 1);
          console.error('[LinkedIn Preview] insertText failed:', err);
        },
      );
      return;
    }

    if (message.type === 'replaceText') {
      // M4.3: backspace, delete, and typing over a selection. ONE edit, so
      // one Ctrl+Z undoes the whole thing rather than half of it.
      const range = new vscode.Range(
        doc.positionAt(message.start), doc.positionAt(message.end));
      const edit = new vscode.WorkspaceEdit();
      edit.replace(doc.uri, range, message.text);
      this._cardCaret = message.start + message.text.length;
      this._selfEditsInFlight += 1;
      vscode.workspace.applyEdit(edit).then(
        undefined,
        (err) => {
          this._selfEditsInFlight = Math.max(0, this._selfEditsInFlight - 1);
          console.error('[LinkedIn Preview] replaceText failed:', err);
        },
      );
      return;
    }

    if (message.type === 'insertEmoji') {
      const editor = vscode.window.visibleTextEditors.find(
        e => e.document.uri.toString() === this._trackedUri
      );
      // The card caret wins. Reading editor.selection.active inserted the
      // emoji wherever the LEFT pane happened to be, which is not where the
      // user just clicked in the card.
      const emojiAt = this._cardCaret
        ?? (editor ? doc.offsetAt(editor.selection.active) : doc.getText().length);
      const position = doc.positionAt(Math.min(emojiAt, doc.getText().length));
      const edit = new vscode.WorkspaceEdit();
      edit.insert(doc.uri, position, message.emoji);
      this._cardCaret = doc.offsetAt(position) + message.emoji.length;
      vscode.workspace.applyEdit(edit).then(
        undefined,
        (err) => console.error('[LinkedIn Preview] insertEmoji failed:', err),
      );
      return;
    }
  }

  private applyEdit(
    doc: vscode.TextDocument,
    rawStart: number,
    rawEnd: number,
    transform: (text: string) => string,
  ): void {
    const fullText = doc.getText();
    const start = snapToCodePointBoundary(fullText, rawStart, 'backward');
    const end = snapToCodePointBoundary(fullText, rawEnd, 'forward');
    const selectedText = fullText.substring(start, end);
    if (selectedText.length === 0) { return; }

    const replacement = transform(selectedText);
    if (replacement === selectedText) { return; }

    const range = new vscode.Range(
      doc.positionAt(start),
      doc.positionAt(end),
    );
    // Restore the visual selection over the replacement after the
    // change-event re-render, so toggling does not need a re-drag (S5.4).
    this._restoreSelection = { start, end: start + replacement.length };
    this._selfEditsInFlight++;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, range, replacement);
    vscode.workspace.applyEdit(edit).then(
      (applied) => {
        if (!applied) {
          this._selfEditsInFlight--;
          this._restoreSelection = null;
        }
      },
      (err) => {
        this._selfEditsInFlight--;
        this._restoreSelection = null;
        console.error('[LinkedIn Preview] applyEdit failed:', err);
      },
    );
  }

  public update(document: vscode.TextDocument): void {
    const text = document.getText();
    const nonce = getNonce();

    const trackedEditor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === this._trackedUri
    );
    const rawCaret = trackedEditor
      ? document.offsetAt(trackedEditor.selection.active)
      : null;
    this._lastCaretOffset = rawCaret;
    // Mirror the caret only while the editor is actually focused. An
    // unfocused editor's caret is stale state; re-rendering it while the
    // user works in the card reads as a ghost cursor stuck mid-word.
    const editorFocused = vscode.window.activeTextEditor?.document.uri.toString()
      === this._trackedUri;
    const caretOffset = editorFocused ? rawCaret : null;

    const config = vscode.workspace.getConfiguration('linkedinFormatter');
    // Default utf16: LinkedIn's composer counts UTF-16 code units (T20,
    // verified 2026-07-30 - 3000 astral chars showed -3000 overage).
    const rawUnit = config.get<string>('countingUnit', 'utf16');
    const unit: CountingUnit = (rawUnit === 'codepoints') ? 'codepoints' : 'utf16';
    const warnAtPercent = Math.max(0, Math.min(100,
      config.get<number>('warnAtPercent', 90)));
    const warnAt = Math.floor(LINKEDIN_POST_LIMIT * warnAtPercent / 100);

    // Off by default (owner decision 2026-07-30); opt-in via setting.
    const showMarkers = config.get<boolean>('showTruncationMarkers', false);
    const markers: TruncationMarker[] = showMarkers
      ? [
          { position: 140, label: '~140 chars — mobile cutoff' },
          { position: 210, label: '~210 chars — desktop cutoff' },
        ]
      : [];
    const body = buildOffsetSpans(text, markers);

    const count = countCharacters(text, unit);
    const state = getCounterState(count, LINKEDIN_POST_LIMIT, warnAt);
    const counterHtml = buildCounterHtml(count, state, LINKEDIN_POST_LIMIT);

    // Selection-aware toolbar: the dropdown shows the selection's family
    // (when uniform) and the axis buttons show pressed state, so what is
    // highlighted always matches what a click would toggle.
    const { displayFamily, axisState } = this.toolbarStateFor(text);
    this._lastToolbarKey = `${displayFamily}|${JSON.stringify(axisState)}`;

    // Identity: explicit settings win, then the git identity that signs
    // this machine's commits, then neutral placeholders.
    const rawTheme = config.get<string>('cardTheme', 'editor');
    const theme = (['daylight', 'midnight', 'dim', 'editor'] as const)
      .find(t => t === rawTheme) ?? 'daylight';
    const profileName = config.get<string>('profileName', '').trim()
      || this._gitIdentity.name || 'Your Name';
    const profileHeadline = config.get<string>('profileHeadline', '').trim()
      || this._gitIdentity.email || 'Your headline';
    const initials = profileName !== 'Your Name' ? initialsOf(profileName) : null;

    // M4.2 fast path: nothing structural moved, so update the running page
    // instead of replacing it. Structured units, never HTML - the webview
    // builds its DOM with textContent and parses no markup (see toolbar.js).
    // The toolbar is deliberately NOT part of this key.
    //
    // It used to be, so latching bold changed the key, which rebuilt the
    // whole page, which destroyed focus and the caret - pressing Ctrl+B and
    // then being unable to type. Toolbar state now rides along with the
    // render message and the buttons update in place.
    const structuralKey = [
      theme, profileName, profileHeadline, initials ?? '', String(showMarkers),
    ].join('|');

    if (this._hasRendered && structuralKey === this._lastStructuralKey) {
      const external = this._pendingExternal;
      this._pendingExternal = false;
      void this._panel.webview.postMessage({
        type: 'render',
        units: buildOffsetUnits(text, markers),
        counter: { count, limit: LINKEDIN_POST_LIMIT, state },
        external,
        // Authoritative caret. The webview draws with its own optimistic
        // copy between keystrokes, then snaps to this when the render lands.
        caret: this._cardCaret,
        toolbar: {
          family: displayFamily,
          bold: axisState?.bold ?? false,
          italic: axisState?.italic ?? false,
          boldAvailable: axisState?.boldAvailable ?? true,
          italicAvailable: axisState?.italicAvailable ?? true,
        },
      });
      return;
    }

    this._pendingExternal = false;
    this._hasRendered = true;
    this._lastStructuralKey = structuralKey;

    this._panel.webview.html = buildPreviewHtml(
      this._panel.webview.cspSource,
      nonce,
      body,
      counterHtml,
      this._cssText,
      this._scriptText,
      displayFamily,
      this._restoreSelection,
      this._trackedUri,
      // While a selection is highlighted the caret marker only reads as a
      // stray cursor inside it; the selection IS the insertion target.
      this._restoreSelection ? null : caretOffset,
      axisState,
      { theme, profileName, profileHeadline, initials },
    );
  }

  private toolbarStateFor(text: string): {
    displayFamily: FamilyId;
    axisState: AxisState | null;
  } {
    if (this._restoreSelection && this._restoreSelection.end > text.length) {
      this._restoreSelection = null;
    }
    const selectionText = this._restoreSelection
      ? text.substring(
          snapToCodePointBoundary(text, this._restoreSelection.start, 'backward'),
          snapToCodePointBoundary(text, this._restoreSelection.end, 'forward'),
        )
      : '';
    const summary = selectionText.length > 0 ? summarizeSelection(selectionText) : null;
    if (!summary) {
      // No selection: the buttons reflect the TYPING MODE, so a latched axis
      // is visible. Without this the mode would be invisible state and users
      // would not know why their typing turned bold.
      const activeSlots = FAMILY_MATRIX.get(this._activeFamily);
      return {
        displayFamily: this._activeFamily,
        axisState: {
          bold: this._activeBold,
          italic: this._activeItalic,
          boldAvailable: activeSlots?.bold !== null,
          italicAvailable: activeSlots?.italic !== null,
          mixed: false,
        },
      };
    }
    if (summary.family === null) {
      // Mixed families: a toggle still works per character (each keeps its
      // own family, unsupported ones no-op), so nothing is disabled.
      return {
        displayFamily: this._activeFamily,
        axisState: {
          bold: summary.bold, italic: summary.italic,
          boldAvailable: true, italicAvailable: true, mixed: true,
        },
      };
    }
    const slots = FAMILY_MATRIX.get(summary.family);
    return {
      displayFamily: summary.family,
      axisState: {
        bold: summary.bold, italic: summary.italic,
        boldAvailable: slots?.bold !== null,
        italicAvailable: slots?.italic !== null,
        mixed: false,
      },
    };
  }

  public dispose(): void {
    PreviewPanel.suppressedThisSession = true;
    PreviewPanel.currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables = [];
  }
}
