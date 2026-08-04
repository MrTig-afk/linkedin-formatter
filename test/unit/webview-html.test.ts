import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildPreviewHtml, getNonce, buildCounterHtml } from '../../src/webview/html';
import { ALL_STYLES } from '../../src/lib/convert';
import { COMBINING_MARKS } from '../../src/lib/combining';

// Since the CSS/JS are inlined (a vscode-resource fetch can fail during
// rapid re-renders), these stand in for the file contents.
const DUMMY_STYLE_URI = '.dummy-css-marker { color: red; }';
const DUMMY_SCRIPT_URI = '/* dummy toolbar script marker */';

test('buildPreviewHtml includes CSP meta tag; style-src is nonce-locked', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(result.includes('<meta http-equiv="Content-Security-Policy"'));
  assert.ok(result.includes("style-src 'nonce-abc123'"));
});

test('CSP script-src uses nonce, not unsafe-inline or unsafe-eval', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(result.includes("script-src 'nonce-abc123'"));
  assert.ok(!result.includes('unsafe-inline'));
  assert.ok(!result.includes('unsafe-eval'));
});

test('CSP default-src is none', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(result.includes("default-src 'none'"));
});

test('script tag carries the nonce attribute', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(result.includes('nonce="abc123"'));
});

test('body content appears inside preview-content div', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(result.includes('id="preview-content"'));
  assert.ok(result.includes('hello'));
});

test('pre-escaped content is not double-escaped', () => {
  const escaped = '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;';
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', escaped, '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(result.includes(escaped));
  assert.ok(!result.includes('&amp;lt;'));
});

test('CSP font-src uses cspSource, not a wildcard', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(result.includes('font-src https://test-csp-source'), 'font-src must use cspSource');
  assert.ok(!result.includes('font-src *'), 'font-src must not be a wildcard');
});

test('getNonce returns 32-char hex string', () => {
  assert.match(getNonce(), /^[0-9a-f]{32}$/);
});

test('getNonce returns unique values', () => {
  assert.notEqual(getNonce(), getNonce());
});

test('HTML contains id="toolbar"', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(result.includes('id="toolbar"'));
});

test('toolbar has a family-select with all 11 family options and axis-support data (v1.2)', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(result.includes('id="family-select"'), 'family-select must exist');
  const options = result.match(/<option value="[^"]+" data-bold="[01]" data-italic="[01]"/g) ?? [];
  assert.equal(options.length, 11, 'exactly 11 family options');
  for (const id of ['serif', 'sans-serif', 'script', 'fraktur', 'monospace',
    'double-struck', 'circled', 'squared', 'negative-squared', 'fullwidth',
    'parenthesized']) {
    assert.ok(result.includes(`<option value="${id}"`), `family option '${id}' must be present`);
  }
  // Axis-support facts from appendix E, spot-checked.
  assert.ok(result.includes('<option value="serif" data-bold="1" data-italic="1"'));
  assert.ok(result.includes('<option value="script" data-bold="1" data-italic="0"'));
  assert.ok(result.includes('<option value="monospace" data-bold="0" data-italic="0"'));
});

test('toolbar has bold and italic axis buttons and no legacy style-btn grid (v1.2)', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(result.includes('id="axis-bold"') && result.includes('data-axis="bold"'));
  assert.ok(result.includes('id="axis-italic"') && result.includes('data-axis="italic"'));
  assert.ok(!result.includes('class="style-btn"'), 'legacy per-style button grid must be gone');
  // Letterform ids must not appear as button data attributes any more.
  for (const style of ALL_STYLES) {
    assert.ok(
      !result.includes(`<button class="mark-btn" data-style-id="${style.id}"`),
      `letterform '${style.id}' must not be a toolbar button`
    );
  }
});

test('toolbar keeps exactly 2 mark buttons for the combining mark ids', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  const markBtns = result.match(/class="mark-btn" data-style-id="[^"]+"/g) ?? [];
  assert.equal(markBtns.length, 2);
  for (const mark of COMBINING_MARKS) {
    assert.ok(
      result.includes(`data-style-id="${mark.id}"`),
      `data-style-id="${mark.id}" must be present`
    );
  }
});

test('activeFamily parameter preselects the matching option, defaulting to serif', () => {
  const withDefault = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(withDefault.includes('<option value="serif" data-bold="1" data-italic="1" selected>'));
  const withFraktur = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI, 'fraktur');
  assert.ok(withFraktur.includes('<option value="fraktur" data-bold="1" data-italic="0" selected>'));
  assert.ok(!withFraktur.includes('<option value="serif" data-bold="1" data-italic="1" selected>'));
});

test('HTML contains id="clear-formatting-btn"', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(result.includes('id="clear-formatting-btn"'));
});

