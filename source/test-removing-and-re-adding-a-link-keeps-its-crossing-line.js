// Removing a link and adding it back keeps the crossing line the row drew — its start/stop coordinates — as well as its rule and comment.
// #removing-and-re-adding-a-link-keeps-its-crossing-line
//
// THE DEFECT (discovery F16, verified on 790cb21, scratchpad/batch10/discover/fE-adjacency.js, a fresh mod over vanilla, one Save with
// the page's bodies): "Remove existing" on Kiel, then the same pair and "Add link" —
//   1. adjacency { action:"remove", from:2729, to:2408 }, meta adjacencyRows [{ type:"sea", rule:"KIEL_CANAL", comment:"Kiel" }]
//   2. adjacency { action:"add", from:2729, to:2408, type:"sea", through:6257, rule:"KIEL_CANAL", comment:"Kiel" }
// map/adjacencies.csv against vanilla:
//   -7:   2729;2408;sea;6257;2949;1598;2962;1612;KIEL_CANAL;Kiel
//   +253: 2729;2408;sea;6257;-1;-1;-1;-1;KIEL_CANAL;Kiel
// adjApply carries only { type, rule, comment } in the remove's meta (#remove-then-add-strips-the-canal-rule), and writeAdjacency keeps
// coordinates only from a row still on disk — which the remove has just deleted. The wiki (Map modding): the X/Y positions "decide the
// start and end of the red line created with a strait crossing … If set to -1, then the position will be calculated automatically".
// So the line the modder (or Paradox) placed moves to wherever the game puts it. Rows with authored positions, re-counted below from
// the files: vanilla 12, MD 9, R56 12, OWB 2, NV 6, RoN 12 (measured 2026-09-16).
//
// THE FIX carries the four columns the same way the rule and comment ride: the remove keeps the model row's coordinates (from its raw
// line) in its client-only meta, an add for the same pair while that remove is unsaved sends them as `coords`, /api/map/adjacency hands
// them to writeAdjacency, and an explicit `coords` wins over the (deleted) row on disk. A plain edit still sends none and the server
// keeps the file's; a brand-new link still writes -1.
//
// Run as the page runs it: the adjacency section of public/map.js and queueWrite are lifted and run against a stubbed DOM whose cards
// come from public/map.html; the model rows are GET /api/map/model's; every queued body is posted to the real /api/map/adjacency as
// flushMapSaves posts it (Object.assign({}, body, { modPath })), and the response body is read before the disk.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const L2 = require("./testlib-two-layer-map.js");
const world = L2.makeWorld("b11-adj-coords");   // before server.js: it reads HOI4_MODS_ROOT when it loads
const md = require("./map-data.js");
const { createApp } = require("./server.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) fails.push(label);
};

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
const sa = MAP_JS.indexOf(SECTION_START), sbx = MAP_JS.indexOf(SECTION_END, sa + 1);
const SECTION = sa >= 0 && sbx > sa ? MAP_JS.slice(sa, sbx) : "";
const QUEUE = liftFunction(MAP_JS, "queueWrite");
const CARD_TYPES = [...MAP_HTML.matchAll(/class="adj-card"[^>]*\bdata-adj-type="([^"]*)"/g)].map((m) => m[1]);
const TYPE_DEFAULT = (MAP_HTML.match(/id="mapAdjType"[^>]*\bvalue="([^"]*)"/) || [])[1];

