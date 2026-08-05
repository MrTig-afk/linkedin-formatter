import { ALL_STYLES } from './convert';
import { COMBINING_MARKS } from './combining';
import { FAMILY_IDS, type FamilyId, type Axis } from './family';

/**
 * v1.2: the toolbar applies letterform styling through the family +
 * modifier model (setFamily / convertFamily / toggleAxis). applyStyle
 * is narrowed to combining marks only (strikethrough, underline).
 */
export interface ApplyStyleMessage {
  readonly type: 'applyStyle';
  readonly styleId: string;   // one of the combining mark IDs
  readonly start: number;     // UTF-16 code unit offset, 0-based
  readonly end: number;       // UTF-16 code unit offset, start <= end
}

export interface SetFamilyMessage {
  readonly type: 'setFamily';
  readonly family: FamilyId;
}

export interface ConvertFamilyMessage {
  readonly type: 'convertFamily';
  readonly family: FamilyId;
  readonly start: number;
  readonly end: number;
}

export interface ToggleAxisMessage {
  readonly type: 'toggleAxis';
  readonly axis: Axis;
  readonly start: number;
  readonly end: number;
}

export interface ClearFormattingMessage {
  readonly type: 'clearFormatting';
  readonly start: number;
  readonly end: number;
}

export interface CursorSyncMessage {
  readonly type: 'cursorSync';
  readonly offset: number;    // UTF-16 code unit offset of click position
}

export interface InsertEmojiMessage {
  readonly type: 'insertEmoji';
  readonly emoji: string;  // must be exactly one of CURATED_EMOJI_CHARS
}

/** Forwarded to the tracked editor's undo stack; no payload. */
export interface UndoRedoMessage {
  readonly type: 'undo' | 'redo';
}

/**
 * v2 (PRD S7.4, M4.1): text typed directly into the preview card.
 *
 * The webview captures keystrokes in a hidden input rather than making the
 * card contenteditable, so the card's DOM stays generated-once-per-render
 * and the browser never becomes a second writer to it (PRD Q1).
 *
 * `text` is what the user typed, `offset` is where it goes. Both are
 * untrusted: typing produces far more messages than styling ever did, and
 * the boundary does not get looser because it is busier.
 */
export interface InsertTextMessage {
  readonly type: 'insertText';
  readonly text: string;    // 1..MAX_INSERT_TEXT_LENGTH UTF-16 code units
  readonly offset: number;  // UTF-16 code unit offset, 0-based
}

/**
 * Upper bound on a single insert. A keystroke is one or two code units; a
 * composition commit or paste is longer. Anything past this is not a human
 * typing, so it is refused rather than clamped - a truncated paste would be
 * worse than a rejected one.
 */
export const MAX_INSERT_TEXT_LENGTH = 10_000;

/**
 * The webview's current text selection, reported on mouseup so the
 * extension can keep it highlighted across re-renders and reflect its
 * family/axes in the toolbar. start === end means no selection.
 */
export interface SelectionStateMessage {
  readonly type: 'selectionState';
  readonly start: number;
  readonly end: number;
}

export type WebviewMessage =
  | ApplyStyleMessage
  | ClearFormattingMessage
  | CursorSyncMessage
  | InsertEmojiMessage
  | InsertTextMessage
  | SetFamilyMessage
  | ConvertFamilyMessage
  | ToggleAxisMessage
  | SelectionStateMessage
  | UndoRedoMessage;

export type WebviewMessageType = WebviewMessage['type'];

export { CURATED_EMOJI_CHARS } from './emoji';

/**
 * Set of all valid styleId values (18 letterform + 2 combining).
 * Built at load time from ALL_STYLES and COMBINING_MARKS.
 */
export const VALID_FORMAT_IDS: ReadonlySet<string> = new Set([
  ...ALL_STYLES.map(s => s.id),
  ...COMBINING_MARKS.map(m => m.id),
]);

/** Mark IDs only - the set applyStyle validates against since v1.2. */
export const VALID_MARK_IDS: ReadonlySet<string> = new Set(
  COMBINING_MARKS.map(m => m.id),
);

/** Family IDs from PRD appendix E, for setFamily/convertFamily validation. */
export const VALID_FAMILY_IDS: ReadonlySet<string> = new Set(FAMILY_IDS);
