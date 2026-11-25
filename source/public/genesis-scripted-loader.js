// Shared, page-agnostic loader: fetch the active mod's + vanilla's scripted_effects and
// scripted_triggers and hand them to the Genesis engine, so a modder's custom `NAME = yes`
// calls resolve to plain English in the maker previews instead of a title-cased name.
//
// The focus editor (app.js) has its own equivalent; this brings the same resolution to the
// Spirits / Decisions / Events / Research makers. Include it AFTER genesis-engine.js:
//   <script src="./genesis-scripted-loader.js?v=1"></script>
// Best-effort and idempotent: if a fetch fails the built-in dictionaries still translate.
(function () {
  function modPath() {
    try { return localStorage.getItem("activeModPath") || ""; } catch (_) { return ""; }
  }

  async function loadGenesisScriptedDefs() {
    const G = window.GenesisEngine;
    if (!G) return;
    const q = modPath() ? `?modPath=${encodeURIComponent(modPath())}` : "";
    let loaded = false;
    if (typeof G.setScriptedEffects === "function") {
      try {
        const e = await fetch(`/api/scripted-effects${q}`).then((r) => r.json());
        if (e && e.effects) { G.setScriptedEffects(e.effects); loaded = true; }
      } catch (_) { /* keep built-in dicts */ }
    }
    if (typeof G.setScriptedTriggers === "function") {
      try {
        const t = await fetch(`/api/scripted-triggers${q}`).then((r) => r.json());
        if (t && t.triggers) { G.setScriptedTriggers(t.triggers); loaded = true; }
      } catch (_) { /* keep built-in dicts */ }
    }
    // If an entry already rendered at startup (before the defs arrived), refresh its previews so
    // they pick up the scripted resolution. We only call known, side-effect-free preview refreshers
    // (they re-render text only — they never mark the form dirty), so this can't fabricate an
    // "unsaved changes" state. Any maker without such a hook simply resolves on the next edit.
    if (loaded) {
      ["__novaRefreshEventTopFields", "__novaRefreshTechModifiers", "__novaRefreshFocusConditions"]
        .forEach((fn) => { if (typeof window[fn] === "function") { try { window[fn](); } catch (_) {} } });
    }
  }

  // Expose so a maker can re-load on mod change if it wants to.
  window.loadGenesisScriptedDefs = loadGenesisScriptedDefs;

  // Defer until the page is idle: scripted_effects/triggers can be several MB on a big mod (Millennium
  // Dawn ≈ 9 MB), and this is only a NICETY (resolves custom NAME=yes calls to English in previews) with
  // a built-in-dictionary fallback. Loading it on DOMContentLoaded made it compete with the first render;
  // running it on idle keeps the page snappy and the previews refresh themselves when the defs arrive.
  function scheduleGenesisScriptedDefs() {
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => loadGenesisScriptedDefs(), { timeout: 4000 });
    else setTimeout(loadGenesisScriptedDefs, 1200);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scheduleGenesisScriptedDefs);
  else scheduleGenesisScriptedDefs();
})();
