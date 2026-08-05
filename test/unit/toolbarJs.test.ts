import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const toolbarPath = path.resolve(__dirname, '..', '..', '..', 'media', 'toolbar.js');
const src = fs.readFileSync(toolbarPath, 'utf-8');

// ---------------------------------------------------------------------------
// No-egress checks: toolbar.js must make zero network calls.
// CSP sets default-src 'none'; any of the APIs below would be blocked at
// runtime but must also not appear in the source (belt and braces).
// ---------------------------------------------------------------------------

test('toolbar.js has no fetch() call', () => {
  assert.ok(!src.includes('fetch('), 'toolbar.js must not call fetch()');
});

test('toolbar.js has no XMLHttpRequest', () => {
  assert.ok(!src.includes('XMLHttpRequest'), 'toolbar.js must not use XMLHttpRequest');
});

test('toolbar.js has no WebSocket', () => {
  assert.ok(!src.includes('WebSocket'), 'toolbar.js must not use WebSocket');
});

test('toolbar.js has no dynamic import()', () => {
  assert.ok(!src.includes('import('), 'toolbar.js must not use dynamic import()');
});

// ---------------------------------------------------------------------------
// T12 message-contract shape: applyStyle
// The postMessage call for style/mark buttons must post exactly
// { type: 'applyStyle', styleId, start, end }.
// ---------------------------------------------------------------------------

test("toolbar.js applyStyle message literal contains type: 'applyStyle'", () => {
  assert.ok(src.includes("type: 'applyStyle'"), "applyStyle postMessage must include type: 'applyStyle'");
});

test('toolbar.js applyStyle message literal contains styleId from data attribute', () => {
  assert.ok(
    src.includes('styleId: btn.dataset.styleId'),
    'applyStyle postMessage must set styleId from btn.dataset.styleId'
  );
});

test('toolbar.js applyStyle message literal contains start and end from resolved offsets', () => {
  // Locate the applyStyle postMessage block and verify start/end appear in it.
  const applyIdx = src.indexOf("type: 'applyStyle'");
  assert.ok(applyIdx !== -1, "type: 'applyStyle' not found");
  const blockStart = src.lastIndexOf('vscode.postMessage', applyIdx);
  const blockEnd = src.indexOf('});', applyIdx);
  const block = src.slice(blockStart, blockEnd + 3);
  assert.ok(block.includes('start: offsets.start'), 'applyStyle block must include start: offsets.start');
  assert.ok(block.includes('end: offsets.end'), 'applyStyle block must include end: offsets.end');
});

// ---------------------------------------------------------------------------
// T12 message-contract shape: clearFormatting
// The postMessage call for the clear button must post exactly
// { type: 'clearFormatting', start, end } -- no styleId.
// ---------------------------------------------------------------------------

test("toolbar.js clearFormatting message literal contains type: 'clearFormatting'", () => {
  assert.ok(src.includes("type: 'clearFormatting'"), "clearFormatting postMessage must include type: 'clearFormatting'");
});

test('toolbar.js clearFormatting message literal has no styleId field', () => {
  const clearIdx = src.indexOf("type: 'clearFormatting'");
  assert.ok(clearIdx !== -1, "type: 'clearFormatting' not found");
  const blockStart = src.lastIndexOf('vscode.postMessage', clearIdx);
  const blockEnd = src.indexOf('});', clearIdx);
  const block = src.slice(blockStart, blockEnd + 3);
  assert.ok(!block.includes('styleId'), 'clearFormatting block must not contain styleId');
});

test('toolbar.js clearFormatting message literal contains start and end from resolved offsets', () => {
  const clearIdx = src.indexOf("type: 'clearFormatting'");
  assert.ok(clearIdx !== -1, "type: 'clearFormatting' not found");
  const blockStart = src.lastIndexOf('vscode.postMessage', clearIdx);
  const blockEnd = src.indexOf('});', clearIdx);
  const block = src.slice(blockStart, blockEnd + 3);
  assert.ok(block.includes('start: offsets.start'), 'clearFormatting block must include start: offsets.start');
  assert.ok(block.includes('end: offsets.end'), 'clearFormatting block must include end: offsets.end');
});

// ---------------------------------------------------------------------------
// CSP: no inline event handlers in the script itself (addEventListener only).
// toolbar.js must wire all handlers via addEventListener, never via
// element.onclick = ... or similar assignment.
// ---------------------------------------------------------------------------

