import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { TOOLS, callTool, SERVER_INSTRUCTIONS } from '../../src/mcp/tools';
import { applyStyle, ALL_STYLES } from '../../src/lib/convert';
import { FAMILY_IDS } from '../../src/lib/family';

// callTool is pure, so none of this starts a server.

// ---------------------------------------------------------------------------
// Tool surface
// ---------------------------------------------------------------------------

test('mcp: exposes exactly the seven tools from issue #3', () => {
  const names = TOOLS.map(t => t.name).sort();
  assert.deepEqual(names, [
    'apply_family', 'apply_mark', 'apply_style',
    'count_characters', 'list_families', 'list_styles', 'strip_formatting',
  ]);
});

test('mcp: every tool has a description and an object input schema', () => {
  for (const t of TOOLS) {
    assert.ok(t.description.length > 40, `${t.name} needs a real description`);
    assert.equal((t.inputSchema as { type: string }).type, 'object', `${t.name} schema`);
  }
});

test('mcp: the styling tools carry the .linkedin convention in their description', () => {
  // These descriptions ARE the delivery mechanism - an assistant does not read
  // the marketplace listing. If this regresses, the server stops teaching the
  // convention and models go back to producing Markdown.
  for (const name of ['apply_style', 'apply_family']) {
    const t = TOOLS.find(x => x.name === name)!;
    assert.ok(t.description.includes('.linkedin'), `${name} must name the extension`);
    assert.ok(/markdown/i.test(t.description), `${name} must warn against Markdown`);
  }
});

test('mcp: count_characters warns about UTF-16, which no model knows', () => {
  const t = TOOLS.find(x => x.name === 'count_characters')!;
  assert.ok(/utf-16/i.test(t.description));
  assert.ok(t.description.includes('3,000'));
});

// ---------------------------------------------------------------------------
// Behaviour
// ---------------------------------------------------------------------------

test('mcp: apply_style produces real Unicode', () => {
  const r = callTool('apply_style', { text: 'Hi', style_id: 'bold' });
  assert.equal(r.isError, false);
  assert.equal(r.text, applyStyle('Hi', ALL_STYLES.find(s => s.id === 'bold')!));
});

test('mcp: apply_family with no axes gives the regular face', () => {
  const r = callTool('apply_family', { text: 'Hi', family: 'script' });
  assert.equal(r.text, applyStyle('Hi', ALL_STYLES.find(s => s.id === 'script')!));
});

test('mcp: apply_family reports a dropped axis WITHOUT contaminating the text', () => {
  const r = callTool('apply_family', { text: 'Hi', family: 'monospace', bold: true });
  assert.equal(r.isError, false);
  assert.ok(r.note !== undefined && /no bold/.test(r.note), 'the note must exist');
  // The data stays pure: piping it onwards must not carry commentary.
  assert.ok(!/note|bold/.test(r.text), 'the converted text must contain no commentary');
  assert.equal(callTool('strip_formatting', { text: r.text }).text, 'Hi',
    'round-trip through the CLEAN text must still work');
});

test('mcp: strip_formatting round-trips every family', () => {
  for (const family of FAMILY_IDS) {
    const styled = callTool('apply_family', { text: 'Hello123', family }).text;
    const back = callTool('strip_formatting', { text: styled }).text;
    assert.equal(back, 'Hello123', `round trip failed for ${family}`);
  }
});

test('mcp: strip_formatting also removes combining marks', () => {
  const marked = callTool('apply_mark', { text: 'Hi', mark_id: 'strikethrough' }).text;
  assert.notEqual(marked, 'Hi');
  assert.equal(callTool('strip_formatting', { text: marked }).text, 'Hi');
});

test('mcp: count_characters charges styled characters double in utf16', () => {
  const styled = callTool('apply_style', { text: 'Hello', style_id: 'bold' }).text;
  assert.match(callTool('count_characters', { text: styled }).text, /^10 \/ 3000/);
  assert.match(callTool('count_characters', { text: styled, unit: 'codepoints' }).text, /^5 \/ 3000/);
});

test('mcp: count_characters says so when over the limit', () => {
  const r = callTool('count_characters', { text: 'a'.repeat(3001) });
  assert.match(r.text, /OVER by 1/);
});

test('mcp: list_families names all 11 and their axes', () => {
  const r = callTool('list_families', {});
  for (const id of FAMILY_IDS) { assert.ok(r.text.includes(id), `missing ${id}`); }
  assert.ok(r.text.includes('axes: none'));
});

