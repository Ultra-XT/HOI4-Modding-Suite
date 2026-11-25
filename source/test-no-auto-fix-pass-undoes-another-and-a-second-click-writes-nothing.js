// No pass of one "Auto-fix all" click undoes what an earlier pass of the same click repaired, the click leaves no problem it did
// not start with, and a second click writes nothing. #one-auto-fix-click-ends-where-every-rule-it-repairs-agrees
//
// THE CLASS. autoFixMap runs some forty fixers in a fixed order, and each one's own tests judge it alone. Batch 8 and 9 found the
// shapes this makes, one by one: fixFractionedRegions moved an island out of its state's region and repairRegionOverlaps moved it
// back, every click (discovery F11); the naval pass deleted a dockyard the stateless-land pass then gave its coast back (F5);
// closeStateIdGaps stopped half way under a duplicated id, so click 2 renumbered again; fixMapXCrossings pushed a province past
// an eighth of the map. This file asks the property of all of them at once, the way batch 8's per-fixer audit did: it builds an
// instrumented copy of map-data.js IN MEMORY (every top-level function re-bound to a wrapper just before module.exports, compiled
// under this directory so its own requires resolve; no file is written), validates between every top-level fixer autoFixMap calls
// (the passes GET /api/map/validate and Auto-fix's own pre-check use), and runs two clicks on each shape.
//
// MEASURED, batch 9 (scratchpad audit9.js over 24 shapes): on 93d90f2 the F11 island and movable shapes re-create
// fractioned_naval_region (repaired by fixFractionedRegions, re-created by repairRegionOverlaps), the X-crossing shape leaves
// province_too_large on a province it did not start with, and stress seeds 7 and 424242 and the duplicate-id shape write again
// on click 2 (closeStateIdGaps). On the four fixes of batch 9 all 24 are clean. The dockyard loss (F5) is data, not a problem the
// validator names, so it has its own test (test-one-auto-fix-click-keeps-a-dockyard-when-it-gives-the-coast-back.js).
// ⚠️ MOVED 2026-09-15, merging batch 9: a problem the same fixer puts right again before the click ends is a settle pass, not a pass
// undoing another, and is not counted (see recreatedIn, which says what was measured).
//
// Shapes: batch 9's fixture shapes (built here with testlib-two-layer-map.js) and test-map-stress.js's fixture after twelve of its
// own random operations for four seeds, lifted out of that file rather than typed again; and a sea the province inspector's Type
// dropdown made land (raisedSeaShapes, below): the page's own write, then the two clicks.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const Module = require("module");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("b9-no-pass-undoes");
const tmps = [];
const M = require("./map-data.js");

