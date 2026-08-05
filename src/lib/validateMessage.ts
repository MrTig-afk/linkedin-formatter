import { VALID_MARK_IDS, VALID_FAMILY_IDS, CURATED_EMOJI_CHARS, MAX_INSERT_TEXT_LENGTH } from './messageContract';
import type { WebviewMessage } from './messageContract';
import type { FamilyId } from './family';

export type ValidationResult =
  | { readonly valid: true;  readonly message: WebviewMessage }
  | { readonly valid: false; readonly reason: string };

function isValidOffset(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0;
}

/**
 * Validate a raw postMessage payload against the contract.
 * Pure function, no vscode import.
 *
 * @param raw            - the unknown value from webview.onDidReceiveMessage
 * @param documentLength - the tracked document's text.length (UTF-16 code units)
 * @returns a validated, clamped WebviewMessage or a rejection with reason
 */
export function validateMessage(
  raw: unknown,
  documentLength: number
): ValidationResult {
  // 1. Outer shape
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { valid: false, reason: 'not a plain object' };
  }

  const obj = raw as Record<string, unknown>;

  // 2. Discriminant
  const type = obj['type'];
  if (type !== 'applyStyle' && type !== 'clearFormatting'
      && type !== 'cursorSync' && type !== 'insertEmoji'
      && type !== 'insertText'
      && type !== 'setFamily' && type !== 'convertFamily'
      && type !== 'toggleAxis' && type !== 'selectionState'
      && type !== 'undo' && type !== 'redo') {
    return { valid: false, reason: 'unknown or missing message type' };
  }

  if (type === 'undo' || type === 'redo') {
    return { valid: true, message: { type } };
  }

  // 3. Per-type field validation
  if (type === 'applyStyle') {
    const styleId = obj['styleId'];
    if (typeof styleId !== 'string') {
      return { valid: false, reason: 'styleId must be a string' };
    }
    if (!VALID_MARK_IDS.has(styleId)) {
      return { valid: false, reason: 'styleId must be a combining mark id' };
    }

    const rawStart = obj['start'];
    const rawEnd = obj['end'];

    if (!isValidOffset(rawStart)) {
      return { valid: false, reason: 'invalid start' };
    }
    if (!isValidOffset(rawEnd)) {
      return { valid: false, reason: 'invalid end' };
    }

    if (rawStart > rawEnd) {
      return { valid: false, reason: 'start exceeds end' };
    }

    const start = Math.min(rawStart, documentLength);
    const end = Math.min(rawEnd, documentLength);

    return { valid: true, message: { type: 'applyStyle', styleId, start, end } };
  }

  if (type === 'insertText') {
    const text = obj['text'];
    if (typeof text !== 'string') {
      return { valid: false, reason: 'text must be a string' };
    }
    if (text.length === 0) {
      return { valid: false, reason: 'text must not be empty' };
    }
    if (text.length > MAX_INSERT_TEXT_LENGTH) {
      // Refused, not truncated: a silently shortened paste loses data.
      return { valid: false, reason: 'text exceeds maximum insert length' };
    }
    // C0 controls carry no meaning in a post body and some (\r) would desync
    // the offset map against the document's own line endings. Newline and tab
    // are the two a person can actually type.
    if (/[\u0000-\u0008\u000B-\u001F\u007F]/.test(text)) {
      return { valid: false, reason: 'text contains control characters' };
    }

    const rawOffset = obj['offset'];
    if (!isValidOffset(rawOffset)) {
      return { valid: false, reason: 'invalid offset' };
    }
    const offset = Math.min(rawOffset, documentLength);

    return { valid: true, message: { type: 'insertText', text, offset } };
  }

  if (type === 'clearFormatting') {
    const rawStart = obj['start'];
    const rawEnd = obj['end'];

    if (!isValidOffset(rawStart)) {
      return { valid: false, reason: 'invalid start' };
    }
    if (!isValidOffset(rawEnd)) {
      return { valid: false, reason: 'invalid end' };
    }

    if (rawStart > rawEnd) {
      return { valid: false, reason: 'start exceeds end' };
    }

    const start = Math.min(rawStart, documentLength);
    const end = Math.min(rawEnd, documentLength);

    return { valid: true, message: { type: 'clearFormatting', start, end } };
  }

  if (type === 'selectionState') {
    const rawStart = obj['start'];
    const rawEnd = obj['end'];

    if (!isValidOffset(rawStart)) {
      return { valid: false, reason: 'invalid start' };
    }
    if (!isValidOffset(rawEnd)) {
      return { valid: false, reason: 'invalid end' };
    }

    if (rawStart > rawEnd) {
      return { valid: false, reason: 'start exceeds end' };
    }

    const start = Math.min(rawStart, documentLength);
    const end = Math.min(rawEnd, documentLength);

    return { valid: true, message: { type: 'selectionState', start, end } };
  }

  if (type === 'cursorSync') {
    const rawOffset = obj['offset'];
    if (!isValidOffset(rawOffset)) {
      return { valid: false, reason: 'invalid offset' };
    }

    const offset = Math.min(rawOffset, documentLength);
    return { valid: true, message: { type: 'cursorSync', offset } };
  }

  if (type === 'setFamily') {
    const family = obj['family'];
    if (typeof family !== 'string' || !VALID_FAMILY_IDS.has(family)) {
      return { valid: false, reason: 'unknown family' };
    }
    return { valid: true, message: { type: 'setFamily', family: family as FamilyId } };
  }

  if (type === 'convertFamily') {
    const family = obj['family'];
    if (typeof family !== 'string' || !VALID_FAMILY_IDS.has(family)) {
      return { valid: false, reason: 'unknown family' };
    }

    const rawStart = obj['start'];
    const rawEnd = obj['end'];
    if (!isValidOffset(rawStart)) {
      return { valid: false, reason: 'invalid start' };
    }
    if (!isValidOffset(rawEnd)) {
      return { valid: false, reason: 'invalid end' };
    }
    if (rawStart > rawEnd) {
      return { valid: false, reason: 'start exceeds end' };
    }

    const start = Math.min(rawStart, documentLength);
    const end = Math.min(rawEnd, documentLength);
    return {
      valid: true,
      message: { type: 'convertFamily', family: family as FamilyId, start, end },
    };
  }

  if (type === 'toggleAxis') {
    const axis = obj['axis'];
    if (axis !== 'bold' && axis !== 'italic') {
      return { valid: false, reason: 'axis must be bold or italic' };
    }

    const rawStart = obj['start'];
    const rawEnd = obj['end'];
    if (!isValidOffset(rawStart)) {
      return { valid: false, reason: 'invalid start' };
    }
    if (!isValidOffset(rawEnd)) {
      return { valid: false, reason: 'invalid end' };
    }
    if (rawStart > rawEnd) {
      return { valid: false, reason: 'start exceeds end' };
    }

    const start = Math.min(rawStart, documentLength);
    const end = Math.min(rawEnd, documentLength);
    return { valid: true, message: { type: 'toggleAxis', axis, start, end } };
  }

  // type === 'insertEmoji'
  const emoji = obj['emoji'];
  if (typeof emoji !== 'string') {
    return { valid: false, reason: 'emoji must be a string' };
  }
  if (!CURATED_EMOJI_CHARS.has(emoji)) {
    return { valid: false, reason: 'emoji not in curated set' };
  }
  return { valid: true, message: { type: 'insertEmoji', emoji } };
}
