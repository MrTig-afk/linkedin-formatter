import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { escapeHtml } from '../../src/lib/html';
import { buildPreviewHtml, LINKEDIN_POST_WIDTH_PX } from '../../src/webview/html';

const DUMMY_SCRIPT_URI = 'https://file+.vscode-resource.test/media/toolbar.js';

test('escapeHtml escapes markup-significant characters', () => {
  assert.equal(
    escapeHtml('<script>alert("x")</script>'),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
  );
  assert.equal(escapeHtml("a & b's <tag>"), 'a &amp; b&#39;s &lt;tag&gt;');
});

test('escapeHtml leaves plain and non-ASCII text unchanged', () => {
  assert.equal(escapeHtml('plain text'), 'plain text');
  assert.equal(escapeHtml('𝐛𝐨𝐥𝐝 𝑖𝑡𝑎𝑙𝑖𝑐'), '𝐛𝐨𝐥𝐝 𝑖𝑡𝑎𝑙𝑖𝑐');
  assert.equal(escapeHtml(''), '');
});

test('LINKEDIN_POST_WIDTH_PX is 555', () => {
  assert.equal(LINKEDIN_POST_WIDTH_PX, 555);
});

test('buildPreviewHtml inlines the stylesheet under the nonce', () => {
  const cssText = '.marker { color: red; }';
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', cssText, DUMMY_SCRIPT_URI);
  assert.ok(result.includes(`<style nonce="abc123">${cssText}</style>`));
});

test('buildPreviewHtml renders card structure', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', 'dummy-uri', DUMMY_SCRIPT_URI);
  assert.ok(result.includes('class="linkedin-card"'));
  assert.ok(result.includes('class="post-header"'));
  assert.ok(result.includes('class="avatar"'));
  assert.ok(result.includes('class="meta-name"'));
  assert.ok(result.includes('class="post-body"'));
});

test('buildPreviewHtml places escaped body inside post-body div', () => {
  const body = '&lt;script&gt;alert(1)&lt;/script&gt;';
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', body, '', 'dummy-uri', DUMMY_SCRIPT_URI);
  assert.ok(result.includes(
    `<div class="post-body" id="preview-content">${body}</div>`
  ));
});

test('buildPreviewHtml does not use pre tag', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', 'dummy-uri', DUMMY_SCRIPT_URI);
  assert.ok(!result.includes('<pre>'));
});

test('buildPreviewHtml locks style-src to the nonce', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', 'dummy-css', DUMMY_SCRIPT_URI);
  assert.ok(result.includes("style-src 'nonce-abc123'"));
  assert.ok(!result.includes('unsafe-inline'));
});

test('buildPreviewHtml has no inline style attributes', () => {
  const result = buildPreviewHtml('https://test-csp-source', 'abc123', 'hello', '', 'dummy-css', DUMMY_SCRIPT_URI);
  assert.ok(!result.includes(' style='), 'output must not contain inline style= attributes (CSP blocks unsafe-inline)');
});