/** The adjacency panel, running its real code against a stubbed DOM (as test-removing-and-re-adding-a-canal-keeps-its-rule.js runs it). */
function makePanel({ adjacencies, provinceType }) {
  const statuses = [];
  const input = (v) => { let val = String(v); return { style: {}, get value() { return val; }, set value(x) { val = String(x); } }; };
  const els = {
    mapAdjPanel: { dataset: {}, style: {} }, mapAdjTitle: { textContent: "" }, mapAdjExisting: { style: {}, textContent: "" },
    mapAdjRemove: { style: {} }, mapAdjThrough: input(""), mapAdjType: input(TYPE_DEFAULT), mapAdjThroughRow: { style: {} },
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
    model,
    open: (from, to) => api.openAdjPanel(from, to),
    click: (type) => { const c = cards.find((k) => k.dataset.adjType === type); if (!c) return false; api.setAdjType(c.dataset.adjType); return true; },
    typeThrough: (v) => { els.mapAdjThrough.value = v; },
    apply: (action) => api.adjApply(action),
    writes: () => api.pendingWrites(),
  };
}
/** The panel's remove-then-add for one row: Remove existing, pick the pair again, its own card and through, Add link. */
function removeThenAdd(h, r) {
  h.open(r.from, r.to); h.apply("remove");
  h.open(r.from, r.to); h.click(r.type);
  if (r.type !== "impassable" && Number.isFinite(r.through) && r.through >= 0) h.typeThrough(String(r.through));
  h.apply("add");
}
const cols = (line) => { const c = String(line).split(";"); return { from: +c[0], to: +c[1], type: (c[2] || "").trim(), through: parseInt(c[3], 10), xy: c.slice(4, 8).map((v) => parseInt(v, 10)), rule: (c[8] || "").trim(), comment: (c[9] || "").trim() }; };
const same = (a, b) => JSON.stringify(cols(a)) === JSON.stringify(cols(b));
const pairRows = (text, a, b) => String(text).split(/\r?\n/).filter((l) => { const k = l.split(";"); const x = parseInt(k[0], 10), y = parseInt(k[1], 10); return (x === a && y === b) || (x === b && y === a); });
const authored = (line) => cols(line).xy.some((v) => Number.isFinite(v) && v !== -1);

// The world's map: sea 1; land 2, 3 (coast) and 4, 5 (inland).
const HEADER = "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment";
const STRAIT = "2;3;sea;1;64;60;192;60;;Strait over the bay";
const CANAL = "4;5;sea;2;100;200;110;210;TEST_CANAL;Canal";
const ANOMALY = "2;5;;-1;2;2;2;2;RULE_ANOMALY;Old World Blues shape";   // OWB writes its province ids into the four columns
const WALL = "3;4;impassable;-1;-1;-1;-1;-1;;Wall";
const ADJ = [HEADER, STRAIT, CANAL, ANOMALY, WALL, "-1;-1;-1;-1;-1;-1;-1;-1;-1;"].join("\r\n") + "\r\n";

