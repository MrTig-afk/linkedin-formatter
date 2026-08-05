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
      // With a selection, restyle it. With none, send a COLLAPSED range:
      // the extension reads that as "latch this axis for typing" (issue #2).
      var offsets = resolveSelectionOffsets();
      var start = offsets ? offsets.start : 0;
      var end = offsets ? offsets.end : 0;
      vscode.postMessage({
        type: 'toggleAxis',
        axis: btn.dataset.axis,
        start: start,
        end: end
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

  // -------------------------------------------------------------
  // The card caret.
  //
  // .caret-marker mirrors the LEFT editor and only renders while the editor
  // has focus - which means it disappears the moment you click into the card
  // to type. So the card draws its own, at the armed offset, whenever typing
  // is armed. Without it there is no way to tell the card is ready.
  // -------------------------------------------------------------
  function clearCardCaret() {
    var old = body.querySelectorAll('.card-caret');
    for (var i = 0; i < old.length; i++) { old[i].remove(); }
  }

  function drawCardCaret() {
    clearCardCaret();
    if (caretOffset === null) { return; }
    var caret = document.createElement('span');
    caret.className = 'card-caret';
    caret.setAttribute('aria-hidden', 'true');

    var target = body.querySelector('span[data-offset="' + caretOffset + '"]');
    if (target) {
      body.insertBefore(caret, target);
      return;
    }

    // No span STARTS here. That happens for a moment after every keystroke:
    // caretOffset advances immediately but the spans are still the old ones,
    // so the offset can land inside a character until the render lands.
    //
    // Falling back to 'append at the end' made the caret visibly jump to the
    // end of the post between keystrokes. Put it after the character that
    // contains the offset instead, and only truly append past the last one.
    var spans = offsetSpans();
    for (var i = 0; i < spans.length; i++) {
      var o = parseInt(spans[i].dataset.offset, 10);
      var l = parseInt(spans[i].dataset.len, 10);
      if (isNaN(o) || isNaN(l)) { continue; }
      if (caretOffset > o && caretOffset < o + l) {
        body.insertBefore(caret, spans[i].nextSibling);
        return;
      }
    }
    body.appendChild(caret);
  }


  /**
   * Nearest real character boundary at or before `offset`.
   *
   * Spans are whole visual units, so only their start offsets - plus the very
   * end of the document - are valid caret positions. Anything else is inside
   * a character.
   */
  function snapToSpanBoundary(offset) {
    var spans = offsetSpans();
    if (spans.length === 0) { return 0; }
    var best = 0;
    for (var i = 0; i < spans.length; i++) {
      var o = parseInt(spans[i].dataset.offset, 10);
      if (isNaN(o)) { continue; }
      if (o <= offset) { best = o; } else { break; }
    }
    // The end of the document is a valid position too.
    var last = spans[spans.length - 1];
    var end = parseInt(last.dataset.offset, 10) + parseInt(last.dataset.len, 10);
    if (offset >= end) { return end; }
    return best;
  }


  /**
   * Move the caret AND tell the extension, immediately.
   *
   * Every path that moves the caret must go through here. The two sides were
   * previously desynchronised in two ways: a click armed the webview at once
   * but only reached the extension 200ms later via the deferred cursorSync,
   * and arrow-key movement was never reported at all. Anything typed in
   * those windows was inserted wherever the extension last believed the
   * caret to be - usually somewhere further up the post.
   */
  function setCaret(offset) {
    caretOffset = offset;
    drawCardCaret();
    if (offset !== null) {
      vscode.postMessage({ type: 'setCaret', offset: offset });
    }
  }

  function collapsedCaretOffset() {
    var sel = window.getSelection();
    if (!sel || !sel.isCollapsed || sel.rangeCount === 0) { return null; }
    var range = sel.getRangeAt(0);
    if (!body || !body.contains(range.startContainer)) { return null; }
    var span = closestOffsetSpan(range.startContainer);
    if (!span) { return null; }
    var base = parseInt(span.dataset.offset, 10);
    if (isNaN(base)) { return null; }
    // Snap: clicking the right half of a two-unit styled character would
    // otherwise land between its surrogates.
    return snapToSpanBoundary(base + range.startOffset);
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
        clearCardCaret();
        return;
      }
      desiredX = null;
      typeCatcher.focus({ preventScroll: true });
      setCaret(offset);
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
      // Deliberately NOT advanced here.
      //
      // Guessing was worse than waiting. Styling changes the length - "a"
      // becomes a two-unit astral character - and only the extension knows
      // by how much, so any local guess is wrong by one unit per styled
      // character. Drawing at that guess made the caret visibly jump back
      // into the middle of the word being typed.
      //
      // The extension ignores this offset anyway (it owns the caret) and
      // sends the true position back with the render a few milliseconds
      // later. Holding the caret still until then is invisible; moving it
      // to the wrong place is not.
      desiredX = null;   // typing sets a new column
    });

    // No invalidation listener is needed. Re-render assigns webview.html
    // wholesale, which tears down the document and re-runs this script, so
    // caretOffset resets to null on its own. That same teardown is why
    // typing currently survives exactly one character - see M4.2.
  }

  // ---------------------------------------------------------------
  // M4.2 In-place render.
  //
  // The extension used to reassign webview.html on every document change,
  // which reloaded ~52KB, cost ~25ms, and destroyed focus and the caret -
  // so typing died after one character. It now sends the changed text here
  // and this rebuilds the body in place. Nothing is torn down, so the
  // type-catcher keeps focus and caretOffset survives.
  //
  // The payload carries STRUCTURED UNITS, never HTML. Every node below is
  // built with createElement + textContent, so nothing on this channel is
  // ever parsed as markup and there is no injection sink to protect. That
  // matches the rest of this file, which uses innerHTML nowhere.
  // ---------------------------------------------------------------
  function isRenderPayload(d) {
    return d && d.type === 'render' && Object.prototype.toString.call(d.units) === '[object Array]';
  }

  // Visible cue that typing just disarmed. The class is removed on the
  // animation end AND on a timer: animationend does not fire when the tab
  // is hidden or when reduced-motion turns the animation off, and a class
  // left stuck on would make the next flash a no-op.
  var interruptTimer = null;
  function flashInterrupted() {
    var card = document.querySelector('.linkedin-card');
    if (!card) { return; }
    card.classList.remove('typing-interrupted');
    void card.offsetWidth;          // reflow, so re-adding restarts it
    card.classList.add('typing-interrupted');
    if (interruptTimer !== null) { clearTimeout(interruptTimer); }
    interruptTimer = setTimeout(function () {
      interruptTimer = null;
      card.classList.remove('typing-interrupted');
    }, 700);
  }


  /**
   * Apply toolbar state from a render message.
   *
   * This exists so latching bold does not have to rebuild the page. The
   * toolbar used to be baked into the HTML, so any change to it triggered a
   * full reload - which destroyed focus and the caret, and left the user
   * pressing Ctrl+B and then unable to type.
   */
  function applyToolbar(t) {
    if (!t || typeof t !== 'object') { return; }

    if (familySelect && typeof t.family === 'string') {
      var opt = familySelect.querySelector('option[value="' + t.family + '"]');
      if (opt) { familySelect.value = t.family; }
    }

    var pairs = [
      ['axis-bold', t.bold === true, t.boldAvailable !== false],
      ['axis-italic', t.italic === true, t.italicAvailable !== false],
    ];
    for (var i = 0; i < pairs.length; i++) {
      var btn = document.getElementById(pairs[i][0]);
      if (!btn) { continue; }
      btn.disabled = !pairs[i][2];
      if (pairs[i][1]) { btn.classList.add('active'); }
      else { btn.classList.remove('active'); }
    }
  }

  function applyRender(payload) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < payload.units.length; i++) {
      var u = payload.units[i];
      if (!u || typeof u !== 'object') { continue; }
      if (u.kind === 'span') {
        if (typeof u.text !== 'string' || typeof u.offset !== 'number') { continue; }
        var span = document.createElement('span');
        span.dataset.offset = String(u.offset);
        span.dataset.len = String(u.len);
        span.textContent = u.text;          // text, never markup
        frag.appendChild(span);
      } else if (u.kind === 'marker') {
        var div = document.createElement('div');
        div.className = 'truncation-marker';
        var label = document.createElement('span');
        label.className = 'truncation-label';
        label.textContent = String(u.label === undefined ? '' : u.label);
        div.appendChild(label);
        frag.appendChild(div);
      }
    }
    body.replaceChildren(frag);

    // M4.5: an edit we did not make - an AI CLI writing to the file, an undo,
    // or typing in the left editor - has moved the text underneath the offset
    // this webview is holding. Disarm rather than insert somewhere wrong; the
    // next click re-arms. Dropping a keystroke is recoverable, putting one in
    // the wrong place silently is not.
    if (payload.external === true) {
      // Only signal when typing was actually armed. Flashing at someone who
      // was not typing is noise, and noise gets ignored - including the time
      // it matters.
      if (caretOffset !== null) { flashInterrupted(); }
      caretOffset = null;
    } else if (typeof payload.caret === 'number' && caretOffset !== null) {
      // The extension owns the caret, because only it knows how long the
      // styled text it inserted actually was. Our optimistic value exists
      // solely to draw between keystrokes; correct it whenever the truth
      // arrives. Without this the two drift by one unit per styled character
      // and inserts start landing inside the previous one.
      // Assign directly, never through setCaret: this value CAME from the
      // extension, and posting it back would be an endless round trip.
      caretOffset = payload.caret;
      drawCardCaret();
    }

    var c = payload.counter;
    var counterEl = document.getElementById('char-counter');
    if (counterEl && c && typeof c.count === 'number' && typeof c.limit === 'number') {
      var over = c.state === 'over';
      counterEl.textContent = c.count + ' / ' + c.limit +
        (over ? ' (-' + (c.count - c.limit) + ')' : '');
      counterEl.className = 'char-counter' +
        (c.state === 'warning' ? ' counter-warning' : over ? ' counter-over' : '');
    }

    applyToolbar(payload.toolbar);

    // replaceChildren wiped the caret along with the old spans; put it back
    // at whatever offset is armed now.
    drawCardCaret();
  }

  // Inbound from the extension. Shape-checked before use, same discipline the
  // extension applies to messages coming the other way.
  window.addEventListener('message', function (event) {
    if (!isRenderPayload(event.data)) { return; }
    applyRender(event.data);
  });

  // ---------------------------------------------------------------
  // M4.3 Deletion: backspace and delete.
  //
  // Sent as replaceText with an empty string, so a deletion is ONE undo entry.
  //
  // Ranges come from the rendered spans, never from arithmetic on the caret.
  // A span is one visual unit - a code point plus any combining marks - so
  // deleting a span's range removes a whole character. Doing caret-1 instead
  // would split a surrogate pair and leave half an emoji in the document.
  //
  // The listener is on document, not window: a keydown must be caught wherever
  // focus sits, and focus is either the type-catcher or the card body. Only
  // CLICK listeners are barred from document (they would swallow toolbar
  // clicks); keydown does not have that problem.
  // ---------------------------------------------------------------

  // -------------------------------------------------------------
  // Word-wise deletion (Ctrl+Backspace / Ctrl+Delete).
  //
  // Boundaries are computed from the rendered spans rather than from the
  // document text, which the webview does not have. A span is one visual
  // unit, so this treats a styled character or an emoji as one character -
  // exactly as single-character deletion does.
  // -------------------------------------------------------------
  function offsetSpans() {
    return Array.prototype.slice.call(body.querySelectorAll('span[data-offset]'));
  }

  function isSpaceSpan(span) {
    return /^\s+$/.test(span.textContent || '');
  }

  /** Start offset of the word ending at `offset`, for Ctrl+Backspace. */
  function wordStartBefore(offset) {
    var spans = offsetSpans();
    var i = spans.length - 1;
    while (i >= 0 && parseInt(spans[i].dataset.offset, 10) >= offset) { i--; }
    if (i < 0) { return null; }
    // Skip the whitespace immediately behind the caret, then the word.
    while (i >= 0 && isSpaceSpan(spans[i])) { i--; }
    while (i >= 0 && !isSpaceSpan(spans[i])) { i--; }
    var start = i < 0 ? 0 : parseInt(spans[i].dataset.offset, 10) +
                            parseInt(spans[i].dataset.len, 10);
    return start >= offset ? null : start;
  }

  /** End offset of the word starting at `offset`, for Ctrl+Delete. */
  function wordEndAfter(offset) {
    var spans = offsetSpans();
    var i = 0;
    while (i < spans.length && parseInt(spans[i].dataset.offset, 10) < offset) { i++; }
    if (i >= spans.length) { return null; }
    while (i < spans.length && isSpaceSpan(spans[i])) { i++; }
    while (i < spans.length && !isSpaceSpan(spans[i])) { i++; }
    var end = i >= spans.length
      ? parseInt(spans[spans.length - 1].dataset.offset, 10) +
        parseInt(spans[spans.length - 1].dataset.len, 10)
      : parseInt(spans[i].dataset.offset, 10);
    return end <= offset ? null : end;
  }

  function spanEndingAt(offset) {
    var spans = body.querySelectorAll('span[data-offset]');
    for (var i = 0; i < spans.length; i++) {
      var o = parseInt(spans[i].dataset.offset, 10);
      var l = parseInt(spans[i].dataset.len, 10);
      if (!isNaN(o) && !isNaN(l) && o + l === offset) { return { start: o, end: offset }; }
    }
    return null;
  }
  function spanStartingAt(offset) {
    var span = body.querySelector('span[data-offset="' + offset + '"]');
    if (!span) { return null; }
    var l = parseInt(span.dataset.len, 10);
    if (isNaN(l)) { return null; }
    return { start: offset, end: offset + l };
  }

  /** Delete whatever is selected in the card. Shared by both delete keys. */
  function deleteSelection() {
    var sel = resolveSelectionOffsets();
    if (!sel || sel.start === sel.end) { return false; }
    vscode.postMessage({ type: 'replaceText', start: sel.start, end: sel.end, text: '' });
    setCaret(sel.start);
    return true;
  }

  function deleteCharBackward() {
    if (deleteSelection()) { return true; }
    if (caretOffset === null) { return false; }
    var r = spanEndingAt(caretOffset);
    if (!r) { return false; }
    vscode.postMessage({ type: 'replaceText', start: r.start, end: r.end, text: '' });
    setCaret(r.start);
    return true;
  }

  function deleteCharForward() {
    if (deleteSelection()) { return true; }
    if (caretOffset === null) { return false; }
    var r = spanStartingAt(caretOffset);
    if (!r) { return false; }
    vscode.postMessage({ type: 'replaceText', start: r.start, end: r.end, text: '' });
    return true;
  }

  function deleteWordBackward() {
    if (deleteSelection()) { return true; }
    if (caretOffset === null) { return false; }
    var from = wordStartBefore(caretOffset);
    if (from === null || from >= caretOffset) { return false; }
    vscode.postMessage({ type: 'replaceText', start: from, end: caretOffset, text: '' });
    setCaret(from);
    return true;
  }

  function deleteWordForward() {
    if (deleteSelection()) { return true; }
    if (caretOffset === null) { return false; }
    var to = wordEndAfter(caretOffset);
    if (to === null || to <= caretOffset) { return false; }
    vscode.postMessage({ type: 'replaceText', start: caretOffset, end: to, text: '' });
    return true;
  }

  // -------------------------------------------------------------
  // Arrow-key navigation.
  //
  // The card caret is a JS variable, not a real browser caret, so nothing
  // moves it on its own - focus sits in the hidden input, where arrow keys
  // just move within an empty field. These move it explicitly.
  //
  // Movement is per SPAN, not per code unit, so one press crosses a whole
  // styled character or emoji rather than landing between its surrogates.
  // -------------------------------------------------------------
  function caretLeftOf(offset) {
    var spans = offsetSpans();
    var prev = null;
    for (var i = 0; i < spans.length; i++) {
      var o = parseInt(spans[i].dataset.offset, 10);
      if (o >= offset) { break; }
      prev = o;
    }
    return prev;
  }

  function caretRightOf(offset) {
    var spans = offsetSpans();
    for (var i = 0; i < spans.length; i++) {
      var o = parseInt(spans[i].dataset.offset, 10);
      if (o > offset) { return o; }
    }
    // Past the last span: the end of the document.
    if (spans.length === 0) { return null; }
    var last = spans[spans.length - 1];
    var end = parseInt(last.dataset.offset, 10) + parseInt(last.dataset.len, 10);
    return end > offset ? end : null;
  }

  function documentEnd() {
    var spans = offsetSpans();
    if (spans.length === 0) { return 0; }
    var last = spans[spans.length - 1];
    return parseInt(last.dataset.offset, 10) + parseInt(last.dataset.len, 10);
  }


  // -------------------------------------------------------------
  // Up/Down arrows.
  //
  // "The line above" cannot be computed from offsets: the card wraps text,
  // so a visual line has no fixed character count and a newline is not the
  // only thing that starts one. This uses the RENDERED GEOMETRY instead -
  // where each span actually sits on screen - which handles wrapped lines and
  // explicit newlines identically because it only asks the browser where
  // things are.
  //
  // desiredX is the column the user is trying to hold. Real editors remember
  // it across a run of vertical moves, so going down through a short line and
  // out the other side returns you to the original column rather than the end
  // of the short one. Any horizontal move or edit clears it.
  // -------------------------------------------------------------
  var desiredX = null;

  function caretRect() {
    var el = body.querySelector('.card-caret');
    if (el) {
      var r = el.getBoundingClientRect();
      if (r.width || r.height) { return r; }
    }
    // No caret element (or a zero-size one): fall back to the span it sits at.
    var span = body.querySelector('span[data-offset="' + caretOffset + '"]');
    if (span) { return span.getBoundingClientRect(); }
    var spans = offsetSpans();
    return spans.length ? spans[spans.length - 1].getBoundingClientRect() : null;
  }

  /** Offset of the span nearest to (x, y) on the target visual line. */
  function offsetNearest(x, y) {
    var spans = offsetSpans();
    var best = null;
    var bestScore = Infinity;
    for (var i = 0; i < spans.length; i++) {
      var r = spans[i].getBoundingClientRect();
      if (!r.height) { continue; }
      var midY = r.top + r.height / 2;
      // Vertical distance dominates so a span on the right line always beats
      // a horizontally closer one on the wrong line.
      var score = Math.abs(midY - y) * 1000 + Math.abs(r.left - x);
      if (score < bestScore) { bestScore = score; best = spans[i]; }
    }
    return best === null ? null : parseInt(best.dataset.offset, 10);
  }

  function moveVertical(direction) {
    var rect = caretRect();
    if (!rect) { return null; }
    if (desiredX === null) { desiredX = rect.left; }

    // One line height, measured from the card rather than assumed.
    var lh = parseFloat(getComputedStyle(body).lineHeight);
    if (isNaN(lh) || lh <= 0) { lh = rect.height || 18; }

    var targetY = rect.top + rect.height / 2 + (direction === 'up' ? -lh : lh);
    var next = offsetNearest(desiredX, targetY);

    // Already on the first or last line: behave like Home / End, which is
    // what every editor does rather than doing nothing.
    if (next === null || next === caretOffset) {
      return direction === 'up' ? 0 : documentEnd();
    }
    return next;
  }

  /** Apply a computed caret position. null means 'nowhere to go'; stay put. */
  function moveTo(next, keepColumn) {
    if (caretOffset === null) { return false; }
    if (!keepColumn) { desiredX = null; }
    if (next === null) { return true; }   // handled: at an edge, do not fall through
    setCaret(next);
    return true;
  }

  function moveCharLeft()  { return moveTo(caretLeftOf(caretOffset), false); }
  function moveCharRight() { return moveTo(caretRightOf(caretOffset), false); }
  function moveLineUp()    { return moveTo(moveVertical('up'), true); }
  function moveLineDown()  { return moveTo(moveVertical('down'), true); }
  function moveDocStart()  { return moveTo(0, false); }
  function moveDocEnd()    { return moveTo(documentEnd(), false); }

  // -------------------------------------------------------------
  // Enter: insert a newline.
  //
  // The catcher is an <input>, which silently swallows Enter - no input
  // event, no newline. It has to be handled as a key and posted directly.
  // -------------------------------------------------------------
  function insertNewline() {
    if (caretOffset === null) { return false; }
    vscode.postMessage({ type: 'insertText', text: '\n', offset: caretOffset });
    // Not advanced locally. The extension owns the caret and sends the true
    // position back with the render; guessing here is how the caret ended up
    // drawing in the wrong place.
    desiredX = null;
    return true;
  }

  function sendUndo() { vscode.postMessage({ type: 'undo' }); return true; }
  function sendRedo() { vscode.postMessage({ type: 'redo' }); return true; }

  /**
   * Offset at the start or end of the caret's VISUAL line.
   *
   * Geometry again, for the same reason as up/down: the card wraps, so a
   * visual line has no fixed character count and Home must go to the wrap
   * point rather than to the paragraph start.
   */
  function lineBoundary(which) {
    var rect = caretRect();
    if (!rect) { return null; }
    var midY = rect.top + rect.height / 2;
    var spans = offsetSpans();
    var best = null;
    var bestRect = null;
    for (var i = 0; i < spans.length; i++) {
      var r = spans[i].getBoundingClientRect();
      if (!r.height) { continue; }
      // Same visual line: vertical centres within half a line of each other.
      if (Math.abs((r.top + r.height / 2) - midY) > r.height / 2) { continue; }
      if (best === null
          || (which === 'start' ? r.left < bestRect.left : r.left > bestRect.left)) {
        best = spans[i];
        bestRect = r;
      }
    }
    if (best === null) { return null; }
    var o = parseInt(best.dataset.offset, 10);
    if (which === 'start') { return o; }
    return o + parseInt(best.dataset.len, 10);
  }

  function moveLineStart() { return moveTo(lineBoundary('start'), false); }
  function moveLineEnd()   { return moveTo(lineBoundary('end'), false); }

  /**
   * Forward word motion differs by platform, and it is not a detail:
   * Windows stops at the START of the next word, macOS at the END of it.
   * Backward motion is identical on both.
   */
  function wordStartAfter(offset) {
    var spans = offsetSpans();
    var i = 0;
    while (i < spans.length && parseInt(spans[i].dataset.offset, 10) < offset) { i++; }
    while (i < spans.length && !isSpaceSpan(spans[i])) { i++; }   // out of this word
    while (i < spans.length && isSpaceSpan(spans[i])) { i++; }    // over the gap
    if (i >= spans.length) { return documentEnd(); }
    return parseInt(spans[i].dataset.offset, 10);
  }

  function moveWordLeft() {
    if (caretOffset === null) { return false; }
    return moveTo(wordStartBefore(caretOffset), false);
  }

  function moveWordRight() {
    if (caretOffset === null) { return false; }
    return moveTo(IS_MAC ? wordEndAfter(caretOffset) : wordStartAfter(caretOffset), false);
  }

  /**
   * Bold/italic from the keyboard.
   *
   * The toolbar tooltips have always advertised 'Bold (Ctrl+B)', but the
   * package.json keybinding is gated on editorTextFocus, which is false
   * whenever focus is in this panel - so the shortcut the UI promised did
   * nothing here. A collapsed range latches the axis for typing; a real
   * selection restyles it, matching the buttons exactly.
   */
  function toggleAxisKey(axis) {
    var btn = document.getElementById(axis === 'bold' ? 'axis-bold' : 'axis-italic');
    if (btn && btn.disabled) { return true; }   // family has no such axis
    var offsets = resolveSelectionOffsets();
    vscode.postMessage({
      type: 'toggleAxis',
      axis: axis,
      start: offsets ? offsets.start : 0,
      end: offsets ? offsets.end : 0
    });
    return true;
  }

  function toggleBoldKey()   { return toggleAxisKey('bold'); }
  function toggleItalicKey() { return toggleAxisKey('italic'); }
  // ---------------------------------------------------------------
  // The keymap.
  //
  // One listener, one table. This replaced four independent keydown
  // handlers that each did their own modifier checks; adding Shift variants
  // and a platform split across four of them would not have stayed coherent.
  //
  // Chords are normalised strings, as CodeMirror and ProseMirror both do.
  // 'Mod' resolves to Ctrl on Windows/Linux and Cmd on macOS. A 'mac' entry
  // overrides the default binding on macOS only.
  //
  // Platform matters for more than taste: on macOS, Cmd+Backspace means
  // 'delete to line start', so treating Ctrl and Cmd as interchangeable would
  // delete a word when the user asked for a line. That is a wrong deletion,
  // not a missing feature.
  // ---------------------------------------------------------------
  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

  // Note: on macOS the system binds Home/End to SCROLLING rather than caret
  // motion. They stay bound to line start/end here on both platforms, because
  // that is what Mac users overwhelmingly remap them to anyway, and Cmd+Left
  // and Cmd+Right are bound alongside for anyone using the native chords.

  function chordOf(e) {
    var parts = [];
    if (e.ctrlKey)  { parts.push('Ctrl'); }
    if (e.altKey)   { parts.push('Alt'); }
    if (e.metaKey)  { parts.push('Meta'); }
    if (e.shiftKey) { parts.push('Shift'); }
    var k = e.key;
    parts.push(k.length === 1 ? k.toLowerCase() : k);
    return parts.join('-');
  }

  /** Resolve 'Mod' for this platform so the table can stay declarative. */
  function resolveChord(chord) {
    return chord.replace(/\bMod\b/, IS_MAC ? 'Meta' : 'Ctrl');
  }

  var BINDINGS = [
    // Editing
    { key: 'Enter',            run: insertNewline },
    { key: 'Backspace',        run: deleteCharBackward },
    { key: 'Delete',           run: deleteCharForward },
    { key: 'Mod-Backspace',    mac: 'Alt-Backspace', run: deleteWordBackward },
    { key: 'Mod-Delete',       mac: 'Alt-Delete',    run: deleteWordForward },

    // History
    { key: 'Mod-z',            run: sendUndo },
    { key: 'Mod-y',            run: sendRedo },
    { key: 'Mod-Shift-z',      run: sendRedo },

    // Caret motion
    { key: 'ArrowLeft',        run: moveCharLeft },
    { key: 'ArrowRight',       run: moveCharRight },
    { key: 'ArrowUp',          run: moveLineUp },
    { key: 'ArrowDown',        run: moveLineDown },
    // Home/End go to the VISUAL line, which is what every editor does and
    // what wrapping requires. Mod promotes them to the whole document.
    { key: 'Home',             mac: 'Meta-ArrowLeft',  run: moveLineStart },
    { key: 'End',              mac: 'Meta-ArrowRight', run: moveLineEnd },
    { key: 'Mod-Home',         mac: 'Meta-ArrowUp',    run: moveDocStart },
    { key: 'Mod-End',          mac: 'Meta-ArrowDown',  run: moveDocEnd },

    // Word motion. The logic already existed for deletion; it was never bound
    // to the arrows because the handler bailed out on any modifier.
    { key: 'Mod-ArrowLeft',    mac: 'Alt-ArrowLeft',   run: moveWordLeft },
    { key: 'Mod-ArrowRight',   mac: 'Alt-ArrowRight',  run: moveWordRight },

    // Formatting, finally honouring what the toolbar tooltips promise.
    { key: 'Mod-b',            run: toggleBoldKey },
    { key: 'Mod-i',            run: toggleItalicKey },
  ];

  var KEYMAP = (function () {
    var map = {};
    for (var i = 0; i < BINDINGS.length; i++) {
      var b = BINDINGS[i];
      var chord = resolveChord(IS_MAC && b.mac ? b.mac : b.key);
      map[chord] = b.run;
    }
    return map;
  })();

  document.addEventListener('keydown', function (e) {
    // Never fight an active IME: mutating the DOM mid-composition aborts it.
    if (e.isComposing || e.keyCode === 229) { return; }
    var run = KEYMAP[chordOf(e)];
    if (!run) { return; }
    if (run() !== false) { e.preventDefault(); }
  });
})();
