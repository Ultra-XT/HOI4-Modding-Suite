// ⏱ #a-new-sea-asked-the-whole-map-which-ocean-it-joined — ONE PASS OF provinces.bmp ANSWERS EVERY PROVINCE.
//
// findAdjacentOceanRegion decides which naval strategic region a province opens onto, and to do that it has to
// find that province's pixels among every pixel of provinces.bmp. Its callers ask it province after province:
// Auto-fix's half-converted-sea cleanup once for every sea it took out of a state, setProvinceDefinition once per
// flip. It decoded and walked the whole bitmap each time.
//
// MEASURED on the owner's flow (a fresh mod over vanilla, Delete map → Generate land 35% → Auto-fix ×2): the
// SECOND Auto-fix read map/provinces.bmp 391 times from this one loop — 13.5 GB — for 391 answers, and that click
// went from 71.8s to 26.8s once it read the map once. The world it produced was byte-for-byte identical.
//
// What this pins:
//   1. N provinces asked in a row decode the bitmap ONCE — the count taken from the fixture's own list.
//   2. Each answer is the same one the per-province walk gave, INCLUDING where a tie is settled. The candidate
//      regions are built by iterating the neighbour set, and the pick keeps the first of the highest sea count,
//      so the ORDER neighbours were added in decides between two equally watery regions. The batch walk visits
//      each province's four neighbours as right, left, down, up in raster order, exactly as the old one did.
//   3. Repainting the bitmap, or retyping a province without touching a pixel, is seen — the reuse is keyed on
//      the file's identity and on the province table, not on the process.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { bmp24 } = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!ok) fails.push(label);
};

const tmps = [];
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oceanonce-" + tag + "-")); tmps.push(d); return d; };
const APP = tmp("appdata");
process.env.APPDATA = APP; process.env.NOVA_APP_DATA_DIR = APP; process.env.XDG_CONFIG_HOME = APP;
process.env.NOVA_HOME_DIR = tmp("home");

let reads = 0;
let counting = false;
const origRead = fs.readFileSync;
fs.readFileSync = function (p, ...rest) {
  if (counting && typeof p === "string" && /provinces\.bmp$/i.test(p)) reads++;
  return origRead.call(this, p, ...rest);
};
const md = require("./map-data.js");
const measure = (fn) => { reads = 0; counting = true; try { return fn(); } finally { counting = false; } };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

// ── A strip of world, 24×4. Four LAND provinces, each with a sea on one side, in two strategic regions ────
//    x:  0-3    4-7    8-11   12-15  16-19  20-23
//        land1  sea2   land3  sea4   land5  land6
// Region 100 holds {1,2,3}; region 200 holds {4,5,6}. Both list a sea, so both are naval.
const COL = { 1: [200, 0, 0], 2: [0, 0, 200], 3: [0, 200, 0], 4: [0, 120, 200], 5: [200, 200, 0], 6: [120, 0, 120] };
const TYPE = { 1: "land", 2: "sea", 3: "land", 4: "sea", 5: "land", 6: "land" };
const provAt = (x) => (x < 4 ? 1 : x < 8 ? 2 : x < 12 ? 3 : x < 16 ? 4 : x < 20 ? 5 : 6);
const defRows = (over = {}) => ["0;0;0;0;land;false;unknown;0"].concat(Object.keys(COL).map((id) =>
  `${id};${COL[id].join(";")};${over[id] || TYPE[id]};false;${(over[id] || TYPE[id]) === "sea" ? "ocean" : "plains"};${(over[id] || TYPE[id]) === "sea" ? 0 : 1}`)).join("\r\n") + "\r\n";

const NOGAME = tmp("nogame");
const MOD = tmp("mod");
mk(path.join(MOD, "descriptor.mod"), 'name="Ocean once"\nreplace_path="map"\nreplace_path="history/states"\n');
mk(path.join(MOD, "map", "provinces.bmp"), bmp24(24, 4, (x) => COL[provAt(x)]));
mk(path.join(MOD, "map", "definition.csv"), defRows());
const rg = (id, provs) => `strategic_region = {\n\tid = ${id}\n\tname = "R${id}"\n\tprovinces = { ${provs.join(" ")} }\n\tweather = {}\n}\n`;
mk(path.join(MOD, "map", "strategicregions", "100-A.txt"), rg(100, [1, 2, 3]));
mk(path.join(MOD, "map", "strategicregions", "200-B.txt"), rg(200, [4, 5, 6]));
mk(path.join(MOD, "history", "states", "1-S.txt"),
  'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 3 5 6 }\n\thistory = { owner = AAA }\n}\n');

const ASK = Object.keys(TYPE).filter((id) => TYPE[id] === "land").map(Number);   // the fixture's own list
const args = { modRoot: MOD, gameRoot: NOGAME, dependencyRoots: [] };

