// Removing a canal and adding it back must not strip its adjacency rule.
// #remove-then-add-strips-the-canal-rule
//
// A canal in map/adjacencies.csv is a `sea` row whose Through is a LAND province, and the row's
// adjacency_rule_name is what lets the game close, contest or gate it. Across the six shipping maps every canal
// carries one (re-counted below from the files: 38 of 38 on 2026-09-10 — SUEZ_CANAL, KIEL_CANAL, PANAMA_CANAL and
// the mods' own).
//
// The panel has no field for that column, and this adds none: whether Nova should read adjacency_rules.txt at all
// is still an open question. Editing a link in place already keeps the rule — writeAdjacency carries it forward
// from the row on disk (#adjacency-edit-drops-the-rule). The panel's other path did not. "Remove existing", pick
// the pair again, "Add link": the two writes are replayed in order at Save, so the remove deletes the row first
// and the add finds nothing to carry. Measured on vanilla's Suez, both writes changed:true:
//
//     5388;803;sea;1155;-1;-1;-1;-1;SUEZ_CANAL;Suez
//  -> 5388;803;sea;1155;-1;-1;-1;-1;;
//
// and the canal note then told the modder the rule was "a field Nova does not set, so add it by hand".
//
// The fix: a queued remove keeps the removed rows' rule and comment in its client-side meta (never sent), and an
// add for the same pair while that remove is still unsaved sends them explicitly — preferring the removed row
// whose type matches, exactly as findAdjacencyRowFor prefers on disk. A brand-new link still names no rule, and a
// plain edit still sends none: nothing is invented, and the server stays the authority for what is on disk.
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
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-adjrule-home-")); tmps.push(HOME);
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
const SECTION_START = "// ── Adjacency mode (straits / canals / impassable borders)";
const SECTION_END = "// ── Supply hubs + railways";
const sa = MAP_JS.indexOf(SECTION_START), sb = MAP_JS.indexOf(SECTION_END, sa + 1);
const SECTION = sa >= 0 && sb > sa ? MAP_JS.slice(sa, sb) : "";
const QUEUE = liftFunction(MAP_JS, "queueWrite");
const CARD_TYPES = [...MAP_HTML.matchAll(/class="adj-card"[^>]*\bdata-adj-type="([^"]*)"/g)].map((m) => m[1]);
const TYPE_DEFAULT = (MAP_HTML.match(/id="mapAdjType"[^>]*\bvalue="([^"]*)"/) || [])[1];

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
    els, model, statuses,
    open: (from, to) => api.openAdjPanel(from, to),
    click: (type) => { const c = cards.find((k) => k.dataset.adjType === type); if (!c) return false; api.setAdjType(c.dataset.adjType); return true; },
    typeThrough: (v) => { els.mapAdjThrough.value = v; },
    apply: (action) => api.adjApply(action),
    writes: () => api.pendingWrites(),
    last: () => statuses[statuses.length - 1] || "",
  };
}
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

const DEF = [
  "0;0;0;0;land;false;unknown;0",
  "1;10;0;0;land;false;plains;1", "2;20;0;0;land;false;plains;1", "3;30;0;0;land;false;plains;1",
  "4;40;0;0;sea;false;ocean;0", "5;50;0;0;sea;false;ocean;0", "6;60;0;0;sea;false;ocean;0", "7;70;0;0;sea;false;ocean;0",
].join("\r\n") + "\r\n";
const HEADER = "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment";
const SUEZ = "6;7;sea;3;-1;-1;-1;-1;SUEZ_CANAL;Suez";
const ROWS = [
  SUEZ,
  // ⭐ A pair with two rows whose FIRST row is not the type re-added — so "carry the first removed row" and
  // "carry the removed row of the same type" give different answers, and the test can tell which one ran.
  "5;4;;-1;-1;-1;-1;-1;RULE_ON_THE_PLAIN_ROW;plain row",
  "4;5;sea;2;-1;-1;-1;-1;RULE_ON_THE_SEA_ROW;sea row",
  "2;3;impassable;-1;-1;-1;-1;-1;;Wall",
];
const ADJ = [HEADER, ...ROWS, "-1;-1;-1;-1;-1;-1;-1;-1;-1;"].join("\r\n") + "\r\n";