test('toolbar.js uses addEventListener for all event wiring, not inline assignment', () => {
  assert.ok(!src.includes('.onclick ='), 'toolbar.js must not assign .onclick');
  assert.ok(!src.includes('.onmousedown ='), 'toolbar.js must not assign .onmousedown');
  assert.ok(!src.includes('.oninput ='), 'toolbar.js must not assign .oninput');
  assert.ok(src.includes('addEventListener'), 'toolbar.js must use addEventListener');
});

// ---------------------------------------------------------------------------
// T16 message-contract shape: cursorSync
// The click handler must post { type: 'cursorSync', offset } derived from
// the clicked span's data-offset, and only when the selection is collapsed.
// ---------------------------------------------------------------------------

test("toolbar.js cursorSync message literal contains type: 'cursorSync'", () => {
  assert.ok(src.includes("type: 'cursorSync'"),
    "cursorSync postMessage must include type: 'cursorSync'");
});

test('toolbar.js cursorSync message literal contains offset from span dataset', () => {
  const csIdx = src.indexOf("type: 'cursorSync'");
  assert.ok(csIdx !== -1, "type: 'cursorSync' not found");
  const blockStart = src.lastIndexOf('vscode.postMessage', csIdx);
  const blockEnd = src.indexOf('});', csIdx);
  const block = src.slice(blockStart, blockEnd + 3);
  assert.ok(block.includes('offset:'),
    'cursorSync postMessage block must include offset field');
  assert.ok(block.includes('span.dataset.offset'),
    'cursorSync offset must come from span.dataset.offset');
});

test('toolbar.js cursorSync handler checks isCollapsed', () => {
  assert.ok(src.includes('isCollapsed'),
    'cursor sync click handler must check isCollapsed to distinguish click from drag');
});

test('toolbar.js cursorSync offset is parsed as integer with parseInt radix 10', () => {
  const csIdx = src.indexOf("type: 'cursorSync'");
  assert.ok(csIdx !== -1, "type: 'cursorSync' not found");
  const blockStart = src.lastIndexOf('vscode.postMessage', csIdx);
  const blockEnd = src.indexOf('});', csIdx);
  const block = src.slice(blockStart, blockEnd + 3);
  assert.ok(
    block.includes('parseInt(span.dataset.offset, 10)'),
    'cursorSync offset must use parseInt(span.dataset.offset, 10) to guarantee an integer'
  );
});

test('toolbar.js cursorSync click listener is bound on body (#preview-content), not document or window', () => {
  // Toolbar buttons live outside #preview-content so their clicks must not
  // bubble to the cursorSync handler.  The CLICK listener must be on body,
  // never on document or window.
  //
  // Narrowed in M4.2 from a blanket ban on document/window listeners to a ban
  // on CLICK listeners specifically. The invariant this test documents has
  // always been about click bubbling; the blanket form also forbade
  // window.addEventListener('message'), which is the only API for receiving
  // updates from the extension and is what lets the card update in place
  // instead of reloading the whole page on every keystroke.
  assert.ok(
    !src.includes("document.addEventListener('click'"),
    'toolbar.js must not attach any click listener to document'
  );
  assert.ok(
    !src.includes("window.addEventListener('click'"),
    'toolbar.js must not attach any click listener to window'
  );
  const csIdx = src.indexOf("type: 'cursorSync'");
  assert.ok(csIdx !== -1, "type: 'cursorSync' not found");
  const listenerIdx = src.lastIndexOf("body.addEventListener('click'", csIdx);
  assert.ok(
    listenerIdx !== -1,
    "cursorSync must be inside a body.addEventListener('click') block, not a document/window listener"
  );
});

test('toolbar.js cursorSync isCollapsed guard precedes closestOffsetSpan call', () => {
  // Drag-select must be filtered before any DOM traversal.
  const clickStart = src.indexOf("body.addEventListener('click'");
  const csIdx = src.indexOf("type: 'cursorSync'");
  assert.ok(clickStart !== -1 && csIdx !== -1, 'click handler and cursorSync literal must both exist');
  const handlerBlock = src.slice(clickStart, csIdx);
  const collapsedPos = handlerBlock.indexOf('isCollapsed');
  const spanLookupPos = handlerBlock.indexOf('closestOffsetSpan');
  assert.ok(collapsedPos !== -1, 'isCollapsed must appear before the cursorSync postMessage');
  assert.ok(spanLookupPos !== -1, 'closestOffsetSpan call must appear before the cursorSync postMessage');
  assert.ok(
    collapsedPos < spanLookupPos,
    'isCollapsed check must come before the closestOffsetSpan call (drag-select guard must fire first)'
  );
});

