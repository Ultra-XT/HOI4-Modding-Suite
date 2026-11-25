// ⛔ #generate-land-pads-the-queue-and-re-berths-the-fleets — THE TWO CRASH SHAPES GENERATE LAND MADE AND ONLY AUTO-FIX REPAIRED.
//
// Two crash shapes were repaired only by Auto-fix, which the modder may never click: Generate land writes straight to the mod.
//   the supply queue  — country_supply's naval-island queue has one slot per strategic region and is pushed once per naval link,
//                       unchecked (TEST 25 crashed an hour in, 1.19.3's 0x12283AB). A 900-run sweep of Generate land alone put 605 worlds
//                       past naval_region_queue_overflows' line and 49 in the band between N and the line, which no rule reports
//                       — and the line stays where it is, because Millennium Dawn and Damaged Continuum ship in that band and play.
//   a fleet loaded later on land with no sea — load_oob runs the game start's own loader into the unchecked read the eleven start
//                       crashes died on (fleet_loaded_on_land_the_map_cut_off).
// So the click ends by running Auto-fix's own two repairs: the queue padded to 0.8 N once it is past N (not past the line), and
// every fleet on land with no sea re-berthed — and the page says what that wrote.
// ⚠ THAT IS NOT A WORLD HOI4 LOADS YET, and nothing here may say it is (the review of 2135d070): Generate land alone still leaves
// fractioned_naval_region (FATAL) on every world the sweeps measured, and the dead-state classes on a world under the base game's
// state ids. The page names those through the crash gate it runs after the click; "WHAT IT CLAIMS" below holds the code to that.
//
// THE FIXTURE (8x8 provinces of 32px, ids 1..64 by row; row r holds 8r+1 .. 8r+8):
//   below  land rows 0-3, sea rows 4-7: row 3 is the coast. CCC holds 25..28 with a harbour on 28. events/gift.txt loads
//          XXX_gift for CCC: a fleet berthed on 28 (task force and home base), "# Halifax" beside it. CCC STARTS CCC_1936: a fleet
//          whose task force lies on 36 and whose home port is 28 — housekeeping (fleet_home_port_has_no_sea, a warning), not a crash.
//   mod    land rows 0-4 (row 4 took row 3's sea: 28 has none left), CCC's state holds 33..36 too with a harbour on 36, its coast now.
//          Regions: land in 1, every sea province of rows 5-7 a region of its own (2..25), and 26..33 empty — N = 34, line 39.
//          The 24 sea regions need 41 slots (24 links across the rows with the wrap, 16 down, and one): past the line. Generate land
//          raises ONE sea province, which takes 3 or 4 of those links with it — 37 or 38 slots: IN THE BAND, where no rule speaks.
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");

const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gencrash-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
process.env.NOVA_HOME_DIR = APPDATA_DIR;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 500))); fails.push(name); }
};
const tmps = [APPDATA_DIR];
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gencrash-" + t + "-")); tmps.push(d); return d; };
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
const definition = (isLand) => {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 64; p++) {
    const [r, g, b] = COL(p), land = isLand(p);
    rows.push(`${p};${r};${g};${b};${land ? "land" : "sea"};false;${land ? "plains" : "ocean"};${land ? 1 : 0}`);
  }
  return rows.join("\n") + "\n";
};
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const WEATHER = "\n\t\tperiod={\n\t\t\tbetween={ 0.0 30.11 }\n\t\t\ttemperature={ 5.0 15.0 }\n\t\t}\n\t";
const region = (id, provs) => `strategic_region={\n\tid=${id}\n\tname="R${id}"\n\tprovinces={\n\t\t${provs.join(" ")}\n\t}\n\tweather={${WEATHER}}\n}\n`;
const state = (id, provs, owner, harbours) =>
  `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n`
  + `\thistory = {\n\t\towner = ${owner}\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n`
  + (harbours || []).map((p) => `\t\t\t${p} = { naval_base = 3 }\n`).join("")
  + `\t\t}\n\t}\n}\n`;