// ── The instrumented module ────────────────────────────────────────────────────────────────────────────────────────────────
const HOOK = { onTop: null, inHook: false, stack: [] };
global.__novaAutoFixAudit = {
  wrap(name, fn) {
    if (typeof fn !== "function") return fn;
    return function (...args) {
      const top = !HOOK.inHook && !!HOOK.onTop && HOOK.stack.length > 0 && HOOK.stack[HOOK.stack.length - 1] === "autoFixMap" && /^(fix|repair|close)/.test(name);
      let before;
      if (top) { HOOK.inHook = true; try { before = HOOK.onTop("before", name); } finally { HOOK.inHook = false; } }
      HOOK.stack.push(name);
      try { return fn.apply(this, args); } finally {
        HOOK.stack.pop();
        if (top) { HOOK.inHook = true; try { HOOK.onTop("after", name, before); } finally { HOOK.inHook = false; } }
      }
    };
  },
};
function instrumentedMapData() {
  const file = path.join(__dirname, "map-data.js");
  const src = fs.readFileSync(file, "utf8");
  const names = [...new Set([...src.matchAll(/^(?:async[ \t]+)?function[ \t]*\*?[ \t]*([A-Za-z_$][\w$]*)[ \t]*\(/gm)].map((m) => m[1]))];
  const exp = [...src.matchAll(/^module\.exports[ \t]*=[ \t]*\{/gm)];
  if (exp.length !== 1) throw new Error("expected exactly one module.exports in map-data.js, found " + exp.length);
  const block = "\n;(function () { const __A = global.__novaAutoFixAudit; if (!__A) return;\n"
    + names.map((n) => `  try { ${n} = __A.wrap(${JSON.stringify(n)}, ${n}); } catch (_) {}`).join("\n") + "\n})();\n";
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(__dirname);
  m._compile(src.slice(0, exp[0].index) + block + src.slice(exp[0].index), file);
  return { MI: m.exports, wrapped: names.length };
}

// ── What the screen shows, as keys ─────────────────────────────────────────────────────────────────────────────────────────
const ID_FIELDS = ["stateId", "state", "province", "provinceId", "id", "from", "to", "through", "region", "regionId", "tag", "file", "type", "category", "x", "y"];
const idOf = (i) => { if (i == null || typeof i !== "object") return String(i); const parts = ID_FIELDS.filter((f) => i[f] != null && typeof i[f] !== "object").map((f) => f + "=" + i[f]); return parts.length ? parts.join(",") : JSON.stringify(i).slice(0, 120); };
function keysOf(problems) {
  const out = new Set();
  for (const p of problems) {
    const ids = [];
    for (const s of p.states || []) ids.push("state=" + s);
    for (const q of p.provinces || []) ids.push("province=" + q);
    for (const i of p.items || []) ids.push(idOf(i));
    if (p.stateId != null) ids.push("state=" + p.stateId);
    if (p.province != null) ids.push("province=" + p.province);
    if (!ids.length) ids.push("-");
    for (const x of ids) out.add(p.rule + "|" + x);
  }
  return out;
}
// ⛔ #a-file-listed-is-not-a-file-still-there — the shared walk, which tolerates a name the on-access scanner creates and deletes
// between readdirSync and readFileSync ("<NAME>.TXT.tmp"). This file kept a private copy that did not, and the hook below runs it
// INSIDE a fixer, so the scanner's ENOENT surfaced as that fixer's own error (the state-gap pass, 09-30, 1 run in the suite).
const tree = lib.tree;
const treeKey = (t) => crypto.createHash("sha1").update(JSON.stringify(Object.entries(t).sort())).digest("hex");
/** A key present, then gone after one pass, then present again after a later one — unless the pass that first repaired it repairs
 *  it again before the click ends and it stays gone: [{ problem, repairedBy, recreatedBy }].
 *
 *  ⚠️ MOVED 2026-09-15 (merging batch 9). #a-settle-pass-that-puts-it-right-is-not-a-pass-undoing-another — autoFixMap places ports
 *  early and settles them last on purpose (#one-auto-fix-click-leaves-every-coast-with-a-port). On test-map-stress seed 20260911
 *  fixCoastalNoPort gives province 10 a port, fixInlandSeas turns the sea it faces into land, and the settle loop's fixCoastalNoPort
 *  gives it a port again: the click ends with no portless coast and a second click writes nothing. This file was written before batch
 *  9's port reading (#a-port-counts-only-for-the-province-it-stands-on), when a 3x3 window credited province 10 with a neighbour's
 *  port: the key never came back, and the click ended with the province portless by the game's own rule (measured with a per-step
 *  trace on both readings). What this guards against is a problem one pass repairs and another brings back FOR GOOD — F11,
 *  fixFractionedRegions then repairRegionOverlaps, left at the end of every click. A re-creation the SAME fixer puts right again,
 *  staying gone to the end of the click, converges inside the click; one only a different fixer tidies up is still counted. */
function recreatedIn(seq) {
  const out = [];
  const all = new Set(); for (const s of seq) for (const k of s.keys) all.add(k);
  for (const k of all) {
    let seen = false, goneAfter = null;
    for (let i = 0; i < seq.length; i++) {
      const s = seq[i];
      const has = s.keys.has(k);
      if (has && !seen) seen = true;
      else if (!has && seen && goneAfter == null) goneAfter = s.step;
      else if (has && goneAfter != null) {
        const rest = seq.slice(i + 1);
        const again = rest.findIndex((r) => r.step === goneAfter && !r.keys.has(k));
        const settled = again !== -1 && rest.slice(again).every((r) => !r.keys.has(k));
        if (!settled) out.push({ problem: k, repairedBy: goneAfter, recreatedBy: s.step });
        break;
      }
    }
  }
  return out;
}

/** Every key a start problem may be answering to now, following each state Auto-fix renumbered BY IDENTITY: key => Set(keys),
 *  always including the key itself. #a-state-id-declared-twice-follows-the-state-hoi4-keeps
 *
 *  ⚠️ MOVED 2026-09-16 (batch 13). This was a substitution applied along fixes.stateGaps.renumbered IN ORDER, which is a
 *  function only while every `from` is distinct. Two declarations of one id are exactly what closeStateIdGaps exists to pull
 *  apart, and they make two moves that share a from ([45->2, 45->4]) — so the mapping was decided by the order of a list.
 *  MEASURED on d8e955b with the guard's own two lines lifted out of it (scratchpad batch13/robust/verify-b.js):
 *  `state_in_two_supply_areas|state=45` became state=2 for one order and state=4 for the other, and a state-gap pass that
 *  threw (autoFixMap stores { error }, map-data.js:3698) dropped the mapping entirely, so every renamed key read as newly
 *  created. Identity is reported and needs no guessing: closeStateIdGaps' fixes.stateGaps.duplicates names the state FILE
 *  each declaration went to. hoi4.exe keeps the FIRST block it loads for an id and destroys the rest ("State ID conflict"),
 *  so a problem key that names only a state id is about the declaration the game KEEPS — keptTo — while one that also names
 *  a file follows that file (under either its old name or the name the renumber gave it). */
function followRenumberedIds(gaps) {
  const byId = new Map();                                   // from -> Set(to)   the declaration HOI4 keeps
  const byFile = new Map();                                 // "<file>|<from>" -> Set(to)   a named declaration
  const put = (map, key, to) => { if (key == null || !Number.isFinite(+to)) return; if (!map.has(key)) map.set(key, new Set()); map.get(key).add(+to); };
  for (const m of (gaps && gaps.renumbered) || []) if (m && Number.isFinite(+m.from)) put(byId, +m.from, m.to);
  for (const d of (gaps && gaps.duplicates) || []) {
    if (!d || !Number.isFinite(+d.id)) continue;
    if (Number.isFinite(+d.keptTo)) byId.set(+d.id, new Set([+d.keptTo]));
    put(byFile, String(d.keptBy || "").toLowerCase() + "|" + +d.id, d.keptTo);
    for (const x of (d.discarded || [])) {
      put(byFile, String(x.file || "").toLowerCase() + "|" + +d.id, x.to);
      if (x.renamedTo) put(byFile, String(x.renamedTo).toLowerCase() + "|" + +d.id, x.to);
    }
  }
  return (key) => {
    const out = new Set([key]);
    const named = /(?:^|[|,])file=([^|,]+)/.exec(key);
    const file = named ? named[1].toLowerCase() : null;
    let frontier = [key];
    for (let hop = 0; hop < 8 && frontier.length; hop++) {   // one click can renumber the same state more than once
      const next = [];
      for (const k of frontier) {
        for (const m of k.matchAll(/\b(state|stateId)=(\d+)\b/g)) {
          const from = +m[2];
          const tos = (file && byFile.get(file + "|" + from)) || byId.get(from);
          if (!tos) continue;
          for (const to of tos) {
            if (to === from) continue;
            const moved = k.replace(new RegExp("\\b(state|stateId)=" + from + "\\b", "g"), (_x, f) => f + "=" + to);
            if (!out.has(moved)) { out.add(moved); next.push(moved); }
          }
        }
      }
      frontier = next;
    }
    return out;
  };
}
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

// ── The shapes ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
function batch9Shapes() {
  const shapes = [];
  const add = (name, mod) => shapes.push({ name, opts: { modRoot: mod, gameRoot: world.GAME, dependencyRoots: [] } });
  {
    const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0], 5: [0, 0, 120] };
    const at = (x, y) => (y < 128 ? (x >= 192 && x < 224 && y >= 32 && y < 64 ? 3 : x < 128 ? 1 : 5) : (x >= 32 && x < 96 ? 2 : 4));
    const DEF = ["0;0;0;0;land;false;unknown;0", "1;0;0;200;sea;false;ocean;0", "2;200;0;0;land;true;plains;1",
      "3;0;200;0;land;true;plains;1", "4;200;200;0;land;true;plains;1", "5;0;0;120;sea;false;ocean;0"].join("\r\n") + "\r\n";
    const B = (isl) => ["1;air_base;176.00;9.50;56.00;0.00;0", "1;rocket_site_spawn;176.00;9.50;56.00;0.00;0",
      "2;air_base;48.00;9.50;56.00;0.00;0", "2;rocket_site_spawn;48.00;9.50;56.00;0.00;0",
      ...(isl === 3 ? ["3;air_base;208.00;9.50;208.00;0.00;0", "3;rocket_site_spawn;208.00;9.50;208.00;0.00;0"] : []),
      "2;naval_base_spawn;48.00;9.50;126.00;0.00;1", "1;naval_base_spawn;176.00;9.50;126.00;0.00;5", `${isl};naval_base_spawn;208.00;9.50;223.00;0.00;5`].join("\n");
    const shape = (name, regions, states, isl) => {
      const files = { "descriptor.mod": `name="${name}"\nsupported_version="1.*"\nreplace_path="history/states"\nreplace_path="map/strategicregions"\n`,
        "map/provinces.bmp": lib.bmp24(256, 256, (x, y) => COL[at(x, y)]), "map/definition.csv": DEF, "map/buildings.txt": B(isl) };
      for (const [id, p] of Object.entries(regions)) files[`map/strategicregions/${id}-R.txt`] = lib.region(id, p);
      for (const [id, p] of Object.entries(states)) files[`history/states/${id}-S.txt`] = lib.st(id, p);
      return world.mod(name, files);
    };
    add("island in a state cut off from its region", shape("f11 island", { 1: "1 2 3 4", 2: "5" }, { 1: "4", 2: "2 3" }, 2));
    add("island whose whole state a land region can take", shape("f11 movable", { 1: "1 2 3", 2: "5", 3: "4" }, { 1: "4", 2: "2 3" }, 2));
    add("island that is a state of its own", shape("f11 island state", { 1: "1 2 3 4", 2: "5" }, { 1: "4", 2: "2", 3: "3" }, 3));
  }
  {
    const DOCK = "\t\tbuildings = {\n\t\t\tdockyard = 2\n\t\t}\n";
    add("dockyard whose coast the click gives back", world.mod("dock back", { "history/states/2-B.txt": lib.st(2, "5", { history: DOCK }),
      "map/strategicregions/2-Land.txt": lib.region(2, "2 5"), "map/strategicregions/3-East.txt": lib.region(3, "3 4") }));
    add("dockyard whose coast goes to another state", world.mod("dock goes", { "history/states/2-B.txt": lib.st(2, "5", { history: DOCK }) }));
  }
  add("state id declared twice above two gaps", world.mod("dup gap", {
    "descriptor.mod": 'name="dup gap"\nsupported_version="1.*"\nreplace_path="history/states"\n',
    "history/states/1-A.txt": lib.st(1, "4"), "history/states/2-B.txt": lib.st(45, "2 5"), "history/states/45-C.txt": lib.st(45, "3"),
    "map/supplyareas/1-S.txt": 'supply_area = {\n\tid = 1\n\tname = "S"\n\tvalue = 1\n\tstates = { 1 45 }\n}\n',
    "history/countries/AAA - A.txt": "capital = 45\n",
  }));
  {
    const COL = { 1: [200, 0, 0], 2: [0, 200, 0], 3: [0, 0, 200], 4: [200, 200, 0], 5: [0, 200, 200], 6: [200, 0, 200], 7: [120, 120, 0], 8: [0, 120, 120] };
    const at = (x, y) => (y < 96 ? 1 : y < 132 ? (x < 32 ? (y < 100 ? 2 : 4) : x < 64 ? (y < 100 ? 3 : 5) : x < 96 ? 6 : 7) : 8);
    const DEF = ["0;0;0;0;land;false;unknown;0"].concat(Object.keys(COL).map((id) => `${id};${COL[id].join(";")};land;false;plains;1`)).join("\r\n") + "\r\n";
    for (const Wd of [256, 512]) add(`X-crossing at an eighth of a ${Wd} px map`, world.mod(`xcross ${Wd}`, {
      "descriptor.mod": `name="xcross ${Wd}"\nsupported_version="1.*"\nreplace_path="history/states"\nreplace_path="map/strategicregions"\n`,
      "map/provinces.bmp": lib.bmp24(Wd, 256, (x, y) => COL[at(x, y)]), "map/definition.csv": DEF,
      "map/buildings.txt": ["1;air_base;150.00;9.50;56.00;0.00;0", "1;rocket_site_spawn;150.00;9.50;56.00;0.00;0"].join("\n"),
      "map/strategicregions/1-R.txt": lib.region(1, "1 2 3 4 5 6 7 8"), "history/states/1-S.txt": lib.st(1, "1 2 3 4 5 6 7 8"),
    }));
  }
  return shapes;
}
function stressShapes(seeds) {
  const stressSrc = fs.readFileSync(path.join(__dirname, "test-map-stress.js"), "utf8");
  const buildModSrc = stressSrc.slice(stressSrc.indexOf("function bmp24("), stressSrc.indexOf("const mod = buildMod();"));
  const opsSrc = stressSrc.slice(stressSrc.indexOf("const OPS = ["), stressSrc.indexOf("const CYCLES"));
  rec("test-map-stress.js's fixture and operations were lifted out of it", buildModSrc.indexOf("function buildMod(") !== -1 && opsSrc.indexOf("renumber") !== -1, { buildModSrc: buildModSrc.length, opsSrc: opsSrc.length });
  const shapes = [];
  for (const seed of seeds) {
    const factory = new Function("fs", "os", "path", "M", "SEED", `
      function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
      const rnd = mulberry32(SEED); const pick = (arr) => arr[Math.floor(rnd() * arr.length)]; const ri = (n) => Math.floor(rnd() * n);
      ${buildModSrc}
      const mod = buildMod(); const opts = { modRoot: mod, gameRoot: null, dependencyRoots: [] };
      const landIds = () => { const m = M.buildMapModel(opts); return (m.provinces || []).filter((p) => p.id > 0 && p.type === "land").map((p) => p.id); };
      const stateIds = () => M.buildMapModel(opts).states.map((s) => s.id);
      ${opsSrc}
      const trail = []; for (let i = 0; i < 12; i++) { const [name, fn] = pick(OPS); try { trail.push(fn()); } catch (e) { trail.push(name + " threw"); } }
      return { mod, trail };`);
    const { mod, trail } = factory(fs, os, path, M, seed);
    tmps.push(mod);
    shapes.push({ name: `stress seed ${seed} (${trail.slice(0, 4).join(" | ")} …)`, opts: { modRoot: mod, gameRoot: null, dependencyRoots: [] } });
  }
  return shapes;
}

