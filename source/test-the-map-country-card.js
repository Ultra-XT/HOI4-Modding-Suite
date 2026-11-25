// 🏳 THE MAP'S COUNTRY CARD SAYS WHAT THE GAME GIVES A COUNTRY, AND OPENS EACH MAKER FOR IT. #country-card
//
// The owner's milestone after TEST 31: the map is the hub — click a country, see what the game gives it on day one, and go
// straight into the focus tree, research, laws and army FOR THAT COUNTRY. Everything the card says is decided in
// public/country-card.js; public/map.js asks the server in the requests that module names and renders the result.
//
// This test sends exactly those requests to a real server over a two-layer world (a base game and a mod on top) and feeds
// the answers to the module, as the page does. Then, from the sources: the page sends what the module names, the module
// asks routes the server has, and every maker the card links to reads the parameter the link carries — derived from the
// links themselves, not typed in here.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const CC = require("./public/country-card.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("country-card");
const TREE = (id, rule, def) => `focus_tree = {\n\tid = ${id}\n\tcountry = ${rule}\n\tdefault = ${def ? "yes" : "no"}\n\tfocus = {\n\t\tid = ${id}_first\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 10\n\t}\n}\n`;
lib.write(world.GAME, {
  // Germany has a tree of its own; everybody else falls to the generic one (the base game's shape: generic.txt is
  // `default = yes` and scores 1, germany.txt scores 10 for GER).
  "common/national_focus/generic.txt": TREE("generic_focus", "{ factor = 1 }", true),
  "common/national_focus/germany.txt": TREE("german_focus", "{ factor = 0 modifier = { add = 10 tag = GER } }", false),
  "common/ideas/_economic.txt": "ideas = {\n\teconomy = {\n\t\tlaw = yes\n\t\tcivilian_economy = {\n\t\t\tdefault = yes\n\t\t}\n\t\tpartial_economic_mobilisation = {\n\t\t}\n\t}\n}\n",
  // Italy's tree counts on a DLC (the base game's shape: a `modifier` holding the tag AND a has_dlc).
  "common/national_focus/italy.txt": TREE("italian_focus", "{ factor = 0 modifier = { add = 10 tag = ITA has_dlc = \"By Blood Alone\" } }", false),
  "common/ideas/_economic.txt": "ideas = {\n\teconomy = {\n\t\tlaw = yes\n\t\tcivilian_economy = {\n\t\t\tdefault = yes\n\t\t}\n\t\tpartial_economic_mobilisation = {\n\t\t}\n\t}\n}\n",
  "common/ideas/germany.txt": "ideas = {\n\tcountry = {\n\t\tGER_iron_will = {\n\t\t}\n\t}\n}\n",
  "common/ideas/france.txt": "ideas = {\n\tcountry = {\n\t\tFRA_maybe_spirit = {\n\t\t}\n\t}\n}\n",
  "localisation/english/card_l_english.yml": "\ufeffl_english:\n civilian_economy:0 \"Civilian Economy\"\n partial_economic_mobilisation:0 \"Partial Mobilization\"\n GER_iron_will:0 \"Iron Will\"\n FRA_maybe_spirit:0 \"Maybe Spirit\"\n",
  "history/countries/GER - Germany.txt": "capital = 1\nadd_ideas = {\n\tpartial_economic_mobilisation\n\tGER_iron_will\n}\n",
  "history/countries/ENG - England.txt": "capital = 3\n",
  // France: a spirit nothing defines, and a law and a spirit behind a condition Nova cannot judge (a game rule; has_dlc it
  // takes as owned, as the tree finder does, and the card says so).
  // …and two advisors: ids no ideas file defines, which ARE defined — as a character's advisor idea_token, the way the
  // base game hires all eight of its (AST_brudenell_white…). One is hired outright, one behind the same condition — and
  // that one's advisor block sits inside an `instance`, as Beneš's, Gömbös's and Ghazi I's do.
  "common/characters/FRA.txt": "characters = {\n\tFRA_jean = {\n\t\tname = FRA_jean\n\t\tadvisor = {\n\t\t\tslot = political_advisor\n\t\t\tidea_token = FRA_adv_token\n\t\t}\n\t}\n\tFRA_paul = {\n\t\tinstance = {\n\t\t\tallowed = {\n\t\t\t\thas_dlc = \"La Resistance\"\n\t\t\t}\n\t\t\tname = FRA_paul\n\t\t\tadvisor = {\n\t\t\t\tslot = army_chief\n\t\t\t\tidea_token = FRA_maybe_adv\n\t\t\t}\n\t\t}\n\t}\n}\n",
  "localisation/english/card_chars_l_english.yml": "﻿l_english:\n FRA_jean:0 \"Jean Adviser\"\n FRA_paul:0 \"Paul Maybe\"\n",
  "history/countries/FRA - France.txt": "capital = 2\nadd_ideas = {\n\tFRA_nowhere\n\tFRA_adv_token\n}\nif = {\n\tlimit = {\n\t\thas_game_rule = {\n\t\t\trule = fra_rule\n\t\t\toption = yes\n\t\t}\n\t}\n\tadd_ideas = {\n\t\tpartial_economic_mobilisation\n\t\tFRA_maybe_spirit\n\t\tFRA_maybe_adv\n\t}\n}\n",
});
const MOD = world.mod("Card Mod", {});
// England's tree, one layer up: from a mod this one builds on, and from a mod of its own.
const ENG_TREE = (id) => TREE(id, "{ factor = 0 modifier = { add = 10 tag = ENG } }", false);
world.mod("Dep Base", { "common/national_focus/eng_dep.txt": ENG_TREE("dep_english_focus") });
const ADDON = world.mod("Dep Addon", {}, ["Dep Base"]);
const OWN = world.mod("Own Mod", { "common/national_focus/eng_own.txt": ENG_TREE("own_english_focus") });