const GIFT = ["units = {", "\tfleet = {", '\t\tname = "Halifax Escort"', "\t\tnaval_base = 28 # Halifax", "\t\ttask_force = {", '\t\t\tname = "Halifax Escort TF"',
  "\t\t\tlocation = 28 # Halifax", '\t\t\tship = { name = "HE 1" definition = destroyer equipment = { destroyer_1 = { amount = 1 owner = CCC } } }', "\t\t}", "\t}", "}", ""].join("\r\n");

const GAME = tmp("game");
mk(GAME, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
mk(GAME, "map/definition.csv", definition((p) => p <= 32));
mk(GAME, "map/strategicregions/1-Land.txt", region(1, range(1, 32)));
mk(GAME, "map/strategicregions/2-Sea.txt", region(2, range(33, 64)));
mk(GAME, "history/states/1-A.txt", state(1, range(1, 24), "OOO", []));
mk(GAME, "history/states/2-C.txt", state(2, range(25, 28), "CCC", [28]));
mk(GAME, "history/states/3-D.txt", state(3, range(29, 32), "DDD", []));
mk(GAME, "history/units/XXX_gift.txt", GIFT);
const HOME = ["units = {", "\tfleet = {", '\t\tname = "Home Fleet"', "\t\tnaval_base = 28", "\t\ttask_force = {", '\t\t\tname = "Home Fleet TF"',
  "\t\t\tlocation = 36", '\t\t\tship = { name = "HF 1" definition = destroyer equipment = { destroyer_1 = { amount = 1 owner = CCC } } }', "\t\t}", "\t}", "}", ""].join("\n");
mk(GAME, "history/units/CCC_1936.txt", HOME);
mk(GAME, "history/countries/CCC - Cland.txt", 'capital = 2\noob = "CCC_1936"\n');
mk(GAME, "events/gift.txt", ["namespace = gift", "country_event = {", "\tid = gift.1", "\timmediate = {", '\t\tCCC = { load_oob = "XXX_gift" }', "\t}", "}", ""].join("\n"));

function writeMod() {
  const m = tmp("mod");
  mk(m, "descriptor.mod", 'name="generated world"\nreplace_path="history/states"\nreplace_path="map/strategicregions"\n');
  mk(m, "map/definition.csv", definition((p) => p <= 40));
  mk(m, "map/strategicregions/1-Land.txt", region(1, range(1, 40)));
  for (let p = 41; p <= 64; p++) mk(m, `map/strategicregions/${p - 39}-Sea ${p}.txt`, region(p - 39, [p]));   // 2..25
  for (let id = 26; id <= 33; id++) mk(m, `map/strategicregions/${id}-Spare.txt`, region(id, []));            // N = 34
  mk(m, "history/states/1-A.txt", state(1, range(1, 24), "OOO", []));
  mk(m, "history/states/2-C.txt", state(2, [...range(25, 28), ...range(33, 36)], "CCC", [36]));
  mk(m, "history/states/3-D.txt", state(3, [...range(29, 32), ...range(37, 40)], "DDD", []));
  return m;
}
const ctx = (modRoot) => ({ modRoot, gameRoot: GAME, dependencyRoots: [] });
const giftIn = (m) => { const p = path.join(m, "history", "units", "XXX_gift.txt"); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; };
const nums = (s, k) => (s.match(new RegExp(k + "\\s*=\\s*(\\d+)", "g")) || []).map((x) => Number(x.replace(/\D/g, "")));
const rulesOf = (m) => { md.clearMapLayerCache(); return (md.validateMapBitmap(ctx(m)) || []).map((p) => p.rule); };

const MOD = writeMod();
console.log("=== THE CONTROLS: the world before the click has both shapes ===");
{
  const q = md.navalRegionQueueDemand(ctx(MOD));
  rec("THE CONTROL: the queue needs 41 slots of N = 34 — past the line (39)", q && q.queue === 41 && q.n === 34 && q.line === 39, q);
  const st = md.findUnitsStrandedByTheMap(ctx(MOD));
  rec("THE CONTROL: CCC's gift loads onto 28, land the mod's map cut off from the sea", (st.laterFleets || []).length === 1 && st.laterFleets[0].province === 28 && st.laterFleets[0].cutOff === true,
    (st.laterFleets || []).map((u) => ({ p: u.province, cut: u.cutOff, tag: u.tag })));
  const r = rulesOf(MOD);
  rec("THE CONTROL: Map Errors stops Save for both", r.includes("naval_region_queue_overflows") && r.includes("fleet_loaded_on_land_the_map_cut_off")
    && labels.isFatalRule("naval_region_queue_overflows") && labels.isFatalRule("fleet_loaded_on_land_the_map_cut_off"), r);
}

console.log("\n=== Generate land ===");
const res = md.generateLand({ ...ctx(MOD), count: 1, seed: 1 });
const cr = (res && res.crashRepairs) || {};
rec("it raised one province", res && res.changed === true && res.flippedProvinces === 1, res && { changed: res.changed, flipped: res.flippedProvinces, error: res.error });
md.clearMapLayerCache();
const after = md.navalRegionQueueDemand(ctx(MOD));
const q0 = cr.navalRegionQueue || {};
rec("THE CONTROL: the raised province left the queue IN THE BAND — over N, under the line the rule reports past",
  q0.queue > q0.n && q0.queue <= q0.n + Math.ceil(q0.n / 8), q0);
rec("⭐⭐⭐ the queue fits after the click: under N on disk, padded to the 0.8 N TEST 26 played — not to the rule's line",
  after && after.queue <= after.n && after.queue <= 0.8 * after.n && q0.added === Math.ceil(q0.queue / 0.8) - 34 && after.n === 34 + q0.added, { after, q0 });
rec("⭐⭐ …with empty regions numbered on from the highest, one per file, named as Auto-fix names them",
  q0.added > 0 && range(34, 33 + (q0.added || 0)).every((id) => fs.existsSync(path.join(MOD, "map", "strategicregions", `${id}-Nova Reserve.txt`))), q0);
const g = giftIn(MOD);
const fb = cr.fleetBerths || {};
rec("⭐⭐⭐ the gift is re-berthed at CCC's coastal harbour 36, task force and home base, copied in and named",
  nums(g, "location")[0] === 36 && nums(g, "naval_base")[0] === 36 && fb.moved === 1 && fb.rebased === 1 && (fb.materialised || []).join() === "XXX_gift.txt", { location: nums(g, "location"), naval_base: nums(g, "naval_base"), fb });
rec("⭐⭐ …the comment beside it made honest", /location = 36\s+# Nova: moved from 28\s+# Halifax/.test(g), g.split(/\r?\n/).filter((l) => /Nova:/.test(l)));
rec("⭐⭐ the base game's copy is unchanged", fs.readFileSync(path.join(GAME, "history", "units", "XXX_gift.txt"), "utf8") === GIFT);
{
  const r = rulesOf(MOD);
  rec("⭐⭐⭐ Map Errors after the one click: neither the queue nor the fleet", !r.includes("naval_region_queue_overflows") && !r.includes("fleet_loaded_on_land_the_map_cut_off") && !r.includes("fleet_loaded_on_land_with_no_sea"), r);
}
rec("⭐⭐ it says how long it took", Number.isFinite(cr.ms) && cr.ms >= 0, cr.ms);
const homeIn = (m) => { const p = path.join(m, "history", "units", "CCC_1936.txt"); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; };
rec("⭐⭐⭐ fatalOnly: the started fleet whose only fault is its home port earns no copy of its file — that is Auto-fix's housekeeping",
  homeIn(MOD) === "" && !(fb.materialised || []).includes("CCC_1936.txt"), { materialised: fb.materialised });
rec("THE CONTROL: …and that home port is still said, as the warning it is", rulesOf(MOD).includes("fleet_home_port_has_no_sea") && !labels.isFatalRule("fleet_home_port_has_no_sea"), rulesOf(MOD));

console.log("\n=== a later Auto-fix finds nothing of theirs to do ===");
{
  const before = fs.readdirSync(path.join(MOD, "map", "strategicregions")).length + "|" + giftIn(MOD);
  const qx = md.fixNavalRegionQueue(ctx(MOD)), fx = md.fixDrownedFleetBerths(ctx(MOD));
  rec("⭐⭐⭐ Auto-fix's own two repairs add no region and move no task force — idempotent with the click",
    qx.added === 0 && fx.moved === 0 && fx.toSea === 0
    && fs.readdirSync(path.join(MOD, "map", "strategicregions")).length + "|" + giftIn(MOD) === before, { qx, fx });
  rec("⭐⭐ …and the one thing it still writes is the housekeeping the click left it: the home port, to CCC's harbour 36",
    fx.rebased === 1 && (fx.files || []).join() === "CCC_1936.txt" && nums(homeIn(MOD), "naval_base")[0] === 36 && nums(homeIn(MOD), "location")[0] === 36, { fx, home: homeIn(MOD) });
}

console.log("\n=== Redraw regions after the click ===");
{
  const nBefore = md.navalRegionQueueDemand(ctx(MOD)).n;
  const rr = md.rebuildStrategicRegions({ ...ctx(MOD), dryRun: false, opts: {} });
  md.clearMapLayerCache();
  const q = md.navalRegionQueueDemand(ctx(MOD));
  rec("⭐⭐ Redraw redraws a padded world without undoing it: the ids it found kept, the queue under N, and Auto-fix's pad then adds none",
    rr && rr.ok === true && rr.written > 0 && q && q.n >= nBefore && q.queue <= q.n && md.fixNavalRegionQueue(ctx(MOD)).added === 0 && !rulesOf(MOD).includes("naval_region_queue_overflows"),
    { ok: rr && rr.ok, error: rr && rr.error, nBefore, q });
}

console.log("\n=== the page says what it wrote ===");
{
  const { maskJsLiterals, jsBodyAt, stripJsComments } = require("./testlib-strip-comments.js");
  const PAGE = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"), MASKED = maskJsLiterals(PAGE);
  const at = MASKED.indexOf("function generatedCrashRepairsNote("), body = at < 0 ? null : jsBodyAt(MASKED, at);
  rec("public/map.js has generatedCrashRepairsNote", !!body);
  const note = body ? require("vm").runInNewContext("(" + PAGE.slice(at, body[1] + 1) + ")") : () => "";
  const said = note(res);
  rec("⭐⭐⭐ the click's own answer is said: the regions added, and the fleet re-berthed with the file copied for it",
    said.includes(`Added ${q0.added} empty strategic regions`) && /Re-berthed 1 fleet the new land left on land with no sea/.test(said) && /XXX_gift\.txt/.test(said), said);
  rec("CONTROL: an answer with nothing written, or none at all, says nothing",
    note({ crashRepairs: { navalRegionQueue: { added: 0 }, fleetBerths: { moved: 0, toSea: 0 } } }) === "" && note({}) === "" && note(null) === "");
  const failed = note({ crashRepairs: { navalRegionQueue: { added: 0, error: "boom" }, fleetBerths: { moved: 0, error: "bang" } } });
  rec("⭐⭐ a repair that failed is said, with its reason", /⚠/.test(failed) && failed.includes("(boom)") && failed.includes("(bang)"), failed);
  const handler = stripJsComments(PAGE), post = handler.indexOf('fetch("/api/map/generate-land"');
  const caught = post < 0 ? -1 : handler.indexOf(".catch(", post), done = caught < 0 ? -1 : handler.lastIndexOf("reloadAfterImmediateWrite(", caught);
  // ⚠️ MOVED WITH 🌍 Generate a world: the handler hands generatedLandResultNote(res) to the reload, and the notes are built in that
  // function (the world shows the same words for its own Generate land step) — so the report is read through it (testlib-map-page.js)
  const line = require("./testlib-map-page.js").generateLandReportLine(handler);
  rec("⭐⭐ the Generate land report on the page carries it", /=\s*generatedCrashRepairsNote\(res\)/.test(line) && /\$\{crashNote\}/.test(line), line.slice(-300));
}

console.log("\n=== where it runs ===");
{
  // every caller gets it: the endpoint calls mapData.generateLand, which is the backup-scope wrapper — and the repairs run inside it
  const { stripJsComments, jsBodyAt, maskJsLiterals } = require("./testlib-strip-comments.js");
  const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const code = stripJsComments(src);
  rec("map-data exports the wrapper AS generateLand", /\bgenerateLand:\s*generateLandInBackupScope\b/.test(code));
  const m = maskJsLiterals(src), at = m.indexOf("function generateLandInBackupScope("), body = at < 0 ? null : jsBodyAt(m, at);
  const w = body ? stripJsComments(src.slice(at, body[1] + 1)) : "";
  rec("⭐⭐ the wrapper runs the repairs after generateLand and before the caller's own last write (the names), inside the backup scope",
    w.indexOf("padQueueAndReberthFleets(") > w.indexOf("generateLand.call(") && w.indexOf("padQueueAndReberthFleets(") < w.indexOf("then(result)") && w.indexOf("endBackupScope(") > w.indexOf("padQueueAndReberthFleets("), w.slice(0, 600));
}

console.log("\n=== what it claims ===");
{
  // ⚠ the review of 2135d070: this file's name, the anchor and the function's comment said the world Generate land writes is one
  // HOI4 can play, while fractioned_naval_region (FATAL) is left on every world the sweeps measured. The comment IS the claim, so it
  // is read here as written; the gate it points the modder at is then checked in the page's code.
  const { stripJsComments, jsBodyAt, maskJsLiterals } = require("./testlib-strip-comments.js");
  const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const fnAt = SRC.indexOf("function padQueueAndReberthFleets(");
  const doc = fnAt < 0 ? "" : SRC.slice(SRC.lastIndexOf("/**", fnAt), fnAt);
  rec("map-data.js has padQueueAndReberthFleets, with its comment", fnAt > 0 && doc.length > 200, doc.length);
  rec("⭐⭐⭐ the comment claims no world HOI4 can play, and names what Generate land still leaves and where the modder is told it",
    !/HOI4 CAN PLAY|crash-safe/i.test(doc) && /NOT YET/.test(doc) && /fractioned_naval_region/.test(doc) && /mapCrashGate/.test(doc), doc.slice(0, 500));
  const ALL = ["map-data.js", "public/map.js", "public/map-rule-labels.js"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n");
  rec("⭐⭐ no source names the old claim's anchor any more", !/#generate-land-ends-crash-safe\b/.test(ALL));
  const PAGE = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"), MASKED = maskJsLiterals(PAGE);
  const fnBody = (name) => { const a = MASKED.indexOf(name), b = a < 0 ? null : jsBodyAt(MASKED, a); return b ? PAGE.slice(a, b[1] + 1) : ""; };
  const reload = stripJsComments(fnBody("async function reloadAfterImmediateWrite(")), gate = stripJsComments(fnBody("async function mapCrashGate("));
  rec("⭐⭐ …and that gate is real: the line Generate land ends with runs mapCrashGate, which reads Map Errors and counts its FATAL rules",
    /await mapCrashGate\(/.test(reload) && /fetch\("\/api\/map\/validate/.test(gate) && /isFatalRule/.test(gate), { reload: reload.slice(0, 200), gate: gate.length });
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n=== Generate land pads the queue and re-berths the fleets: ${pass + fails.length} checks, ${fails.length} failed ===`);
if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exit(1); }
assert.ok(pass > 0);
