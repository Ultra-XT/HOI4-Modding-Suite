// ⛔ #a-relink-replaces-one-row (tool campaign B4-5) — RE-APPLYING A LINK ON A PAIR THE FILE LINKS BY TWO ROWS: THE PAGE KEEPS WHAT THE DISK KEEPS.
//
// Millennium Dawn links the Bosphorus (5412 ↔ 7678) and the Dardanelles by two rows apiece. 🔗 on that pair, Sea, through 9833, Add link:
// writeAdjacency replaces ONE row (findAdjacencyRowFor: the pair's row of the same type, else its first) and keeps the other, while the
// page's adjApply dropped every row of the pair and pushed one. So before a reload the panel said "Already linked (sea through 9833,
// adjacency rule BOSPHORUS_STRAIT)" and after it "(no type, adjacency rule BOSPHORUS_STRAIT)": the page and the disk disagreed, and the
// edit looked lost. Now the page drops only the row the writer replaces, and the panel names every row of such a pair.
//
// RUN, not grepped: the page's adjacency section (lifted from public/map.js) on a parsed adjacencies.csv; its writes replayed through the
// server's own writeAdjacency on a temp mod; the page's rows held against the file's, and the panel's words before and after a reload
// (the file parsed again). Binds no port.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0; const fails = [];
const rec = (label, ok, detail) => { checks++; console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400))); if (!ok) fails.push(label); };

const tmps = [];
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-relink-home-")); tmps.push(HOME);
process.env.NOVA_HOME_DIR = HOME;
process.env.NOVA_APP_DATA_DIR = path.join(HOME, "appdata");
process.env.APPDATA = path.join(HOME, "roaming");
process.env.XDG_CONFIG_HOME = path.join(HOME, "xdg");
for (const d of [process.env.NOVA_APP_DATA_DIR, process.env.APPDATA, process.env.XDG_CONFIG_HOME]) fs.mkdirSync(d, { recursive: true });
const md = require("./map-data.js");

const MAP_JS = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8").replace(/\r\n/g, "\n");
const MAP_HTML = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
function liftFunction(src, name) {
  const at = src.indexOf("function " + name + "(");
  if (at === -1) return "";
  let depth = 0, i = src.indexOf("(", at);
  for (; i < src.length; i++) { if (src[i] === "(") depth++; else if (src[i] === ")") { depth--; if (depth === 0) break; } }
  let d = 0;
  for (i = src.indexOf("{", i); i < src.length; i++) { if (src[i] === "{") d++; else if (src[i] === "}") { d--; if (d === 0) return src.slice(at, i + 1); } }
  return "";
}
const SECTION_START = "// ── Adjacency mode (straits / canals / impassable borders)", SECTION_END = "// ── Supply hubs + railways";
const sa = MAP_JS.indexOf(SECTION_START), sb = MAP_JS.indexOf(SECTION_END, sa + 1);
const SECTION = sa >= 0 && sb > sa ? MAP_JS.slice(sa, sb) : "";
const QUEUE = liftFunction(MAP_JS, "queueWrite");
const CARD_TYPES = [...MAP_HTML.matchAll(/class="adj-card"[^>]*\bdata-adj-type="([^"]*)"/g)].map((m) => m[1]);
const TYPE_DEFAULT = (MAP_HTML.match(/id="mapAdjType"[^>]*\bvalue="([^"]*)"/) || [])[1];

function makePanel(adjacencies, provinceType) {
  const statuses = [];
  const input = (v) => { let val = String(v); return { style: {}, get value() { return val; }, set value(x) { val = String(x); } }; };
  const els = { mapAdjPanel: { dataset: {}, style: {} }, mapAdjTitle: { textContent: "" }, mapAdjExisting: { style: {}, textContent: "" }, mapAdjRemove: { style: {} },
    mapAdjThrough: input(""), mapAdjType: input(TYPE_DEFAULT), mapAdjThroughRow: { style: {} } };
  const cards = CARD_TYPES.map((t) => { const cls = new Set(["adj-card"]); return { dataset: { adjType: t }, classList: { toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); }, contains: (c) => cls.has(c) } }; });
  const documentStub = { querySelectorAll: (sel) => (sel === "#mapAdjPanel .adj-card" ? cards : []) };
  const model = { adjacencies };
  const api = new Function("$", "document", "model", "provinceType", "setStatus", "pushUndo", "draw", "setMapDirty",
    '"use strict";\nlet adjFirst = null;\nlet pendingWrites = [];\n' + QUEUE + "\n" + SECTION + "\nreturn { openAdjPanel, adjApply, setAdjType, pendingWrites: () => pendingWrites };")(
    (id) => els[id] || null, documentStub, model, provinceType, (s) => statuses.push(String(s)), () => {}, () => {}, () => {});
  return {
    els, model, statuses,
    open: (from, to) => { api.openAdjPanel(from, to); return els.mapAdjExisting.textContent; },
    pick: (type) => api.setAdjType(type),
    through: (v) => { els.mapAdjThrough.value = v; },
    apply: (action) => api.adjApply(action),
    writes: () => api.pendingWrites(),
  };
}
const DEF = ["0;0;0;0;land;false;unknown;0", "1;10;0;0;land;false;plains;1", "2;20;0;0;land;false;plains;1", "3;30;0;0;land;false;plains;1",
  "4;40;0;0;sea;false;ocean;0", "5;50;0;0;land;true;plains;1", "6;60;0;0;land;true;plains;1", "7;70;0;0;sea;false;ocean;0"].join("\r\n") + "\r\n";