// ⛔ #the-region-passes-settle-in-one-click, #a-coast-auto-fix-gives-a-state-gets-its-port-in-that-click,
// #a-raise-says-the-sea-it-cuts-off — A SEA THE PROVINCE INSPECTOR MADE LAND, THEN ONE CLICK.
// MEASURED on a copy of the base game's map with the page's own bodies (the tools review's CB-1, CB-2 and MISSED 1): sea 3201 made land,
// and the click ended on fractioned_naval_region [8812], which is fatal — it homed 3201 in land state 463, and the region pass then took
// 3201 out of sea region 171, whose two seas only 3201 joined; the second click moved 8812. Sea 2498 made land ended on coastal_no_port
// [2498] (a coast the click homed and never ported), which the second click ported. And 8812, with 3201 land, was a sea with no water
// beside it, which Auto-fix spared twice over (a mostly-water region; the mod's unitstacks.txt, like every full layout, has sea-only slots
// on every sea) and faced 3201's new harbour onto. Each shape below is the write the page queues — saveProvinceTerrain's
// { provinceId, terrain: "plains", type: "land", coastal: the row's own box } — sent through server.js's own
// /api/map/set-province-terrain handler (lifted, so no port), and then the two clicks every shape gets.
//   A   a sea that is its region's only link between two of its seas, every sea still reaching the ocean (CB-1, CB-2)
//   B   a sea that is the only way out of the sea behind it, which a harbour faces from nowhere, with a full unit layout (MISSED 1)
//   B'  …and a harbour faces the sea behind it: the shape of the 23 cut-off seas the installed maps ship, kept as it is
const RAISED_TERRAIN = ["categories = {", "\tunknown = { color = { 255 0 0 } }", "\tocean = { naval_terrain = yes color = { 40 83 176 } is_water = yes }",
  "\tplains = { color = { 255 129 66 } }", "\tforest = { color = { 89 199 85 } }", "\thills = { color = { 248 255 153 } }", "}", ""].join("\n");