console.log("WHICH OCEAN A COAST JOINS IS READ ONCE:");
try {
  md.clearMapLayerCache();
  const model = md.buildMapModel({ ...args, cacheStableLayers: true });
  const answers = measure(() => ASK.map((pid) => md.findAdjacentOceanRegion({ ...args, provinceId: pid, model })));

  rec(`the bitmap was decoded once for ${ASK.length} provinces (was once each)`, reads === 1, reads);
  // The fixture's own geometry says what each answer must be: 1 touches sea 2 (region 100); 3 touches sea 2 and
  // sea 4 — one sea each, and 3's own region is 100, which is among them, so it stays; 5 touches sea 4 (region
  // 200); 6 touches no sea at all and has no answer.
  const byId = Object.fromEntries(ASK.map((pid, i) => [pid, answers[i]]));
  rec("province 1 joins the region of the sea on its right", byId[1] === 100, byId);
  rec("province 3, between two seas of equal size, keeps its own region", byId[3] === 100, byId);
  rec("province 5 joins the region of the sea on its left", byId[5] === 200, byId);
  rec("province 6, which touches no sea, has no answer", byId[6] === null, byId);

  // Asking again must not decode it again.
  const again = measure(() => ASK.map((pid) => md.findAdjacentOceanRegion({ ...args, provinceId: pid, model })));
  rec("a second pass does not decode the bitmap at all", reads === 0, reads);
  rec("…and answers identically", JSON.stringify(again) === JSON.stringify(answers));

  // …and clearing the caches between every call must not change a single answer.
  const uncached = ASK.map((pid) => { md.clearMapLayerCache(); return md.findAdjacentOceanRegion({ ...args, provinceId: pid, model }); });
  rec("clearing the caches between calls changes no answer", JSON.stringify(uncached) === JSON.stringify(answers));

  // ── ⭐ THE TIE, WHICH IS WHAT THE WALK ORDER DECIDES ─────────────────────────────────────────────────────
  // A land province ONE PIXEL WIDE, with an ocean-like naval region on each side holding one sea province each.
  // Every pixel of it has a sea on the right AND a sea on the left, so nothing separates the two regions but the
  // order their seas were added to the neighbour set — and the old walk looked right before left, so the sea on
  // the RIGHT is the one that wins. Widen the strip and the tie stops being decidable this way: the province's
  // first pixel would then have only its left neighbour, which is why this fixture is one column.
  {
    const T = tmp("tie");
    const C = { 7: [10, 10, 200], 8: [200, 10, 10], 9: [10, 200, 200] };
    const at = (x) => (x < 4 ? 7 : x === 4 ? 8 : 9);
    mk(path.join(T, "descriptor.mod"), 'name="Tie"\nreplace_path="map"\nreplace_path="history/states"\n');
    mk(path.join(T, "map", "provinces.bmp"), bmp24(9, 4, (x) => C[at(x)]));
    mk(path.join(T, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0",
      `7;${C[7].join(";")};sea;false;ocean;0`, `8;${C[8].join(";")};land;true;plains;1`, `9;${C[9].join(";")};sea;false;ocean;0`].join("\r\n") + "\r\n");
    mk(path.join(T, "map", "strategicregions", "300-Left.txt"), rg(300, [7]));
    mk(path.join(T, "map", "strategicregions", "400-Right.txt"), rg(400, [9]));
    mk(path.join(T, "map", "strategicregions", "500-Home.txt"), rg(500, [8]));
    mk(path.join(T, "history", "states", "1-S.txt"),
      'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 8 }\n\thistory = { owner = AAA }\n}\n');
    md.clearMapLayerCache();
    const tm = md.buildMapModel({ modRoot: T, gameRoot: NOGAME, dependencyRoots: [], cacheStableLayers: true });
    const tie = md.findAdjacentOceanRegion({ modRoot: T, gameRoot: NOGAME, dependencyRoots: [], provinceId: 8, model: tm });
    rec("⭐ a coast between two equal oceans takes the one on its right, as the old walk's order decided", tie === 400, tie);
  }

  // ── A REPAINTED WORLD IS SEEN ───────────────────────────────────────────────────────────────────────────
  // Give the whole left half to sea 4's colour: province 1 now borders sea 4, whose region is 200.
  fs.writeFileSync(path.join(MOD, "map", "provinces.bmp"), bmp24(24, 4, (x) => COL[x < 4 ? 1 : x < 8 ? 4 : provAt(x)]));
  const afterPaint = measure(() => md.findAdjacentOceanRegion({ ...args, provinceId: 1, model }));
  rec("a repainted provinces.bmp is decoded again", reads === 1, reads);
  rec("…and province 1 now joins the region of the sea it actually borders", afterPaint === 200, afterPaint);

  // ── …AND SO IS A RETYPED PROVINCE, WHICH CHANGES NO BYTE OF THE BITMAP ─────────────────────────────────
  fs.writeFileSync(path.join(MOD, "map", "provinces.bmp"), bmp24(24, 4, (x) => COL[provAt(x)]));
  md.clearMapLayerCache();
  const m2 = md.buildMapModel({ ...args, cacheStableLayers: true });
  const before = md.findAdjacentOceanRegion({ ...args, provinceId: 1, model: m2 });
  fs.writeFileSync(path.join(MOD, "map", "definition.csv"), defRows({ 2: "land" }));   // the sea beside it is land now
  md.clearMapLayerCache();
  const m3 = md.buildMapModel({ ...args, cacheStableLayers: true });
  const afterRetype = md.findAdjacentOceanRegion({ ...args, provinceId: 1, model: m3 });
  rec("a province whose only sea neighbour was retyped to land has no answer, with the bitmap unchanged",
    before === 100 && afterRetype === null, { before, afterRetype });
} finally {
  fs.readFileSync = origRead;
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}

console.log(`  ${checks - fails.length}/${checks} passed`);
if (fails.length) { console.log("  FAILED: " + fails.join(" | ")); process.exit(1); }
process.exit(0);