const types = new Map(DEF.trim().split(/\r?\n/).map((l) => { const c = l.split(";"); return [Number(c[0]), c[4]]; }));
const HEADER = "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment";
// Millennium Dawn's shape for the Bosphorus: a blank-type row carrying the rule, and a sea row, for one pair of land provinces.
const ROWS = ["5;6;;4;-1;-1;-1;-1;STRAIT_RULE;the strait's rule row", "1;2;impassable;-1;-1;-1;-1;-1;;Wall", "6;5;sea;4;-1;-1;-1;-1;;the strait's sea row"];
const ADJ = [HEADER, ...ROWS, "-1;-1;-1;-1;-1;-1;-1;-1;-1;"].join("\r\n") + "\r\n";
const key = (j) => `${Math.min(j.from, j.to)}-${Math.max(j.from, j.to)}|${j.type || ""}|${j.through}|${j.rule || ""}`;
const pairOf = (rows) => rows.filter((j) => (j.from === 5 && j.to === 6) || (j.from === 6 && j.to === 5)).map(key).sort();

try {
  const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-relink-game-")); tmps.push(GAME);
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-relink-mod-")); tmps.push(mod);
  fs.mkdirSync(path.join(mod, "map"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Relink"\nreplace_path="map"\n');
  fs.writeFileSync(path.join(mod, "map", "definition.csv"), DEF);
  fs.writeFileSync(path.join(mod, "map", "adjacencies.csv"), ADJ);
  rec("THE CONTROL: the page's adjacency section and queueWrite were lifted, and the panel's cards read from map.html", /function adjApply\(/.test(SECTION) && /pendingWrites\.push/.test(QUEUE) && CARD_TYPES.includes("sea"), { section: SECTION.length, CARD_TYPES });

  const h = makePanel(md.parseAdjacencies(ADJ), types);
  const opened = h.open(5, 6);
  rec("THE CONTROL: the file links the pair by two rows, and the page holds both", pairOf(h.model.adjacencies).length === 2, pairOf(h.model.adjacencies));
  rec("⭐ the panel names both rows of the pair, and which one an edit replaces", /Already linked by 2 rows: \(no type through 4, adjacency rule STRAIT_RULE\); \(sea through 4\)\./.test(opened) && /Add link replaces the row of the type you pick, or the first; Remove existing takes all 2\./.test(opened), opened);
  h.pick("sea"); h.through("7"); h.apply("add");
  const page = pairOf(h.model.adjacencies);
  // the Save: every queued write through the server's own writer, as flushMapSaves sends it
  for (const w of h.writes().splice(0)) {
    const r = md.writeAdjacency({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], action: w.body.action, from: w.body.from, to: w.body.to, type: w.body.type, through: w.body.through, rule: w.body.rule, comment: w.body.comment, coords: w.body.coords });
    rec("THE CONTROL: the writer took the add", r && r.changed === true, r);
  }
  const csv = fs.readFileSync(path.join(mod, "map", "adjacencies.csv"), "utf8");
  const disk = pairOf(md.parseAdjacencies(csv));
  rec("THE CONTROL: the disk keeps the rule row and the re-added sea row", JSON.stringify(disk) === JSON.stringify(["5-6|sea|7|", "5-6||4|STRAIT_RULE"]), disk);
  rec("⭐⭐⭐ the page holds, row for row, what the disk holds after the Save", JSON.stringify(page) === JSON.stringify(disk), { page, disk });
  const before = h.open(5, 6), after = makePanel(md.parseAdjacencies(csv), types).open(5, 6);
  rec("⭐⭐ …so the panel says the same before and after a reload", before === after && /\(sea through 7\)/.test(before) && /STRAIT_RULE/.test(before), { before, after });
  rec("THE CONTROL: the other pairs are untouched", JSON.stringify(h.model.adjacencies.filter((j) => j.from === 1).map(key)) === JSON.stringify(["1-2|impassable|-1|"]), h.model.adjacencies.map(key));

  // a pair linked by ONE row keeps its old words
  const one = makePanel(md.parseAdjacencies(ADJ), types).open(1, 2);
  rec("THE CONTROL: a pair linked by one row is said as before", one === "Already linked (impassable).", one);
  // a remove takes every row, on the page as on disk
  const r2 = makePanel(md.parseAdjacencies(ADJ), types); r2.open(5, 6); r2.apply("remove");
  rec("⭐ Remove existing takes both rows off the page, as the writer's remove takes both", pairOf(r2.model.adjacencies).length === 0 && r2.writes().length === 1 && r2.writes()[0].body.action === "remove" && !r2.writes()[0].body.type, { page: pairOf(r2.model.adjacencies), w: r2.writes().map((w) => w.body) });
} catch (e) {
  rec("harness threw", false, e && e.stack ? e.stack.split("\n").slice(0, 5).join(" | ") : String(e));
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
