"use strict";
// Universal Ctrl/Cmd+S → click this page's primary "Save" button, so the makers match the OS-wide save
// muscle memory (the Map editor already has its own Ctrl+S). Self-contained: it only acts if one of the
// known maker save buttons exists on the page, preventDefaults the browser "Save page" dialog, and never
// clicks a disabled button. Saving mid-edit is fine — the maker's save reads the current field values.
(function () {
  // Primary save button ids across the makers.
  //
  // #ctrl-s-saves-the-hidden-editor — CTRL+S MUST SAVE THE EDITOR YOU CAN SEE.
  //
  // This took the first id that EXISTED, and one page has two editors in the same document. The Spirit
  // maker's "Designers & Companies" mode hides the national-spirit form and renders a company editor in its
  // place, hiding #saveIdeaBtn along with it; #mioSaveBtn ("💾 Save company") is the button actually on
  // screen. Ctrl+S still found #saveIdeaBtn — present, not disabled, merely invisible — clicked it, and
  // wrote the hidden spirit form. Measured on Millennium Dawn: with a company half-written in the form,
  // Ctrl+S sent POST /api/ideas/upsert-definition and no /api/mio at all, and reported success. The company
  // was never saved and an unrelated idea was rewritten from stale hidden fields.
  //
  // So: prefer a button that is actually rendered, and if none is, do nothing. Saving something the user
  // cannot see is worse than not saving.
  const SAVE_IDS = ["saveEventBtn", "saveDecisionBtn", "saveIdeaBtn", "mioSaveBtn", "saveCharBtn"];
  // getClientRects() rather than offsetParent: offsetParent is null for a position:fixed element too, and a
  // save button living in a fixed toolbar is a perfectly ordinary thing to add later.
  const isOnScreen = (el) => !!el && el.getClientRects().length > 0;
  function findSaveBtn() {
    for (const id of SAVE_IDS) {
      const b = document.getElementById(id);
      if (isOnScreen(b)) return b;
    }
    return null; // nothing visible to save — let the browser have the keystroke
  }
  // Capture phase so a focused input's own key handling can't swallow Ctrl+S before we see it.
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.shiftKey || e.altKey) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if ((e.key || "").toLowerCase() !== "s") return;
      const btn = findSaveBtn();
      if (!btn) return; // no save button on this page → let the browser do its thing
      e.preventDefault();
      if (!btn.disabled) btn.click();
    },
    true
  );
  // Advertise the shortcut on the Save button's tooltip so it's discoverable (an invisible shortcut is
  // half a feature). Appends to any existing title; runs whether the script loads before or after DOM ready.
  function advertise() {
    const btn = findSaveBtn();
    if (!btn) return;
    const t = (btn.getAttribute("title") || "").trim();
    if (!/ctrl\s*\+\s*s/i.test(t)) btn.setAttribute("title", (t ? t + " · " : "") + "Ctrl+S");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", advertise);
  else advertise();
})();