test('toolbar div appears before .linkedin-card in the HTML string', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  const toolbarIndex = result.indexOf('id="toolbar"');
  const cardIndex = result.indexOf('class="linkedin-card"');
  assert.ok(toolbarIndex !== -1, 'toolbar must exist');
  assert.ok(cardIndex !== -1, 'linkedin-card must exist');
  assert.ok(toolbarIndex < cardIndex, 'toolbar must appear before linkedin-card');
});

test('toolbar script is inlined under the nonce, with no external src', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(result.includes(`<script nonce="abc123">${DUMMY_SCRIPT_URI}</script>`),
    'the toolbar script must be inlined verbatim under the nonce');
  assert.ok(!result.includes('src='), 'no script may load from an external uri');
});

test('stylesheet is inlined under the nonce, with no link element', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(result.includes(`<style nonce="abc123">${DUMMY_STYLE_URI}</style>`),
    'the stylesheet must be inlined verbatim under the nonce');
  assert.ok(!result.includes('<link'), 'no stylesheet may load from an external uri');
});

test('buildPreviewHtml output has no inline event handler attributes', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  // CSP blocks unsafe-inline; all event wiring must go through addEventListener in toolbar.js.
  assert.ok(!/ on[a-z]+=/.test(result), 'HTML must not contain inline event handler attributes (e.g. onclick=, onmousedown=)');
});

// buildCounterHtml tests

test('buildCounterHtml normal state includes count and limit without state class', () => {
  const result = buildCounterHtml(500, 'normal', 3000);
  assert.ok(result.includes('500 / 3000'), 'must include count / limit');
  assert.ok(result.includes('char-counter'), 'must have char-counter class');
  assert.ok(!result.includes('counter-warning'), 'must not have counter-warning class');
  assert.ok(!result.includes('counter-over'), 'must not have counter-over class');
});

test('buildCounterHtml warning state includes counter-warning class', () => {
  const result = buildCounterHtml(2700, 'warning', 3000);
  assert.ok(result.includes('2700 / 3000'), 'must include count / limit');
  assert.ok(result.includes('counter-warning'), 'must have counter-warning class');
});

test('buildCounterHtml over state includes counter-over class and overage', () => {
  const result = buildCounterHtml(3001, 'over', 3000);
  assert.ok(result.includes('3001 / 3000'), 'must include count / limit');
  assert.ok(result.includes('(-1)'), 'must include overage of 1');
  assert.ok(result.includes('counter-over'), 'must have counter-over class');
});

test('buildCounterHtml over state with large overage shows correct number', () => {
  const result = buildCounterHtml(3127, 'over', 3000);
  assert.ok(result.includes('(-127)'), 'must include overage of 127');
});

test('buildCounterHtml zero count shows 0 / 3000', () => {
  const result = buildCounterHtml(0, 'normal', 3000);
  assert.ok(result.includes('0 / 3000'), 'must include 0 / 3000');
});

// Counter placement tests in buildPreviewHtml

test('buildPreviewHtml with non-empty counterHtml includes that HTML', () => {
  const counter = buildCounterHtml(500, 'normal', 3000);
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', counter, DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(result.includes('id="char-counter"'), 'counter HTML must appear in output');
});

test('counter HTML appears after linkedin-card closing div', () => {
  const counter = buildCounterHtml(500, 'normal', 3000);
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', counter, DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  const counterIdx = result.indexOf('id="char-counter"');
  const cardIdx = result.lastIndexOf('class="linkedin-card"');
  assert.ok(counterIdx !== -1, 'char-counter must exist');
  assert.ok(cardIdx !== -1, 'linkedin-card must exist');
  assert.ok(counterIdx > cardIdx, 'counter must appear after linkedin-card');
});

test('counter HTML appears before script tag', () => {
  const counter = buildCounterHtml(500, 'normal', 3000);
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', counter, DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  const counterIdx = result.indexOf('id="char-counter"');
  const scriptIdx = result.indexOf('<script');
  assert.ok(counterIdx !== -1, 'char-counter must exist');
  assert.ok(scriptIdx !== -1, 'script tag must exist');
  assert.ok(counterIdx < scriptIdx, 'counter must appear before script tag');
});

test('counter HTML is not inside post-body', () => {
  const counter = buildCounterHtml(500, 'normal', 3000);
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', counter, DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  const previewContentIdx = result.indexOf('id="preview-content"');
  // Find the closing </div> right after the post-body opening tag
  const postBodyCloseIdx = result.indexOf('</div>', previewContentIdx);
  const counterIdx = result.indexOf('id="char-counter"');
  assert.ok(previewContentIdx !== -1, 'preview-content must exist');
  assert.ok(postBodyCloseIdx !== -1, 'post-body closing div must exist');
  assert.ok(counterIdx !== -1, 'char-counter must exist');
  assert.ok(
    counterIdx > postBodyCloseIdx,
    'char-counter must appear after the post-body closing div, not inside it'
  );
});

