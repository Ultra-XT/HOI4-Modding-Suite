// ── Nova's real dropdown, shared by every maker ───────────────────────────────────────────────────
//
// A native <datalist> renders an OS popup Nova cannot style, size or scroll. On a big mod the lists are
// long — 588 equipment entries, ~29.5k 3D models, and the focus editor's country picker carries every tag
// the game loads (364 in vanilla, 385 in Millennium Dawn) — so the popup runs off the bottom of the window
// with nothing to scroll. That was reported twice: once for the Military maker, and again for the focus
// editor's "Which Country Uses This Tree" dialog.
//
// The first report was fixed inside army.js, and the comment there even said the panel had a hard
// max-height "so it can never bleed off-screen again" — but it lived in ONE page's script, so index.html,
// characters.html, country-setup.html and research.html kept the native popup and kept the bug. This file
// is that same widget, moved out whole so there is one implementation and every page gets it.
//
// It is a drop-in: existing `<input list="…">` markup is untouched and the <datalist> stays as the data
// source, it just stops being the popup. Free text still stands — several of these inputs must accept a
// value that is not in the list (you invent your own module categories), which is why this is not a
// <select>. Loading it on a page with no `input[list]` does nothing. #combo
(function () {
  "use strict";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // ── A real dropdown ───────────────────────────────────────────────────────────────────────────────
  // Native <datalist> renders an OS popup Nova cannot style, size or scroll. On MD the equipment list is
  // 588 entries and the stat list ~30 — both spill off the screen with no scrollbar, which is what "the
  // lists bleed" was. A plain <select> is the wrong replacement: several of these inputs must still accept
  // FREE TEXT (you invent your own module categories), and a select can't. So: keep the input, replace the
  // popup with a styled, searchable, scrollable panel. Type to filter, click or ↑↓+Enter to pick, and
  // whatever you type still stands. The panel is position:FIXED off the input's rect, so no ancestor's
  // overflow can clip it — which is why it works inside the scrolling editor panes. #combo
  let _comboPanel = null, _comboInput = null, _comboIdx = -1, _placeCombo = null;
  function closeCombo() { if (_comboPanel) _comboPanel.remove(); _comboPanel = null; _comboInput = null; _comboIdx = -1; _placeCombo = null; }
  document.addEventListener("mousedown", (e) => { if (_comboPanel && !_comboPanel.contains(e.target) && e.target !== _comboInput) closeCombo(); });
  window.addEventListener("resize", closeCombo);
  // THE PANEL WAS KILLING ITSELF (#combo-scroll-self-dismiss). This was an unconditional
  // `closeCombo` in the CAPTURE phase on window, so it saw scroll events from ANY element — including the
  // panel's own `overflow-y: auto` box. One wheel-tick over the list destroyed it, and the ↑↓ handler's
  // own scrollIntoView did the same at the tenth row. Every one of the 16 upgraded inputs on this page was
  // affected, and the long ones (ship types ~588 entries, 3D models ~29.5k) can only be used by scrolling.
  //
  // A scroll INSIDE the panel is not a reason to dismiss it. And a scroll outside is not either: the panel
  // is position:fixed off the input's rect, so the honest response is to move it back onto the input —
  // which is what a native select does — rather than vanish. It only closes if the input has actually left
  // the viewport, where a fixed panel would otherwise float detached from its box.
  window.addEventListener("scroll", (e) => {
    if (!_comboPanel) return;
    const t = e.target;
    if (t === _comboPanel || (t && t.nodeType === 1 && _comboPanel.contains(t))) return; // its own scrollbar
    const r = _comboInput && _comboInput.getBoundingClientRect();
    if (!r || r.bottom < 0 || r.top > window.innerHeight) { closeCombo(); return; }
    if (_placeCombo) _placeCombo();
  }, true);
  // options: array of "value" strings, or { v, t } for value + a right-aligned hint (e.g. its display name).
  function novaCombo(input, options) {
    if (!input || input._novaCombo) return;
    input._novaCombo = true;
    input.removeAttribute("list");            // kill the native popup
    input.setAttribute("autocomplete", "off");
    const norm = () => (typeof options === "function" ? options() : options || []).map((o) => (typeof o === "string" ? { v: o, t: "" } : o)).filter((o) => o && o.v != null);
    // `_picking` stops the panel from reopening on top of the choice just made. Selecting fires `input` so
    // the page's own listeners run, and this widget listens for `input` too — so the panel closed and then
    // immediately reopened showing the one value now in the box, which reads as the click not having taken.
    let _picking = false;
    const pick = (v) => {
      _picking = true;
      input.value = v;
      closeCombo();
      try {
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      } finally { _picking = false; }
    };
    // `filtered` only once the user actually types. Opening a field that already holds a value must show
    // the WHOLE list — otherwise clicking a filled box filters to the one thing already in it and you can
    // never see the alternatives, which is exactly the trap the variant picker fell into.
    const render = (filtered) => {
      const q = filtered ? String(input.value || "").toLowerCase().trim() : "";
      const all = norm();
      const list = q ? all.filter((o) => String(o.v).toLowerCase().includes(q) || String(o.t || "").toLowerCase().includes(q)) : all;
      if (!_comboPanel) { _comboPanel = document.createElement("div"); _comboPanel.className = "nova-combo"; }
      // #combo-modal — THE PANEL HAS TO LIVE INSIDE THE MODAL, NOT BESIDE IT.
      //
      // A <dialog> opened with showModal() does two things to the rest of the document: it paints above it
      // (the dialog is in the browser's TOP LAYER, which beats every z-index) and it makes it INERT. So a
      // panel appended to <body> while a modal is open is both buried and dead — it is positioned, sized and
      // scrollable, and the user can neither see nor click it. Painting it in the top layer as a popover
      // fixes only the first half; inertness follows the DOM tree, so the clicks still went nowhere.
      //
      // Appending it into the dialog puts it inside the non-inert subtree and inside the top-layer paint, and
      // z-index 9999 lifts it above the dialog's own content. position:fixed still resolves against the
      // viewport — the dialog is not a containing block for it (no transform/filter/contain ancestor), which
      // is also why the dialog's `overflow: hidden` does not clip it.
      //
      // This is why the widget looked correct for as long as it lived in army.js: not one input on that page
      // sits inside a modal, so neither half of this could show up.
      const dlgHost = input.closest("dialog");
      const host = dlgHost && dlgHost.matches(":modal") ? dlgHost : document.body;
      if (_comboPanel.parentElement !== host) host.appendChild(_comboPanel);
      _comboInput = input;
      _comboPanel.innerHTML = list.length
        ? list.slice(0, 400).map((o, i) => `<button type="button" class="nc-opt${i === _comboIdx ? " on" : ""}" data-v="${esc(o.v)}"><span class="nc-v">${esc(o.v)}</span>${o.t ? `<span class="nc-t">${esc(o.t)}</span>` : ""}</button>`).join("")
          + (list.length > 400 ? `<div class="nc-more">${list.length - 400} more — keep typing to narrow</div>` : "")
        : '<div class="nc-more">No match — what you type is still used.</div>';
      // Placement is its own step so an outer scroll can re-run it and keep the panel glued to its input,
      // instead of the panel being destroyed. #combo-scroll-self-dismiss
      place();
      _comboPanel.querySelectorAll(".nc-opt").forEach((b) => b.addEventListener("mousedown", (e) => { e.preventDefault(); pick(b.dataset.v); }));
    };
    function place() {
      if (!_comboPanel || !_comboInput) return;
      const r = _comboInput.getBoundingClientRect();
      _comboPanel.style.left = Math.round(r.left) + "px";
      _comboPanel.style.width = Math.max(180, Math.round(r.width)) + "px";
      // Put it wherever there's more room, and CAP it to the room that's actually there. A fixed flip
      // threshold isn't enough: with, say, 220px below, it wouldn't flip yet a 264px panel still overhangs.
      // Sizing to the space is the only version that can never run off an edge.
      // Measure the room from the SAME rounded offset the panel is actually positioned at. Sizing from the
      // raw fractional rect while rounding the offset up made the panel overhang by the difference — with an
      // input whose bottom is 207.5 the offset became 212 but the height was still computed from 207.5, so
      // the panel ended half a pixel past the window edge and clipped its own last row. Round first, then
      // subtract, and the two can never disagree.
      const MAXH = 264, GAP = 4;
      const topPx = Math.round(r.bottom + GAP);                        // if placed below
      const botPx = Math.round(window.innerHeight - r.top + GAP);      // if placed above
      const below = window.innerHeight - topPx - GAP;
      const above = window.innerHeight - botPx - GAP;
      const useAbove = above > below && below < MAXH;
      // The 96px floor keeps the panel usable when neither side has much room; clamp it to the window so
      // that floor can never itself become the thing that pushes the panel off-screen.
      const room = Math.max(96, Math.min(MAXH, useAbove ? above : below));
      _comboPanel.style.maxHeight = Math.min(room, window.innerHeight - GAP * 2) + "px";
      if (useAbove) { _comboPanel.style.top = "auto"; _comboPanel.style.bottom = botPx + "px"; }
      else { _comboPanel.style.bottom = "auto"; _comboPanel.style.top = topPx + "px"; }
      _placeCombo = place;
    }
    input.addEventListener("focus", () => { _comboIdx = -1; render(false); });   // show everything
    // A DISMISSED PANEL LEFT THE BOX DEAD. The panel only opened on `focus`, and after any dismissal the
    // input still HELD focus — so clicking the same box fired no focus event and nothing happened. That is
    // the "I can't click on anything" half of the report: not the click failing, but there being nothing
    // left to click into. Reopen on mousedown when this input has no panel of its own.
    input.addEventListener("mousedown", () => {
      if (_comboPanel && _comboInput === input) return; // already open — let the normal dismiss logic run
      _comboIdx = -1;
      setTimeout(() => render(false), 0); // after focus/dismiss handlers have settled
    });
    input.addEventListener("input", () => { if (_picking) return; _comboIdx = -1; render(true); });    // now narrow it
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeCombo(); return; }
      if (!_comboPanel || _comboInput !== input) return;
      const opts = [..._comboPanel.querySelectorAll(".nc-opt")];
      if (!opts.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        _comboIdx = e.key === "ArrowDown" ? Math.min(opts.length - 1, _comboIdx + 1) : Math.max(0, _comboIdx - 1);
        opts.forEach((o, i) => o.classList.toggle("on", i === _comboIdx));
        const on = opts[_comboIdx]; if (on) on.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && _comboIdx >= 0) { e.preventDefault(); pick(opts[_comboIdx].dataset.v); }
    });
  }
  // Convert every `<input list="…">` to the real dropdown, reading its <datalist> for options. Existing
  // markup keeps working untouched — the datalist stays as the data source, it just stops being the popup.
  // Resolve it by ID at OPEN time, not now: these panels re-render constantly and a captured element goes
  // stale the moment its parent's innerHTML is rewritten.
  function upgradeCombos(root) {
    (root || document).querySelectorAll("input[list]").forEach((inp) => {
      const listId = inp.getAttribute("list");
      if (!listId || !document.getElementById(listId)) return;
      novaCombo(inp, () => {
        const dl = document.getElementById(listId);
        return dl ? [...dl.querySelectorAll("option")].map((o) => ({ v: o.value, t: o.textContent || o.label || "" })) : [];
      });
    });
  }
  // Upgrade as they APPEAR. Nine render functions emit these inputs and more will follow; hooking each call
  // site guarantees the next one gets forgotten. One observer, rAF-debounced, and novaCombo is idempotent.
  // setTimeout, not requestAnimationFrame: rAF is paused while the tab isn't painting, which would leave
  // the native popups in place on a backgrounded tab until it was focused again.
  let _comboScan = 0;
  function scheduleComboScan() {
    if (_comboScan) return;
    _comboScan = setTimeout(() => { _comboScan = 0; try { upgradeCombos(document); } catch (_) {} }, 0);
  }
  new MutationObserver(scheduleComboScan).observe(document.documentElement, { childList: true, subtree: true });
  scheduleComboScan();

  // Exposed so a page that renders inputs outside the observer's reach can force a pass, and so a maker
  // can dismiss the panel when it tears down a dialog.
  window.NovaCombo = { upgrade: upgradeCombos, close: closeCombo };
})();
