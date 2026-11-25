"use strict";
/*
 * Shared country picker for the "Start game with this … for country:" selectors in the
 * Event, Decision, and National Spirit makers. One place so all three behave identically.
 *
 * Why this exists: a user can create a custom country that REUSES a vanilla tag (their own
 * GER vs vanilla GER). The raw 3-letter tag can't tell them apart, so this renders the
 * country NAME plus a "(Your Mod)" / "(Vanilla)" badge, groups the mod's own countries
 * first, and explicitly marks a collision (a tag that is both mod-defined AND in vanilla).
 *
 * The backend (/api/countries/catalog) already resolves tags collision-safely and returns
 * { tag, displayName, isMod, inVanilla, modCustomized } per country; this is purely the presentation
 * layer. modCustomized = the mod ships its own history setup for an otherwise-vanilla country (e.g. LUX).
 *
 * Exposes window.NovaCountryPicker.populate(selectEl, { modPath, keepValue }).
 */
(function () {
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // Label for one country option. Examples:
  //   "Germany (GER) — Your Mod"         (mod-defined, also in vanilla → a reused tag)
  //   "Atlantis (ATL) — Your Mod (new)"  (mod-defined, not in vanilla → brand-new tag)
  //   "Germany (GER) — Vanilla"          (plain vanilla country)
  function labelFor(c) {
    const name = c.displayName || c.name || c.tag;
    const namePart = name && name.toUpperCase() !== String(c.tag).toUpperCase()
      ? `${name} (${c.tag})`
      : String(c.tag);
    let badge;
    if (c.modCustomized) badge = "Your Mod";                       // your mod ships its own setup for this country (e.g. customizing LUX)
    else if (c.isMod && c.inVanilla) badge = "Your Mod · reuses vanilla tag"; // a brand-new custom country that collides with a vanilla tag
    else if (c.isMod) badge = "Your Mod";
    else badge = "Vanilla";
    return `${namePart} — ${badge}`;
  }

  /**
   * Populate a <select> with the country catalog for the given mod.
   * @param {HTMLSelectElement} sel
   * @param {{ modPath?: string, keepValue?: boolean }} [opts]
   * @returns {Promise<Array>} the catalog list (possibly empty)
   */
  async function populate(sel, opts) {
    if (!sel) return [];
    const options = opts || {};
    const prev = options.keepValue === false ? "" : sel.value;
    let list = [];
    try {
      const url = "/api/countries/catalog" +
        (options.modPath ? "?modPath=" + encodeURIComponent(options.modPath) : "");
      const res = await fetch(url);
      const data = await res.json();
      list = Array.isArray(data) ? data : (data && data.countries) || [];
    } catch (e) {
      console.error("[country-picker] failed to load catalog:", e);
      return [];
    }
    if (!list.length) return [];

    // This picker exists to attach the mod's OWN content (spirits, decisions, events, characters,
    // research locks) to countries, so it lists ONLY the mod's own countries — the mod's defined tags
    // PLUS dependency countries (e.g. Millennium Dawn's, for an add-on) PLUS any vanilla country the mod
    // customizes (it gets a history file → isMod). Dumping the 400+ untouched vanilla countries was pure
    // noise (the user only has ~1 of them). A vanilla-only workspace (no mod countries) still shows all
    // so the picker isn't empty.
    const byTag = (a, b) => String(a.tag).localeCompare(String(b.tag));
    const mod = list.filter((c) => c.isMod).sort(byTag);
    const rest = list.filter((c) => !c.isMod).sort(byTag);
    const opt = (c) => `<option value="${esc(c.tag)}">${esc(labelFor(c))}</option>`;
    let html = "";
    if (options.all) {
      // COMPLETE list (opt-in): every tag the mod will know about — the mod's own countries first,
      // then all remaining vanilla/dependency ones. Nothing hidden. Used where the user must be able to
      // target ANY country (e.g. the equipment designer's owner, loading any country's army). #completelist
      if (mod.length) html += `<optgroup label="Your mod's countries">${mod.map(opt).join("")}</optgroup>`;
      if (rest.length) html += `<optgroup label="${mod.length ? "All other countries" : "All countries"}">${rest.map(opt).join("")}</optgroup>`;
      if (!html) html = list.slice().sort(byTag).map(opt).join("");
    } else if (mod.length) {
      html = `<optgroup label="Your mod's countries">${mod.map(opt).join("")}</optgroup>`;
    } else {
      // No mod countries (vanilla-only workspace): fall back to the full list so it isn't empty.
      html = list.slice().sort(byTag).map(opt).join("");
    }
    // "All countries" sentinel (opt-in via includeAll): applies the item to EVERY country via one
    // on_startup → every_country effect instead of listing 461 tags. First option so it's easy to pick.
    const allOpt = options.includeAll ? `<option value="__ALL__">🌍 All countries (everyone)</option>` : "";
    sel.innerHTML = allOpt + html;

    // Restore prior selection if it still exists; otherwise leave the browser default.
    if (prev) {
      const has = Array.prototype.some.call(sel.options, (o) => o.value === prev);
      if (has) sel.value = prev;
    }
    return list;
  }

  window.NovaCountryPicker = { populate, labelFor };
})();