// ---------------------------------------------------------------------------
// T19 Emoji picker
// ---------------------------------------------------------------------------

test('HTML contains emoji-data script tag with type application/json', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(result.includes('id="emoji-data"'), 'emoji-data script tag must exist');
  assert.ok(result.includes('type="application/json"'), 'emoji-data must have type application/json');
});

test('emoji-data script tag carries the nonce', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  // Find the emoji-data script tag and confirm it contains the nonce.
  const emojiDataIdx = result.indexOf('id="emoji-data"');
  assert.ok(emojiDataIdx !== -1, 'emoji-data script tag must exist');
  const tagStart = result.lastIndexOf('<script', emojiDataIdx);
  const tagEnd = result.indexOf('>', emojiDataIdx);
  const tag = result.slice(tagStart, tagEnd + 1);
  assert.ok(tag.includes('nonce="abc123"'), 'emoji-data script tag must carry the nonce');
});

test('HTML contains emoji-picker container with hidden attribute', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(result.includes('id="emoji-picker"'), 'emoji-picker div must exist');
  assert.ok(result.includes('hidden'), 'emoji-picker must have hidden attribute');
});

test('HTML contains emoji-picker-btn button', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(result.includes('id="emoji-picker-btn"'), 'emoji-picker-btn button must exist');
});

test('emoji-data JSON parses to an array with ~200 entries', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  const match = result.match(/<script[^>]+id="emoji-data"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(match !== null, 'emoji-data script tag must be present');
  const emojiData = JSON.parse(match![1]);
  assert.ok(Array.isArray(emojiData), 'emoji-data must be a JSON array');
  assert.ok(
    emojiData.length >= 180 && emojiData.length <= 220,
    `expected 180-220 entries, got ${emojiData.length}`
  );
});

test('emoji-data JSON entries all have char, name, group fields', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  const match = result.match(/<script[^>]+id="emoji-data"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(match !== null, 'emoji-data script tag must be present');
  const emojiData = JSON.parse(match![1]) as Array<Record<string, unknown>>;
  for (const entry of emojiData) {
    assert.ok(typeof entry.char === 'string' && entry.char.length > 0,
      `entry missing char: ${JSON.stringify(entry)}`);
    assert.ok(typeof entry.name === 'string' && entry.name.length > 0,
      `entry missing name: ${JSON.stringify(entry)}`);
    assert.ok(typeof entry.group === 'string' && entry.group.length > 0,
      `entry missing group: ${JSON.stringify(entry)}`);
  }
});

test('emoji-picker appears between toolbar and linkedin-card', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  const toolbarIdx = result.indexOf('id="toolbar"');
  const pickerIdx = result.indexOf('id="emoji-picker"');
  const cardIdx = result.indexOf('class="linkedin-card"');
  assert.ok(toolbarIdx !== -1, 'toolbar must exist');
  assert.ok(pickerIdx !== -1, 'emoji-picker must exist');
  assert.ok(cardIdx !== -1, 'linkedin-card must exist');
  assert.ok(toolbarIdx < pickerIdx, 'emoji-picker must appear after toolbar');
  assert.ok(pickerIdx < cardIdx, 'emoji-picker must appear before linkedin-card');
});

test('restoreSelection parameter injects a nonce-carrying JSON block; absent by default (T32)', () => {
  const withRestore = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI, 'serif', { start: 3, end: 9 });
  assert.ok(withRestore.includes('id="restore-selection"'));
  assert.ok(withRestore.includes('<script type="application/json" id="restore-selection" nonce="abc123">{"start":3,"end":9}</script>'));
  const without = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(!without.includes('restore-selection'));
});

