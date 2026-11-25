// ⛔ #nova-does-not-find-the-game — WITH NO GAME FOLDER FOUND, THE MAKERS SAY SO INSTEAD OF SAYING THE BASE GAME HAS NOTHING.
//
// Driven with no game folder found and a blank mod, every endpoint the research maker, the focus maker and the map editor read
// on open answered 200 (no 500) — and four places on those pages then told the modder something false:
//   research — "Nothing else defines a research tree here either, so the canvas really is empty", over a "Copy Generic Tree"
//              button that copies nothing, while the game loads 552 technologies into that mod;
//   map      — "No definition.csv found (mod or base game). Can't render the map.";
//   focus    — the icon picker's "No icons found." (the base game has 3,232 focus icons), and the tech-bonus wizard's "Check HOI4
//              install path or set HOI4_ROOT", an environment variable a modder using the app has no way to set.
// Now each response says gameFound, and each page says that Nova did not find the game and where to set it (Home, Game folder).
//
// SEND WHAT THE CLIENT SENDS, READ WHAT THE PAGE READS: the requests are the pages' own URLs, against this file's own server on
// 54784 (in-process, app data in the bare-run sandbox), and the page code that reads each answer is LIFTED out of
// public/research.js, public/map.js and public/app.js and run on that answer. The game, when there is one, is a fixture.
"use strict";
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { maskJsLiterals, maskJsComments, jsBodyAt } = require("./testlib-strip-comments.js");

const PORT = 54784;
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 500) : "")); }
};

delete process.env.HOI4_ROOT;
const T = fs.mkdtempSync(path.join(os.tmpdir(), "nova-no-game-makers-"));
const write = (p, text) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const MOD = path.join(T, "mods", "blank");
write(path.join(MOD, "descriptor.mod"), 'version="1.0"\nname="Blank"\nsupported_version="1.19.*"\n');
const GAME = path.join(T, "Games", "Hearts of Iron IV");
write(path.join(GAME, "hoi4.exe"), "MZ");
write(path.join(GAME, "launcher-settings.json"), JSON.stringify({ gameId: "hoi4", rawVersion: "v1.19.4.1", version: "v1.19.4.1" }));
write(path.join(GAME, "common", "technologies", "fixture_tech.txt"),
  "technologies = {\n\tfixture_tech = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }\n\t}\n}\n");
write(path.join(GAME, "common", "technology_tags", "00_technology.txt"), "technology_categories = {\n\tinfantry_weapons\n}\n");

const S = require("./server.js");

/** The page code that starts at `anchor` (found once, outside comments) and runs to the close of the block it opens. */
function lift(file, anchor) {
  const raw = fs.readFileSync(path.join(__dirname, "public", file), "utf8");
  const plain = maskJsComments(raw);
  const at = plain.indexOf(anchor);
  if (at < 0 || plain.indexOf(anchor, at + 1) >= 0) throw new Error(`${file}: "${anchor}" is not there exactly once`);
  const b = jsBodyAt(maskJsLiterals(raw), at);
  if (!b) throw new Error(`${file}: no block after "${anchor}"`);
  return raw.slice(at, b[1] + 1);
}
const run = (code, ctx) => { vm.createContext(ctx); vm.runInContext(`(function () {\n${code}\n})();`, ctx); return ctx; };

/** research.js's checkEmptyTreeOverlay over a stand-in page: the canvas, the mod selector, and the card it prepends. A button
 *  the code looks up is there only when the card it wrote names it. */
function researchCard(catalog) {
  const fn = lift("research.js", "function checkEmptyTreeOverlay()");
  let card = null;
  const el = (id) => ({ id, style: {}, className: "", innerHTML: "", remove() { if (card === this) card = null; }, addEventListener() {} });
  const container = Object.assign(el("canvasContainer"), { prepend(o) { card = o; } });
  const canvas = el("researchCanvas");
  const selector = { selectedIndex: 0, options: [{ text: "Blank", dataset: { vanilla: "0" } }] };
  const ctx = {
    document: {
      createElement: () => el(""),
      getElementById: (id) => {
        if (id === "canvasContainer") return container;
        if (id === "researchCanvas") return canvas;
        if (id === "headerModSelector") return selector;
        if (id === "emptyTreeOverlay") return card && card.id === id ? card : null;
        return card && new RegExp(`id="${id}"`).test(card.innerHTML) ? el(id) : null;
      },
    },
    allTechs: catalog.technologies || [], SHOW_BASE_TECHS: true, catalogGameFound: catalog.gameFound !== false,
    tempVanillaTechs: [], tempVanillaEquips: {}, allEquips: {}, dirtyTechIds: new Set(), NOVA_DEFAULT_EQUIPMENT_FILE: "x.txt",
    markDirty() {}, renderTabs() {}, renderCanvas() {}, updateSidebar() {}, JSON,
  };
  run(fn + "\ncheckEmptyTreeOverlay();", ctx);
  return card ? card.innerHTML.replace(/\s+/g, " ") : "";
}
const mapStatus = (model) => { let s = ""; run(lift("map.js", "if (!m.provinces || !m.provinces.length) {"), { m: model, setStatus: (t) => { s = t; } }); return s; };
const focusPicker = (data) => {
  const grid = { innerHTML: "" };
  run(lift("app.js", "if (!data.sprites || data.sprites.length === 0) {"), { data, iconPickerGrid: grid, allFocusSprites: null, allFocusSpritesRoot: "", pickerRoot: MOD });
  return grid.innerHTML;
};
const techWizard = (payload) => {
  const list = { innerHTML: "" };
  run(lift("app.js", "if (!techBonusWizardState.categories.length) {"), { payload, techBonusWizardState: { categories: payload.categories || [] }, techBonusWizardListEl: list, renderTechBonusWizardList() {} });
  return list.innerHTML;
};