// ---------------------------------------------------------------------------
// T19 Emoji picker
// ---------------------------------------------------------------------------

test("toolbar.js insertEmoji message literal contains type: 'insertEmoji'", () => {
  assert.ok(
    src.includes("type: 'insertEmoji'"),
    "insertEmoji postMessage must include type: 'insertEmoji'"
  );
});

test("toolbar.js reads emoji data from #emoji-data element, not a hardcoded list", () => {
  assert.ok(
    src.includes("getElementById('emoji-data')"),
    "toolbar.js must read emoji data from #emoji-data element"
  );
  assert.ok(
    !src.includes('var emojiList = ['),
    "toolbar.js must not contain a hardcoded emoji array literal"
  );
});

test('toolbar.js insertEmoji uses dataset.emoji', () => {
  assert.ok(
    src.includes('dataset.emoji'),
    "insertEmoji must use dataset.emoji to get the emoji char"
  );
});

// ---------------------------------------------------------------------------
// v1.2 family toolbar: toggleAxis, convertFamily, setFamily
// ---------------------------------------------------------------------------

test("toolbar.js toggleAxis message posts axis from data attribute with offsets", () => {
  const idx = src.indexOf("type: 'toggleAxis'");
  assert.ok(idx !== -1, "type: 'toggleAxis' not found");
  const blockStart = src.lastIndexOf('vscode.postMessage', idx);
  const blockEnd = src.indexOf('});', idx);
  const block = src.slice(blockStart, blockEnd + 3);
  assert.ok(block.includes('axis: btn.dataset.axis'), 'axis must come from btn.dataset.axis');
  assert.ok(block.includes('start: start'), 'toggleAxis block must include start');
  assert.ok(block.includes('end: end'), 'toggleAxis block must include end');

  // Issue #2: with no selection the handler sends a COLLAPSED range rather
  // than bailing out, and the extension reads that as "latch this axis for
  // typing". Previously it interpolated offsets.start/end directly and
  // returned early when there was no selection.
  // Slice from the AXIS handler specifically. ".axis-btn" also appears in the
  // combined mousedown selector at the top of the file, and starting there
  // would scan the mark-button handler, which legitimately does bail out.
  const handler = src.slice(src.indexOf("querySelectorAll('.axis-btn')"), idx);
  assert.ok(
    handler.includes('offsets ? offsets.start : 0'),
    'axis handler must fall back to a collapsed range when nothing is selected'
  );
  assert.ok(
    !handler.includes('if (!offsets) { return; }'),
    'axis handler must NOT bail out when there is no selection (issue #2)'
  );
});

test('toolbar.js axis button handler respects disabled state', () => {
  const handlerIdx = src.indexOf('.axis-btn');
  assert.ok(handlerIdx !== -1, 'axis-btn handler must exist');
  assert.ok(src.includes('if (btn.disabled) { return; }'),
    'axis handler must no-op when the button is disabled');
});

test("toolbar.js convertFamily message carries family, start, end", () => {
  const idx = src.indexOf("type: 'convertFamily'");
  assert.ok(idx !== -1, "type: 'convertFamily' not found");
  const blockStart = src.lastIndexOf('vscode.postMessage', idx);
  const blockEnd = src.indexOf('});', idx);
  const block = src.slice(blockStart, blockEnd + 3);
  assert.ok(block.includes('family: family'), 'convertFamily must carry the family value');
  assert.ok(block.includes('start: offsets.start') && block.includes('end: offsets.end'),
    'convertFamily must carry the selection offsets');
});

test("toolbar.js setFamily message is posted when no selection offsets resolve", () => {
  assert.ok(src.includes("type: 'setFamily'"), "type: 'setFamily' not found");
  const changeIdx = src.indexOf("familySelect.addEventListener('change'");
  assert.ok(changeIdx !== -1, 'family select change handler must exist');
  const convertIdx = src.indexOf("type: 'convertFamily'", changeIdx);
  const setIdx = src.indexOf("type: 'setFamily'", changeIdx);
  assert.ok(convertIdx !== -1 && setIdx !== -1 && convertIdx < setIdx,
    'change handler must prefer convertFamily (selection) and fall back to setFamily');
});

test('toolbar.js caches selection offsets on family-select mousedown', () => {
  const mdIdx = src.indexOf("familySelect.addEventListener('mousedown'");
  assert.ok(mdIdx !== -1, 'family select mousedown handler must exist');
  const block = src.slice(mdIdx, src.indexOf('});', mdIdx) + 3);
  assert.ok(block.includes('cachedOffsets = resolveSelectionOffsets()'),
    'mousedown must cache offsets before the dropdown steals the selection');
});

