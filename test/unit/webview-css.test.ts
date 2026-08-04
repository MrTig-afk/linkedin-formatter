import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const cssPath = path.resolve(__dirname, '..', '..', '..', 'media', 'webview.css');
const css = fs.readFileSync(cssPath, 'utf-8');

test('webview.css has no url() references (zero egress)', () => {
  assert.ok(!css.includes('url('), 'webview.css must not contain url() — no external resources allowed');
});

test('webview.css has no @import (zero egress)', () => {
  assert.ok(!css.includes('@import'), 'webview.css must not contain @import');
});

test('webview.css sets white-space pre-wrap for line-break preservation', () => {
  assert.ok(
    css.includes('white-space: pre-wrap'),
    'webview.css must set white-space: pre-wrap on .post-body to preserve line breaks without a <pre> tag'
  );
});

test('webview.css does not suppress text selection on post content', () => {
  // user-select: none is permitted on non-content UI chrome (e.g.
  // .truncation-marker) but must never apply to selectors that contain
  // or render post text. Check .post-body and the global * reset.
  const postBodyBlock = css.match(/\.post-body\s*\{[^}]*\}/);
  assert.ok(postBodyBlock, '.post-body rule must exist');
  assert.ok(
    !postBodyBlock[0].includes('user-select'),
    '.post-body must not restrict user-select (post text must be selectable per S5.3)'
  );
  const globalBlock = css.match(/\*\s*\{[^}]*\}/);
  if (globalBlock) {
    assert.ok(
      !globalBlock[0].includes('user-select'),
      'global * rule must not restrict user-select'
    );
  }
});
