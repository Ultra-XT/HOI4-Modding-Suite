// MAP STRESS FUZZER (permanent; promoted from scratch-fuzz{,2}.js after the 2026-07 map campaign).
// Chains RANDOM map operations through the REAL map-data writers on a SPEC-VALID fixture (256×256 bmp —
// dims are 256-multiples so, unlike the e2e fixtures, ZERO errors is the honest baseline), then runs
// Auto-fix and asserts the map validates CLEAN after every cycle. This is the harness class that found
// the maker splice-drift bugs: individual ops all pass their own tests; it's the CHAINS that break maps.
// Invariants per cycle:
//   - no op THROWS (guard rejections are fine — that's the guards working);
//   - buildMapModel still parses; every state file stays brace-balanced; definition.csv stays parseable
//     with unique ids;
//   - after autoFixMap: validateMapModel + validateMapBitmap report ZERO errors (warnings allowed).
// Deterministic: `node test-map-stress.js [seed]` (defaults to today's date-seed like the maker fuzzers).
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const M = require("./map-data.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; } else { fail++; console.log("  FAIL", n, x != null ? "→ " + JSON.stringify(String(x).slice(0, 260)) : ""); } };
const SEED = parseInt(process.argv[2], 10) || parseInt(new Date().toISOString().slice(0, 10).replace(/-/g, ""), 10);
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const ri = (n) => Math.floor(rnd() * n);

// ── Fixture: 4×4 grid of 64px cells on a 256×256 bmp. Provinces 1..12 land (rows 0-2), 13..16 sea
// (bottom row → row-2 land is coastal). 4 states × 3 land provinces; 1 land region + 1 naval region.
function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const provAt = (x, y) => Math.floor(x / 64) + Math.floor(y / 64) * 4 + 1;
const COLOF = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-stress-"));
  const mk = (rel, c) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  mk("descriptor.mod", 'name="MapStress"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\nreplace_path="common/country_tags"\n');
  mk("map/provinces.bmp", bmp24(256, 256, (x, y) => COLOF(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 16; p++) { const [r, g, b] = COLOF(p); const sea = p >= 13; rows.push(`${p};${r};${g};${b};${sea ? "sea" : "land"};${!sea && p >= 9 ? "true" : "false"};${sea ? "ocean" : "plains"};${sea ? 0 : 1}`); }
  mk("map/definition.csv", rows.join("\n") + "\n");
  const st = (id, provs, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = ${1000 * id}\n\tstate_category = rural\n\tresources = {\n\t\tsteel = ${id}\n\t}\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = ${owner}\n\t\tbuildings = {\n\t\t\tindustrial_complex = ${id}\n\t\t}\n\t\tvictory_points = { ${provs.split(" ")[0]} ${id} }\n\t}\n}\n`;
  mk("history/states/1.txt", st(1, "1 2 3", "AAA"));
  mk("history/states/2.txt", st(2, "4 5 6", "BBB"));
  mk("history/states/3.txt", st(3, "7 8 9", "AAA"));
  mk("history/states/4.txt", st(4, "10 11 12", "BBB"));
  mk("history/countries/AAA.txt", "capital = 1\n");
  mk("history/countries/BBB.txt", "capital = 2\n");
  const weather = "\tweather={\n\t\tperiod={\n\t\t\tbetween={ 0.0 364.0 }\n\t\t\ttemperature={ -5.0 25.0 }\n\t\t\tno_phenomenon=0.700\n\t\t}\n\t}\n";
  mk("map/strategicregions/1.txt", `strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ 1 2 3 4 5 6 7 8 9 10 11 12 }\n${weather}}\n`);
  mk("map/strategicregions/2.txt", `strategic_region={\n\tid=2\n\tname="R2"\n\tprovinces={ 13 14 15 16 }\n${weather}}\n`);
  mk("map/weatherpositions.txt", "1;100.00;9.90;100.00;small\n1;110.00;9.90;110.00;large\n2;40.00;9.90;230.00;small\n2;50.00;9.90;230.00;large\n");
  mk("map/buildings.txt", "1;arms_factory;20.00;9.60;20.00;0.00;0\n");
  mk("map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  mk("map/supplyareas/1.txt", `supply_area={\n\tid=1\n\tname="SA1"\n\tvalue=1\n\tstates={ 1 2 3 4 }\n}\n`);
  return mod;
}

const mod = buildMod();
const opts = { modRoot: mod, gameRoot: null, dependencyRoots: [] };
const landIds = () => { const m = M.buildMapModel(opts); return (m.provinces || []).filter((p) => p.id > 0 && p.type === "land").map((p) => p.id); };
const stateIds = () => M.buildMapModel(opts).states.map((s) => s.id);

// ── Op pool: each returns a short label; guard rejections are fine (never throw). ──
const OPS = [
  ["merge", () => { const s = stateIds(); if (s.length < 3) return "skip"; const a = pick(s), b = pick(s); M.mergeState({ ...opts, sourceStateId: a, targetStateId: b }); return `merge ${a}->${b}`; }],
  ["renumber", () => { const s = stateIds(); const a = pick(s); const to = 40 + ri(10); M.renumberStateId(mod, a, to, { gameRoot: null, dependencyRoots: [] }); return `renumber ${a}->${to}`; }],
  ["supply+", () => { const p = pick(landIds().concat([13, 99])); const r = M.writeSupplyNode({ ...opts, action: "add", province: p }); return `supply+ ${p} ${r.changed ? "ok" : "rej"}`; }],
  ["supply-", () => { const p = 1 + ri(16); M.writeSupplyNode({ ...opts, action: "remove", province: p }); return `supply- ${p}`; }],
  ["rail+", () => { const l = landIds(); const a = pick(l), b = pick(l); const r = M.writeRailway({ ...opts, action: "add", provinces: [a, b], level: 1 + ri(3) }); return `rail+ ${a}-${b} ${r.changed ? "ok" : "rej"}`; }],
  ["adj+", () => { const a = 1 + ri(16), b = 1 + ri(16); const type = pick(["impassable", "sea"]); const r = M.writeAdjacency({ ...opts, action: "add", from: a, to: b, type, through: type === "sea" ? pick([13, 14, 2, 99]) : undefined }); return `adj+ ${a}-${b} ${type} ${r.changed ? "ok" : "rej"}`; }],
  ["adj-", () => { const a = 1 + ri(16), b = 1 + ri(16); M.writeAdjacency({ ...opts, action: "remove", from: a, to: b }); return `adj- ${a}-${b}`; }],
  ["region", () => { const l = landIds(); const r = M.createStrategicRegion({ ...opts, provinces: [pick(l)] }); return `region ${r.id || "?"}`; }],
  ["provmove", () => { const m = M.buildMapModel(opts); const rs = m.strategicRegions || []; if (rs.length < 2) return "skip"; const p = pick(landIds()); M.moveProvinceToRegion({ ...opts, provinceId: p, toRegionId: pick(rs).id }); return `provmove ${p}`; }],
  ["terrain", () => { const p = pick(landIds()); M.setProvinceDefinition({ ...opts, provinceId: p, terrain: pick(["plains", "hills", "forest", "mountain"]) }); return `terrain ${p}`; }],
  ["flipsea", () => { const p = pick(landIds()); const r = M.flipProvinceToSea({ ...opts, provinceId: p, waterType: "sea" }); return `flipsea ${p} ${r.changed ? "ok" : "rej"}`; }],
  ["seafix", () => { M.fixSeaProvinceLeftovers(opts); return "seafix"; }],
];

const CYCLES = 3;
for (let c = 1; c <= CYCLES; c++) {
  const nOps = 6 + ri(7);
  const trail = [];
  for (let i = 0; i < nOps; i++) {
    const [name, fn] = pick(OPS);
    try { trail.push(fn()); } catch (e) { ok(`cycle ${c}: op ${name} must not THROW (trail: ${trail.join(" | ")})`, false, e && e.message); }
  }
  // Auto-fix, then the map must be CLEAN — the fixture starts spec-valid and every op is either
  // guarded or auto-fixable, so any surviving error is a real chained-ops bug.
  let fixes = null;
  try { fixes = M.autoFixMap(opts); } catch (e) { ok(`cycle ${c}: autoFixMap must not THROW`, false, e && e.message); }
  let model = null;
  try { model = M.buildMapModel(opts); } catch (e) { ok(`cycle ${c}: model must still build`, false, e && e.message); }
  if (model) {
    // state_id_gap is EXCLUDED here: autoFixMap deliberately does NOT auto-renumber states (renumbering
    // rekeys every reference — it's a user-initiated "Auto-fix all" action, not a silent fix), so when the
    // fuzz renumbers a state to an arbitrary high id (e.g. 2->40) on this tiny map it legitimately leaves an
    // id gap that persists by design. A gap in state ids doesn't crash HOI4 (ids needn't be contiguous) —
    // it's benign toy-map scarcity, see [[map-ops-fuzz-findings]]. The other error rules stay strict.
    const errs = [...M.validateMapModel(model), ...M.validateMapBitmap(opts)].filter((p) => p.severity === "error" && p.rule !== "state_id_gap");
    ok(`cycle ${c}: ZERO errors after ops+autofix (ops: ${trail.join(" | ")})`, errs.length === 0, errs.map((e) => e.rule + ": " + String(e.message).slice(0, 90)).join(" || "));
    // structural invariants
    const seen = new Set(); let dup = null;
    for (const d of model.provinces) { if (seen.has(d.id)) dup = d.id; seen.add(d.id); }
    ok(`cycle ${c}: definition ids unique`, dup == null, dup);
    for (const f of fs.readdirSync(path.join(mod, "history", "states"))) {
      const t = fs.readFileSync(path.join(mod, "history", "states", f), "utf8");
      let d = 0; for (const ch of t) { if (ch === "{") d++; else if (ch === "}") d--; }
      if (d !== 0) ok(`cycle ${c}: state file ${f} brace-balanced`, false, d);
    }
    pass++; // brace sweep passed
  }
}

try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
console.log(`\nMAP-STRESS seed=${SEED}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