test('mcp: list_families gives every family a role, novelties on request only', () => {
  const r = callTool('list_families', {});
  for (const line of r.text.split('\n')) {
    assert.match(line, / - role: /, `no role on: ${line}`);
  }
  assert.match(r.text, /serif \(.*workhorse/);
  assert.match(r.text, /monospace \(.*versions, commands and code/);
  // The seven novelty families all carry the explicit-request marker.
  const noveltyCount = r.text.split('\n')
    .filter(l => l.includes('only on explicit user request')).length;
  assert.equal(noveltyCount, 7);
});

test('mcp: server instructions carry judgment, roles and the three-tier offer', () => {
  // Taste: emphasis, not decoration.
  assert.match(SERVER_INSTRUCTIONS, /emphasis, not decoration/);
  assert.match(SERVER_INSTRUCTIONS, /never style an entire paragraph/);
  // Roles for the load-bearing families, novelty rule for the rest.
  assert.match(SERVER_INSTRUCTIONS, /FAMILY ROLES/);
  assert.match(SERVER_INSTRUCTIONS, /only\s+when the user explicitly asks/);
  // The tier offer, in order, before any styling is applied.
  assert.match(SERVER_INSTRUCTIONS, /OFFER the user three styling tiers/);
  for (const tier of ['minimal', 'balanced', 'pizzazz']) {
    assert.ok(SERVER_INSTRUCTIONS.includes(tier), `missing tier ${tier}`);
  }
  // The workflow still ends at the preview with an ask-first install.
  assert.match(SERVER_INSTRUCTIONS, /\.linkedin/);
  assert.match(SERVER_INSTRUCTIONS, /never install anything without asking/);
});

test('mcp: the ask-first and preview rules are unconditional, not workflow steps', () => {
  // Both used to sit inside "FULL WORKFLOW when composing a whole post", which
  // made them skippable for anything smaller than a post. They are gates now.
  assert.match(SERVER_INSTRUCTIONS, /TWO RULES ALWAYS APPLY/);
  assert.match(SERVER_INSTRUCTIONS, /not optional steps in a workflow/);

  // Rule 1: ask, and wait, before the first conversion.
  assert.match(SERVER_INSTRUCTIONS, /RULE 1 - ASK BEFORE YOU STYLE/);
  assert.match(SERVER_INSTRUCTIONS, /Before the first apply_\* call/);
  assert.match(SERVER_INSTRUCTIONS, /WAIT for an answer/);
  // A tier name is meaningless to the user, so the offer has to be shown.
  assert.match(SERVER_INSTRUCTIONS, /plain words instead of naming font families/);
  assert.match(SERVER_INSTRUCTIONS, /render a sample line in each tier/);

  // Rule 2: styled text in the chat is not the deliverable.
  assert.match(SERVER_INSTRUCTIONS, /RULE 2 - FINISH AT THE PREVIEW/);
  assert.match(SERVER_INSTRUCTIONS, /is NOT a preview/);
  assert.match(SERVER_INSTRUCTIONS, /only if you actually wrote the file and opened it/);
});

test('mcp: list_styles covers 18 letterform styles and 2 marks', () => {
  const r = callTool('list_styles', {});
  assert.match(r.text, /Letterform styles \(18\)/);
  assert.match(r.text, /Combining marks \(2\)/);
});

// ---------------------------------------------------------------------------
// Untrusted input: arguments come from a language model
// ---------------------------------------------------------------------------

test('mcp: a bad style id is a tool error the model can read, not a throw', () => {
  const r = callTool('apply_style', { text: 'Hi', style_id: 'comic-sans' });
  assert.equal(r.isError, true);
  assert.match(r.text, /unknown style_id/);
  assert.match(r.text, /list_styles/, 'the error must point at the recovery');
});

test('mcp: a bad family is a tool error, not a throw', () => {
  const r = callTool('apply_family', { text: 'Hi', family: 'papyrus' });
  assert.equal(r.isError, true);
  assert.match(r.text, /list_families/);
});

test('mcp: missing or wrongly typed text is rejected', () => {
  assert.equal(callTool('apply_style', { style_id: 'bold' }).isError, true);
  assert.equal(callTool('apply_style', { text: 42, style_id: 'bold' }).isError, true);
  assert.equal(callTool('strip_formatting', {}).isError, true);
});

test('mcp: a null or non-object argument bag does not throw', () => {
  assert.equal(callTool('strip_formatting', null).isError, true);
  assert.equal(callTool('strip_formatting', 'nope').isError, true);
  assert.equal(callTool('list_styles', null).isError, false);
});

test('mcp: an unknown tool name is an error, not a throw', () => {
  assert.equal(callTool('drop_database', {}).isError, true);
});

test('mcp: an invalid counting unit is rejected rather than defaulted', () => {
  assert.equal(callTool('count_characters', { text: 'Hi', unit: 'bytes' }).isError, true);
});

test('mcp: apply_mark is idempotent - a model retry cannot double the marks', () => {
  const once = callTool('apply_mark', { text: 'ab', mark_id: 'strikethrough' }).text;
  const twice = callTool('apply_mark', { text: once, mark_id: 'strikethrough' }).text;
  assert.equal(twice, once, 'second application must be a no-op');
});

test('mcp: oversized text is refused, never truncated', () => {
  const huge = 'a'.repeat(100_001);
  const r = callTool('strip_formatting', { text: huge });
  assert.equal(r.isError, true);
  assert.ok(/exceeds/.test(r.text));
  assert.equal(callTool('strip_formatting', { text: 'a'.repeat(100_000) }).isError, false,
    'exactly at the limit is allowed');
});