test('docUri parameter lands as an escaped body data attribute; absent by default', () => {
  const withUri = buildPreviewHtml('https://csp', 'abc123', 'x', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI, 'serif', null, 'file:///a/b.linkedin');
  assert.ok(withUri.includes('<body data-doc-uri="file:///a/b.linkedin">'));
  const escaped = buildPreviewHtml('https://csp', 'abc123', 'x', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI, 'serif', null, 'file:///a"><script>');
  assert.ok(!escaped.includes('"><script>'), 'docUri must be HTML-escaped');
  const without = buildPreviewHtml('https://csp', 'abc123', 'x', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(without.includes('<body>'), 'plain body tag when no docUri');
});

test('caretOffset parameter lands as a body data attribute; absent when null', () => {
  const withCaret = buildPreviewHtml('https://csp', 'abc123', 'x', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI, 'serif', null, '', 42);
  assert.ok(withCaret.includes('data-caret-offset="42"'));
  const without = buildPreviewHtml('https://csp', 'abc123', 'x', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(!without.includes('data-caret-offset'));
});

test('axisState parameter adds the pressed class to axis buttons; absent by default', () => {
  const pressed = buildPreviewHtml('https://csp', 'abc123', 'x', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI,
    'serif', null, '', null,
    { bold: true, italic: false, boldAvailable: true, italicAvailable: true, mixed: false });
  assert.ok(pressed.includes('class="axis-btn active" id="axis-bold"'),
    'bold button must carry the active class when axisState.bold is true');
  assert.ok(pressed.includes('class="axis-btn" id="axis-italic"'),
    'italic button must not carry the active class when axisState.italic is false');
  const plain = buildPreviewHtml('https://csp', 'abc123', 'x', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(plain.includes('class="axis-btn" id="axis-bold"'),
    'no pressed class without axisState');
});

test('card mimics a LinkedIn post: header, social strip, action bar in order', () => {
  const result = buildPreviewHtml('https://csp', 'abc123', 'hello', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  const headerIdx = result.indexOf('class="post-header"');
  const bodyIdx = result.indexOf('id="preview-content"');
  const socialIdx = result.indexOf('class="post-social"');
  const actionsIdx = result.indexOf('class="post-actions"');
  assert.ok(headerIdx !== -1 && socialIdx !== -1 && actionsIdx !== -1, 'all card sections must exist');
  assert.ok(headerIdx < bodyIdx && bodyIdx < socialIdx && socialIdx < actionsIdx,
    'card sections must be ordered header, body, social, actions');
  assert.ok(result.includes('class="avatar"'), 'ghost avatar must exist');
  for (const label of ['Like', 'Comment', 'Repost', 'Send']) {
    assert.ok(result.includes(`</svg>${label}</span>`), `action bar must include ${label}`);
  }
});

test('axis availability from the selection disables the button server-side', () => {
  const mono = buildPreviewHtml('https://csp', 'abc123', 'x', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI,
    'monospace', null, '', null,
    { bold: false, italic: false, boldAvailable: false, italicAvailable: false, mixed: false });
  assert.ok(/id="axis-bold"[^>]*disabled/.test(mono), 'bold must be disabled for monospace selection');
  assert.ok(/id="axis-italic"[^>]*disabled/.test(mono), 'italic must be disabled for monospace selection');
  const noSelection = buildPreviewHtml('https://csp', 'abc123', 'x', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI, 'fraktur');
  assert.ok(!/id="axis-bold"[^>]*disabled/.test(noSelection), 'fraktur has bold, button enabled');
  assert.ok(/id="axis-italic"[^>]*disabled/.test(noSelection), 'fraktur has no italic, button disabled');
});

test('mixed selection shows a synthetic Mixed dropdown entry and disables nothing', () => {
  const result = buildPreviewHtml('https://csp', 'abc123', 'x', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI,
    'serif', null, '', null,
    { bold: false, italic: false, boldAvailable: true, italicAvailable: true, mixed: true });
  assert.ok(result.includes('<option value="" selected disabled hidden>Mixed</option>'),
    'a hidden Mixed option must be selected');
  assert.ok(!result.includes('data-italic="1" selected'), 'no real family option may be selected');
  assert.ok(!/id="axis-bold"[^>]*disabled/.test(result), 'mixed selection must not disable bold');
  const plain = buildPreviewHtml('https://csp', 'abc123', 'x', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(!plain.includes('>Mixed<'), 'no Mixed entry without a mixed selection');
});

test('theme lands as a body class; daylight stays classless', () => {
  const midnight = buildPreviewHtml('https://csp', 'abc123', 'x', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI,
    'serif', null, '', null, null, { theme: 'midnight' });
  assert.ok(midnight.includes('<body class="theme-midnight">'), 'midnight must set the body class');
  const daylight = buildPreviewHtml('https://csp', 'abc123', 'x', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(daylight.includes('<body>'), 'daylight (default) must not add a class');
});

test('profile name and headline are escaped into the card; initials replace the ghost avatar', () => {
  const result = buildPreviewHtml('https://csp', 'abc123', 'x', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI,
    'serif', null, '', null, null,
    { profileName: 'Ada <Lovelace>', profileHeadline: 'a&b', initials: 'AL' });
  assert.ok(result.includes('Ada &lt;Lovelace&gt; <span class="meta-degree">'), 'name must be escaped');
  assert.ok(result.includes('<div class="meta-headline">a&amp;b</div>'), 'headline must be escaped');
  assert.ok(result.includes('class="avatar avatar-initials"') && result.includes('>AL</div>'),
    'initials avatar must render');
  const ghost = buildPreviewHtml('https://csp', 'abc123', 'x', '', DUMMY_STYLE_URI, DUMMY_SCRIPT_URI);
  assert.ok(ghost.includes('<div class="avatar" aria-hidden="true"></div>'),
    'no initials: ghost silhouette avatar');
  assert.ok(ghost.includes('Your Name'), 'placeholder name by default');
});
