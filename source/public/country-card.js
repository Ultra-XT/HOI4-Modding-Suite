// 🏳 THE MAP'S COUNTRY CARD — what it says about a country, built from the server's own answers. #country-card
//
// Click a country on the map and see what the game will give it on day one: the focus tree it gets (and a warning when that
// is the generic one), its laws and national spirits, its capital and its footprint on this map, and a way into each maker
// for THIS country. map.js asks the server and renders; everything the card SAYS is decided here, so a test can feed it
// real responses. UMD: window.NovaCountryCard in the browser, module.exports in node.
//
// Left out on purpose: ruling party, stability and war support. /api/history/country-details reads only a history's
// undated lines, and a mod that writes its whole country inside its start-date block (Millennium Dawn, 2000.1.1) would be
// shown the defaults as if they were the country's. The card says nothing rather than something false.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.NovaCountryCard = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** The requests the card makes, in one place: map.js sends exactly these, and the test sends what this returns. */
  function requests(tag, modPath) {
    const q = "tag=" + encodeURIComponent(tag) + "&modPath=" + encodeURIComponent(modPath || "");
    return {
      tree: "/api/focus/tree-for-country?" + q,
      ideas: "/api/countries/start-ideas?" + q,
      flag: "/api/flags/country-flag?" + q,
    };
  }

  // The three law categories every base-game country has, named as the game's law screen names them. Any other category
  // (a mod's own) is shown by its id, made readable.
  const LAW_CATEGORY = { economy: "Economy", trade_laws: "Trade", mobilization_laws: "Conscription" };
  const readable = (id) => String(id || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  /** Which focus tree the game gives it, as one line with a tone: "ok", or "warn" when it has none of its own. */
  function focusLine(tree) {
    if (!tree || tree.error) return { tone: "unknown", text: "Could not tell which focus tree it gets" + (tree && tree.error ? ": " + tree.error : ".") };
    const t = tree.tree || {};
    const where = [t.fileName, t.sourceName].filter(Boolean).join(", ");
    const id = t.treeId || "";
    // The server scores a tree with every DLC owned; a tree that counts on one is not what a player without it gets.
    const dlc = Array.isArray(t.dlc) && t.dlc.length
      ? ` It counts on ${t.dlc.join(", ")}: without ${t.dlc.length === 1 ? "that DLC" : "those DLCs"} the game gives another tree.` : "";
    switch (tree.kind) {
      case "own": return { tone: "ok", text: `Its own tree: ${id}${where ? ` (${where})` : ""}.${dlc}` };
      case "loaded": return { tone: "ok", text: `The tree its history loads: ${id}${where ? ` (${where})` : ""}.${dlc}` };
      case "shared": return { tone: "warn", text: `No tree of its own. It gets ${id}, a tree every country without one shares${where ? ` (${where})` : ""}.${dlc}` };
      case "generic": return { tone: "warn", text: `No tree of its own. It gets the generic tree, ${id}${where ? ` (${where})` : ""}.${dlc}` };
      case "none": return { tone: "warn", text: "No focus tree at all: no tree names it, and none is marked as the default." };
      default: return { tone: "unknown", text: "Could not tell which focus tree it gets." };
    }
  }

  /** The focus editor opens a tree from the mod or the base game. A dependency's tree it does not: opening one there makes that
   *  dependency the mod being edited, on every page — the card says where the tree is instead. */
  const openableTree = (tree) => !!(tree && tree.tree && tree.tree.file && (tree.tree.layer === "mod" || tree.tree.layer === "base"));
  function focusNote(tree) {
    const t = tree && tree.tree;
    if (!t || t.layer !== "dependency") return "";
    return `That tree is ${t.sourceName || "a mod yours builds on"}'s, not your mod's: 🎯 opens your own trees. To change it, open it from the focus editor's tree list, which edits ${t.sourceName || "that mod"}'s file.`;
  }

  /** Its laws, one row per category: the law's name (or id), and whether the history sets it or it is the default. */
  function lawRows(ideas) {
    const unsure = (ideas && ideas.unsure) || [];
    return ((ideas && ideas.laws) || []).map((l) => {
      const base = l.fromHistory ? "" : (l.isDefault ? "default" : (l.id ? "" : "none set"));
      // A law the history sets behind a condition Nova cannot judge belongs to this row, not to the spirits.
      const maybe = unsure.filter((u) => u && u.category === l.category).map((u) => u.name || u.id);
      const or = maybe.length ? `or ${maybe.join(", ")}, behind a condition Nova cannot judge` : "";
      return { category: LAW_CATEGORY[l.category] || readable(l.category), law: l.name || l.id || "—", note: [base, or].filter(Boolean).join("; ") };
    });
  }

  /** Its national spirits on day one, what the reader could not be sure of, and what the history adds that nothing defines. */
  function spiritSummary(ideas) {
    const name = (s) => s.name || s.id;
    const spirits = (ideas && ideas.spirits) || [];
    const lawCategories = new Set(((ideas && ideas.laws) || []).map((l) => l.category));
    return {
      // An idea defined nowhere the game loads (a mod's replace_path took it away) is not a spirit it gets: the game skips it.
      list: spirits.filter((s) => s.known !== false).map(name),
      undefinedIds: spirits.filter((s) => s.known === false).map((s) => s.id),
      unsure: ((ideas && ideas.unsure) || []).filter((s) => !lawCategories.has(s.category) && s.category !== "advisor").map(name),
      hidden: (ideas && ideas.hiddenSpirits) || 0,
    };
  }

  /** Its advisors on day one: ids the history adds that are a character's advisor token (the server says which), by the
   *  character's name and the slot the game's politics screen shows — never counted as spirits, never as undefined. */
  function advisorList(ideas) {
    const one = (maybe) => (a) => ({ name: a.name || a.id, slot: a.slot ? readable(a.slot) : "", maybe });
    return [
      ...((ideas && ideas.advisors) || []).map(one(false)),
      ...((ideas && ideas.unsure) || []).filter((s) => s.category === "advisor").map(one(true)),
    ];
  }

  /** Where each maker opens FOR THIS COUNTRY. The focus editor opens the tree the game gives it, when there is one. */
  function links(tag, tree) {
    const t = encodeURIComponent(tag);
    return {
      focus: openableTree(tree) ? "index.html?file=" + encodeURIComponent(tree.tree.file) : "index.html",
      research: "research.html?tag=" + t,
      setup: "country-setup.html?tag=" + t,
      army: "army.html?tag=" + t,
    };
  }

  /**
   * Everything the card shows. `name` from the country catalog; `stats` from the map (computeCountryStats); `capital` the
   * capital state's name and id; `tree` and `ideas` the two responses from requests().
   */
  function build({ tag, name, stats, capital, tree, ideas }) {
    const T = String(tag || "").toUpperCase();
    const s = stats || null;
    return {
      tag: T,
      title: name && name.toUpperCase() !== T ? name : T,
      capital: capital || null,
      footprint: s && s.states ? s : null,
      focus: focusLine(tree),
      focusNote: focusNote(tree),
      laws: ideas && !ideas.error ? lawRows(ideas) : [],
      spirits: ideas && !ideas.error ? spiritSummary(ideas) : { list: [], undefinedIds: [], unsure: [], hidden: 0 },
      advisors: ideas && !ideas.error ? advisorList(ideas) : [],
      ideasError: ideas && ideas.error ? String(ideas.error) : "",
      startDate: ideas && ideas.startDate ? ideas.startDate : null,
      historyInMod: !!(ideas && ideas.inMod),
      links: links(T, tree),
    };
  }

  return { requests, focusLine, focusNote, lawRows, spiritSummary, advisorList, links, build, LAW_CATEGORY };
});
