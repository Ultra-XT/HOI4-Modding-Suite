// The adjacency panel must leave a link's TYPE alone unless the modder changes it.
// #an-apply-rewrote-a-strait-as-a-wall
//
// map/adjacencies.csv's Type column takes exactly three values across the six shipping maps (vanilla,
// Millennium Dawn, The Road to 56, Old World Blues, Novum Vexillum, Rise of Nations — 2,741 rows, measured
// 2026-09-10; re-counted below from the files, not typed in):
//
//     sea 1,386 · impassable 1,291 · (empty) 64
//
// The panel had two cards, and setAdjType() was `type === "sea" ? "sea" : "impassable"`. The EMPTY type is how
// vanilla writes all seven of its rule-controlled straits — GIBRALTAR_STRAIT twice, DANISH_BELTS_STRAIT,
// BOSPHORUS_STRAIT, DARDANELLES_STRAIT, HORMUZ_STRAIT and OTRANTO_STRAIT, every one joining two SEA provinces. Such
// a row opened with Impassable pre-selected, and pressing the panel's green button wrote it back as a wall:
//
//     5407;5382;;-1;-1;-1;-1;-1;GIBRALTAR_STRAIT;Gibraltar North
//  -> 5407;5382;impassable;-1;-1;-1;-1;-1;GIBRALTAR_STRAIT;Gibraltar North      changed:true, no warning
//
// 0 of the corpus's 1,291 impassable rows carry a rule name. It lost more than the type, too: 9 of the 64
// empty-type rows carry a sea THROUGH (The Road to 56's and Novum Vexillum's Danish island crossings, e.g.
// `11251;3325;;2408;2956;1628;2960;1629;;Fyn-SdrJylland`), and adjApply sent -1 for every type except sea.
//
// So: the panel offers a card for every type the maps ship, the type travels VERBATIM from the row to the write, a
// through survives on any type that is not impassable, and a card the modder actually clicks still wins.
//
// ⭐ SEND WHAT THE CLIENT SENDS. The panel's own functions are lifted out of public/map.js and run against a stubbed
// DOM whose cards are read out of public/map.html; the bodies they queue are replayed through the real
// writeAdjacency exactly as /api/map/adjacency hands them over. test-adjacency-edit-keeps-its-rule.js could not see
// this: it re-writes every row at its OWN type, a value the client never sent for any of the 64.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260)));
  if (!ok) fails.push(label);
};

const tmps = [];
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-adjtype-home-")); tmps.push(HOME);
process.env.NOVA_HOME_DIR = HOME;
process.env.NOVA_APP_DATA_DIR = path.join(HOME, "appdata");
process.env.APPDATA = path.join(HOME, "roaming");
process.env.XDG_CONFIG_HOME = path.join(HOME, "xdg");
for (const d of [process.env.NOVA_APP_DATA_DIR, process.env.APPDATA, process.env.XDG_CONFIG_HOME]) fs.mkdirSync(d, { recursive: true });
const md = require("./map-data.js");

const MAP_JS = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MAP_HTML = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");

function liftFunction(src, name) {
  const at = src.indexOf("function " + name + "(");
  if (at === -1) return "";
  let depth = 0, i = src.indexOf("(", at);
  for (; i < src.length; i++) { if (src[i] === "(") depth++; else if (src[i] === ")") { depth--; if (depth === 0) break; } }
  let d = 0;
  for (i = src.indexOf("{", i); i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (d === 0) return src.slice(at, i + 1); }
  }
  return "";
}

// The whole adjacency section, so a helper added inside it comes along without this test naming it.
const SECTION_START = "// ── Adjacency mode (straits / canals / impassable borders)";
const SECTION_END = "// ── Supply hubs + railways";
const sa = MAP_JS.indexOf(SECTION_START), sb = MAP_JS.indexOf(SECTION_END, sa + 1);
const SECTION = sa >= 0 && sb > sa ? MAP_JS.slice(sa, sb) : "";
const QUEUE = liftFunction(MAP_JS, "queueWrite");
// Every card the panel offers, and the hidden input's own starting value — both read from the page.
const CARD_TYPES = [...MAP_HTML.matchAll(/class="adj-card"[^>]*\bdata-adj-type="([^"]*)"/g)].map((m) => m[1]);
const TYPE_DEFAULT = (MAP_HTML.match(/id="mapAdjType"[^>]*\bvalue="([^"]*)"/) || [])[1];