function raisedSeaShapes() {
  const COL = { 1: [0, 0, 200], 2: [0, 0, 150], 3: [0, 0, 110], 4: [200, 0, 0], 5: [0, 200, 0], 6: [200, 200, 0], 7: [0, 200, 200], 8: [200, 0, 200], 9: [120, 60, 0] };
  // a 256 x 256 provinces.bmp from rectangles [id, x0, y0, x1, y1) — a later one paints over an earlier — and its definition.csv
  const paint = (rects) => lib.bmp24(256, 256, (x, y) => { let id = 0; for (const [p, x0, y0, x1, y1] of rects) if (x >= x0 && x < x1 && y >= y0 && y < y1) id = p; return COL[id] || [0, 0, 0]; });
  const def = (rows) => ["0;0;0;0;land;false;unknown;0"].concat(rows.map(([id, type, coastal, terrain]) => `${id};${COL[id].join(";")};${type};${coastal};${terrain || (type === "sea" ? "ocean" : "plains")};${type === "sea" ? 0 : 1}`)).join("\r\n") + "\r\n";
  const build = (name, { rects, rows, regions, states, buildings, layout }) => {
    const files = {
      "descriptor.mod": `name="${name}"\nsupported_version="1.*"\nreplace_path="history/states"\nreplace_path="map/strategicregions"\n`,
      "map/provinces.bmp": paint(rects), "map/definition.csv": def(rows), "map/buildings.txt": buildings.join("\n"), "common/terrain/00_terrain.txt": RAISED_TERRAIN,
    };
    for (const [id, p] of Object.entries(regions)) files[`map/strategicregions/${id}-R.txt`] = lib.region(id, p);
    for (const [id, p] of Object.entries(states)) files[`history/states/${id}-S.txt`] = lib.st(id, p);
    if (layout) files["map/unitstacks.txt"] = "";
    const mod = world.mod(name, files);
    // a full unit layout, written by Nova's own writers from an empty file: the sea floor on every sea, then every land province's
    if (layout) { const o = { modRoot: mod, gameRoot: world.GAME, dependencyRoots: [] }; M.fixUnitStacks(o); M.layOutUnitPositions(o); }
    return mod;
  };
  const shapes = [];
  const add = (name, raise, mod, extra) => shapes.push(Object.assign({ name, raise, opts: { modRoot: mod, gameRoot: world.GAME, dependencyRoots: [] } }, extra));
  // A. 1 sea [0,128)x[0,64) r1 · 2 sea [128,256)x[0,128) r2 · 3 sea [64,128)x[64,96) r1, RAISED · 4 sea [64,128)x[96,128) r1 (it touches 2)
  //    5 land [0,64)x[64,160) and 7 land [0,64)x[160,256), state 1 · 6 land [64,256)x[128,256), state 2 · land region 3
  add("a sea raised where it was its region's only link (CB-1, CB-2)", 3, build("raised link", {
    rects: [[1, 0, 0, 128, 64], [2, 128, 0, 256, 128], [3, 64, 64, 128, 96], [4, 64, 96, 128, 128], [5, 0, 64, 64, 160], [7, 0, 160, 64, 256], [6, 64, 128, 256, 256]],
    rows: [[1, "sea", true], [2, "sea", true], [3, "sea", true], [4, "sea", true], [5, "land", true], [6, "land", true], [7, "land", false]],
    regions: { 1: "1 3 4", 2: "2", 3: "5 6 7" }, states: { 1: "5 7", 2: "6" },
    buildings: ["1;air_base;32.00;9.50;155.00;0.00;0", "1;rocket_site_spawn;32.00;9.50;155.00;0.00;0", "2;air_base;160.00;9.50;63.00;0.00;0", "2;rocket_site_spawn;160.00;9.50;63.00;0.00;0",
      "1;naval_base_spawn;32.00;9.50;191.00;0.00;1", "2;naval_base_spawn;192.00;9.50;127.00;0.00;2"],
  }), { linkOf: { region: 1, seas: [1, 4] } });
  // B. 1 sea [0,256)x[0,64) · 2 sea [96,160)x[64,96), RAISED · 3 sea [96,160)x[96,256) down to the map's edge — region 1, all water
  //    land in 32 px strips under the ocean, each with its own harbour on it: 6 5 4 (state 1) | 7 8 9 (state 2) — land region 2
  const B = (name, extraPorts) => build(name, {
    rects: [[1, 0, 0, 256, 64], [6, 0, 64, 32, 256], [5, 32, 64, 64, 256], [4, 64, 64, 96, 256], [2, 96, 64, 160, 96], [3, 96, 96, 160, 256],
      [7, 160, 64, 192, 256], [8, 192, 64, 224, 256], [9, 224, 64, 256, 256]],
    rows: [[1, "sea", true], [2, "sea", true], [3, "sea", true], [4, "land", true, "forest"], [5, "land", true], [6, "land", true], [7, "land", true, "hills"], [8, "land", true], [9, "land", true]],
    regions: { 1: "1 2 3", 2: "4 5 6 7 8 9" }, states: { 1: "4 5 6", 2: "7 8 9" },
    buildings: ["1;air_base;48.00;9.50;100.00;0.00;0", "1;rocket_site_spawn;48.00;9.50;100.00;0.00;0", "2;air_base;208.00;9.50;100.00;0.00;0", "2;rocket_site_spawn;208.00;9.50;100.00;0.00;0",
      ...[[6, 16], [5, 48], [4, 80], [7, 176], [8, 208], [9, 240]].map(([p, x]) => `${p <= 6 ? 1 : 2};naval_base_spawn;${x}.00;9.50;191.00;0.00;1`), ...extraPorts],
    layout: true,
  });
  add("a sea raised in front of the only sea behind it (MISSED 1)", 2, B("raised mouth", []), { behind: 3, noSeaCutOff: true });   // (one province, no harbour, no fleet: #a-lone-sea-nobody-uses)
  add("…and a harbour faces the sea behind it, which stays sea", 2, B("raised mouth harbour", ["1;naval_base_spawn;95.00;9.50;79.00;0.00;3"]), { behind: 3, keptHarbour: "1;naval_base_spawn;95.00;9.50;79.00;0.00;3" });
  return shapes;
}
/** server.js's own /api/map/set-province-terrain handler, lifted and run as the Save loop posts to it: { status, json }. No port. */
function setProvinceTerrainRoute() {
  const vm = require("vm");
  const SERVER = fs.readFileSync(path.join(__dirname, "server.js"), "utf8").replace(/\r\n/g, "\n");
  const at = SERVER.indexOf('app.post("/api/map/set-province-terrain"');
  const end = at < 0 ? -1 : SERVER.indexOf("\n  app.", at + 10);
  if (at < 0 || end < 0) throw new Error("server.js's /api/map/set-province-terrain handler was not found");
  const routes = {};
  vm.runInNewContext(SERVER.slice(at, end), {
    app: { post: (url, mw, fn) => { routes[url] = fn; } }, express: { json: () => null }, mapData: M, DEV_ROOT: "<dev>", fs, path,
    getActiveRoot: () => "", checkActiveRootNotGameRoot() {}, resolveHoi4GameRoot: () => world.GAME, resolveDependencyRootsForAssets: () => [],
  });
  return (body) => { let status = 200, json = null; routes["/api/map/set-province-terrain"]({ body }, { status(c) { status = c; return this; }, json(j) { json = j; return this; } }); return { status, json: json || {} }; };
}
/** The seas of a map no sea path joins to the body holding sea 1 (inlandSeaPlan's own walk: provinces touching in provinces.bmp), and
 *  the harbours in map/buildings.txt that face one. */
