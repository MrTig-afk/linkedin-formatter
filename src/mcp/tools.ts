import { ALL_STYLES, applyStyle, removeStyle } from '../lib/convert';
import {
  FAMILY_IDS, FAMILY_LABELS, FAMILY_MATRIX, nearestSupported, type FamilyId,
} from '../lib/family';
import { COMBINING_MARKS, applyCombiningMark, stripCombiningMark } from '../lib/combining';
import { countCharacters, getCounterState, LINKEDIN_POST_LIMIT, type CountingUnit } from '../lib/charCount';

/**
 * The MCP tool surface, as pure functions over plain objects.
 *
 * Transport wiring lives in index.ts. Everything decidable is here so the
 * tests never start a server, exactly as the CLI splits run.ts from index.ts.
 *
 * The DESCRIPTIONS matter as much as the code. They are injected into the
 * model's context at session start, and they are the only way an assistant
 * learns the `.linkedin` convention - it does not read the marketplace
 * listing. If a description is vague, the tool is effectively undiscoverable.
 */

export interface ToolAnnotations {
  readonly readOnlyHint: true;
  readonly destructiveHint: false;
  readonly idempotentHint: true;
  readonly openWorldHint: false;
}

export interface ToolDef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: ToolAnnotations;
}

/**
 * Every tool here is a pure string transformation: nothing touches the disk,
 * a socket or a clock. Clients use these hints to decide whether to prompt
 * before running a tool, so accurate hints mean a user is never asked to
 * confirm something that cannot alter anything.
 */
const PURE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/**
 * Surfaced by clients at session start. A second route for the convention to
 * reach a model, independent of the individual tool descriptions.
 */
export const SERVER_INSTRUCTIONS =
  'Formats text for LinkedIn using real Unicode characters. LinkedIn has no '
  + 'formatting controls, so Markdown does not work: **bold** pastes in as '
  + 'literal asterisks. Use apply_family to style text, and count_characters '
  + 'before posting, because LinkedIn counts UTF-16 code units and a styled '
  + 'character costs two. '
  + 'TWO RULES ALWAYS APPLY, whether the user asked for a whole post or a '
  + 'single styled line. They are not optional steps in a workflow. '
  + 'RULE 1 - ASK BEFORE YOU STYLE. These tools apply exactly the family and '
  + 'axes you pass them. Nothing here prompts for a treatment and there is no '
  + 'default house style, so styling without asking means you picked one on '
  + 'the user\'s behalf. Before the first apply_* call, OFFER the user three '
  + 'styling tiers and WAIT for an answer: minimal (plain text, bold hook '
  + 'only), balanced (bold hook, sans-serif-bold headers, sparing serif-bold '
  + 'emphasis; the sensible default), and pizzazz (a deliberate mixture: '
  + 'script flourish, monospace details, marks). Describe what each one looks '
  + 'like in plain words instead of naming font families, and render a sample '
  + 'line in each tier if you can - a tier name means nothing to the user '
  + 'until they see it. Present them with your client\'s option picker if it '
  + 'has one, else as a numbered list. Skip this only when the user has '
  + 'already named a tier or given explicit styling instructions; whichever '
  + 'they pick, they can still restyle by hand in the preview afterwards. '
  + 'RULE 2 - FINISH AT THE PREVIEW, NOT AT THE TEXT. Returning styled text '
  + 'into the conversation is NOT a preview, and you must never describe it '
  + 'as one. After styling, always save the result to a file ending .linkedin '
  + 'and then open that file in VS Code (for example: code draft.linkedin). '
  + 'The LinkedIn Formatter extension renders it as a live LinkedIn card '
  + 'beside the editor, where the user reviews and adjusts by hand before '
  + 'posting. Report that a preview is open only if you actually wrote the '
  + 'file and opened it. If no preview appears the extension is not '
  + 'installed; OFFER the user the command '
  + 'code --install-extension kaushiknaru.linkedin-formatter and let them '
  + 'decide - never install anything without asking. '
  + 'STYLING JUDGMENT: style for emphasis, not decoration. Bold the hook and '
  + 'the few load-bearing phrases, keep body text plain, and never style an '
  + 'entire paragraph. '
  + 'FAMILY ROLES: serif bold/italic for emphasis in body text (the default '
  + 'workhorse); sans-serif bold for the hook and headers; monospace for '
  + 'versions, commands and code; script as a sparing flourish or sign-off. '
  + 'Every other family (fraktur, double-struck, circled, squared, '
  + 'negative-squared, fullwidth, parenthesized) is a novelty: use it only '
  + 'when the user explicitly asks for it. '
  + 'ORDER OF WORK for a whole post: draft the prose, offer the tiers and '
  + 'wait (rule 1), apply the chosen tier, check count_characters, then the '
  + '.linkedin file and the preview (rule 2).';

/**
 * One-line role per family, injected into list_families output and mirrored
 * in SERVER_INSTRUCTIONS. The realistic prompt is "make it look good", not a
 * styling spec (PRD S7.5.2): without roles an agent either never leaves serif
 * or decorates with novelty fonts. Families absent here are novelties.
 */