test('toolbar.js updates axis button disabled state from selected option dataset', () => {
  assert.ok(src.includes('updateAxisButtonState'), 'axis state updater must exist');
  assert.ok(src.includes("dataset.bold !== '1'") && src.includes("dataset.italic !== '1'"),
    'disabled state must derive from the option data-bold/data-italic attributes');
});

// ---------------------------------------------------------------------------
// T32 selection restoration
// ---------------------------------------------------------------------------

test('toolbar.js restores selection from #restore-selection JSON block', () => {
  assert.ok(src.includes("getElementById('restore-selection')"),
    'toolbar.js must read the restore-selection block');
  assert.ok(src.includes('range.setStart(startText, 0)') && src.includes('range.setEnd(endText'),
    'restoration must anchor in the spans TEXT NODES so the restored ' +
    'selection resolves through closestOffsetSpan for follow-up edits');
  assert.ok(src.includes('removeAllRanges') && src.includes('addRange'),
    'restoration must replace the window selection');
});

test('toolbar.js selection restore fails closed on malformed data', () => {
  const idx = src.indexOf('function restoreSelection');
  assert.ok(idx !== -1, 'restoreSelection block must exist');
  const block = src.slice(idx, src.indexOf('})();', idx));
  assert.ok(block.includes('try'), 'JSON.parse must be guarded');
  assert.ok(block.includes("typeof target.start !== 'number'"),
    'restore data shape must be checked before use');
});

test('toolbar.js persists the tracked doc uri via setState for panel revival', () => {
  assert.ok(src.includes("getAttribute('data-doc-uri')"), 'must read the doc uri from the body');
  assert.ok(src.includes('vscode.setState({ uri: docUri })'), 'must persist it via setState');
});

test('toolbar.js inserts a caret marker from data-caret-offset', () => {
  assert.ok(src.includes("getAttribute('data-caret-offset')"), 'must read the caret offset');
  assert.ok(src.includes("marker.className = 'caret-marker'"), 'must create the caret marker element');
});

test('toolbar.js posts undo/redo on ctrl-z / ctrl-y without payload', () => {
  assert.ok(src.includes("vscode.postMessage({ type: 'undo' })"), 'undo message must be bare');
  assert.ok(src.includes("vscode.postMessage({ type: 'redo' })"), 'redo message must be bare');
  // The chords now live in the keymap table rather than in inline key checks.
  // Mod resolves to Ctrl on Windows/Linux and Cmd on macOS.
  assert.ok(src.includes("{ key: 'Mod-z',"), 'undo must be bound to Mod-z');
  assert.ok(src.includes("{ key: 'Mod-y',"), 'redo must be bound to Mod-y');
  assert.ok(src.includes("{ key: 'Mod-Shift-z',"), 'redo must also be bound to Mod-Shift-z');
});

// ---------------------------------------------------------------------------
// The keymap: one table, one listener
// ---------------------------------------------------------------------------