function seasCutOffFromTheOcean(MI, opts) {
  if (MI.clearMapLayerCache) MI.clearMapLayerCache();
  const model = MI.buildMapModel({ ...opts, cacheStableLayers: true });
  const graph = MI.provinceNeighbourGraph({ ...opts, model });
  const touching = new Map();
  for (const [pair, edges] of (graph && graph.borderPixels) || []) {
    if (!(edges > 0)) continue;
    const [a, b] = pair.split("-").map(Number);
    for (const [x, y] of [[a, b], [b, a]]) { if (!touching.has(x)) touching.set(x, new Set()); touching.get(x).add(y); }
  }
  const ocean = MI.inlandSeaPlan({ model, adj: touching, keepMostlyWater: false, ocean: new Set([1]) }).oceanBody;
  const cut = (model.provinces || []).filter((p) => p.id > 0 && p.type === "sea" && !ocean.has(p.id)).map((p) => p.id);
  const harbours = fs.readFileSync(path.join(opts.modRoot, "map", "buildings.txt"), "utf8").split(/\r?\n/)
    .filter((l) => l.split(";")[1] === "naval_base_spawn" && cut.includes(+l.split(";")[6]));
  return { cut, harbours, touching, model };
}

// ── Two clicks per shape, validated between every top-level fixer ─────────────────────────────────────────────────────────
function audit(MI, shape) {
  const { opts } = shape;
  const memo = new Map();
  const validate = () => {
    const k = treeKey(tree(opts.modRoot));
    if (memo.has(k)) return memo.get(k);
    if (MI.clearMapLayerCache) MI.clearMapLayerCache();
    const model = MI.buildMapModel({ ...opts, cacheStableLayers: true });
    const keys = keysOf([...MI.findStateFileConflicts(opts.modRoot), ...MI.validateMapModel(model),
      ...MI.findBuildingAnchorMismatches({ ...opts, model }), ...MI.validateMapBitmap(opts)]);
    memo.set(k, keys);
    return keys;
  };
  const clicks = [];
  for (let click = 1; click <= 2; click++) {
    const seq = [{ step: "(start)", keys: validate(), wrote: [] }];
    const t0 = tree(opts.modRoot);
    HOOK.onTop = (phase, name, before) => {
      if (phase === "before") return tree(opts.modRoot);
      const t = tree(opts.modRoot);
      seq.push({ step: name, keys: validate(), wrote: lib.written(before, t) });
      return undefined;
    };
    let r = null, error = null;
    try { r = MI.autoFixMap(opts); } catch (e) { error = String((e && e.stack) || e); } finally { HOOK.onTop = null; }
    const end = validate();
    const seen = typeof shape.afterClick === "function" ? shape.afterClick(click) : null;   // what a shape asks of the map this click left
    const gaps = (r && r.fixes && r.fixes.stateGaps) || {};
    // A pass that THREW is stored as { error } with no list, so the ids it had already moved would be followed by nothing
    // and every renamed key would read as a problem the click created. That is worth saying, not passing over quietly.
    const gapsUnreported = !Array.isArray(gaps.renumbered) && gaps.error != null ? String(gaps.error) : null;
    const follow = followRenumberedIds(gaps);
    const start = seq[0].keys, startRenamed = new Set();
    for (const k of start) for (const k2 of follow(k)) startRenamed.add(k2);
    clicks.push({ click, error, gapsUnreported, seen, steps: seq.length - 1, wrote: lib.written(t0, tree(opts.modRoot)), writers: seq.filter((s) => s.wrote.length).map((s) => s.step),
      created: [...end].filter((k) => !start.has(k) && !startRenamed.has(k)), recreated: recreatedIn(seq.concat([{ step: "(end of click)", keys: end, wrote: [] }])) });
  }
  return clicks;
}

