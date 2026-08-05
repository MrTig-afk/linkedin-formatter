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

export interface ToolDef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

const CONVENTION =
  'LinkedIn posts belong in a file ending .linkedin, written as plain text '
  + 'with real Unicode styling and never Markdown - LinkedIn has no formatting '
  + 'controls, so **bold** pastes in as literal asterisks. ';

const str = (description: string) => ({ type: 'string', description });

export const TOOLS: readonly ToolDef[] = [
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
    },
  },
  {
    name: 'list_families',
    description:
      'List the font families available for apply_family, and which of bold '
      + 'and italic each one supports in Unicode.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_styles',
    description: 'List every letterform style id and combining mark id.',
    inputSchema: { type: 'object', properties: {} },
  },
];

export interface ToolResult {
  readonly text: string;
  readonly isError: boolean;
}

const ok = (text: string): ToolResult => ({ text, isError: false });
const fail = (text: string): ToolResult => ({ text, isError: true });

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
      return `${id} (${FAMILY_LABELS.get(id) ?? id}) - axes: ${axes}`;
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
    const note = dropped.length > 0
      ? `\n\n(note: ${family} has no ${dropped.join(' or ')} in Unicode; dropped)`
      : '';
    return ok(out + note);
  }

  if (name === 'apply_mark') {
    const markId = requireString(args, 'mark_id');
    if (markId === null) { return fail('mark_id is required and must be a string'); }
    const mark = COMBINING_MARKS.find(m => m.id === markId);
    if (mark === undefined) {
      const ids = COMBINING_MARKS.map(m => m.id).join(' | ');
      return fail(`unknown mark_id "${markId}". Valid: ${ids}`);
    }
    return ok(applyCombiningMark(text, mark));
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