test('toolbar.js has exactly ONE keydown listener', () => {
  // Four independent handlers each doing their own modifier checks could not
  // stay coherent once Shift variants and a platform split were added.
  const listeners = src.match(/addEventListener\('keydown'/g) ?? [];
  assert.equal(listeners.length, 1,
    `expected a single keydown listener, found ${listeners.length}`);
});

test('the keymap splits Windows and macOS where the platforms genuinely differ', () => {
  // On macOS Cmd+Backspace means "delete to line start", so treating Ctrl and
  // Cmd as interchangeable would delete a word when the user asked for a line.
  // That is a wrong deletion, not a missing feature.
  assert.ok(src.includes("mac: 'Alt-Backspace'"),
    'word-delete-backward must be Option+Backspace on macOS');
  assert.ok(src.includes("mac: 'Alt-Delete'"),
    'word-delete-forward must be Option+Delete on macOS');
  assert.ok(/IS_MAC\s*=/.test(src), 'the keymap must detect the platform');
});

test('the keymap never acts during an IME composition', () => {
  // Mutating the DOM mid-composition aborts it, which would break CJK input.
  assert.ok(src.includes('e.isComposing'), 'must check isComposing');
  assert.ok(src.includes('229'), 'must also guard the legacy keyCode 229 signal');
});

// ---------------------------------------------------------------------------
// Selection persistence: mouseup reporting
// ---------------------------------------------------------------------------

test('toolbar.js posts selectionState on every mouseup gesture, undeduped', () => {
  assert.ok(src.includes("type: 'selectionState'"), 'selectionState message must exist');
  assert.ok(src.includes("document.body.addEventListener('mouseup'"),
    'selection reporting must hook mouseup on document.body');
  // Deliberately NOT deduped against lastSelState: the extension clears its
  // copy on any setCaret, so an identical-looking report can still be news.
  // Skipping it left the webview showing a selection the extension had
  // forgotten. Loops are impossible anyway - renders never fire mouseup and
  // the report is debounced per gesture.
  assert.ok(!src.includes('start === lastSelState.start && end === lastSelState.end'),
    'selectionState must not be deduped; a dropped report desyncs the two sides');
});

test('toolbar.js primes lastSelState from a restored selection', () => {
  const restoreIdx = src.indexOf('function restoreSelection');
  assert.ok(restoreIdx !== -1, 'restoreSelection block must exist');
  const block = src.slice(restoreIdx, src.indexOf('})();', restoreIdx));
  assert.ok(block.includes('lastSelState = { start: target.start, end: target.end }'),
    'restored selection must not be re-reported as a change');
});

// ---------------------------------------------------------------------------
// Double-click protection
// ---------------------------------------------------------------------------

test('toolbar.js defers cursorSync and re-checks isCollapsed so a double-click cancels it', () => {
  const clickStart = src.indexOf("body.addEventListener('click'");
  const csIdx = src.indexOf("type: 'cursorSync'");
  assert.ok(clickStart !== -1 && csIdx !== -1, 'click handler and cursorSync must exist');
  const handlerBlock = src.slice(clickStart, csIdx);
  assert.ok(handlerBlock.includes('cursorSyncTimer = setTimeout('),
    'cursorSync must be posted from a timer, not synchronously');
  assert.ok(handlerBlock.includes('clearTimeout(cursorSyncTimer)'),
    'a rapid second click must cancel the pending cursorSync');
  const timerBody = src.slice(handlerBlock.lastIndexOf('setTimeout') + clickStart, csIdx);
  assert.ok(timerBody.includes('isCollapsed'),
    'the timer must re-check isCollapsed at fire time (double-click made a word selection)');
});

test('toolbar.js debounces selectionState past the double-click window', () => {
  const muIdx = src.indexOf("document.body.addEventListener('mouseup'");
  assert.ok(muIdx !== -1, 'mouseup handler must exist');
  const block = src.slice(muIdx, src.indexOf('});', src.indexOf('selStateTimer = setTimeout', muIdx)) + 3);
  assert.ok(block.includes('clearTimeout(selStateTimer)'),
    'each mouseup must reset the pending selectionState report');
});

test('toolbar.js does not report selection state for toolbar or emoji-picker mouseups', () => {
  const muIdx = src.indexOf("document.body.addEventListener('mouseup'");
  const block = src.slice(muIdx, src.indexOf('selStateTimer = setTimeout', muIdx));
  assert.ok(block.includes("el.id === 'toolbar'") && block.includes("el.id === 'emoji-picker'"),
    'mouseup on toolbar/emoji-picker must not post selectionState (the dropdown steals the selection)');
});

// ---------------------------------------------------------------------------
// M4.2 render channel: the webview must never parse markup
// ---------------------------------------------------------------------------

test('toolbar.js never assigns innerHTML or outerHTML', () => {
  // The extension sends structured units over the render channel, never HTML.
  // Because nothing here is parsed as markup, there is no injection sink on
  // that channel at all - the CSP is a second line of defence, not the only
  // one. Added when the render channel opened in M4.2; if this ever fails,
  // the channel gained a sink and the threat model changed with it.
  assert.ok(
    !/\.\s*innerHTML\s*=/.test(src),
    'toolbar.js must not assign innerHTML'
  );
  assert.ok(
    !/\.\s*outerHTML\s*=/.test(src),
    'toolbar.js must not assign outerHTML'
  );
  assert.ok(
    !src.includes('insertAdjacentHTML'),
    'toolbar.js must not call insertAdjacentHTML'
  );
  assert.ok(
    !src.includes('document.write'),
    'toolbar.js must not call document.write'
  );
});

test('toolbar.js shape-checks inbound render messages before using them', () => {
  // event.data is untrusted input arriving on a new inbound boundary.
  assert.ok(
    src.includes("window.addEventListener('message'"),
    'toolbar.js must listen for render messages from the extension'
  );
  assert.ok(
    src.includes('isRenderPayload'),
    'inbound render messages must be shape-checked before use'
  );
});
