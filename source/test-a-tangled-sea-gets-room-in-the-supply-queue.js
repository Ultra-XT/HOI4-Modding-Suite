// 🌊 #the-supply-queue-counts-naval-links — HOI4'S SUPPLY QUEUE IS SIZED BY THE REGION COUNT, AND NAVAL LINKS FILL IT.
//
// country_supply.cpp (hoi4.exe 1.19.4.1 fn 0x12B49E0) flood-fills a country's sea regions into naval islands with a queue of
// N = highest region id + 1 slots, pushing a region once per naval link into it, unchecked. The owner's TEST 25 needed 514
// of 305 and crashed an hour into its first game; TEST 26, the same world with 345 empty regions (N = 650), played nine
// months. The rule's line is the end of the pending array beside the queue, N + ⌈N/8⌉ — two shipping maps overflow a little
// and play, 7-9 slots under it (pinned by test-the-new-map-fixers-stay-silent-on-maps-that-work.js).
//
// The fixture: an 8x8 map, row 0 land, rows 1-7 sea, and a mod that gives EVERY sea province a region of its own — 56 sea
// regions whose 104 links (56 across rows with the wrap, 48 down) need 105 queue slots against N = 58, line 66.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-queue-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 500))); fails.push(name); }
};
const tmps = [APPDATA_DIR];
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-queue-" + t + "-")); tmps.push(d); return d; };
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };

function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const provAt = (x, y) => Math.floor(x / 32) + Math.floor(y / 32) * 8 + 1;
const COL = (p) => [((p * 29) % 210) + 15, ((p * 67) % 210) + 15, ((p * 101) % 210) + 15];
const DEFINITION = ["0;0;0;0;land;false;unknown;0"].concat(Array.from({ length: 64 }, (_, i) => {
  const p = i + 1, [r, g, b] = COL(p), land = p <= 8;
  return `${p};${r};${g};${b};${land ? "land" : "sea"};false;${land ? "plains" : "ocean"};${land ? 1 : 0}`;
})).join("\n") + "\n";
const WEATHER = "\n\t\tperiod={\n\t\t\tbetween={ 0.0 30.11 }\n\t\t\ttemperature={ 5.0 15.0 }\n\t\t}\n\t";
const region = (id, provs) => `strategic_region={\n\tid=${id}\n\tname="R${id}"\n\tprovinces={\n\t\t${provs.join(" ")}\n\t}\n\tweather={${WEATHER}}\n}\n`;