/** The panel, running its real code against a stubbed DOM. */
function makePanel({ adjacencies, provinceType }) {
  const statuses = [];
  const input = (v) => { let val = String(v); return { style: {}, get value() { return val; }, set value(x) { val = String(x); } }; };
  const els = {
    mapAdjPanel: { dataset: {}, style: {} },
    mapAdjTitle: { textContent: "" },
    mapAdjExisting: { style: {}, textContent: "" },
    mapAdjRemove: { style: {} },
    mapAdjThrough: input(""),
    mapAdjType: input(TYPE_DEFAULT),
    mapAdjThroughRow: { style: {} },
  };
  const cards = CARD_TYPES.map((t) => {
    const cls = new Set(["adj-card"]);
    return { dataset: { adjType: t }, classList: { toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); }, contains: (c) => cls.has(c) } };
  });
  const documentStub = { querySelectorAll: (sel) => (sel === "#mapAdjPanel .adj-card" ? cards : []) };
  const model = { adjacencies };
  const api = new Function("$", "document", "model", "provinceType", "setStatus", "pushUndo", "draw", "setMapDirty",
    '"use strict";\nlet adjFirst = null;\nlet pendingWrites = [];\n' + QUEUE + "\n" + SECTION +
    "\nreturn { openAdjPanel, adjApply, setAdjType, pendingWrites: () => pendingWrites };")(
    (id) => els[id] || null, documentStub, model, provinceType, (s) => statuses.push(String(s)), () => {}, () => {}, () => {});
  return {
    els, cards, model, statuses,
    open: (from, to) => api.openAdjPanel(from, to),
    // What the card's click listener does (public/map.js: `setAdjType(c.dataset.adjType)`).
    click: (type) => { const c = cards.find((k) => k.dataset.adjType === type); if (!c) return false; api.setAdjType(c.dataset.adjType); return true; },
    selected: () => cards.filter((c) => c.classList.contains("selected")).map((c) => c.dataset.adjType),
    typeThrough: (v) => { els.mapAdjThrough.value = v; },
    apply: (action) => api.adjApply(action),
    writes: () => api.pendingWrites(),
    last: () => statuses[statuses.length - 1] || "",
  };
}

/** Replay the queue the way flushMapSaves + /api/map/adjacency do: JSON over the wire, then these fields. */
function flush(h, modRoot, gameRoot) {
  const out = [];
  for (const w of h.writes().splice(0)) {
    const b = JSON.parse(JSON.stringify(Object.assign({}, w.body, { modPath: modRoot })));
    out.push(md.writeAdjacency({ modRoot, gameRoot, dependencyRoots: [], action: b.action, from: b.from, to: b.to, type: b.type, through: b.through, rule: b.rule, comment: b.comment }));
  }
  return out;
}

const provinceTypeOf = (defText) => {
  const m = new Map();
  for (const ln of String(defText).split(/\r?\n/)) {
    const c = ln.split(";");
    const id = parseInt(c[0], 10);
    if (Number.isFinite(id) && c.length >= 5) m.set(id, (c[4] || "").trim().toLowerCase());
  }
  return m;
};
const pairRows = (text, a, b) => String(text).split(/\r?\n/).filter((l) => {
  const k = l.split(";"); const x = parseInt(k[0], 10), y = parseInt(k[1], 10);
  return (x === a && y === b) || (x === b && y === a);
});

// ── the fixture: one row of every shape the corpus ships ─────────────────────────────────────────────────
const DEF = [
  "0;0;0;0;land;false;unknown;0",
  "1;10;0;0;land;false;plains;1", "2;20;0;0;land;false;plains;1", "3;30;0;0;land;false;plains;1",
  "4;40;0;0;sea;false;ocean;0", "5;50;0;0;sea;false;ocean;0", "6;60;0;0;sea;false;ocean;0", "7;70;0;0;sea;false;ocean;0",
].join("\r\n") + "\r\n";
const HEADER = "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment";
const ROWS = [
  "4;5;;-1;-1;-1;-1;-1;GIBRALTAR_STRAIT;Gibraltar North",   // vanilla's shape: empty type, two seas, a rule
  "1;2;;4;2956;1628;2960;1629;;Fyn-SdrJylland",              // R56/NV's shape: empty type WITH a sea through
  "6;7;sea;3;-1;-1;-1;-1;SUEZ_CANAL;Suez",                   // a canal
  "1;3;sea;4;-1;-1;-1;-1;;Strait",                            // a strait
  "2;3;impassable;-1;-1;-1;-1;-1;;Wall",                      // an impassable border
];
const ADJ = [HEADER, ...ROWS, "-1;-1;-1;-1;-1;-1;-1;-1;-1;"].join("\r\n") + "\r\n";