try {
  const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-adjrule-game-")); tmps.push(GAME);
  const makeMod = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-adjrule-mod-")); tmps.push(d);
    fs.mkdirSync(path.join(d, "map"), { recursive: true });
    fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="AdjRule"\nreplace_path="map"\n');
    fs.writeFileSync(path.join(d, "map", "definition.csv"), DEF);
    fs.writeFileSync(path.join(d, "map", "adjacencies.csv"), ADJ);
    return d;
  };
  const fresh = () => makePanel({ adjacencies: md.parseAdjacencies(ADJ), provinceType: provinceTypeOf(DEF) });
  const csvOf = (mod) => fs.readFileSync(path.join(mod, "map", "adjacencies.csv"), "utf8");

  console.log("\n0. the harness runs the page's own code");
  rec("the adjacency section and queueWrite were lifted out of public/map.js",
    /function adjApply\(/.test(SECTION) && /pendingWrites\.push/.test(QUEUE) && MAP_JS.split(SECTION_START).length === 2, SECTION.length);
  rec("the panel's cards were read out of public/map.html", CARD_TYPES.includes("sea"), CARD_TYPES);

  console.log("\n1. ⛔ Remove existing → pick the pair again → Add link, on a canal");
  {
    const mod = makeMod();
    const h = fresh();
    h.open(6, 7); h.apply("remove");
    h.open(6, 7); h.click("sea"); h.typeThrough("3"); h.apply("add");
    const note = h.last();
    const sent = h.writes().map((w) => w.body);
    rec("the panel queued a remove and then an add", sent.length === 2 && sent[0].action === "remove" && sent[1].action === "add", sent);
    const res = flush(h, mod, GAME);
    rec("…and both writes landed", res.length === 2 && res.every((r) => r && r.changed === true), res);
    const after = pairRows(csvOf(mod), 6, 7);
    rec("⭐⭐⭐ the canal comes back carrying SUEZ_CANAL", after.length === 1 && after[0].split(";")[8] === "SUEZ_CANAL", after);
    rec("⭐⭐ …and its comment", after.length === 1 && after[0].split(";")[9] === "Suez", after);
    rec("⭐⭐ …so the row is exactly what it was", after.length === 1 && after[0] === SUEZ, after);
    rec("⭐ the canal note says the rule was kept, instead of telling the modder to add one by hand",
      /SUEZ_CANAL/.test(note) && !/add it by hand/.test(note), note);
  }

  console.log("\n2. ⭐⭐ a pair with two rows: the rule of the removed row whose TYPE matches rides back");
  {
    const mod = makeMod();
    const h = fresh();
    h.open(4, 5); h.apply("remove");
    h.open(4, 5); h.click("sea"); h.typeThrough("2"); h.apply("add");
    const res = flush(h, mod, GAME);
    rec("the remove took both rows and the add landed", res.length === 2 && res[0].removed === 2 && res[1].changed === true, res);
    const after = pairRows(csvOf(mod), 4, 5);
    rec("⭐⭐ the re-added sea row carries the SEA row's rule, not the first row's", after.length === 1 && after[0].split(";")[8] === "RULE_ON_THE_SEA_ROW", after);
  }

  console.log("\n3. nothing is invented");
  {
    let h = fresh();
    h.open(6, 7); h.apply("add");
    let b = (h.writes()[0] || {}).body || {};
    rec("CONTROL: a plain edit sends no rule — the server carries it from disk, as before", !("rule" in b) && !("comment" in b), b);
    const mod = makeMod();
    flush(h, mod, GAME);
    rec("CONTROL: …and the canal keeps it", pairRows(csvOf(mod), 6, 7)[0] === SUEZ, pairRows(csvOf(mod), 6, 7));

    h = fresh();
    h.open(1, 7); h.click("sea"); h.typeThrough("4"); h.apply("add");
    b = (h.writes()[0] || {}).body || {};
    rec("CONTROL: a brand-new link names no rule", !("rule" in b), b);

    h = fresh();
    h.open(6, 7); h.apply("remove");
    h.open(1, 3); h.click("sea"); h.typeThrough("4"); h.apply("add");
    b = (h.writes()[1] || {}).body || {};
    rec("CONTROL: removing one link lends its rule to no other pair", b.action === "add" && !("rule" in b), b);

    h = fresh();
    h.open(6, 7); h.apply("remove");
    h.open(6, 7); h.click("sea"); h.typeThrough("3"); h.apply("add");
    h.open(6, 7); h.apply("remove");
    h.open(6, 7); h.click("sea"); h.typeThrough("3"); h.apply("add");
    b = (h.writes()[3] || {}).body || {};
    rec("⭐ remove, add, remove, add: the rule survives the whole chain", b.action === "add" && b.rule === "SUEZ_CANAL" && b.comment === "Suez", b);
  }

  console.log("\n4. 🈯 every ruled link in every shipping map, removed and re-added");
  const CORPUS = [
    ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
    ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"],
    ["The Road to 56", "D:/SteamLibrary/steamapps/workshop/content/394360/820260968"],
    ["Old World Blues", "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196"],
    ["Novum Vexillum", "D:/SteamLibrary/steamapps/workshop/content/394360/1827273767"],
    ["Rise of Nations", "D:/SteamLibrary/steamapps/workshop/content/394360/2026448968"],
  ];
  let maps = 0, canals = 0, canalsRuled = 0, tried = 0, kept = 0, lost = 0;
  const lostExamples = [];
  for (const [label, root] of CORPUS) {
    const a = path.join(root, "map", "adjacencies.csv"), d = path.join(root, "map", "definition.csv");
    if (!fs.existsSync(a) || !fs.existsSync(d)) continue;
    maps++;
    const rows = md.parseAdjacencies(fs.readFileSync(a, "utf8"));
    const types = provinceTypeOf(fs.readFileSync(d, "utf8"));
    for (const r of rows) if (r.type === "sea" && types.get(r.through) === "land") { canals++; if (r.rule) canalsRuled++; }
    const h = makePanel({ adjacencies: rows, provinceType: types });
    const seenPair = new Set();
    for (const r of rows) {
      const k = Math.min(r.from, r.to) + "-" + Math.max(r.from, r.to);
      if (seenPair.has(k)) continue;
      seenPair.add(k);
      if (!r.rule || !CARD_TYPES.includes(r.type)) continue;
      h.model.adjacencies = rows;
      h.writes().length = 0;
      h.open(r.from, r.to); h.apply("remove");
      h.open(r.from, r.to); h.click(r.type);
      if (r.type !== "impassable" && Number.isFinite(r.through) && r.through >= 0) h.typeThrough(String(r.through));
      h.apply("add");
      const w = h.writes()[1];
      if (!w) continue;                     // a row the panel refuses to re-add at all (e.g. a sea row with no through)
      tried++;
      if (w.body.rule === r.rule && w.body.comment === r.comment) kept++;
      else { lost++; if (lostExamples.length < 3) lostExamples.push(`${label}: ${r.raw} -> ${JSON.stringify(w.body)}`); }
    }
  }
  if (!maps) console.log("  ..   (no shipping map is installed here — the fixture above still ran)");
  else {
    console.log(`     ${maps} maps · ${canals} canals, ${canalsRuled} carrying a rule · ${tried} ruled links re-added through the panel: ${kept} kept, ${lost} lost`);
    rec("🈯 every shipping canal carries a rule — which is why losing one matters", canals > 0 && canalsRuled === canals, { canals, canalsRuled });
    rec("⭐⭐⭐ every ruled link removed and re-added through the panel keeps its rule and comment", tried > 0 && lost === 0, { tried, kept, lost, lostExamples });
  }

  console.log(`\n=== removing and re-adding a canal keeps its rule: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