try {
  console.log("0. The harness");
  const { MI, wrapped } = instrumentedMapData();
  rec("map-data.js was instrumented in memory", wrapped > 200 && typeof MI.autoFixMap === "function", wrapped);
  const ctl = recreatedIn([{ step: "(start)", keys: new Set(["a|1", "b|2"]) }, { step: "fixA", keys: new Set(["b|2"]) }, { step: "fixB", keys: new Set(["b|2"]) }, { step: "fixC", keys: new Set(["a|1"]) }]);
  rec("THE CONTROL: a problem one pass repairs and a later pass brings back is caught, and one that only goes is not",
    ctl.length === 1 && ctl[0].problem === "a|1" && ctl[0].repairedBy === "fixA" && ctl[0].recreatedBy === "fixC", ctl);
  const S = (step, ...k) => ({ step, keys: new Set(k) });
  const settled = recreatedIn([S("(start)", "a|1"), S("fixA"), S("fixC", "a|1"), S("fixA"), S("(end of click)")]);
  const otherFixer = recreatedIn([S("(start)", "a|1"), S("fixA"), S("fixC", "a|1"), S("fixD"), S("(end of click)")]);
  const backAgain = recreatedIn([S("(start)", "a|1"), S("fixA"), S("fixC", "a|1"), S("fixA"), S("fixC", "a|1"), S("(end of click)", "a|1")]);
  rec("THE CONTROL: …one the SAME fixer puts right again before the click ends, staying gone, is a settle pass and is not counted",
    settled.length === 0, settled);
  rec("THE CONTROL: …but one only a different fixer tidies up, or one brought back again after its settle, is still caught",
    otherFixer.length === 1 && otherFixer[0].recreatedBy === "fixC" && backAgain.length === 1 && backAgain[0].recreatedBy === "fixC", { otherFixer, backAgain });

  console.log("\n0b. Following a renumbered state id by IDENTITY, not by the order of a list");
  // The report closeStateIdGaps writes for an id two state blocks declare (test-map-stress seed 7, batch 12): the block HOI4
  // keeps (2-B.txt) takes gap 2, the one it discards (45-C.txt, renamed 4-C.txt) takes gap 4.
  const dupReport = (order) => ({ renumbered: order, duplicates: [{ id: 45, files: ["2-B.txt", "45-C.txt"], keptBy: "2-B.txt", keptTo: 2,
    discarded: [{ file: "45-C.txt", renamedTo: "4-C.txt", to: 4 }] }] });
  {
    const oneWay = followRenumberedIds(dupReport([{ from: 45, to: 2 }, { from: 45, to: 4 }]));
    const orOther = followRenumberedIds(dupReport([{ from: 45, to: 4 }, { from: 45, to: 2 }]));
    const K = "state_in_two_supply_areas|state=45";
    rec("⭐⭐ THE CONTROL: two moves sharing a `from` follow the state HOI4 KEEPS — the same answer whichever order the list is in",
      oneWay(K).has("state_in_two_supply_areas|state=2") && sameSet(oneWay(K), orOther(K)), { oneWay: [...oneWay(K)], orOther: [...orOther(K)] });
    const F = "state_file_conflict|file=45-C.txt,state=45";
    rec("THE CONTROL: …and a problem naming the FILE of the declaration the game discards follows THAT file's new id",
      oneWay(F).has("state_file_conflict|file=45-C.txt,state=4") && !oneWay(F).has("state_file_conflict|file=45-C.txt,state=2"), [...oneWay(F)]);
    const chain = followRenumberedIds({ renumbered: [{ from: 45, to: 2 }, { from: 2, to: 1 }] });
    rec("THE CONTROL: …a state renumbered twice in one click is followed to where it ended up",
      chain("r|state=45").has("r|state=1"), [...chain("r|state=45")]);
    const untouched = followRenumberedIds({ renumbered: [{ from: 45, to: 2 }] });
    rec("THE CONTROL: …and an id nothing moved is followed nowhere, so a problem the click really created is still created",
      sameSet(untouched("r|state=7"), new Set(["r|state=7"])), [...untouched("r|state=7")]);
    rec("THE CONTROL: …and a pass that reported nothing follows nothing, which is why the click is asked whether it reported",
      sameSet(followRenumberedIds({ error: "boom" })("r|state=45"), new Set(["r|state=45"])));
  }

  const shapes = batch9Shapes().concat(stressShapes([3, 7, 20260911, 424242]));
  let maxSteps = 0, sawRegionWriter = false;
  const judge = (shape, c1, c2) => {
    maxSteps = Math.max(maxSteps, c1.steps);
    if (c1.writers.includes("fixFractionedRegions")) sawRegionWriter = true;
    const on = ` — ${shape.name}`;
    rec(`the click ran (${c1.steps} fixer steps, wrote ${c1.wrote.length} file(s))${on}`, !c1.error && !c2.error, c1.error || c2.error);
    // The pass's own error goes into the LABEL: this check has failed intermittently in two full-suite runs and passed alone
    // every time, and the runner prints only the tail of a failing file — the FAILED summary line, not the detail above it.
    const gapErr = c1.gapsUnreported || c2.gapsUnreported;
    rec(`…and its state-gap pass said which ids it moved${on}${gapErr ? ` — it threw: ${String(gapErr).slice(0, 200)}` : ""}`, !c1.gapsUnreported && !c2.gapsUnreported, { click1: c1.gapsUnreported, click2: c2.gapsUnreported });
    rec(`⭐⭐⭐ no pass re-created a problem an earlier pass of the same click repaired${on}`, c1.recreated.length === 0, c1.recreated);
    rec(`⭐⭐ the click left no problem it did not start with (renumbered state ids followed)${on}`, c1.created.length === 0, c1.created);
    rec(`⭐⭐⭐ a second click writes nothing${on}`, c2.wrote.length === 0, { wrote: c2.wrote, by: c2.writers });
  };
  for (const shape of shapes) {
    console.log("\n— " + shape.name);
    const [c1, c2] = audit(MI, shape);
    judge(shape, c1, c2);
  }

  // ⛔ #the-region-passes-settle-in-one-click, #a-coast-auto-fix-gives-a-state-gets-its-port-in-that-click,
  // #a-raise-says-the-sea-it-cuts-off — the page's write first, then the same two clicks and the same five questions.
  const route = setProvinceTerrainRoute();
  const defRow = (mod, id) => (fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/).find((l) => l.split(";")[0] === String(id)) || "").split(";");
  const seaLinks = (touching, model, id) => [...(touching.get(id) || [])].filter((n) => (model.provinces.find((p) => p.id === n) || {}).type === "sea").sort((a, b) => a - b);
  for (const shape of raisedSeaShapes()) {
    const { opts, raise } = shape;
    const on = ` — ${shape.name}`;
    console.log("\n— " + shape.name);
    const pre = seasCutOffFromTheOcean(MI, opts);
    rec(`THE CONTROL: before the write every sea reaches the ocean${on}`, pre.cut.length === 0, pre.cut);
    if (shape.linkOf) {
      // the region's two seas touch only through the raise, and each of them still reaches the ocean without it
      const [a, b] = shape.linkOf.seas;
      rec(`THE CONTROL: seas ${a} and ${b} of region ${shape.linkOf.region} touch only through ${raise}, and ${b} reaches the ocean by itself${on}`,
        !seaLinks(pre.touching, pre.model, a).includes(b) && seaLinks(pre.touching, pre.model, a).includes(raise) && seaLinks(pre.touching, pre.model, b).includes(raise)
          && seaLinks(pre.touching, pre.model, b).some((n) => n !== raise), { [a]: seaLinks(pre.touching, pre.model, a), [b]: seaLinks(pre.touching, pre.model, b) });
    }
    if (shape.behind) rec(`THE CONTROL: sea ${shape.behind} has no water beside it but ${raise}${on}`, seaLinks(pre.touching, pre.model, shape.behind).join() === String(raise), seaLinks(pre.touching, pre.model, shape.behind));
    // the inspector's Type dropdown, sea -> land: saveProvinceTerrain queues { provinceId, terrain, type, coastal } with the sea's ocean swapped for
    // plains and the coastal box as the row has it, and flushMapSaves posts it with modPath
    const body = { provinceId: raise, terrain: "plains", type: "land", coastal: defRow(opts.modRoot, raise)[5] === "true" };
    const w = route(Object.assign({}, body, { modPath: opts.modRoot }));
    rec(`THE CONTROL: the page's write landed: province ${raise} is land${on}`, w.status === 200 && w.json.ok === true && defRow(opts.modRoot, raise)[4] === "land", { status: w.status, json: w.json });
    shape.afterClick = (click) => (click === 1 ? seasCutOffFromTheOcean(MI, opts) : null);
    const [c1, c2] = audit(MI, shape);
    judge(shape, c1, c2);
    const left = c1.seen || { cut: [], harbours: [] };
    if (shape.noSeaCutOff) {
      rec(`⭐⭐⭐ the raise and one click leave no sea cut off from the ocean${on}`, left.cut.length === 0, left.cut);
      rec(`⭐⭐ …and no harbour facing one${on}`, left.harbours.length === 0, left.harbours);
    }
    if (shape.keptHarbour) {
      rec(`⭐ the sea a harbour faces stays sea behind the raise, and keeps its harbour: the write takes nothing the modder placed${on}`,
        left.cut.includes(shape.behind) && left.harbours.includes(shape.keptHarbour), left);
    }
  }
  console.log("\n— the harness saw the fixers");
  rec("THE CONTROL: a click was validated between at least thirty top-level fixers", maxSteps >= 30, maxSteps);
  rec("THE CONTROL: …and a region file a fixer wrote was put down to that fixer", sawRegionWriter);
} catch (e) {
  rec("harness", false, String((e && e.stack) || e));
} finally {
  world.cleanup();
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  delete global.__novaAutoFixAudit;
  console.log(`\n=== no Auto-fix pass undoes another and a second click writes nothing: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
}
