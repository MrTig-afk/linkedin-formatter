import { parseArgs } from 'node:util';
import { ALL_STYLES, applyStyle, removeStyle } from '../lib/convert';
import {
  FAMILY_IDS, FAMILY_LABELS, FAMILY_MATRIX, nearestSupported, type FamilyId,
} from '../lib/family';
import { COMBINING_MARKS, applyCombiningMark, stripCombiningMark } from '../lib/combining';
import { countCharacters, getCounterState, LINKEDIN_POST_LIMIT, type CountingUnit } from '../lib/charCount';

/**
 * Result of a CLI invocation. Returned rather than written, so the whole CLI
 * is a pure function over (argv, stdin) and its tests need no subprocess.
 */
export interface CliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

const USAGE = `linkedin-fmt - LinkedIn Unicode styling on the command line

USAGE
  linkedin-fmt <command> [text] [options]

  Text is taken from the positional argument, or from stdin when it is
  omitted, so files work by redirection:

    linkedin-fmt strip < post.linkedin
    cat post.linkedin | linkedin-fmt count

COMMANDS
  style <text>     Apply a font family, optionally with bold/italic
  mark <text>      Layer a combining mark (strikethrough, underline)
  strip <text>     Convert styled text back to plain ASCII
  count <text>     Count against LinkedIn's 3,000 character limit
  families         List the font families and the axes each supports
  styles           List every letterform style and combining mark

OPTIONS
  -f, --family <id>   Font family for 'style' (default: serif)
  -b, --bold          Bold axis for 'style'
  -i, --italic        Italic axis for 'style'
  -m, --mark <id>     Mark id for 'mark' (strikethrough | underline)
  -u, --unit <unit>   Counting unit for 'count': utf16 (default) | codepoints
  -h, --help          Show this help
  -v, --version       Show the version

NOTES
  Output is real Unicode characters, not markup. LinkedIn's composer has no
  formatting controls, so this is the only styling that survives a paste.

  Conversion fails closed: a character with no equivalent in the target style
  is left unchanged rather than replaced with a lookalike. Families with no
  digit row leave digits as plain ASCII; that is correct, not a fallback.
`;

function isFamilyId(v: string): v is FamilyId {
  return (FAMILY_IDS as readonly string[]).includes(v);
}

function listFamilies(): string {
  const rows = FAMILY_IDS.map((id) => {
    const slots = FAMILY_MATRIX.get(id)!;
    const axes = [
      slots.bold !== null ? 'bold' : null,
      slots.italic !== null ? 'italic' : null,
    ].filter(Boolean).join(', ') || 'none';
    return `  ${id.padEnd(18)} ${(FAMILY_LABELS.get(id) ?? id).padEnd(18)} axes: ${axes}`;
  });
  return `${FAMILY_IDS.length} families:\n${rows.join('\n')}\n`;
}

function listStyles(): string {
  const letter = ALL_STYLES.map(s => `  ${s.id.padEnd(24)} ${s.label} (${s.coverage})`);
  const marks = COMBINING_MARKS.map(m => `  ${m.id.padEnd(24)} ${m.label}`);
  return `${ALL_STYLES.length} letterform styles:\n${letter.join('\n')}\n\n`
       + `${COMBINING_MARKS.length} combining marks:\n${marks.join('\n')}\n`;
}

/**
 * Run the CLI.
 *
 * @param argv  - arguments after the node binary and script path
 * @param stdin - text piped in, or null when stdin was a TTY
 * @param version - version string reported by --version
 */