// the base game: one land region, one sea region — nothing tangled
const GAME = tmp("game");
mk(GAME, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
mk(GAME, "map/definition.csv", DEFINITION);
mk(GAME, "map/strategicregions/1-Land.txt", region(1, [1, 2, 3, 4, 5, 6, 7, 8]));
mk(GAME, "map/strategicregions/2-Sea.txt", region(2, Array.from({ length: 56 }, (_, i) => i + 9)));
mk(GAME, "history/states/1-A.txt", "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 2 3 4 5 6 7 8 }\n\thistory = { owner = AAA }\n}\n");

function tangledMod() {
  const m = tmp("mod");
  mk(m, "descriptor.mod", 'name="tangled seas"\nreplace_path="map/strategicregions"\n');
  mk(m, "map/strategicregions/1-Land.txt", region(1, [1, 2, 3, 4, 5, 6, 7, 8]));
  for (let p = 9; p <= 64; p++) mk(m, `map/strategicregions/${p - 7}-Sea ${p}.txt`, region(p - 7, [p]));   // regions 2..57
  return m;
}
const ctx = (m) => ({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
const rowsFor = (m) => (md.validateMapBitmap(ctx(m)) || []).filter((p) => p.rule === "naval_region_queue_overflows");

try {
  console.log("=== the demand ===");
  const base = md.navalRegionQueueDemand({ modRoot: null, gameRoot: GAME, dependencyRoots: [] });
  rec("THE CONTROL: the base game's one sea region has no links — a queue of 1", base && base.queue === 1 && base.n === 3, base);
  const M = tangledMod();
  const d = md.navalRegionQueueDemand(ctx(M));
  rec("⭐⭐⭐ 56 one-province sea regions: 104 links → 105 slots against N = 58, line 66",
    d && d.regions === 56 && d.links === 104 && d.queue === 105 && d.n === 58 && d.line === 66, d);

  console.log("\n=== the rule ===");
  const rows = rowsFor(M);
  rec("⭐⭐⭐ it fires, as an ERROR in the FATAL set with the outcome \"crashes\"",
    rows.length === 1 && rows[0].severity === "error" && labels.isFatalRule("naval_region_queue_overflows") && labels.fatalOutcome("naval_region_queue_overflows") === "crashes", rows.map((r) => r.severity));
  rec("⭐⭐ …saying how many empty regions Auto-fix will add (⌈105/0.8⌉ − 58 = 74)", rows[0] && /add 74 empty strategic regions/.test(rows[0].message), rows[0] && rows[0].message);

  console.log("\n=== the repair ===");
  const r = md.fixNavalRegionQueue(ctx(M));
  rec("⭐⭐⭐ it adds exactly 74 empty regions, numbered on from 58", r.added === 74 && r.n === 58 && r.newN === 132 && !r.errors, r);
  const files = fs.readdirSync(path.join(M, "map", "strategicregions")).filter((f) => /Nova Reserve/.test(f));
  rec("⭐⭐ one region per file, as every shipping map writes them", files.length === 74, files.length);
  const f58 = fs.readFileSync(path.join(M, "map", "strategicregions", "58-Nova Reserve.txt"), "utf8");
  rec("⭐⭐ each is EMPTY — nothing on the map moves — and carries an existing region's weather",
    /id=58\b/.test(f58) && /provinces=\{\s*\}/.test(f58) && /between=\{ 0\.0 30\.11 \}/.test(f58), f58);
  const after = md.navalRegionQueueDemand(ctx(M));
  rec("⭐⭐⭐ afterwards the queue fits: 105 of 132 slots, the rule silent", after.n === 132 && after.queue === 105 && rowsFor(M).length === 0, after);
  const fatal = (md.validateMapModel(md.buildMapModel(ctx(M))) || []).concat(md.validateMapBitmap(ctx(M)) || []).filter((p) => /strategic_region_id_gap|province_no_region/.test(p.rule));
  rec("⭐⭐ the new ids leave no gap and take no province", fatal.length === 0, fatal.map((p) => p.rule));
  const again = md.fixNavalRegionQueue(ctx(M));
  rec("⭐⭐⭐ a second click adds nothing", again.added === 0, again);

  console.log("\n=== a tangle the layer below made ===");
  // #inherited-problem-not-yours — an add-on that re-shapes no region is not told to fix its dependency's seas, and the fix
  // writes no regions into it.
  const DEP = tangledMod();
  const ADDON = tmp("addon");
  mk(ADDON, "descriptor.mod", 'name="addon"\n');
  const actx = { modRoot: ADDON, gameRoot: GAME, dependencyRoots: [DEP] };
  rec("⭐⭐ an add-on over the tangled dependency is not blamed for it", (md.validateMapBitmap(actx) || []).every((p) => p.rule !== "naval_region_queue_overflows"));
  const af = md.fixNavalRegionQueue(actx);
  rec("⭐⭐ …and the click writes no regions into it — the fix judges by the rule's own gate",
    af.added === 0 && af.inherited === true && !fs.existsSync(path.join(ADDON, "map")), af);

  console.log("\n=== the back-out control ===");
  const CALM = tmp("calm");
  mk(CALM, "descriptor.mod", 'name="calm seas"\n');
  rec("⭐⭐⭐ a mod that leaves the regions as they are gets nothing", rowsFor(CALM).length === 0 && md.fixNavalRegionQueue(ctx(CALM)).added === 0);

  console.log("\n=== Auto-fix all ===");
  const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const q = src.indexOf("fixes.navalRegionQueue = fixNavalRegionQueue(");
  const fr = src.indexOf("fixes.fractionedRegions = { moved");
  const b = src.indexOf("fixes.buildingsTxt = fixBuildingsTxtPlacement(");
  rec("⭐⭐ autoFixMap runs it after the region passes and before the buildings placement that must stay last", fr !== -1 && q > fr && b > q, { fr, q, b });
} finally {
  for (const t of tmps) { try { fs.rmSync(t, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