const { createApp } = require("./server.js");

(async () => {
  const srv = await lib.startServer(createApp);
  const ask = (url) => fetch(srv.base + url)
    .then(async (r) => { const j = await r.json().catch(() => ({})); return r.ok ? j : { error: (j && j.error) || `HTTP ${r.status}` }; });
  const cardFor = async (tag, extra = {}, modPath = MOD) => {
    const req = CC.requests(tag, modPath);
    const [tree, ideas] = await Promise.all([ask(req.tree), ask(req.ideas)]);
    return { card: CC.build(Object.assign({ tag, tree, ideas }, extra)), tree, ideas, req };
  };

  console.log("1. ⭐⭐ A country with a tree of its own: the card names it, its laws and its spirits");
  let { card, tree } = await cardFor("GER", { name: "Germany", capital: { id: 1, name: "STATE_1" }, stats: { states: 2, provinces: 3, civ: 4, mil: 5, dock: 0, infra: 0, mp: 2000, vpCount: 0, vpPts: 0 } });
  rec("⭐⭐ the focus line names Germany's own tree and where it comes from", card.focus.tone === "ok" && /german_focus/.test(card.focus.text) && /germany\.txt/.test(card.focus.text) && /base game/.test(card.focus.text), card.focus);
  const econ = card.laws.find((l) => l.category === "Economy") || {};
  rec("⭐ the economy law its history sets, by the game's name for it, with no 'default' note", econ.law === "Partial Mobilization" && econ.note === "", card.laws);
  rec("⭐ its national spirit on day one, by name", card.spirits.list.includes("Iron Will"), card.spirits);
  rec("the title is the country's name, with the tag beside it", card.title === "Germany" && card.tag === "GER", { title: card.title, tag: card.tag });
  rec("the footprint and capital the map knows are carried through", card.footprint && card.footprint.states === 2 && card.capital && card.capital.id === 1, { footprint: card.footprint, capital: card.capital });
  rec("⭐⭐ 🎯 Focus tree opens THAT tree in the focus editor (its path in ?file=)", card.links.focus === "index.html?file=" + encodeURIComponent(tree.tree.file) && fs.existsSync(tree.tree.file), card.links.focus);
  rec("the server says which layer the tree is in (the base game's), and a tree with no DLC gate says nothing of one", tree.tree.layer === "base" && !/counts on/.test(card.focus.text) && card.focusNote === "", { layer: tree.tree.layer, text: card.focus.text });
  rec("⭐ the other makers open for this country (?tag=GER)", card.links.research === "research.html?tag=GER" && card.links.setup === "country-setup.html?tag=GER" && card.links.army === "army.html?tag=GER", card.links);

  console.log("\n2. ⭐⭐ A country with no tree of its own is WARNED, not shown a tree as if it were its own");
  ({ card } = await cardFor("ENG"));
  rec("⭐⭐ the focus line is a warning naming the generic tree", card.focus.tone === "warn" && /generic/.test(card.focus.text) && /generic_focus/.test(card.focus.text), card.focus);
  const engEcon = card.laws.find((l) => l.category === "Economy") || {};
  rec("⭐ a law nobody set shows the category's default, marked as the default", engEcon.law === "Civilian Economy" && engEcon.note === "default", card.laws);
  rec("no spirits, said as none rather than left blank", card.spirits.list.length === 0 && card.ideasError === "", card.spirits);
  rec("with no name from the catalog, the tag is the title", card.title === "ENG", card.title);
  rec("a country that owns nothing on this map has no footprint (the card says so; it does not show zeros)", card.footprint === null, card.footprint);

  console.log("\n3. When the server refuses, the card says so");
  const refusedIdeas = await ask("/api/countries/start-ideas?modPath=" + encodeURIComponent(MOD));
  card = CC.build({ tag: "GER", tree: { error: "boom" }, ideas: refusedIdeas });
  rec("a refused request's own words reach the card (a missing tag is a 400 that says so)", /tag/i.test(card.ideasError) && card.laws.length === 0, { ideasError: card.ideasError });
  rec("…and a focus answer that failed is 'could not tell', never a tree", card.focus.tone === "unknown" && /boom/.test(card.focus.text), card.focus);
  rec("with no tree, 🎯 Focus tree opens the focus editor as it is", card.links.focus === "index.html", card.links.focus);

  console.log("\n3b. ⭐⭐ A tree from a mod yours builds on is named, but 🎯 does not open it (#a-dependency-tree-became-the-active-mod)");
  {
    // Opening a dependency's file in the focus editor makes that dependency the mod every page edits: the card's one click
    // would have moved the user's whole session into somebody else's mod. The card names where the tree is instead.
    const dep = await cardFor("ENG", {}, ADDON);
    const t = dep.tree.tree || {};
    rec("(precondition: the addon's ENG gets the tree of the mod it builds on)", t.treeId === "dep_english_focus" && t.sourceName === "Dep Base", t);
    rec("⭐⭐ the server says the tree is a dependency's", t.layer === "dependency", t.layer);
    rec("⭐⭐ 🎯 opens the focus editor as it is — never ?file= a dependency's tree", dep.card.links.focus === "index.html", dep.card.links.focus);
    rec("⭐ the card says whose tree it is, and how to edit it on purpose", /Dep Base/.test(dep.card.focusNote) && /tree list/.test(dep.card.focusNote), dep.card.focusNote);
    const own = await cardFor("ENG", {}, OWN);
    const o = own.tree.tree || {};
    rec("⭐ a tree in the mod itself is layer 'mod', and 🎯 opens it (?file=), with no note", o.layer === "mod" && o.treeId === "own_english_focus"
      && own.card.links.focus === "index.html?file=" + encodeURIComponent(o.file) && own.card.focusNote === "", { layer: o.layer, link: own.card.links.focus, note: own.card.focusNote });
  }

  console.log("\n3c. ⭐ A tree that counts on a DLC says so (the server scores trees as if every DLC were owned)");
  {
    const ita = await cardFor("ITA");
    rec("(precondition: Italy gets its DLC-gated tree)", ita.tree.tree && ita.tree.tree.treeId === "italian_focus", ita.tree);
    rec("⭐ the focus line names the DLC it counts on", /By Blood Alone/.test(ita.card.focus.text) && /without that DLC/.test(ita.card.focus.text), ita.card.focus.text);
  }

  console.log("\n3d. ⭐⭐ Laws and spirits the history is unsure of, or that nothing defines, are not shown as facts");
  {
    const fra = await cardFor("FRA");
    const sp = fra.card.spirits;
    rec("(precondition: the server marks FRA_nowhere as defined nowhere, and reports both conditional ideas as unsure)",
      (fra.ideas.spirits || []).some((s) => s.id === "FRA_nowhere" && s.known === false)
      && ["partial_economic_mobilisation", "FRA_maybe_spirit"].every((id) => (fra.ideas.unsure || []).some((u) => u.id === id)), fra.ideas);
    rec("⭐⭐ a spirit nothing defines is not listed as one it gets (the game skips it) — it is named apart", !sp.list.includes("FRA_nowhere") && sp.undefinedIds.join() === "FRA_nowhere", sp);
    rec("⭐⭐ an unsure LAW is not called a spirit", !sp.unsure.includes("Partial Mobilization") && sp.unsure.join() === "Maybe Spirit", sp.unsure);
    const econ = fra.card.laws.find((l) => l.category === "Economy") || {};
    rec("⭐ …it is said on its law's row, beside the default", econ.law === "Civilian Economy" && /^default; or Partial Mobilization, behind a condition/.test(econ.note), econ);
    // Advisors (#an-advisor-is-not-an-undefined-spirit): found by hand on the base game's Australia, whose card said
    // AST_brudenell_white was "defined nowhere — the game skips it". He is its Chief of Army.
    const adv = (fra.ideas.advisors || []).find((a) => a.id === "FRA_adv_token");
    rec("⭐⭐ the server knows an advisor's idea_token for an advisor: by the character's name and slot, not a spirit, not undefined",
      adv && adv.name === "Jean Adviser" && adv.slot === "political_advisor" && adv.known === true
      && !(fra.ideas.spirits || []).some((s) => s.id === "FRA_adv_token"), { advisors: fra.ideas.advisors, spirits: fra.ideas.spirits });
    rec("⭐⭐ the card lists the advisors apart — the hired one, and the one behind a condition as 'perhaps' — and neither among the spirits",
      JSON.stringify(fra.card.advisors) === JSON.stringify([{ name: "Jean Adviser", slot: "Political Advisor", maybe: false }, { name: "Paul Maybe", slot: "Army Chief", maybe: true }])
      && sp.undefinedIds.join() === "FRA_nowhere" && !sp.list.concat(sp.unsure).some((n) => /Adviser|Paul/.test(n)), { advisors: fra.card.advisors, sp });
  }

  srv.close();

  console.log("\n4. ⭐⭐ Derived from the sources: what the page sends, what the server answers, where the links land");
  const strip = (f) => maskJsComments(fs.readFileSync(path.join(__dirname, f), "utf8"));
  const SERVER = strip("server.js");
  const MAPJS = strip("public/map.js");
  const MAPHTML = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
  const reqs = CC.requests("GER", MOD);
  const routes = Object.values(reqs).map((u) => u.split("?")[0]);
  const missing = routes.filter((r) => !SERVER.includes(`app.get("${r}"`));
  rec("⭐ every request the card names is a route the server has", routes.length === 3 && missing.length === 0, { routes, missing });
  rec("⭐⭐ map.js asks through the module's own requests(), and fetches the tree and the ideas it names (not URLs of its own)",
    /CC\.requests\(/.test(MAPJS) && /ask\(req\.tree\)/.test(MAPJS) && /ask\(req\.ideas\)/.test(MAPJS) && /\.src = req\.flag/.test(MAPJS), null);
  const at = (s, re) => { const m = re.exec(s); return m ? m.index : -1; };
  const iCard = at(MAPHTML, /<script src="\.\/country-card\.js[^"]*"><\/script>/), iMap = at(MAPHTML, /<script src="\.\/map\.js[^"]*"><\/script>/);
  rec("⭐ map.html loads country-card.js, before map.js", iCard !== -1 && iMap !== -1 && iCard < iMap, { iCard, iMap });
  // Leaving the map goes through the same question the suite links ask.
  const navAt = MAPJS.indexOf("#mapCountryCard [data-cc-open]");
  const nav = navAt === -1 ? "" : MAPJS.slice(navAt, navAt + 600);
  rec("⭐ a card button asks mapHasUnsavedWork() before it leaves the map", /mapHasUnsavedWork\(\)[\s\S]*window\.location\.href = href/.test(nav), nav.slice(0, 200));
  // Every button in the card's markup has a link, and every link's page reads the parameter the link carries.
  const buttons = [...MAPHTML.matchAll(/data-cc-open="([a-z]+)"/g)].map((m) => m[1]);
  const L = CC.links("GER", { tree: { file: "C:/x/common/national_focus/y.txt", layer: "base" } });
  rec("each button in the card has a link, and each link a button", buttons.length === Object.keys(L).length && buttons.every((b) => L[b]), { buttons, links: Object.keys(L) });
  const unread = [];
  for (const [key, href] of Object.entries(L)) {
    const [page, query] = href.split("?");
    const param = query ? query.split("=")[0] : "";
    if (!param) { unread.push(`${key}: no parameter`); continue; }
    const html = fs.readFileSync(path.join(__dirname, "public", page), "utf8");
    const scripts = [...html.matchAll(/<script src="\.?\/?([^"?]+)(?:\?[^"]*)?"><\/script>/g)].map((m) => m[1]).filter((s) => fs.existsSync(path.join(__dirname, "public", s)));
    const reads = scripts.some((s) => new RegExp(`\\.get\\(\\s*["']${param}["']\\s*\\)`).test(strip(path.join("public", s))));
    if (!reads) unread.push(`${key}: ${page} (${scripts.join(", ")}) never reads ?${param}=`);
  }
  rec("⭐⭐ every maker the card opens reads the parameter its link carries (a link a page ignores opens the wrong country)", unread.length === 0, unread);

  // Research lists only the mod's own countries: ?tag= for one the mod inherits (GER, from the game) cannot select it, and
  // the page must SAY so — in both its branches (a mod with countries, and one with none, where it said only "Select a
  // country…"; found by hand). The note comes after the last thing that rewrites that line, loadCountryTechs().
  {
    const R = strip("public/research.js");
    const i = R.indexOf("async function refreshCountryList(");
    const body = i === -1 ? "" : R.slice(i, R.indexOf("\n  async function ", i + 10));
    const afterLoads = [...body.matchAll(/await loadCountryTechs\(\);\s*\n\s*(\S[^\n]*)\n\s*(\S[^\n]*)/g)].map((m) => [m[1], m[2]]);
    rec("⭐ Research says when ?tag= names a country it does not list — after each loadCountryTechs() in refreshCountryList, both branches",
      afterLoads.length === 2 && afterLoads.every(([l]) => /^noteUnlistedTag\(/.test(l)), afterLoads);
    // …and then forgets it: the page stores ?tag= as the remembered country, so a reload after the user picked another
    // would put the card's country back over their choice.
    rec("⭐ …and then drops ?tag= from the address (forgetUrlTag), in both branches", afterLoads.length === 2 && afterLoads.every(([, l]) => /^forgetUrlTag\(\);/.test(l)), afterLoads);
    const fu = body.slice(body.indexOf("const forgetUrlTag"), body.indexOf("const forgetUrlTag") + 400);
    rec("(forgetUrlTag deletes tag and replaces the history entry)", /searchParams\.delete\("tag"\)/.test(fu) && /history\.replaceState\(/.test(fu), fu.slice(0, 200));
  }

  console.log("\n5. ⭐⭐⭐ Opening a base-game tree from the card does not make the base game the active mod (#vanilla-tree-made-the-active-mod)");
  {
    // For most mods the tree the game gives GER is the base game's own. The focus editor's Load used to adopt the folder
    // of whatever tree it opened as the WHOLE suite's active mod, and for a base-game tree that was the game's folder:
    // found by driving the card by hand, the map came back as vanilla with the user's mod gone. The helpers are lifted out
    // of app.js and run as they are, with the game where /api/root says it is.
    const { maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
    const RAW = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
    const SRC = maskJsComments(RAW), CODE = maskJsLiterals(RAW);
    const lift = (name) => { const i = SRC.indexOf(`function ${name}(`); const b = i === -1 ? null : jsBodyAt(CODE, i); return b ? RAW.slice(i, b[1] + 1) : ""; };
    const fns = ["inferModRootFromFocusPath", "isLoadedFocusUnderVanillaGameInstall"].map(lift);
    const vm = require("vm");
    const run = (gameRoot, file) => { const ctx = { hoi4GameRootPath: gameRoot, out: null, file }; vm.runInNewContext(fns.join("\n") + "\nout = inferModRootFromFocusPath(file);", ctx); return ctx.out; };
    rec("(precondition: both helpers lifted out of app.js)", fns.every(Boolean), fns.map((f) => f.length));
    rec("⭐⭐ a tree in a game installed outside Steam names no mod (the folder /api/root reports)", run("E:\\Games\\Hearts of Iron IV", "E:\\Games\\Hearts of Iron IV\\common\\national_focus\\germany.txt") === "", run("E:\\Games\\Hearts of Iron IV", "E:\\Games\\Hearts of Iron IV\\common\\national_focus\\germany.txt"));
    rec("⭐ …nor one in Steam's install, before /api/root has answered", run("", "D:\\SteamLibrary\\steamapps\\common\\Hearts of Iron IV\\common\\national_focus\\germany.txt") === "", null);
    rec("⭐ …while a mod's tree still names its mod", run("E:\\Games\\Hearts of Iron IV", "C:\\mods\\my_mod\\common\\national_focus\\x.txt") === "C:\\mods\\my_mod", run("E:\\Games\\Hearts of Iron IV", "C:\\mods\\my_mod\\common\\national_focus\\x.txt"));
    rec("…and a folder that merely starts like the game's is not the game", run("E:\\Games\\Hearts of Iron IV", "E:\\Games\\Hearts of Iron IV mods\\m\\common\\national_focus\\x.txt") === "E:\\Games\\Hearts of Iron IV mods\\m", null);
    // The Load adopts the active mod through this helper, and fetchRoot records where the game is.
    const lf = lift("loadFile"), fr = lift("fetchRoot");
    rec("⭐⭐ loadFile adopts the active mod only through inferModRootFromFocusPath (so a base-game tree adopts nothing)",
      /const loadedModRoot = inferModRootFromFocusPath\(loadedPath\);\s*if \(loadedModRoot\) localStorage\.setItem\("activeModPath", loadedModRoot\);/.test(maskJsComments(lf)), null);
    rec("⭐ fetchRoot records the game's folder from /api/root", /hoi4GameRootPath = String\(game/.test(fr), null);
    // A base-game tree names no mod now, so every write keyed on it falls back to the active mod. The focus-loc strip
    // after a delete is one: it would strip the MOD's localisation of the base game's focus ids. It is refused for a
    // base-game tree, as autoRestoreFocusIcons and treeOwnerContext next door already were.
    const code = maskJsComments(RAW);
    const at = code.indexOf('fetch("/api/focus/strip-localization"');
    const guard = at === -1 ? "" : code.slice(code.lastIndexOf("if (", code.lastIndexOf("const stripModRoot", at)), at);
    rec("⭐⭐ the focus-loc strip is refused for a base-game tree", /^if \(stripIds\.length > 0 && !isLoadedFocusUnderVanillaGameInstall\(loadedPath\)\)/.test(guard), guard.slice(0, 160));
    // The card's ?file= is spent once used: a reload after the user opened another tree must not reopen the card's.
    const wf = code.indexOf("} else if (wantFile) {");
    const branch = wf === -1 ? "" : code.slice(wf, code.indexOf("} else if", wf + 10));
    rec("⭐ the focus editor drops ?file= from the address once it has opened it", /await loadFile\(\);[\s\S]*searchParams\.delete\("file"\)[\s\S]*history\.replaceState\(/.test(branch), branch.slice(0, 300));
  }

  console.log("\n6. ⭐⭐ Derived from the map page: the card is a floating panel like the others, and its ids are its own");
  {
    // A click on a floating panel must not reach the map under it (it would pick a province, paint, or drop the
    // selection). map.js kept two copies of one exclusion list; the card's buttons fell through them, and so did two
    // confirm dialogs that were never on either list. Since B6-7 (#a-key-under-a-dialog-stays-under-it) it is ONE list:
    // overFloatingPanel's panels plus every dialog of mapDialogs(), and both canvas guards (the press and the wheel) ask it.
    // Derived: every panel #mapWrap shows on demand — an element with an inline `display:none … position:absolute`, or
    // role="dialog" — is on that list, and no canvas guard keeps a list of its own.
    const open = MAPHTML.indexOf('<div id="mapWrap">');
    let depth = 0, end = -1;
    const re = /<div\b[^>]*>|<\/div>/g; re.lastIndex = open;
    for (let m; (m = re.exec(MAPHTML));) { if (m[0].startsWith("</")) { if (--depth === 0) { end = m.index; break; } } else depth++; }
    const wrap = open === -1 || end === -1 ? "" : MAPHTML.slice(open, end);
    const panels = [...wrap.matchAll(/<\w+\b([^>]*)>/g)].map((t) => t[1])
      .filter((a) => /\sid="/.test(a) && (/role="dialog"/.test(a) || /style="[^"]*display:\s*none[^"]*position:\s*absolute/.test(a) || /style="[^"]*position:\s*absolute[^"]*display:\s*none/.test(a)))
      .map((a) => /\sid="([^"]+)"/.exec(a)[1]);
    const bodyOf = (sig) => { const at = MAPJS.indexOf(sig); return at === -1 ? "" : MAPJS.slice(at, MAPJS.indexOf("\n  }", at)); };
    const ofpBody = bodyOf("function overFloatingPanel("), dialogsBody = bodyOf("function mapDialogs(");
    const listed = [...ofpBody.matchAll(/"#([A-Za-z][\w-]*)"/g)].map((x) => x[1])
      .concat(/\bmapDialogs\(\)/.test(ofpBody) ? [...dialogsBody.matchAll(/\["([A-Za-z][\w-]*)",/g)].map((x) => x[1]) : []);
    const guards = [...MAPJS.matchAll(/\bwrap\.addEventListener\("(mousedown|wheel)", \(e\) => \{([\s\S]*?)\n  \}\);/g)]
      .map((x) => ({ type: x[1], asks: /if \(overFloatingPanel\(e\.target\)\) return;/.test(x[2]), ownList: /closest\("#/.test(x[2]) }));
    rec("(precondition: #mapWrap found, with its floating panels, and map.js's one click-exclusion list)", wrap.length > 0 && panels.includes("mapCountryCard") && panels.includes("mapArmyPanel") && listed.length > 0, { panels: panels.length, listed: listed.length });
    const missing = panels.filter((p) => !listed.includes(p));
    rec("⭐⭐ every floating panel on the map — the card among them — is on map.js's click-exclusion list", missing.length === 0, missing);
    rec("⭐ …and both canvas guards (the press and the wheel) ask that one list, keeping none of their own", guards.length === 2 && guards.every((g) => g.asks && !g.ownList) && guards.map((g) => g.type).sort().join() === "mousedown,wheel", guards);

    // One id, one element. The card's ✕ was #ccClose — the Manage-countries dialog's ✕ already was, so
    // getElementById handed one of them the other's listener. Across map.html and the templates of every script it loads.
    const scripts = [...MAPHTML.matchAll(/<script src="\.?\/?([^"?]+)(?:\?[^"]*)?"><\/script>/g)].map((m) => m[1]).filter((s) => fs.existsSync(path.join(__dirname, "public", s)));
    const seen = new Map();
    const note = (id, where) => seen.set(id, (seen.get(id) || []).concat(where));
    for (const m of MAPHTML.matchAll(/\sid="([^"]+)"/g)) note(m[1], "map.html");
    for (const s of scripts) for (const m of fs.readFileSync(path.join(__dirname, "public", s), "utf8").matchAll(/\sid=\\?"([A-Za-z][\w-]*)\\?"/g)) note(m[1], s);
    const dupes = [...seen].filter(([, w]) => w.length > 1).map(([id, w]) => `${id} (${w.join(", ")})`);
    rec("(precondition: the card's own ids are among them)", seen.has("ctyCardClose") && scripts.includes("map.js"), scripts);
    rec("⭐⭐ no id on the map page is used twice", dupes.length === 0, dupes);

    // Everything the card decides reaches the page: every field build() returns is read by renderCountryCard.
    const r = MAPJS.indexOf("function renderCountryCard(");
    const render = r === -1 ? "" : MAPJS.slice(r, MAPJS.indexOf("\n  function ", r + 10));
    const sample = CC.build({ tag: "GER", tree: { kind: "own", tree: { treeId: "t", layer: "base", file: "f" } }, ideas: { laws: [], spirits: [], unsure: [] } });
    const unread = [...Object.keys(sample), ...Object.keys(sample.spirits), ...Object.keys(sample.focus)].filter((k) => !new RegExp("\\." + k + "\\b").test(render));
    rec("⭐ every field the card module builds is shown by map.js (a field nobody renders is a warning nobody sees)", render.length > 0 && unread.length === 0, unread);

    // The country's display name comes from the catalog, asked once per page. Two cards opened quickly used to race it
    // (the second saw a catalog still being read and showed the bare tag), and one failed ask left every card nameless
    // for the rest of the page. Lifted out of map.js and run against a fetch that counts, and fails when told to.
    const { maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
    const RAWMAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
    const n = MAPJS.indexOf("async function countryNameOf(");
    const nb = n === -1 ? null : jsBodyAt(maskJsLiterals(RAWMAP), n);
    const nameFn = nb ? RAWMAP.slice(n, nb[1] + 1) : "";
    rec("(precondition: countryNameOf lifted out of map.js)", nameFn.length > 0, nameFn.length);
    const ctx = { calls: 0, failNext: false, modPath: () => "C:\\mods\\m", encodeURIComponent };
    ctx.fetch = () => {
      ctx.calls++;
      if (ctx.failNext) { ctx.failNext = false; return Promise.reject(new Error("offline")); }
      return new Promise((res) => setTimeout(() => res({ json: () => Promise.resolve([{ tag: "GER", displayName: "Germany" }]) }), 20));
    };
    const vm = require("vm");
    vm.runInNewContext("let countryCatalogNames = null;\n" + nameFn + "\nthis.nameOf = countryNameOf;", ctx);
    const both = await Promise.all([ctx.nameOf("GER"), ctx.nameOf("GER")]);
    rec("⭐ two cards opened at once both get the name, from ONE ask of the catalog", both.join() === "Germany,Germany" && ctx.calls === 1, { both, calls: ctx.calls });
    // a fresh page: the first ask fails, the next card asks again and gets it
    const ctxF = { calls: 0, failNext: true, modPath: ctx.modPath, encodeURIComponent };
    ctxF.fetch = () => { ctxF.calls++; if (ctxF.failNext) { ctxF.failNext = false; return Promise.reject(new Error("offline")); } return Promise.resolve({ json: () => Promise.resolve([{ tag: "GER", displayName: "Germany" }]) }); };
    vm.runInNewContext("let countryCatalogNames = null;\n" + nameFn + "\nthis.nameOf = countryNameOf;", ctxF);
    const first = await ctxF.nameOf("GER");
    const second = await ctxF.nameOf("GER");
    rec("⭐ a failed ask costs that card its name only — the next card asks again", first === "" && second === "Germany" && ctxF.calls === 2, { first, second, calls: ctxF.calls });
  }

  console.log("\n7. ⭐⭐ Country Setup opens a country the mod inherits, and says so (it used to open nothing)");
  {
    const { maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
    const RAW = fs.readFileSync(path.join(__dirname, "public", "country-setup.js"), "utf8");
    const at = maskJsComments(RAW).indexOf("function selectFromDeepLink(");
    const b = at === -1 ? null : jsBodyAt(maskJsLiterals(RAW), at);
    const fn = b ? RAW.slice(at, b[1] + 1) : "";
    const vm = require("vm");
    const run = (search, listed, everyCountry, modPath) => {
      const ctx = { window: { location: { search } }, URLSearchParams, countries: listed, selectedTag: null, deepLinkHonoured: false,
        getActiveModPath: () => modPath, panelSub: { textContent: "" }, calls: [], out: null, every: everyCountry };
      ctx.selectCountry = (t, n) => ctx.calls.push([t, n]);
      vm.runInNewContext(fn + "\nout = selectFromDeepLink(every);", ctx);
      return ctx;
    };
    rec("(precondition: selectFromDeepLink lifted out of country-setup.js)", fn.length > 0, fn.length);
    const every = [{ tag: "GER", name: "Germany" }, { tag: "ABC", name: "Abc" }];
    let c = run("?tag=GER", [{ tag: "ABC", name: "Abc" }], every, "C:\\mods\\m");
    rec("⭐⭐ ?tag= for a country the mod inherits opens it, as 🌍 Customize base-game country does", c.out === true && c.calls.length === 1 && c.calls[0][0] === "GER", c.calls);
    rec("⭐ …and says it is the inherited one, and that Save writes an override", /inherits/.test(c.panelSub.textContent) && /override/.test(c.panelSub.textContent), c.panelSub.textContent);
    c = run("?tag=ABC", [{ tag: "ABC", name: "Abc" }], every, "C:\\mods\\m");
    rec("a country the mod lists opens as before, with no note", c.out === true && c.calls[0][0] === "ABC" && c.panelSub.textContent === "", c.calls);
    c = run("?tag=ZZZ", [{ tag: "ABC", name: "Abc" }], every, "C:\\mods\\m");
    rec("a tag the game does not load opens nothing", c.out === false && c.calls.length === 0, c.calls);
    c = run("?tag=GER", [{ tag: "ABC", name: "Abc" }], every, "");
    rec("with no mod active (the list is the base game's own), nothing is opened as 'inherited'", c.out === false && c.calls.length === 0, c.calls);
    rec("⭐ the page hands it the WHOLE catalog, not the mod-only list", /selectFromDeepLink\(norm\(raw\)\)/.test(maskJsComments(RAW)), null);
  }

  world.cleanup();
  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
})().catch((e) => { console.error(e); world.cleanup(); process.exitCode = 1; });