export function run(argv: readonly string[], stdin: string | null, version: string): CliResult {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        family:  { type: 'string',  short: 'f' },
        bold:    { type: 'boolean', short: 'b' },
        italic:  { type: 'boolean', short: 'i' },
        mark:    { type: 'string',  short: 'm' },
        unit:    { type: 'string',  short: 'u' },
        help:    { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { stdout: '', stderr: `${msg}\n\n${USAGE}`, code: 2 };
  }

  const { values, positionals } = parsed;

  if (values.version) { return { stdout: `${version}\n`, stderr: '', code: 0 }; }
  if (values.help || positionals.length === 0) {
    return { stdout: USAGE, stderr: '', code: values.help ? 0 : 2 };
  }

  const command = positionals[0];

  if (command === 'families') { return { stdout: listFamilies(), stderr: '', code: 0 }; }
  if (command === 'styles') { return { stdout: listStyles(), stderr: '', code: 0 }; }

  // Everything below needs text: positional, else stdin.
  const text = positionals.length > 1 ? positionals.slice(1).join(' ') : stdin;
  if (text === null || text.length === 0) {
    return {
      stdout: '',
      stderr: `${command}: no text given. Pass it as an argument or pipe it in.\n`,
      code: 2,
    };
  }

  if (command === 'style') {
    const familyRaw = values.family ?? 'serif';
    if (!isFamilyId(familyRaw)) {
      return {
        stdout: '',
        stderr: `unknown family "${familyRaw}". Run 'linkedin-fmt families' to list them.\n`,
        code: 2,
      };
    }
    // nearestSupported cascades when the family cannot express the axes
    // (monospace has no bold): exact -> drop italic -> drop bold -> regular.
    const resolved = nearestSupported(familyRaw, values.bold === true, values.italic === true);
    const style = ALL_STYLES.find(s => s.id === resolved.styleIdOrPlain);
    const out = style === undefined ? text : applyStyle(text, style);

    // Report a dropped axis on stderr so a pipeline still gets clean stdout.
    const wantedBold = values.bold === true;
    const wantedItalic = values.italic === true;
    const dropped: string[] = [];
    if (wantedBold && !resolved.bold) { dropped.push('bold'); }
    if (wantedItalic && !resolved.italic) { dropped.push('italic'); }
    const stderr = dropped.length > 0
      ? `note: ${familyRaw} has no ${dropped.join(' or ')} in Unicode; dropped.\n`
      : '';
    return { stdout: `${out}\n`, stderr, code: 0 };
  }

  if (command === 'mark') {
    const markId = values.mark;
    const mark = COMBINING_MARKS.find(m => m.id === markId);
    if (mark === undefined) {
      const ids = COMBINING_MARKS.map(m => m.id).join(' | ');
      return { stdout: '', stderr: `mark requires --mark <${ids}>\n`, code: 2 };
    }
    return { stdout: `${applyCombiningMark(text, mark)}\n`, stderr: '', code: 0 };
  }

  if (command === 'strip') {
    let out = text;
    for (const mark of COMBINING_MARKS) { out = stripCombiningMark(out, mark); }
    for (const style of ALL_STYLES) { out = removeStyle(out, style); }
    return { stdout: `${out}\n`, stderr: '', code: 0 };
  }

  if (command === 'count') {
    const unitRaw = values.unit ?? 'utf16';
    if (unitRaw !== 'utf16' && unitRaw !== 'codepoints') {
      return { stdout: '', stderr: `unknown unit "${unitRaw}". Use utf16 or codepoints.\n`, code: 2 };
    }
    const unit: CountingUnit = unitRaw;
    const count = countCharacters(text, unit);
    // 90% matches the extension's default warnAtPercent.
    const state = getCounterState(count, LINKEDIN_POST_LIMIT, Math.floor(LINKEDIN_POST_LIMIT * 0.9));
    const over = count > LINKEDIN_POST_LIMIT;
    const suffix = over ? ` (${LINKEDIN_POST_LIMIT - count})` : '';
    return {
      stdout: `${count} / ${LINKEDIN_POST_LIMIT}${suffix}  [${unit}, ${state}]\n`,
      stderr: '',
      // Non-zero when over the limit, so a script can gate on it.
      code: over ? 1 : 0,
    };
  }

  return {
    stdout: '',
    stderr: `unknown command "${command}"\n\n${USAGE}`,
    code: 2,
  };
}
