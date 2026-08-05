(function () {
  var vscode = acquireVsCodeApi();
  var body = document.getElementById('preview-content');

  // Persist the tracked document so a window restore can revive the panel
  // (the extension's WebviewPanelSerializer reads this state back).
  var docUri = document.body.getAttribute('data-doc-uri');
  if (docUri) { vscode.setState({ uri: docUri }); }

  // ---------------------------------------------------------------
  // Selection preservation: prevent mousedown on any toolbar button
  // from moving focus away from the post body and collapsing the
  // text selection. This is load-bearing.
  // ---------------------------------------------------------------
  document.querySelectorAll('.axis-btn, .mark-btn, .clear-btn').forEach(function (btn) {
    btn.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });
  });

  // ---------------------------------------------------------------
  // closestOffsetSpan: walk from a DOM node up to the nearest
  // ancestor <span> carrying data-offset, stopping at #preview-content.
  // ---------------------------------------------------------------
  function closestOffsetSpan(node) {
    var el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (el && el !== body) {
      if (el.tagName === 'SPAN' && el.dataset.offset !== undefined) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  // ---------------------------------------------------------------
  // resolveSelectionOffsets: map the current window selection to
  // UTF-16 document offsets using span data attributes.
  //
  // Returns { start: number, end: number } or null.
  // ---------------------------------------------------------------
  function resolveSelectionOffsets() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { return null; }

    var range = sel.getRangeAt(0);

    // Both endpoints must be inside the post body.
    if (!body || !body.contains(range.startContainer) ||
        !body.contains(range.endContainer)) {
      return null;
    }

    var startSpan = closestOffsetSpan(range.startContainer);

    // End span: if range.endOffset is 0 and the end container is
    // the first child of the span, the selection ends BEFORE this
    // span (at the boundary). Walk to the previous sibling span.
    var endSpan = closestOffsetSpan(range.endContainer);
    if (endSpan && range.endOffset === 0 &&
        range.endContainer === endSpan.firstChild) {
      var prev = endSpan.previousElementSibling;
      if (prev && prev.tagName === 'SPAN' &&
          prev.dataset.offset !== undefined) {
        endSpan = prev;
      } else {
        // No previous span -- degenerate selection.
        return null;
      }
    }

    if (!startSpan || !endSpan) { return null; }

    var start = parseInt(startSpan.dataset.offset, 10);
    var end = parseInt(endSpan.dataset.offset, 10) +
              parseInt(endSpan.dataset.len, 10);

    if (start >= end) { return null; }

    return { start: start, end: end };
  }

  // ---------------------------------------------------------------
  // Button click handlers
  // ---------------------------------------------------------------

  // Combining mark buttons (strikethrough, underline)
  document.querySelectorAll('.mark-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var offsets = resolveSelectionOffsets();
      if (!offsets) { return; }
      vscode.postMessage({
        type: 'applyStyle',
        styleId: btn.dataset.styleId,
        start: offsets.start,
        end: offsets.end
      });
    });
  });

  // Axis buttons: toggle the bold/italic axis of the selection.
  document.querySelectorAll('.axis-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.disabled) { return; }
      var offsets = resolveSelectionOffsets();
      if (!offsets) { return; }
      vscode.postMessage({
        type: 'toggleAxis',
        axis: btn.dataset.axis,
        start: offsets.start,
        end: offsets.end
      });
    });
  });

  // Family dropdown. Opening the native dropdown moves focus, which can
  // collapse the text selection, so the offsets are cached on mousedown
  // (while the selection is still alive) and used at change time.
  var familySelect = document.getElementById('family-select');
  var cachedOffsets = null;

  function updateAxisButtonState() {
    if (!familySelect || familySelect.selectedIndex === -1) { return; }
    var opt = familySelect.options[familySelect.selectedIndex];
    if (!opt) { return; }
    var familyName = opt.textContent;
    var boldBtn = document.getElementById('axis-bold');
    var italicBtn = document.getElementById('axis-italic');
    if (boldBtn) {
      boldBtn.disabled = opt.dataset.bold !== '1';
      boldBtn.title = boldBtn.disabled
        ? 'Unicode has no bold ' + familyName + ' alphabet'
        : 'Bold (Ctrl+B)';
    }
    if (italicBtn) {
      italicBtn.disabled = opt.dataset.italic !== '1';
      italicBtn.title = italicBtn.disabled
        ? 'Unicode has no italic ' + familyName + ' alphabet'
        : 'Italic (Ctrl+I)';
    }
  }

  if (familySelect) {
    var prevFamilyValue = familySelect.value;

    familySelect.addEventListener('mousedown', function () {
      cachedOffsets = resolveSelectionOffsets();
      // Native selects fire no change event when the SAME option is picked
      // again, but re-applying the current family to a new selection is a
      // legitimate action. Blanking the selection while the dropdown is
      // open forces change to fire for every pick.
      if (cachedOffsets) {
        prevFamilyValue = familySelect.value;
        familySelect.selectedIndex = -1;
      }
    });

    // Dropdown dismissed without picking anything: restore the display.
    familySelect.addEventListener('blur', function () {
      if (familySelect.selectedIndex === -1) {
        familySelect.value = prevFamilyValue;
        updateAxisButtonState();
      }
    });

    familySelect.addEventListener('change', function () {
      if (familySelect.selectedIndex === -1) { return; }
      var offsets = resolveSelectionOffsets() || cachedOffsets;
      cachedOffsets = null;
      prevFamilyValue = familySelect.value;
      updateAxisButtonState();
      var family = familySelect.value;
      if (offsets) {
        vscode.postMessage({
          type: 'convertFamily',
          family: family,
          start: offsets.start,
          end: offsets.end
        });
      } else {
        vscode.postMessage({ type: 'setFamily', family: family });
      }
    });

    // No init call: the server-rendered disabled/pressed state is
    // authoritative at load (it knows the selection; the dropdown may
    // show a synthetic Mixed entry). This updater covers live picks only.
  }

  // Clear formatting button
  var clearBtn = document.getElementById('clear-formatting-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      var offsets = resolveSelectionOffsets();
      if (!offsets) { return; }
      vscode.postMessage({
        type: 'clearFormatting',
        start: offsets.start,
        end: offsets.end
      });
    });
  }

  // ---------------------------------------------------------------
  // T16 Cursor sync: a click that collapses to a caret posts the
  // span's data-offset so the extension can move the left-pane cursor.
  // Deferred, then re-checked: posting immediately would move the editor
  // caret and re-render the card between the two clicks of a double-click,
  // tearing down the word selection the second click is about to make.
  // ---------------------------------------------------------------
  var cursorSyncTimer = null;

  body.addEventListener('click', function (e) {
    var sel = window.getSelection();
    if (!sel || !sel.isCollapsed) { return; }

    var span = closestOffsetSpan(e.target);
    if (!span) { return; }

    if (cursorSyncTimer !== null) { clearTimeout(cursorSyncTimer); }
    cursorSyncTimer = setTimeout(function () {
      cursorSyncTimer = null;
      // A double-click landed in the meantime: the selection is a word
      // now, not a caret. Do not move the editor cursor.
      var now = window.getSelection();
      if (!now || !now.isCollapsed) { return; }
      vscode.postMessage({
        type: 'cursorSync',
        offset: parseInt(span.dataset.offset, 10)
      });
    }, 200);
  });

  // ---------------------------------------------------------------
  // T19 Emoji picker
  // ---------------------------------------------------------------

  // Read emoji data from the injected JSON block (no hardcoded list).
  var emojiDataEl = document.getElementById('emoji-data');
  var emojiList = emojiDataEl ? JSON.parse(emojiDataEl.textContent) : [];

  var emojiPickerBtn = document.getElementById('emoji-picker-btn');
  var emojiPicker = document.getElementById('emoji-picker');
  var emojiSearch = document.getElementById('emoji-search');
  var populated = false;

  // Prevent mousedown from collapsing text selection (same pattern as style buttons).
  if (emojiPickerBtn) {
    emojiPickerBtn.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });

    emojiPickerBtn.addEventListener('click', function () {
      if (!emojiPicker) { return; }
      if (emojiPicker.hasAttribute('hidden')) {
        // Populate the grid on first open (lazy).
        if (!populated) {
          populateEmojiGrid();
          populated = true;
        }
        emojiPicker.removeAttribute('hidden');
      } else {
        emojiPicker.setAttribute('hidden', '');
      }
    });
  }

  function populateEmojiGrid() {
    var groupsEl = document.getElementById('emoji-groups');
    if (!groupsEl) { return; }

    var currentGroup = null;
    for (var i = 0; i < emojiList.length; i++) {
      var entry = emojiList[i];
      if (entry.group !== currentGroup) {
        currentGroup = entry.group;
        var header = document.createElement('div');
        header.className = 'emoji-group-header';
        header.textContent = entry.group;
        groupsEl.appendChild(header);
      }
      var btn = document.createElement('button');
      btn.className = 'emoji-item';
      btn.dataset.emoji = entry.char;
      btn.dataset.name = entry.name;
      btn.title = entry.name;
      btn.textContent = entry.char;
      groupsEl.appendChild(btn);
    }
  }

  // Search filter: show/hide items and headers on each keystroke.
  if (emojiSearch) {
    emojiSearch.addEventListener('input', function () {
      var groupsEl = document.getElementById('emoji-groups');
      if (!groupsEl) { return; }

      var query = emojiSearch.value.toLowerCase();
      var headers = groupsEl.querySelectorAll('.emoji-group-header');
      var items = groupsEl.querySelectorAll('.emoji-item');

      if (!query) {
        headers.forEach(function (h) { h.removeAttribute('hidden'); });
        items.forEach(function (b) { b.removeAttribute('hidden'); });
        return;
      }

      // Show/hide individual items.
      items.forEach(function (item) {
        var name = item.dataset.name || '';
        if (name.includes(query)) {
          item.removeAttribute('hidden');
        } else {
          item.setAttribute('hidden', '');
        }
      });

      // Hide group headers whose items are all hidden.
      headers.forEach(function (header) {
        var next = header.nextElementSibling;
        var hasVisible = false;
        while (next && !next.classList.contains('emoji-group-header')) {
          if (!next.hasAttribute('hidden')) {
            hasVisible = true;
            break;
          }
          next = next.nextElementSibling;
        }
        if (hasVisible) {
          header.removeAttribute('hidden');
        } else {
          header.setAttribute('hidden', '');
        }
      });
    });
  }

  // Last selection reported to the extension; also primed by the
  // restore block below so a restored selection is not re-reported.
  var lastSelState = { start: 0, end: 0 };

  // ---------------------------------------------------------------
  // T32 Selection restoration: after a style-triggered re-render the
  // extension injects a #restore-selection JSON block with the UTF-16
  // range of the replacement. Re-select the spans covering it so a
  // second toolbar click can toggle without re-dragging. Best-effort:
  // any mismatch (document moved underneath) drops the restore.
  // ---------------------------------------------------------------
  (function restoreSelection() {
    var restoreEl = document.getElementById('restore-selection');
    if (!restoreEl || !body) { return; }

    var target;
    try {
      target = JSON.parse(restoreEl.textContent);
    } catch (err) {
      return;
    }
    if (!target || typeof target.start !== 'number' ||
        typeof target.end !== 'number' || target.start >= target.end) {
      return;
    }

    var spans = body.querySelectorAll('span[data-offset]');
    var startSpan = null;
    var endSpan = null;
    for (var i = 0; i < spans.length; i++) {
      var off = parseInt(spans[i].dataset.offset, 10);
      var len = parseInt(spans[i].dataset.len, 10);
      if (startSpan === null && off + len > target.start) { startSpan = spans[i]; }
      if (off < target.end) { endSpan = spans[i]; }
    }
    if (!startSpan || !endSpan) { return; }

    // Anchor in the spans' TEXT NODES, not at element boundaries:
    // resolveSelectionOffsets walks up from the range containers via
    // closestOffsetSpan, and an element-boundary anchor resolves to the
    // post body itself, making the restored selection unresolvable -- the
    // next toolbar action on it would silently no-op.
    var startText = startSpan.firstChild;
    var endText = endSpan.lastChild;
    if (!startText || !endText || endText.nodeType !== Node.TEXT_NODE ||
        startText.nodeType !== Node.TEXT_NODE) { return; }

    var range = document.createRange();
    range.setStart(startText, 0);
    range.setEnd(endText, endText.textContent.length);
    var sel = window.getSelection();
    if (!sel) { return; }
    sel.removeAllRanges();
    sel.addRange(range);
    lastSelState = { start: target.start, end: target.end };
  })();

  // ---------------------------------------------------------------
  // Selection reporting: after any mouseup, tell the extension what is
  // selected so it survives re-renders (caret mirror, counter updates)
  // and the toolbar can reflect the selection's family and axes.
  // Deduped against the last reported state so re-renders cannot loop.
  // ---------------------------------------------------------------
  function postSelectionState() {
    var offsets = resolveSelectionOffsets();
    var start = offsets ? offsets.start : 0;
    var end = offsets ? offsets.end : 0;
    if (start === lastSelState.start && end === lastSelState.end) { return; }
    lastSelState = { start: start, end: end };
    vscode.postMessage({ type: 'selectionState', start: start, end: end });
  }

  var selStateTimer = null;

  document.body.addEventListener('mouseup', function (e) {
    // Toolbar and picker interactions manage the selection themselves: a
    // mouseup there (dropdown pick, button release) must not report the
    // focus-stolen selection as cleared and wipe the pending restore.
    var el = e.target && e.target.nodeType === Node.ELEMENT_NODE ? e.target : null;
    while (el && el !== document.body) {
      if (el.id === 'toolbar' || el.id === 'emoji-picker') { return; }
      el = el.parentElement;
    }
    // Debounced past the double-click window: reporting the first click's
    // collapsed state would re-render the card mid-double-click.
    if (selStateTimer !== null) { clearTimeout(selStateTimer); }
    selStateTimer = setTimeout(function () {
      selStateTimer = null;
      postSelectionState();
    }, 350);
  });

  // ---------------------------------------------------------------
  // Caret mirror: the extension passes the left editor's cursor offset;
  // a thin marker shows where typed text and emoji will land.
  // ---------------------------------------------------------------
  (function showCaretMarker() {
    var attr = document.body.getAttribute('data-caret-offset');
    if (attr === null || !body) { return; }
    var caret = parseInt(attr, 10);
    if (isNaN(caret) || caret < 0) { return; }

    var marker = document.createElement('span');
    marker.className = 'caret-marker';

    var spans = body.querySelectorAll('span[data-offset]');
    for (var i = 0; i < spans.length; i++) {
      if (parseInt(spans[i].dataset.offset, 10) >= caret) {
        spans[i].parentNode.insertBefore(marker, spans[i]);
        return;
      }
    }
    body.appendChild(marker);
  })();

  // ---------------------------------------------------------------
  // Undo/redo from the preview: forward to the real editor's undo stack.
  // ---------------------------------------------------------------
  document.body.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey)) { return; }
    var key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      vscode.postMessage({ type: 'undo' });
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      vscode.postMessage({ type: 'redo' });
    }
  });

  // Insert via event delegation on the groups container.
  var emojiGroupsEl = document.getElementById('emoji-groups');
  if (emojiGroupsEl) {
    emojiGroupsEl.addEventListener('click', function (e) {
      var btn = e.target;
      if (!btn.classList || !btn.classList.contains('emoji-item')) { return; }
      vscode.postMessage({ type: 'insertEmoji', emoji: btn.dataset.emoji });
      // Hide the picker and reset the search input.
      if (emojiPicker) { emojiPicker.setAttribute('hidden', ''); }
      if (emojiSearch) {
        emojiSearch.value = '';
        emojiSearch.dispatchEvent(new Event('input'));
      }
    });
  }

  // ---------------------------------------------------------------
  // M4.1 Typing in the card.
  //
  // Keystrokes land in a hidden input (#type-catcher) rather than a
  // contenteditable body: the card's DOM is regenerated from offset spans on
  // every render, and contenteditable would make the browser a second writer
  // to that same DOM (PRD Q1).
  //
  // The caret offset is tracked here in the webview because the document
  // round trip is far slower than typing. Each insert advances it locally and
  // optimistically; without that, every keystroke in a fast burst would post
  // the same offset and the text would arrive reversed.
  // ---------------------------------------------------------------
  var typeCatcher = document.getElementById('type-catcher');
  var caretOffset = null;

  // Precise offset of a collapsed caret: the span's start plus how far into
  // that span's text node the caret sits. The span offset alone would snap
  // every insert to a span boundary.
  function collapsedCaretOffset() {
    var sel = window.getSelection();
    if (!sel || !sel.isCollapsed || sel.rangeCount === 0) { return null; }
    var range = sel.getRangeAt(0);
    if (!body || !body.contains(range.startContainer)) { return null; }
    var span = closestOffsetSpan(range.startContainer);
    if (!span) { return null; }
    var base = parseInt(span.dataset.offset, 10);
    if (isNaN(base)) { return null; }
    return base + range.startOffset;
  }

  if (typeCatcher && body) {
    // Only a collapsed click arms typing. A drag-selection must keep focus in
    // the body, or the selection the toolbar acts on would be destroyed.
    body.addEventListener('click', function () {
      var offset = collapsedCaretOffset();
      if (offset === null) {
        // Not a caret click - a drag-selection, or a click outside any offset
        // span. Disarm: keeping the previous offset armed would make the next
        // keystroke land wherever the caret used to be. Focus stays in the
        // body so the toolbar can still act on the selection.
        caretOffset = null;
        return;
      }
      caretOffset = offset;
      typeCatcher.focus({ preventScroll: true });
    });

    // 'input' fires once per committed change, including at the end of an IME
    // composition, so a composed character arrives whole rather than as its
    // intermediate candidates.
    typeCatcher.addEventListener('input', function () {
      var text = typeCatcher.value;
      typeCatcher.value = '';
      if (!text) { return; }
      if (caretOffset === null) { return; }
      vscode.postMessage({
        type: 'insertText',
        text: text,
        offset: caretOffset
      });
      caretOffset += text.length;
    });

    // No invalidation listener is needed. Re-render assigns webview.html
    // wholesale, which tears down the document and re-runs this script, so
    // caretOffset resets to null on its own. That same teardown is why
    // typing currently survives exactly one character - see M4.2.
  }
})();