try {
  const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-adjtype-game-")); tmps.push(GAME);
  const makeMod = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-adjtype-mod-")); tmps.push(d);
    fs.mkdirSync(path.join(d, "map"), { recursive: true });
    fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="AdjType"\nreplace_path="map"\n');
    fs.writeFileSync(path.join(d, "map", "definition.csv"), DEF);
    fs.writeFileSync(path.join(d, "map", "adjacencies.csv"), ADJ);
    return d;
  };

  console.log("\n0. the harness runs the page's own code");
  rec("the adjacency section was lifted out of public/map.js", /function adjApply\(/.test(SECTION) && /function openAdjPanel\(/.test(SECTION) && /function setAdjType\(/.test(SECTION), SECTION.length);
  rec("…from exactly one place", MAP_JS.split(SECTION_START).length === 2, MAP_JS.split(SECTION_START).length - 1);
  rec("queueWrite was lifted", /pendingWrites\.push/.test(QUEUE), QUEUE.slice(0, 80));
  rec("the panel's cards were read out of public/map.html", CARD_TYPES.length >= 2 && typeof TYPE_DEFAULT === "string", { CARD_TYPES, TYPE_DEFAULT });

  console.log("\n1. ⭐⭐⭐ the panel can say every type the maps ship");
  const CORPUS = [
    ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
    ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"],
    ["The Road to 56", "D:/SteamLibrary/steamapps/workshop/content/394360/820260968"],
    ["Old World Blues", "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196"],
    ["Novum Vexillum", "D:/SteamLibrary/steamapps/workshop/content/394360/1827273767"],
    ["Rise of Nations", "D:/SteamLibrary/steamapps/workshop/content/394360/2026448968"],
  ];
  const corpus = [];
  for (const [label, root] of CORPUS) {
    const a = path.join(root, "map", "adjacencies.csv"), d = path.join(root, "map", "definition.csv");
    if (fs.existsSync(a) && fs.existsSync(d)) corpus.push({ label, adj: fs.readFileSync(a, "utf8"), def: fs.readFileSync(d, "utf8") });
  }
  const typeCounts = new Map();
  for (const src of [{ adj: ADJ }, ...corpus]) for (const r of md.parseAdjacencies(src.adj)) typeCounts.set(r.type, (typeCounts.get(r.type) || 0) + 1);
  console.log(`     maps read: fixture${corpus.map((c) => ", " + c.label).join("")}`);
  console.log(`     type values: ${[...typeCounts].map(([t, n]) => `${JSON.stringify(t)} ${n}`).join(" · ")}`);
  const missing = [...typeCounts.keys()].filter((t) => !CARD_TYPES.includes(t));
  rec("⭐⭐⭐ the panel has a card for EVERY type value the maps ship", missing.length === 0, { missing, cards: CARD_TYPES });

  console.log("\n2. ⭐⭐⭐ Add link on an existing row, touching nothing, writes the row back exactly");
  for (const raw of ROWS) {
    const c = raw.split(";");
    const from = parseInt(c[0], 10), to = parseInt(c[1], 10), label = c[9] || raw;
    const mod = makeMod();
    const h = makePanel({ adjacencies: md.parseAdjacencies(ADJ), provinceType: provinceTypeOf(DEF) });
    h.open(from, to);
    h.apply("add");
    const w = h.writes()[0] || null;
    rec(`${label}: the panel queues the write`, !!w, h.last());
    if (!w) continue;
    const res = flush(h, mod, GAME)[0] || {};
    const after = pairRows(fs.readFileSync(path.join(mod, "map", "adjacencies.csv"), "utf8"), from, to);
    rec(`⭐⭐⭐ ${label}: …and the row on disk is exactly what it was`, res.changed === true && after.length === 1 && after[0] === raw,
      { sent: w.body, res, after });
  }

  console.log("\n3. the modder's own choice still wins");
  {
    const fresh = () => makePanel({ adjacencies: md.parseAdjacencies(ADJ), provinceType: provinceTypeOf(DEF) });
    let h = fresh();
    h.open(4, 5);
    rec("⭐⭐ an empty-type row opens with the EMPTY type selected, not Impassable",
      h.els.mapAdjType.value === "" && JSON.stringify(h.selected()) === JSON.stringify([""]), { hidden: h.els.mapAdjType.value, selected: h.selected() });

    h = fresh(); h.open(4, 5); h.click("impassable"); h.apply("add");
    let b = (h.writes()[0] || {}).body || {};
    rec("clicking Impassable on it makes it impassable", b.type === "impassable" && b.through === -1, b);

    h = fresh(); h.open(4, 5); h.click("sea"); h.typeThrough("6"); h.apply("add");
    b = (h.writes()[0] || {}).body || {};
    rec("clicking Sea strait with a crossing makes it a strait", b.type === "sea" && b.through === 6, b);

    h = fresh(); h.open(4, 5); h.click("impassable");
    const clicked = h.click("");
    h.apply("add");
    b = (h.writes()[0] || {}).body || {};
    rec("⭐⭐ …and the empty-type card can be clicked back", clicked && b.type === "", { clicked, body: b });

    // A crossing now survives on an empty-type link, so the panel's two refusals must reach it too — none of the
    // corpus's nine such rows trips either (section 4 counts every refusal), so neither cries wolf.
    h = fresh(); h.open(1, 2); h.typeThrough("999"); h.apply("add");
    rec("⭐ a crossing given on an empty-type link must be a province that exists", h.writes().length === 0 && /no province 999/i.test(h.last()), h.last());
    h = fresh(); h.open(1, 2); h.typeThrough("2"); h.apply("add");
    rec("⭐ …and must be a THIRD province", h.writes().length === 0 && /THIRD province/.test(h.last()), h.last());

    h = fresh(); h.open(1, 7); h.apply("add");
    b = (h.writes()[0] || {}).body || {};
    rec("CONTROL: a brand-new link still starts from the page's default type", b.type === TYPE_DEFAULT && b.through === -1, { body: b, TYPE_DEFAULT });
  }

  console.log("\n4. 🈯 every row of every shipping map, opened and applied unchanged");
  if (!corpus.length) console.log("  ..   (no shipping map is installed here — the fixture above still ran)");
  for (const src of corpus) {
    const rows = md.parseAdjacencies(src.adj);
    const h = makePanel({ adjacencies: rows, provinceType: provinceTypeOf(src.def) });
    const seenPair = new Set();
    let opened = 0, refused = 0, refusedNotSea = 0, typeChanged = 0, throughChanged = 0;
    const examples = [];
    for (const r of rows) {
      const k = Math.min(r.from, r.to) + "-" + Math.max(r.from, r.to);
      if (seenPair.has(k)) continue;      // the panel opens the FIRST row of a pair (findAdjacency)
      seenPair.add(k);
      h.model.adjacencies = rows;
      h.writes().length = 0;
      h.open(r.from, r.to);
      h.apply("add");
      opened++;
      const w = h.writes()[0];
      if (!w) { refused++; if (r.type !== "sea") refusedNotSea++; continue; }
      const wantThrough = Number.isFinite(r.through) && r.through >= 0 ? r.through : -1;
      if (w.body.type !== r.type) { typeChanged++; if (examples.length < 2) examples.push(r.raw + "  ->  type " + JSON.stringify(w.body.type)); }
      if (w.body.through !== wantThrough) { throughChanged++; if (examples.length < 4) examples.push(r.raw + "  ->  through " + w.body.through); }
    }
    console.log(`     ${src.label}: opened ${opened}, refused ${refused}, type changed ${typeChanged}, through changed ${throughChanged}`);
    rec(`⭐⭐⭐ ${src.label}: no unchanged Apply changes a row's type`, typeChanged === 0, examples);
    rec(`⭐⭐ ${src.label}: …or its through`, throughChanged === 0, examples);
    rec(`${src.label}: …and every row the panel refuses to re-apply is a sea row it always refused`, refusedNotSea === 0, refusedNotSea);
  }

  console.log(`\n=== applying an adjacency leaves its type alone: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
