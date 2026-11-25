// #an-adjacency-describes-the-map-it-was-written-for — retyping provinces changes what an adjacency row MEANS,
// while the file itself is untouched and still looks fine.
//
// A row is `From;To;Type;Through;…;adjacency_rule_name`, and its meaning is the declared Type read together
// with the definition.csv types of From, To and Through. A `sea` row joining two LAND provinces across water
// is a strait; joining two SEA provinces through LAND it is a canal. Flood the shores and the strait now reads
// as a strait between two open-ocean tiles, which is a shape no shipping map contains.
//
// ⚠️ EVERY MAP THAT OWNS A definition.csv ALSO OWNS BOTH ADJACENCY FILES — vanilla, Novum Vexillum, Rise of
// Nations, Old World Blues, Hearts of Minecraft, Millennium Dawn, Millennium: Damaged Continuum, Road to 56.
// Eight of eight. A world Nova generated owned NEITHER, so vanilla's 251 rows loaded over a map where 8,433
// provinces had changed type, and 183 of 244 were in a shape none of those eight maps produce.
//
// ⛔⛔ THE PIN THAT MATTERS MOST IS THAT NOTHING IS DELETED. Deleting the mismatched rows produces
// `fractioned_naval_region` — 150 provinces cut off from their strategic region, which makes HOI4 refuse to
// load the map at all — because a strait BECOMES a sea link when its shores drown, and deleting it disconnects
// two oceans it had been joining. So the row count must come out unchanged.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
if (!fs.existsSync(path.join(GAME, "map", "definition.csv"))) {
  console.log("SKIP: no Hearts of Iron IV install at " + GAME);
  process.exit(0);
}

const rowsOf = (file) => fs.readFileSync(file, "latin1").replace(/^\uFEFF/, "").split(/\r?\n/)
  .map((l) => l.split(";")).filter((c) => c.length >= 4 && /^\d+$/.test((c[0] || "").trim()));