(async () => {
  const srv = S.createApp().listen(PORT, "127.0.0.1");
  await new Promise((r, j) => { srv.once("listening", r); srv.once("error", j); });
  const get = async (u) => { const r = await fetch(`http://127.0.0.1:${PORT}${u}`); return { status: r.status, body: await r.json() }; };
  const q = `?modPath=${encodeURIComponent(MOD)}`;
  // the pages' own requests (research.js loadCatalog, app.js's icon picker and tech-bonus wizard, map.js's load)
  const ask = async () => ({
    catalog: await get(`/api/technologies/catalog${q}`),
    sprites: await get(`/api/focus/sprites${q}`),
    model: await get(`/api/map/model${q}`),
    cats: await get(`/api/vanilla/tech-categories${q}`),
    catsBare: await get("/api/vanilla/tech-categories"),
  });
  try {
    console.log("\n1. no game folder found: every answer is a 200 that says so");
    S.applyGameFolderDetection({ found: null, candidates: [] });
    S.resetGameFolderCaches();
    ok(S.hoi4GameFolderFound() === false && S.resolveHoi4GameRoot() === S.NO_GAME_FOLDER, "precondition: Nova has no game folder", S.resolveHoi4GameRoot());
    const no = await ask();
    ok(Object.values(no).every((r) => r.status === 200), "no request is refused or a 500", Object.fromEntries(Object.entries(no).map(([k, r]) => [k, r.status])));
    ok(no.catalog.body.gameFound === false && (no.catalog.body.technologies || []).length === 0, "research catalogue: no technologies, gameFound false", { n: (no.catalog.body.technologies || []).length, gameFound: no.catalog.body.gameFound });
    ok(no.sprites.body.gameFound === false && (no.sprites.body.sprites || []).length === 0, "focus icons: none, gameFound false", { gameFound: no.sprites.body.gameFound });
    ok(no.model.body.ok === true && (no.model.body.provinces || []).length === 0 && no.model.body.gameFound === false, "map model: no provinces, gameFound false", { ok: no.model.body.ok, gameFound: no.model.body.gameFound });
    ok(no.cats.body.gameFound === false && no.catsBare.body.gameFound === false, "tech categories: gameFound false, with and without the mod", [no.cats.body.gameFound, no.catsBare.body.gameFound]);
    const warn = String(no.catsBare.body.warning || "");
    ok(/could not find Hearts of Iron IV/.test(warn) && /Game folder/.test(warn) && !/HOI4_ROOT/.test(warn), "…and its warning says the game was not found and where to set it, not HOI4_ROOT", warn);

    console.log("\n2. ⭐⭐ …and each page says that Nova did not find the game, and where to set it");
    const card = researchCard(no.catalog.body);
    ok(/Nova could not find Hearts of Iron IV/.test(card) && /Game folder/.test(card), "research: the card says Nova could not find the game, and to set the game folder on Home", card.slice(0, 300));
    ok(!/canvas really is empty/.test(card), "…and not that nothing defines a research tree here", card.slice(0, 300));
    ok(!/id="copyVanillaTreeBtn"/.test(card) && /id="startEmptyTreeBtn"/.test(card), "…and offers no Copy Generic Tree (nothing to copy), only Start Fresh", card.slice(0, 300));
    const loadCat = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
    const lc = maskJsComments(loadCat);
    const lcAt = lc.indexOf("async function loadCatalog()");
    const lcBody = lcAt >= 0 ? (() => { const b = jsBodyAt(maskJsLiterals(loadCat), lcAt); return b ? lc.slice(b[0], b[1]) : ""; })() : "";
    ok(/catalogGameFound\s*=\s*data\.gameFound\s*!==\s*false/.test(lcBody), "…the flag the card reads is the catalogue's own answer (loadCatalog sets it from data.gameFound)", lcAt);
    const st = mapStatus(no.model.body);
    ok(/Nova could not find Hearts of Iron IV/.test(st) && /Game folder/.test(st) && !/No definition\.csv found/.test(st), "map: the status says Nova could not find the game, not that the base game has no definition.csv", st);
    const pick = focusPicker(no.sprites.body);
    ok(/Nova could not find Hearts of Iron IV/.test(pick) && /Game folder/.test(pick), "focus: the icon picker says why it has no icons", pick);
    const wiz = techWizard(no.cats.body);
    ok(/Nova could not find Hearts of Iron IV/.test(wiz) && /Game folder/.test(wiz) && !/HOI4_ROOT/.test(wiz), "focus: the tech-bonus wizard says the game was not found and where to set it, not HOI4_ROOT", wiz);

    console.log("\n3. CONTROL: with a game folder found, the answers say so and the pages say what they always said");
    const found = { path: GAME, source: "steam", where: "the Steam library (fixture)", how: "fixture", valid: true };
    S.applyGameFolderDetection({ found, candidates: [found] });
    S.resetGameFolderCaches();
    ok(S.hoi4GameFolderFound() === true, "precondition: the fixture game is in use", S.resolveHoi4GameRoot());
    const yes = await ask();
    ok(yes.catalog.body.gameFound === true && (yes.catalog.body.technologies || []).some((t) => t.id === "fixture_tech"), "research catalogue: gameFound true, and the game's technology is in it", { gameFound: yes.catalog.body.gameFound });
    ok(yes.sprites.body.gameFound === true && yes.model.body.gameFound === true && yes.cats.body.gameFound === true, "focus icons, map model, tech categories: gameFound true", [yes.sprites.body.gameFound, yes.model.body.gameFound, yes.cats.body.gameFound]);
    const empty = Object.assign({}, yes.catalog.body, { technologies: [] });   // a found game whose tree the mod has none of
    const card2 = researchCard(empty);
    ok(/canvas really is empty/.test(card2) && /id="copyVanillaTreeBtn"/.test(card2) && !/could not find/.test(card2), "research: with the game found, an empty tree keeps its card and its Copy Generic Tree", card2.slice(0, 200));
    ok(/No definition\.csv found/.test(mapStatus(yes.model.body)), "map: with the game found, a map with no provinces keeps its message", mapStatus(yes.model.body));
    ok(focusPicker({ sprites: [], gameFound: true }) .includes("No icons found.") && !/could not find/.test(focusPicker({ sprites: [], gameFound: true })), "focus: with the game found, no icons is just \"No icons found.\"", focusPicker({ sprites: [], gameFound: true }));
    ok(!/could not find|HOI4_ROOT/.test(techWizard({ categories: [], gameFound: true })), "focus: with the game found, the wizard does not blame the game folder", techWizard({ categories: [], gameFound: true }));

    console.log("\n4. ⭐⭐ the advice is the Game folder setting, in every message that gives it (review P-P4)");
    // The focus page's "Copy Generic Tree" request (app.js: { modPath: activeModPath }); the fixture game has no generic tree.
    const copy = () => fetch(`http://127.0.0.1:${PORT}/api/mod/copy-generic-focus-tree`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modPath: MOD }) })
      .then(async (r) => ({ status: r.status, error: String(((await r.json().catch(() => ({}))) || {}).error || "") }));
    const withGame = await copy();
    ok(withGame.status >= 400 && withGame.error.includes(GAME) && /Home page \(Game folder\)/.test(withGame.error) && !/could not find Hearts of Iron IV/.test(withGame.error),
      "⭐ with a game found, a copy with nothing to copy names the folder Nova reads and the setting that changes it", withGame);
    S.applyGameFolderDetection({ found: null, candidates: [] });
    const noGame = await copy();
    ok(noGame.status >= 400 && /Nova could not find Hearts of Iron IV on this PC/.test(noGame.error) && /Home page \(Game folder\)/.test(noGame.error),
      "⭐⭐ with none, it says Nova could not find the game, and where to set it", noGame);
    // …and no string left in the server or a page sends a modder to a setting that is not there: a "game path", an "install
    // path" or HOI4_ROOT, an environment variable a modder using the app cannot set. Comments masked; strings read.
    const told = [];
    const files = ["server.js", ...fs.readdirSync(path.join(__dirname, "public")).filter((f) => /\.js$/.test(f)).map((f) => "public/" + f)];
    for (const rel of files) {
      const src = maskJsComments(fs.readFileSync(path.join(__dirname, rel), "utf8"));
      for (const m of src.matchAll(/set your HOI4 game path|check (?:the )?HOI4 install(?:ation)? path|HOI4 install \/ HOI4_ROOT|(?:check|set) HOI4_ROOT|HOI4_ROOT \/ mod layout/gi)) told.push(`${rel}: ${m[0]}`);
    }
    ok(files.length > 20 && told.length === 0, `⭐⭐ no message in server.js or the ${files.length} page scripts tells a modder to set a game path, an install path or HOI4_ROOT`, told);
  } catch (e) {
    fail++;
    console.log("  FAIL threw: " + (e && e.stack || e));
  } finally {
    srv.close();
    try { fs.rmSync(T, { recursive: true, force: true }); } catch (_) { /* this file's own mkdtemp; nothing else */ }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
