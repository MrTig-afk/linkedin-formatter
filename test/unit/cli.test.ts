import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { run } from '../../src/cli/run';
import { applyStyle, ALL_STYLES } from '../../src/lib/convert';

// run() is pure over (argv, stdin), so none of this spawns a process.
const V = '0.0.0-test';
const call = (args: string[], stdin: string | null = null) => run(args, stdin, V);

// ---------------------------------------------------------------------------
// Usage and metadata
// ---------------------------------------------------------------------------

test('cli: no arguments prints usage and exits non-zero', () => {
  const r = call([]);
  assert.match(r.stdout, /USAGE/);
  assert.equal(r.code, 2);
});

test('cli: --help exits zero', () => {
  const r = call(['--help']);
  assert.match(r.stdout, /USAGE/);
  assert.equal(r.code, 0);
});

test('cli: --version prints the version', () => {
  assert.equal(call(['--version']).stdout, V + '\n');
});

test('cli: an unknown command fails with usage', () => {
  const r = call(['frobnicate', 'x']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /unknown command/);
});

test('cli: an unknown flag fails rather than being ignored', () => {
  const r = call(['style', 'x', '--nope']);
  assert.equal(r.code, 2);
});

// ---------------------------------------------------------------------------
// style
// ---------------------------------------------------------------------------

test('cli: style defaults to serif, which is plain ASCII', () => {
  const r = call(['style', 'Hello']);
  assert.equal(r.stdout, 'Hello\n');
  assert.equal(r.code, 0);
});

test('cli: style --family script produces real script characters', () => {
  const r = call(['style', 'Hello', '--family', 'script']);
  const expected = applyStyle('Hello', ALL_STYLES.find(s => s.id === 'script')!);
  assert.equal(r.stdout, expected + '\n');
});

test('cli: style --bold produces math bold', () => {
  const r = call(['style', 'Hi', '--bold']);
  const expected = applyStyle('Hi', ALL_STYLES.find(s => s.id === 'bold')!);
  assert.equal(r.stdout, expected + '\n');
});

test('cli: style short flags match long ones', () => {
  assert.equal(call(['style', 'Hi', '-f', 'script']).stdout,
               call(['style', 'Hi', '--family', 'script']).stdout);
  assert.equal(call(['style', 'Hi', '-b']).stdout, call(['style', 'Hi', '--bold']).stdout);
});

test('cli: style rejects an unknown family instead of guessing', () => {
  const r = call(['style', 'Hi', '--family', 'comic-sans']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /unknown family/);
});

test('cli: a dropped axis is reported on stderr, leaving stdout clean', () => {
  // monospace has no bold in Unicode.
  const r = call(['style', 'Hi', '--family', 'monospace', '--bold']);
  assert.equal(r.code, 0);
  const expected = applyStyle('Hi', ALL_STYLES.find(s => s.id === 'monospace')!);
  assert.equal(r.stdout, expected + '\n', 'stdout must stay pipeable');
  assert.match(r.stderr, /no bold/);
});

test('cli: fails closed on characters with no styled equivalent', () => {
  const r = call(['style', 'a!b', '--bold']);
  assert.ok(r.stdout.includes('!'), 'punctuation must pass through unchanged');
});

// ---------------------------------------------------------------------------
// strip and round trip
// ---------------------------------------------------------------------------

test('cli: strip reverses style for every family', () => {
  const families = ['script', 'fraktur', 'monospace', 'double-struck', 'fullwidth'];
  for (const f of families) {
    const styled = call(['style', 'Hello123', '--family', f]).stdout.trim();
    const back = call(['strip', styled]).stdout.trim();
    assert.equal(back, 'Hello123', `round trip failed for ${f}`);
  }
});

test('cli: strip also removes combining marks', () => {
  const marked = call(['mark', 'Hello', '--mark', 'strikethrough']).stdout.trim();
  assert.notEqual(marked, 'Hello');
  assert.equal(call(['strip', marked]).stdout.trim(), 'Hello');
});

test('cli: mark requires a valid mark id', () => {
  assert.equal(call(['mark', 'Hi']).code, 2);
  assert.equal(call(['mark', 'Hi', '--mark', 'sparkles']).code, 2);
});

// ---------------------------------------------------------------------------
// count
// ---------------------------------------------------------------------------

test('cli: count reports against the 3,000 limit', () => {
  const r = call(['count', 'Hello']);
  assert.match(r.stdout, /^5 \/ 3000/);
  assert.equal(r.code, 0);
});

test('cli: count exits non-zero when over the limit, so scripts can gate on it', () => {
  const r = call(['count', 'a'.repeat(3001)]);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /over/);
});

test('cli: count in utf16 charges styled characters double', () => {
  const styled = call(['style', 'Hello', '--bold']).stdout.trim();
  const utf16 = call(['count', styled, '--unit', 'utf16']).stdout;
  const cps = call(['count', styled, '--unit', 'codepoints']).stdout;
  assert.match(utf16, /^10 /, 'math bold is astral: 5 chars = 10 UTF-16 units');
  assert.match(cps, /^5 /);
});

test('cli: count rejects an unknown unit', () => {
  assert.equal(call(['count', 'Hi', '--unit', 'bytes']).code, 2);
});

// ---------------------------------------------------------------------------
// Input handling
// ---------------------------------------------------------------------------

test('cli: text is read from stdin when no positional is given', () => {
  const r = call(['style', '--bold'], 'Hi');
  const expected = applyStyle('Hi', ALL_STYLES.find(s => s.id === 'bold')!);
  assert.equal(r.stdout, expected + '\n');
});

test('cli: a positional argument wins over stdin', () => {
  const r = call(['strip', 'positional'], 'piped');
  assert.equal(r.stdout.trim(), 'positional');
});

test('cli: missing text fails with a clear message rather than empty output', () => {
  const r = call(['style'], null);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /no text given/);
});

test('cli: multi-word positional text is preserved', () => {
  assert.equal(call(['strip', 'two', 'words']).stdout.trim(), 'two words');
});

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

test('cli: families lists all 11 with their axes', () => {
  const r = call(['families']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /11 families/);
  assert.ok(r.stdout.includes('monospace'));
  assert.ok(r.stdout.includes('axes: none'), 'families without axes must say so');
});

test('cli: styles lists 18 letterform styles and 2 marks', () => {
  const r = call(['styles']);
  assert.match(r.stdout, /18 letterform styles/);
  assert.match(r.stdout, /2 combining marks/);
});

test('cli: listings need no text argument', () => {
  assert.equal(call(['families'], null).code, 0);
  assert.equal(call(['styles'], null).code, 0);
});