const typesOf = (dir) => {
  const f = fs.existsSync(path.join(dir, "map", "definition.csv"))
    ? path.join(dir, "map", "definition.csv") : path.join(GAME, "map", "definition.csv");
  const t = new Map();
  for (const l of fs.readFileSync(f, "latin1").split(/\r?\n/)) {
    const c = l.split(";");
    if (c.length >= 8 && /^\d+$/.test(c[0])) t.set(+c[0], (c[4] || "").trim());
  }
  return t;
};
const countBroken = (rows, t) => {
  const water = (v) => { const x = t.get(parseInt(v, 10)); return x === "sea" || x === "lake"; };
  const land = (v) => t.get(parseInt(v, 10)) === "land";
  const absent = (v) => { const n = parseInt(v, 10); return !Number.isFinite(n) || n <= 0; };
  let drowned = 0, dried = 0;
  for (const c of rows) {
    if ((c[2] || "").trim() !== "sea") continue;
    if (water(c[0]) && water(c[1]) && !land(c[3])) drowned++;
    else if (land(c[0]) && land(c[1]) && (land(c[3]) || absent(c[3]))) dried++;
  }
  return { drowned, dried };
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-adjtype-"));

// ── CONTROL: a mod that has NOT changed definition.csv must be left completely alone ─────────────────────
{
  const mod = path.join(tmp, "untouched");
  fs.mkdirSync(path.join(mod, "map"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"),
    'version="1"\nname="untouched"\nsupported_version="1.19.*"\npath="mod/x"\n');
  const r = md.fixAdjacenciesForProvinceTypes({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
  assert.strictEqual(r.changed, false, "a mod that owns no definition.csv must not be touched: " + JSON.stringify(r));
  assert.ok(!fs.existsSync(path.join(mod, "map", "adjacencies.csv")),
    "materialised a 13 KB copy of the base game's file to fix nothing — that is the whole-file-override bug");
  console.log("control: an unmodified mod is skipped (" + r.skipped + ") and owns no adjacencies.csv");
}

// ── the real case: flood the map, which turns every strait into a strait between two oceans ──────────────
const mod = path.join(tmp, "flooded");
fs.mkdirSync(path.join(mod, "map"), { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"),
  'version="1"\nname="flooded"\nsupported_version="1.19.*"\npath="mod/x"\n');
fs.copyFileSync(path.join(GAME, "map", "provinces.bmp"), path.join(mod, "map", "provinces.bmp"));
md.blankMapToSea({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
assert.ok(fs.existsSync(path.join(mod, "map", "definition.csv")), "blankMapToSea should have written a definition.csv");
assert.ok(!fs.existsSync(path.join(mod, "map", "adjacencies.csv")),
  "the fixture must start NOT owning adjacencies.csv — that is the whole point");

const before = rowsOf(path.join(GAME, "map", "adjacencies.csv"));
const t = typesOf(mod);
const broke = countBroken(before, t);
console.log("after flooding: " + before.length + " inherited rows, " + broke.drowned + " drowned strait(s), " + broke.dried + " dried");
assert.ok(broke.drowned + broke.dried > 20,
  "the fixture did not break enough rows to prove anything (" + JSON.stringify(broke) + ")");

const res = md.fixAdjacenciesForProvinceTypes({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
console.log("fixAdjacenciesForProvinceTypes -> " + JSON.stringify(res));

// ── the pins ──────────────────────────────────────────────────────────────────────────────────────────────
assert.strictEqual(res.changed, true, "nothing was written: " + JSON.stringify(res));
const own = path.join(mod, "map", "adjacencies.csv");
assert.ok(fs.existsSync(own), "the mod still does not own map/adjacencies.csv — every shipping map that owns a definition.csv owns this too");

const after = rowsOf(own);
assert.strictEqual(after.length, before.length,
  "row count changed " + before.length + " -> " + after.length
  + " — rows must be RETYPED, never deleted; deleting them fractions a naval region and HOI4 refuses the map");

const left = countBroken(after, t);
assert.strictEqual(left.drowned, 0, left.drowned + " `sea` row(s) still join two water provinces");
assert.strictEqual(left.dried, 0, left.dried + " `sea` row(s) still join two land provinces through land");
// ⛔ #a-row-written-for-the-map-below — MOVED: the retype has two more kinds now, so the straits are counted by their own counters.
// This said `res.retyped === broke.drowned + broke.dried`, which held only while straits were all it retyped.
assert.strictEqual(res.seaLinks + res.landCrossings, broke.drowned + broke.dried,
  "retyped " + (res.seaLinks + res.landCrossings) + " strait(s) but " + (broke.drowned + broke.dried) + " were broken");
// …and the walls: every `impassable` row the flood put a sea end on, between two provinces that touch in provinces.bmp, is
// opened — the pixels join them already. Derived here through the same neighbour graph the region check floods, and counted
// only where an end changed class (base land → sea now), which is what makes the row this flood's doing.
const graph = md.provinceNeighbourGraph({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], model: md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] }) });
const baseT = typesOf(GAME);
const cls = (x) => (x === "land" ? "land" : x === "sea" || x === "lake" ? "water" : "other");
const walls = before.filter((c) => {
  if ((c[2] || "").trim().toLowerCase() !== "impassable") return false;
  const a = parseInt(c[0], 10), b = parseInt(c[1], 10);
  return (t.get(a) === "sea" || t.get(b) === "sea") && [a, b].some((p) => cls(t.get(p)) !== cls(baseT.get(p)))
    && (graph.borderPixels.get(a < b ? `${a}-${b}` : `${b}-${a}`) || 0) > 0;
}).length;
console.log("impassable rows the flood put in the sea, between provinces that touch: " + walls);
assert.ok(walls > 20, "the fixture did not put enough walls in the sea to prove anything (" + walls + ")");
assert.strictEqual(res.wallsOpened, walls, "opened " + res.wallsOpened + " wall(s) in the sea, but " + walls + " stand there");
assert.strictEqual(res.retyped, res.seaLinks + res.landCrossings + res.oneShore + res.wallsOpened, "the counters do not add up: " + JSON.stringify(res));
assert.strictEqual(after.filter((c) => (c[2] || "").trim() === "impassable" && [c[0], c[1]].some((v) => t.get(parseInt(v, 10)) === "sea")
  && (graph.borderPixels.get(+c[0] < +c[1] ? `${+c[0]}-${+c[1]}` : `${+c[1]}-${+c[0]}`) || 0) > 0).length, 0, "a wall still stands in the sea between two provinces that touch");

// every rule name still resolves, and the header and terminator survived
const rulesTxt = fs.readFileSync(path.join(GAME, "map", "adjacency_rules.txt"), "latin1").replace(/#[^\n]*/g, "");
const declared = new Set([...rulesTxt.matchAll(/name\s*=\s*"([^"]+)"/g)].map((m) => m[1]));
for (const c of after) {
  const r = (c[8] || "").trim();
  assert.ok(!r || declared.has(r), "a retyped row names adjacency rule " + r + ", which nothing declares");
}
const raw = fs.readFileSync(own, "latin1");
assert.ok(/^From;To;Type;Through/i.test(raw), "header lost");
assert.ok(/(^|\n)-1;/.test(raw), "the -1 terminator was lost");

// ── AND THE WIRING, WHICH IS WHAT ACTUALLY BROKE ─────────────────────────────────────────────────────────
// ⛔ Calling the function directly passes even when Auto-fix cannot reach it. The first wiring passed
// autoFixMap's `model`, which is declared in a nested block and is NOT in scope at the call site: it threw
// "model is not defined", the surrounding try/catch swallowed it, and Auto-fix reported success having done
// nothing. Every fixer there is wrapped in the same try/catch, so this whole class is invisible unless the
// RESULT is asserted on. #a-silent-no-op-reported-as-success
{
  const w = path.join(tmp, "wired");
  fs.mkdirSync(path.join(w, "map"), { recursive: true });
  fs.writeFileSync(path.join(w, "descriptor.mod"),
    'version="1"\nname="wired"\nsupported_version="1.19.*"\npath="mod/x"\n');
  fs.copyFileSync(path.join(GAME, "map", "provinces.bmp"), path.join(w, "map", "provinces.bmp"));
  md.blankMapToSea({ modRoot: w, gameRoot: GAME, dependencyRoots: [] });
  const r = md.autoFixMap({ modRoot: w, gameRoot: GAME, dependencyRoots: [] });
  const got = ((r && r.fixes) || r || {}).adjacencyTypes;
  console.log("autoFixMap -> fixes.adjacencyTypes = " + JSON.stringify(got));
  assert.ok(got, "Auto-fix does not report an adjacencyTypes result at all — the fixer is not wired in");
  assert.ok(!got.error, "Auto-fix swallowed an error instead of retyping: " + got.error);
  assert.ok(got.retyped > 0, "Auto-fix reached the fixer but retyped nothing: " + JSON.stringify(got));
  assert.ok(fs.existsSync(path.join(w, "map", "adjacencies.csv")),
    "Auto-fix reported success but the mod still does not own map/adjacencies.csv");
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log("PASS: an adjacency row is retyped, not deleted, when its provinces change type");