const FAMILY_ROLES: ReadonlyMap<string, string> = new Map([
  ['serif', 'body emphasis via bold/italic - the default workhorse'],
  ['sans-serif', 'the hook and headers, usually bold'],
  ['monospace', 'versions, commands and code'],
  ['script', 'a sparing flourish or sign-off'],
]);
const NOVELTY_ROLE = 'novelty - only on explicit user request';

const CONVENTION =
  'LinkedIn posts belong in a file ending .linkedin, written as plain text '
  + 'with real Unicode styling and never Markdown - LinkedIn has no formatting '
  + 'controls, so **bold** pastes in as literal asterisks. ';

const str = (description: string) => ({ type: 'string', description });

const TOOL_DEFS: readonly Omit<ToolDef, 'annotations'>[] = [
  {
    name: 'apply_style',
    description:
      CONVENTION
      + 'Convert text to a specific Unicode letterform style by id. Use '
      + 'list_styles to see the ids. Prefer apply_family when you are thinking '
      + 'in terms of a font plus bold/italic.',
    inputSchema: {
      type: 'object',
      properties: {
        text: str('The text to convert.'),
        style_id: str('A style id from list_styles, e.g. "bold", "script", "monospace".'),
      },
      required: ['text', 'style_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'apply_family',
    description:
      CONVENTION
      + 'Convert text to a font family with optional bold and italic. This is '
      + 'the tool to reach for when styling a post. Unicode is sparse: monospace '
      + 'has no bold, script has no italic. Unsupported axes are dropped rather '
      + 'than faked, and the response reports what was actually applied.',
    inputSchema: {
      type: 'object',
      properties: {
        text: str('The text to convert.'),
        family: str('A family id from list_families, e.g. "serif", "script", "monospace".'),
        bold: { type: 'boolean', description: 'Apply the bold axis if the family has one.' },
        italic: { type: 'boolean', description: 'Apply the italic axis if the family has one.' },
      },
      required: ['text', 'family'],
      additionalProperties: false,
    },
  },
  {
    name: 'apply_mark',
    description:
      'Layer a combining mark over text: strikethrough or underline. Marks '
      + 'stack on top of any letterform style rather than replacing it.',
    inputSchema: {
      type: 'object',
      properties: {
        text: str('The text to mark.'),
        mark_id: str('Either "strikethrough" or "underline".'),
      },
      required: ['text', 'mark_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'strip_formatting',
    description:
      'Convert styled Unicode text back to plain ASCII, removing both '
      + 'letterform styles and combining marks. Lossless: the result is exactly '
      + 'what was originally typed.',
    inputSchema: {
      type: 'object',
      properties: { text: str('The styled text to convert back to plain.') },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'count_characters',
    description:
      'Count text against LinkedIn\'s 3,000 character limit. IMPORTANT: '
      + 'LinkedIn counts UTF-16 code units, so a styled character costs 2, not '
      + '1. Naive character counting will tell you a post fits when it does '
      + 'not. About the first 210 characters show before the "see more" fold.',
    inputSchema: {
      type: 'object',
      properties: {
        text: str('The text to count.'),
        unit: {
          type: 'string',
          enum: ['utf16', 'codepoints'],
          description: 'Counting unit. Default utf16, which is what LinkedIn uses.',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_families',
    description:
      'List the font families available for apply_family: which of bold and '
      + 'italic each one supports in Unicode, and the role each plays in a '
      + 'well-styled post.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_styles',
    description: 'List every letterform style id and combining mark id.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

/**
 * The tool list, in a FIXED order. The spec asks for deterministic ordering so
 * client-side prompt caching keeps working across sessions.
 */
export const TOOLS: readonly ToolDef[] =
  TOOL_DEFS.map(d => ({ ...d, annotations: PURE_ANNOTATIONS }));

/** For the transport layer: an unknown tool NAME is a protocol error, not a
 *  tool-execution error (spec: unknown tool -> JSON-RPC error). */
export const TOOL_NAMES: ReadonlySet<string> = new Set(TOOL_DEFS.map(d => d.name));

export interface ToolResult {
  readonly text: string;
  readonly isError: boolean;
  /**
   * Commentary for the model, kept OUT of the data. It used to be appended
   * to the converted text itself, which meant a model piping apply_family
   * output onward counted and stripped the note along with the text - and
   * could paste it into the post. The transport renders it as a separate
   * content block instead.
   */
  readonly note?: string;
}

const ok = (text: string, note?: string): ToolResult => ({ text, isError: false, ...(note !== undefined ? { note } : {}) });
const fail = (text: string): ToolResult => ({ text, isError: true });

/**
 * Upper bound on tool text. A LinkedIn post is 3,000 characters; 100k is two
 * orders of magnitude of headroom. Refused rather than truncated - a silently
 * shortened post is worse than a rejected call.
 */
const MAX_TOOL_TEXT_LENGTH = 100_000;

function requireString(args: Record<string, unknown>, key: string): string | null {
  const v = args[key];
  return typeof v === 'string' ? v : null;
}

/**
 * Execute a tool call. Arguments arrive from a language model, so every field
 * is checked rather than trusted; a wrong type comes back as a tool error the
 * model can read and correct, never as a thrown exception.
 */
export function callTool(name: string, rawArgs: unknown): ToolResult {
  const args = (typeof rawArgs === 'object' && rawArgs !== null)
    ? rawArgs as Record<string, unknown>
    : {};

  if (name === 'list_families') {
    return ok(FAMILY_IDS.map((id) => {
      const slots = FAMILY_MATRIX.get(id)!;
      const axes = [
        slots.bold !== null ? 'bold' : null,
        slots.italic !== null ? 'italic' : null,
      ].filter(Boolean).join(', ') || 'none';
      const role = FAMILY_ROLES.get(id) ?? NOVELTY_ROLE;
      return `${id} (${FAMILY_LABELS.get(id) ?? id}) - axes: ${axes} - role: ${role}`;
    }).join('\n'));
  }

  if (name === 'list_styles') {
    return ok(
      `Letterform styles (${ALL_STYLES.length}):\n`
      + ALL_STYLES.map(s => `  ${s.id} - ${s.label} (${s.coverage})`).join('\n')
      + `\n\nCombining marks (${COMBINING_MARKS.length}):\n`
      + COMBINING_MARKS.map(m => `  ${m.id} - ${m.label}`).join('\n'),
    );
  }

  const text = requireString(args, 'text');
  if (text === null) { return fail('text is required and must be a string'); }
  if (text.length > MAX_TOOL_TEXT_LENGTH) {
    return fail('text exceeds ' + MAX_TOOL_TEXT_LENGTH + ' UTF-16 units; split the input');
  }

  if (name === 'apply_style') {
    const styleId = requireString(args, 'style_id');
    if (styleId === null) { return fail('style_id is required and must be a string'); }
    const style = ALL_STYLES.find(s => s.id === styleId);
    if (style === undefined) {
      return fail(`unknown style_id "${styleId}". Call list_styles for valid ids.`);
    }
    return ok(applyStyle(text, style));
  }

  if (name === 'apply_family') {
    const family = requireString(args, 'family');
    if (family === null) { return fail('family is required and must be a string'); }
    if (!(FAMILY_IDS as readonly string[]).includes(family)) {
      return fail(`unknown family "${family}". Call list_families for valid ids.`);
    }
    const wantBold = args['bold'] === true;
    const wantItalic = args['italic'] === true;
    const resolved = nearestSupported(family as FamilyId, wantBold, wantItalic);
    const style = ALL_STYLES.find(s => s.id === resolved.styleIdOrPlain);
    const out = style === undefined ? text : applyStyle(text, style);

    // Tell the model what actually happened, so it does not report bold text
    // to the user when the family had no bold to give.
    const dropped: string[] = [];
    if (wantBold && !resolved.bold) { dropped.push('bold'); }
    if (wantItalic && !resolved.italic) { dropped.push('italic'); }
    // The note must NOT contaminate the converted text: models pipe tool
    // output onwards, and a note fused into the data gets counted by
    // count_characters, mangled by strip_formatting, or pasted straight
    // into the post. It travels in a separate content block instead.
    const note = dropped.length > 0
      ? family + ' has no ' + dropped.join(' or ') + ' in Unicode; that axis was dropped.'
      : undefined;
    return ok(out, note);
  }

  if (name === 'apply_mark') {
    const markId = requireString(args, 'mark_id');
    if (markId === null) { return fail('mark_id is required and must be a string'); }
    const mark = COMBINING_MARKS.find(m => m.id === markId);
    if (mark === undefined) {
      const ids = COMBINING_MARKS.map(m => m.id).join(' | ');
      return fail(`unknown mark_id "${markId}". Valid: ${ids}`);
    }
    // Strip first so the call is idempotent. Models retry tools; a bare
    // re-apply DOUBLED the combining marks on every retry (verified:
    // two calls on "ab" gave 6 units instead of 4).
    return ok(applyCombiningMark(stripCombiningMark(text, mark), mark));
  }

  if (name === 'strip_formatting') {
    let out = text;
    for (const mark of COMBINING_MARKS) { out = stripCombiningMark(out, mark); }
    for (const style of ALL_STYLES) { out = removeStyle(out, style); }
    return ok(out);
  }

  if (name === 'count_characters') {
    const unitRaw = args['unit'];
    if (unitRaw !== undefined && unitRaw !== 'utf16' && unitRaw !== 'codepoints') {
      return fail('unit must be "utf16" or "codepoints"');
    }
    const unit: CountingUnit = unitRaw === 'codepoints' ? 'codepoints' : 'utf16';
    const count = countCharacters(text, unit);
    const state = getCounterState(count, LINKEDIN_POST_LIMIT, Math.floor(LINKEDIN_POST_LIMIT * 0.9));
    const over = count > LINKEDIN_POST_LIMIT;
    return ok(
      `${count} / ${LINKEDIN_POST_LIMIT} ${unit} (${state})`
      + (over ? `\nOVER by ${count - LINKEDIN_POST_LIMIT}. Shorten before posting.` : ''),
    );
  }

  return fail(`unknown tool "${name}"`);
}