(async () => {
  let srv = null;
  const tmps = [];
  try {
    console.log("0. The harness runs the page's own code");
    rec("the adjacency section and queueWrite were lifted out of public/map.js", /function adjApply\(/.test(SECTION) && /pendingWrites\.push/.test(QUEUE) && MAP_JS.split(SECTION_START).length === 2, SECTION.length);
    rec("the panel's cards were read out of public/map.html, the empty type included", CARD_TYPES.includes("sea") && CARD_TYPES.includes(""), CARD_TYPES);
    srv = await L2.startServer(createApp);

    const newMod = (name) => world.mod(name, { "map/adjacencies.csv": ADJ });
    const panelFor = async (mod) => {
      const m = await fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      return makePanel({ adjacencies: m.adjacencies || [], provinceType: new Map((m.provinces || []).map((p) => [p.id, p.type])) });
    };
    const flush = async (h, mod) => {
      const out = [];
      for (const w of h.writes().splice(0)) out.push(await srv.post("/api/map/adjacency", JSON.parse(JSON.stringify(w.body)), mod));
      return out;
    };
    const csvOf = (mod) => fs.readFileSync(path.join(mod, "map", "adjacencies.csv"), "utf8");

    for (const [label, row] of [["a strait whose line was placed by hand", STRAIT], ["a canal carrying a rule", CANAL], ["an empty-type link (Old World Blues' shape)", ANOMALY]]) {
      console.log(`\n1. ⛔ Remove existing → the same pair → Add link, on ${label}: ${row}`);
      const mod = newMod("Adj Coords " + cols(row).comment);
      const h = await panelFor(mod);
      const r = cols(row);
      rec("THE CONTROL: the page's model row is the file's row, raw line included", (h.model.adjacencies || []).some((j) => j.from === r.from && j.to === r.to && j.raw === row), h.model.adjacencies);
      removeThenAdd(h, { from: r.from, to: r.to, type: r.type, through: r.through });
      const sent = h.writes().map((w) => w.body);
      rec("the panel queued a remove and then an add", sent.length === 2 && sent[0].action === "remove" && sent[1].action === "add", sent);
      rec("⭐⭐ the add carries the row's four coordinates", !!sent[1] && JSON.stringify(sent[1].coords) === JSON.stringify(r.xy), sent[1]);
      const res = await flush(h, mod);
      rec("THE ANSWER: both writes were accepted", res.length === 2 && res.every((x) => x.status === 200 && x.body.ok === true && x.body.changed === true), res);
      const after = pairRows(csvOf(mod), r.from, r.to);
      rec("⭐⭐⭐ the row comes back with its crossing line where it was", after.length === 1 && JSON.stringify(cols(after[0]).xy) === JSON.stringify(r.xy), after);
      rec("⭐⭐ …and is otherwise exactly the row it was: type, through, rule and comment", after.length === 1 && same(after[0], row), after);
    }

    console.log("\n2. Controls: nothing is invented, and an edit in place still reads the file");
    {
      const mod = newMod("Adj Coords Plain Edit");
      let h = await panelFor(mod);
      h.open(2, 3); h.click("sea"); h.typeThrough("1"); h.apply("add");
      let b = (h.writes()[0] || {}).body || {};
      rec("CONTROL: a plain edit sends no coordinates — the server carries the file's", b.action === "add" && !("coords" in b) && !("rule" in b), b);
      let res = await flush(h, mod);
      rec("CONTROL: …and the strait keeps its line", res[0].body.ok === true && pairRows(csvOf(mod), 2, 3)[0] === STRAIT, pairRows(csvOf(mod), 2, 3));

      h = await panelFor(mod);
      h.open(3, 5); h.click("impassable"); h.apply("add");
      b = (h.writes()[0] || {}).body || {};
      rec("CONTROL: a brand-new link sends no coordinates", b.action === "add" && !("coords" in b), b);
      res = await flush(h, mod);
      const fresh = pairRows(csvOf(mod), 3, 5);
      rec("CONTROL: …and is written with -1, the game's own placement", res[0].body.ok === true && fresh.length === 1 && cols(fresh[0]).xy.every((v) => v === -1), fresh);

      h = await panelFor(newMod("Adj Coords Other Pair"));
      h.open(2, 3); h.apply("remove");
      h.open(3, 4); h.click("sea"); h.typeThrough("1"); h.apply("add");
      b = (h.writes()[1] || {}).body || {};
      rec("CONTROL: removing one link lends its line to no other pair", b.action === "add" && !("coords" in b), b);

      const chainMod = newMod("Adj Coords Chain");
      h = await panelFor(chainMod);
      removeThenAdd(h, { from: 4, to: 5, type: "sea", through: 2 });
      removeThenAdd(h, { from: 4, to: 5, type: "sea", through: 2 });
      b = (h.writes()[3] || {}).body || {};
      rec("⭐ remove, add, remove, add: the line survives the whole chain", b.action === "add" && JSON.stringify(b.coords) === JSON.stringify(cols(CANAL).xy) && b.rule === "TEST_CANAL", b);
      await flush(h, chainMod);
      rec("⭐ …and on disk", pairRows(csvOf(chainMod), 4, 5).length === 1 && same(pairRows(csvOf(chainMod), 4, 5)[0], CANAL), pairRows(csvOf(chainMod), 4, 5));
    }

    console.log("\n3. The endpoint: what it does with a coords it is sent");
    {
      const mod = newMod("Adj Coords Endpoint");
      let r = await srv.post("/api/map/adjacency", { action: "add", from: 2, to: 3, type: "sea", through: 1, coords: [70, 61, 190, 59] }, mod);
      rec("an add naming coordinates writes those", r.body.ok === true && JSON.stringify(cols(pairRows(csvOf(mod), 2, 3)[0]).xy) === "[70,61,190,59]", { res: r.body, rows: pairRows(csvOf(mod), 2, 3) });
      r = await srv.post("/api/map/adjacency", { action: "add", from: 2, to: 3, type: "sea", through: 1, coords: "not four numbers" }, mod);
      rec("CONTROL: a coords that is not four values is ignored, and the row keeps the line it has", r.body.ok === true && JSON.stringify(cols(pairRows(csvOf(mod), 2, 3)[0]).xy) === "[70,61,190,59]", { res: r.body, rows: pairRows(csvOf(mod), 2, 3) });
    }

    console.log("\n4. 🈯 every link with a placed line in every shipping map, removed and re-added through the panel and written");
    const CORPUS = [
      ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
      ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"],
      ["The Road to 56", "D:/SteamLibrary/steamapps/workshop/content/394360/820260968"],
      ["Old World Blues", "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196"],
      ["Novum Vexillum", "D:/SteamLibrary/steamapps/workshop/content/394360/1827273767"],
      ["Rise of Nations", "D:/SteamLibrary/steamapps/workshop/content/394360/2026448968"],
    ];
    let maps = 0, placed = 0, tried = 0, sentOk = 0, keptOnDisk = 0;
    const lost = [], counts = {};
    for (const [label, root] of CORPUS) {
      const a = path.join(root, "map", "adjacencies.csv"), d = path.join(root, "map", "definition.csv");
      if (!fs.existsSync(a) || !fs.existsSync(d)) continue;
      maps++;
      const text = fs.readFileSync(a, "utf8");
      const rows = md.parseAdjacencies(text);
      const types = new Map();
      for (const ln of fs.readFileSync(d, "utf8").split(/\r?\n/)) { const c = ln.split(";"); const id = parseInt(c[0], 10); if (Number.isFinite(id) && c.length >= 5) types.set(id, (c[4] || "").trim().toLowerCase()); }
      const withLine = rows.filter((r) => authored(r.raw));
      counts[label] = withLine.length;
      placed += withLine.length;
      // A scratch mod holding a copy of this map's adjacencies.csv; the map's own folder is read (definition.csv), never written.
      const MOD = fs.mkdtempSync(path.join(os.tmpdir(), "nova-b11-adjcoords-corpus-")); tmps.push(MOD);
      fs.mkdirSync(path.join(MOD, "map"), { recursive: true });
      fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Adj Coords Corpus"\n');
      fs.writeFileSync(path.join(MOD, "map", "adjacencies.csv"), text);
      const h = makePanel({ adjacencies: rows, provinceType: types });
      for (const r of withLine) {
        if (!CARD_TYPES.includes(r.type)) continue;
        h.writes().length = 0;
        removeThenAdd(h, r);
        const ws = h.writes().slice();
        if (ws.length !== 2) continue;            // a row the panel refuses to re-add
        tried++;
        if (JSON.stringify(ws[1].body.coords) === JSON.stringify(cols(r.raw).xy)) sentOk++;
        for (const w of ws) md.writeAdjacency({ modRoot: MOD, gameRoot: root, dependencyRoots: [], ...JSON.parse(JSON.stringify(w.body)) });
        const back = pairRows(fs.readFileSync(path.join(MOD, "map", "adjacencies.csv"), "utf8"), r.from, r.to);
        if (back.length === 1 && same(back[0], r.raw)) keptOnDisk++;
        else if (lost.length < 4) lost.push(`${label}: ${r.raw} -> ${back.join(" | ")}`);
      }
    }
    if (!maps) console.log("  ..   (no shipping map is installed here — the fixtures above still ran)");
    else {
      console.log(`     ${maps} maps · ${placed} links with a placed line ${JSON.stringify(counts)} · ${tried} removed and re-added: ${sentOk} sent their line, ${keptOnDisk} kept it on disk`);
      rec("🈯 the shipping maps do place lines by hand — which is why losing one matters", placed > 0, counts);
      rec("⭐⭐⭐ every one re-added through the panel sends its own four coordinates", tried > 0 && sentOk === tried, { tried, sentOk });
      rec("⭐⭐⭐ …and comes back on disk as the row it was", tried > 0 && keptOnDisk === tried, { tried, keptOnDisk, lost });
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
    world.cleanup();
    console.log(`\n=== removing and re-adding a link keeps its crossing line: ${checks} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = fails.length ? 1 : 0;
  }
})();
