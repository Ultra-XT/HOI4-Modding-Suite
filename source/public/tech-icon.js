/*
 * tech-icon.js — shared HOI4 technology-icon helper (Nova).
 *
 * The user wants EVERY technology shown by name to also show its in-game icon,
 * so it's recognisable by picture. GFX_<id>_medium tech sprites are SINGLE-frame
 * pictures (vanilla's Technologies.gfx declares zero noOfFrames across all 1836
 * of them) — so show the WHOLE image contained, never strip-crop by aspect ratio
 * (a 144×68 tech-box picture is wide because it's wide, not because it's 2 frames).
 * Nova's missing-icon placeholder is a 63×63 image → we hide those.
 *
 * Usage:
 *   NovaTechIcon.html(techId)   → '<span class="tech-ico" data-tech="…"></span>'
 *   NovaTechIcon.mount(rootEl)  → resolves + crops every un-mounted .tech-ico under root
 *
 * Self-contained: injects its own .tech-ico CSS once and reads the active mod
 * path from localStorage, so it works on any page with no other dependencies.
 */
(function () {
  "use strict";
  if (window.NovaTechIcon) return;

  var STYLE_ID = "nova-tech-ico-style";
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent =
      ".tech-ico{display:inline-block;width:34px;height:16px;background-repeat:no-repeat;" +
      "background-position:left center;background-size:contain;flex-shrink:0;vertical-align:middle;}" +
      // #tech-picker-icon-tiny — the inline size above is right beside a line of text, and far too small in
      // a PICKER TILE, which is 200px wide and reserves a whole row for the picture. A tech sprite is a
      // single-frame image about 2.1:1 (vanilla's are ~144x68), so the large variant keeps that shape and
      // centres it in the tile instead of hugging the left edge the way an inline row wants.
      ".tech-ico--lg{width:100px;height:48px;background-position:center center;}";
    (document.head || document.documentElement).appendChild(s);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function modPath() {
    try { return localStorage.getItem("activeModPath") || ""; } catch (_) { return ""; }
  }

  // opts.size === "lg" → the picker-tile variant. Default stays the inline size, so every existing caller
  // (the assigned-tech rows, the research page) keeps the size it was built around.
  //
  // opts.key overrides the sprite this looks up. A TECHNOLOGY's picture is GFX_<id>_medium, which is what
  // this derives — but EQUIPMENT is not the same: measured on vanilla, GFX_<id>_medium resolves for only 74
  // of its 308 equipment entries. Equipment art is GFX_<picture>_medium, where `picture` comes from the
  // entry or its archetype (infantry_equipment carries no picture of its own; its archetype's is
  // archetype_infantry_equipment → GFX_archetype_infantry_equipment_medium). Callers that know the real key
  // pass it. #equipment-picker-blind
  function html(techId, opts) {
    var big = opts && opts.size === "lg";
    var key = opts && opts.key ? String(opts.key) : "";
    return '<span class="tech-ico' + (big ? " tech-ico--lg" : "") + '" data-tech="' + esc(techId) + '"' +
      (key ? ' data-key="' + esc(key) + '"' : "") + ' title="' + esc(techId) + '"></span>';
  }

  function mount(root) {
    injectStyle();
    (root || document).querySelectorAll(".tech-ico[data-tech]").forEach(function (el) {
      if (el.dataset.mounted) return;
      el.dataset.mounted = "1";
      var im = new Image();
      im.onload = function () {
        var w = im.naturalWidth, h = im.naturalHeight;
        if (!w || !h || (w === 63 && h === 63)) { el.style.display = "none"; return; } // Nova's "?" placeholder
        el.style.backgroundImage = 'url("' + im.src + '")';
        // Single-frame pictures (the vanilla rule) — contain the WHOLE image, never slice it.
        el.style.backgroundSize = "contain";
        el.style.backgroundPosition = "left center";
      };
      im.onerror = function () { el.style.display = "none"; };
      im.src = "/api/icon-image?key=" +
        encodeURIComponent(el.dataset.key || "GFX_" + el.dataset.tech + "_medium") +
        "&modPath=" + encodeURIComponent(modPath());
    });
  }

  injectStyle();
  window.NovaTechIcon = { html: html, mount: mount };
})();
