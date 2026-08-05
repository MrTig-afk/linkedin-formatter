import * as vscode from 'vscode';
import * as fs from 'node:fs';
import { buildOffsetSpans, buildOffsetUnits, type TruncationMarker } from '../lib/spanBuilder';
import { buildPreviewHtml, getNonce, buildCounterHtml, type AxisState } from './html';
import { validateMessage } from '../lib/validateMessage';
import type { WebviewMessage } from '../lib/messageContract';
import { toggleStyle, clearAllFormatting, snapToCodePointBoundary } from '../lib/toggleStyle';
import { convertFamily, toggleAxis, summarizeSelection, effectiveFamily, decompose, resolveTypingStyle, FAMILY_IDS, FAMILY_MATRIX, type FamilyId } from '../lib/family';
import { ALL_STYLES, applyStyle } from '../lib/convert';
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
   * Pending bold/italic for the insertion point - the Word model.
   *
   * null means "follow the text": typing inside a bold run is bold, plain
   * text is plain. Pressing Ctrl+B sets an explicit override RELATIVE to
   * that - bold inside a bold run means "stop being bold". The override
   * lives only at this caret: any caret movement clears it, exactly as a
   * word processor drops a pending format when you click elsewhere.
   *
   * (The previous design was an absolute sticky boolean, which had two
   * faults: it could not express "un-bold inside a bold run", and it was
   * never cleared, so one Ctrl+B quietly bolded everything typed for the
   * rest of the session.)
   */
  /**
   * The card caret, owned HERE rather than in the webview.
   *
   * The webview cannot know how long an inserted character will be: it
   * sends "a", and styling turns that into a two-unit astral character.
   * Only this side knows the styled length, so only this side can advance
   * the caret correctly. The webview keeps a copy purely to draw with,
   * corrected by the caret echoed back on every render. The immediate
   * setCaret message is its single writer besides our own edits.
   */
  private _cardCaret: number | null = null;
  private _pendingBold: boolean | null = null;
  private _pendingItalic: boolean | null = null;
  /** Which side of a soft-wrap the caret sticks to (see SetCaretMessage). */
  private _cardCaretAssoc: 'before' | 'after' = 'after';
  /**
   * True while an undo/redo WE issued is mutating the document. Without it
   * the change event classed our own undo as an external edit, disarmed
   * typing and nulled the caret - the "cursor vanishes on Ctrl+Z" bug.
   */
  private _historyInFlight = false;
  /**
   * Edits from the card are SERIALIZED through this chain.
   *
   * Without it, a fast burst delivered keystroke N+1 while keystroke N's
   * applyEdit was still in flight. The handler then computed the insert
   * position against a document snapshot that did not yet contain N -
   * offset 1044 in the trace fell mid-surrogate in the STALE text, the
   * boundary snap pulled it back to 1043, and N+1 was inserted INSIDE the
   * character the user had just typed. Split surrogate, garbled render,
   * and the visible "line jump". Chaining means the document is always
   * current when a position is computed; the few-ms serialization is far
   * below typing cadence.
   */
  private _editChain: Promise<void> = Promise.resolve();
  /**
   * Undo coalescing for typing. Each keystroke used to be its own
   * WorkspaceEdit and therefore its own undo stop, so Ctrl+Z peeled one
   * character at a time. Real editors swallow a typed run back to the
   * word boundary. We get that by inserting through TextEditor.edit with
   * undo stops only at boundaries: after whitespace, after a pause, or
   * after the caret moved.
   */
  private _lastTypedAt = 0;
  private _lastTypedBoundary = true;
  /**
   * Diagnostics for the caret investigation (branch-only, not shipped).
   * Every caret-relevant event lands here with a timestamp, so a repro of
   * "typing jumped lines" turns into a readable trace instead of a guess.
   * View > Output > "LinkedIn Formatter Diag".
   */
  private readonly _diag = vscode.window.createOutputChannel('LinkedIn Formatter Diag');

  private log(event: string): void {
    const t = String(Date.now() % 1_000_000).padStart(6, '0');
    this._diag.appendLine(
      `${t} ${event} | caret=${this._cardCaret} assoc=${this._cardCaretAssoc}`
      + ` pending=${this._pendingBold}/${this._pendingItalic}`
      + ` selfEdits=${this._selfEditsInFlight} history=${this._historyInFlight}`);
  }
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
        this.log('docChange classified SELF');
        this._selfEditsInFlight--;
      } else if (this._historyInFlight) {
        this.log('docChange classified HISTORY');
        this._lastTypedBoundary = true;
        // Rebase the card caret across the undone/redone change. The
        // previous approach read the EDITOR's cursor afterwards, but that
        // cursor does not track the card - the trace showed a caret at 760
        // teleporting to 1162 because that is where the editor happened to
        // be. The change event tells us exactly what moved and by how much.
        if (this._cardCaret !== null) {
          for (const ch of event.contentChanges) {
            const start = ch.rangeOffset;
            const oldEnd = ch.rangeOffset + ch.rangeLength;
            const delta = ch.text.length - ch.rangeLength;
            if (this._cardCaret >= oldEnd) {
              this._cardCaret += delta;
            } else if (this._cardCaret > start) {
              this._cardCaret = start + ch.text.length;
            }
          }
          this._cardCaretAssoc = 'before';
        }
        // Our own undo/redo. Not external: the user asked for it from the
        // card, so the card must stay armed. The caret is recomputed from
        // the editor once the command resolves.
      } else {
        this.log('docChange classified EXTERNAL - caret nulled');
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
      this.log('editor selection changed -> update()');
      const offset = event.textEditor.document.offsetAt(event.selections[0].active);
      if (offset === this._lastCaretOffset) { return; }
      this.update(event.textEditor.document);
    }, null, this._disposables);

    this._panel.webview.onDidReceiveMessage((raw: unknown) => {
      this.log(`rx ${JSON.stringify(raw).slice(0, 120)}`);
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
      // Ctrl+B with nothing selected: flip the axis RELATIVE to what typing
      // would produce right now. Inside a bold run that means "stop being
      // bold"; in plain text it means "start". An absolute sticky toggle
      // cannot express the first of those - and it was never cleared, so one
      // press quietly bolded everything typed for the rest of the session.
      if (message.start === message.end) {
        const latchText = doc.getText();
        const at = this._cardCaret ?? latchText.length;
        const effective = decompose(resolveTypingStyle(
          latchText, at, this._pendingBold, this._pendingItalic, this._activeFamily));
        if (message.axis === 'bold') {
          this._pendingBold = !(effective?.bold ?? false);
        } else {
          this._pendingItalic = !(effective?.italic ?? false);
        }
        this.update(doc);   // re-render so the button shows the new state
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
      this._historyInFlight = true;
      void vscode.window.showTextDocument(editor.document, {
        viewColumn: editor.viewColumn,
        preserveFocus: false,
      }).then(
        () => vscode.commands.executeCommand(command),
        (err) => console.error('[LinkedIn Preview] undo/redo failed:', err),
      ).then(() => {
        this._historyInFlight = false;
        const after = vscode.window.visibleTextEditors.find(
          e => e.document.uri.toString() === this._trackedUri);
        // The card caret was already rebased from the change event itself;
        // the editor's cursor is NOT consulted - it does not track the
        // card and pointed somewhere unrelated in practice.
        this._panel.reveal(undefined, false);   // focus returns to the card
        // Push a fresh render so the webview re-arms from the echoed caret.
        if (after) { this.update(after.document); }
      }, () => { this._historyInFlight = false; });
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

    if (message.type === 'setCaret') {
      // Cheap and frequent: no edit, no render, just the truth about where
      // the caret is so the next insert lands in the right place.
      this._cardCaret = message.offset;
      this._cardCaretAssoc = message.assoc ?? 'after';
      this._lastTypedBoundary = true;   // caret moved: next insert starts a new undo unit
      // Moving the caret drops any pending Ctrl+B/I, as a word processor
      // does. (The render echo does not pass through here, so a pending
      // format survives an actual typing run.)
      this._pendingBold = null;
      this._pendingItalic = null;
      return;
    }

    if (message.type === 'clearCaret') {
      // The card disarmed (drag-selection or click-away). Forgetting is the
      // point: holding the previous value is how an emoji picked seconds
      // later ended up inserted at a spot the user had long left.
      this._cardCaret = null;
      this._pendingBold = null;
      this._pendingItalic = null;
      return;
    }

    if (message.type === 'cursorSync') {
      this._restoreSelection = null;
      // Deliberately does NOT touch _cardCaret. This message is deferred
      // 200ms (to survive double-clicks) and carries only the coarse span
      // offset. It used to overwrite the precise caret here - landing in
      // the middle of a typing burst and yanking every later character
      // back to the click position, mid-word. setCaret, sent immediately
      // and precisely, is the only writer for the card caret now.
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
      const msg = message;
      this._editChain = this._editChain.then(async () => {
        // The document is CURRENT here: the previous edit has landed.
        const full = doc.getText();
        const insertAt = this._cardCaret !== null
          // Our own caret is a boundary by construction; clamp only.
          ? Math.min(this._cardCaret, full.length)
          // A webview-supplied offset is untrusted: snap off surrogates.
          : snapToCodePointBoundary(full, msg.offset, 'backward');
        this.log(`insertText USING insertAt=${insertAt}`
          + ` (msg.offset=${msg.offset}, _cardCaret won=${this._cardCaret !== null})`);

        const styleId = resolveTypingStyle(
          full, insertAt, this._pendingBold, this._pendingItalic, this._activeFamily);
        const style = ALL_STYLES.find(st => st.id === styleId);
        const styled = style === undefined
          ? msg.text                         // 'plain': serif regular IS ASCII
          : applyStyle(msg.text, style);

        this._selfEditsInFlight += 1;
        // Advance by what was ACTUALLY inserted, leaning on the character
        // just typed so the caret renders at the end of a wrapped line.
        this._cardCaret = insertAt + styled.length;
        this._cardCaretAssoc = 'before';

        // Undo stop only at a word boundary: after whitespace, after a
        // pause, or after the caret moved. Everything between boundaries
        // undoes as ONE unit - Ctrl+Z takes back the word, not a letter.
        const now = Date.now();
        const boundary = this._lastTypedBoundary || (now - this._lastTypedAt) > 700;
        this._lastTypedAt = now;
        this._lastTypedBoundary = /\s/.test(msg.text);

        const activeEditor = vscode.window.visibleTextEditors.find(
          e => e.document.uri.toString() === this._trackedUri);
        let applied: boolean;
        if (activeEditor) {
          applied = await activeEditor.edit(
            (eb) => eb.insert(doc.positionAt(insertAt), styled),
            { undoStopBefore: boundary, undoStopAfter: false });
        } else {
          // No visible editor: WorkspaceEdit still works, just without
          // coalescing (it cannot suppress undo stops).
          const edit = new vscode.WorkspaceEdit();
          edit.insert(doc.uri, doc.positionAt(insertAt), styled);
          applied = await vscode.workspace.applyEdit(edit);
        }
        if (!applied) {
          this._selfEditsInFlight = Math.max(0, this._selfEditsInFlight - 1);
          this._cardCaret = insertAt;
          this.log('insertText applyEdit REFUSED');
        }
      }).catch((err) => {
        console.error('[LinkedIn Preview] insertText failed:', err);
      });
      return;
    }

    if (message.type === 'replaceText') {
      const msg = message;
      this._editChain = this._editChain.then(async () => {
        const full = doc.getText();
        const start = Math.min(msg.start, full.length);
        const end = Math.min(msg.end, full.length);
        const range = new vscode.Range(
          doc.positionAt(start), doc.positionAt(end));
        // A non-empty replacement is typing-over-a-selection: style it as
        // typing would be styled there. Empty stays a pure deletion.
        const replacement = msg.text.length === 0
          ? msg.text
          : (() => {
              const styleId = resolveTypingStyle(
                full, start,
                this._pendingBold, this._pendingItalic, this._activeFamily);
              const st = ALL_STYLES.find(x => x.id === styleId);
              return st === undefined ? msg.text : applyStyle(msg.text, st);
            })();
        const edit = new vscode.WorkspaceEdit();
        edit.replace(doc.uri, range, replacement);
        this._selfEditsInFlight += 1;
        this._cardCaret = start + replacement.length;
        this._cardCaretAssoc = replacement.length === 0 ? 'after' : 'before';
        this._lastTypedBoundary = true;
        const applied = await vscode.workspace.applyEdit(edit);
        if (!applied) {
          this._selfEditsInFlight = Math.max(0, this._selfEditsInFlight - 1);
          this.log('replaceText applyEdit REFUSED');
        }
      }).catch((err) => {
        console.error('[LinkedIn Preview] replaceText failed:', err);
      });
      return;
    }

    if (message.type === 'insertEmoji') {
      const msg = message;
      this._editChain = this._editChain.then(async () => {
        const full = doc.getText();
        const editor = vscode.window.visibleTextEditors.find(
          e => e.document.uri.toString() === this._trackedUri
        );
        const emojiAt = Math.min(
          this._cardCaret
            ?? (editor ? doc.offsetAt(editor.selection.active) : full.length),
          full.length);
        const edit = new vscode.WorkspaceEdit();
        edit.insert(doc.uri, doc.positionAt(emojiAt), msg.emoji);
        this._selfEditsInFlight += 1;
        this._cardCaret = emojiAt + msg.emoji.length;
        this._cardCaretAssoc = 'before';
        const applied = await vscode.workspace.applyEdit(edit);
        if (!applied) {
          this._selfEditsInFlight = Math.max(0, this._selfEditsInFlight - 1);
          this.log('insertEmoji applyEdit REFUSED');
        }
      }).catch((err) => {
        console.error('[LinkedIn Preview] insertEmoji failed:', err);
      });
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
      this.log(`tx render external=${external} textLen=${text.length}`);
      void this._panel.webview.postMessage({
        type: 'render',
        units: buildOffsetUnits(text, markers),
        counter: { count, limit: LINKEDIN_POST_LIMIT, state },
        external,
        // Authoritative caret. The webview draws with its own optimistic
        // copy between keystrokes, then snaps to this when the render lands.
        caret: this._cardCaret,
        caretAssoc: this._cardCaretAssoc,
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
      // No selection: the buttons show what TYPING at the caret will
      // produce - inherited run, pending override and fallback resolved by
      // the same function the insert path uses, so a lit button can never
      // disagree with the text that then appears.
      const at = this._cardCaret ?? text.length;
      const effective = decompose(resolveTypingStyle(
        text, at, this._pendingBold, this._pendingItalic, this._activeFamily));
      const family = effective?.family ?? this._activeFamily;
      const slots = FAMILY_MATRIX.get(family);
      return {
        displayFamily: family,
        axisState: {
          bold: effective?.bold ?? false,
          italic: effective?.italic ?? false,
          boldAvailable: slots?.bold !== null,
          italicAvailable: slots?.italic !== null,
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
