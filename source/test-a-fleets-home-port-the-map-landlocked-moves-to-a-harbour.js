// ⛔ #a-fleets-home-port-the-map-landlocked — A FLEET'S HOME PORT THE MAP CUT OFF FROM THE SEA MOVES TO A HARBOUR.
//
// A fleet carries two berths: each task force's `location`, and the fleet's own `naval_base` — its home port, independent of
// where its task forces lie (vanilla's Kriegsmarine bases at 241 with a task force at 6332). The fixer re-berthed stranded task
// forces and asked of the home port only "is it water, or where a stranded task force stood?". On the owner's TEST 32 that left
// USA's Atlantic Fleet based on 788, an inland mountain the map had taken the coast from, while every task force sat in a real
// port — and a later click never even opened the file, because nothing listed a fleet's home port at all. The base game bases
// 252 of 252 fleets on a coast, the seven shipping maps 1,725 of 1,725. A WARNING: no crash has been tied to a home port.
//
// THE FIXTURE (8x8 provinces of 32px, ids 1..64 by row; row r holds 8r+1 .. 8r+8):
//     below  land = rows 0–2, so row 2 (17..24) is the coast       mod  land = rows 0–4, row 4 (33..40) the coast now
//   ZZZ owns all of it, with harbours at 33 and 36.
//   ZZZ_a (CRLF)  "A Fleet"  home 20 # Old Port, task force on 21 — both on the cut-off coast
//                 "Control"  home 4 — inland in BOTH worlds, never a coast: not this fault — task force on 36
//   ZZZ_b (LF)    "B Fleet"  home 20, task force on 36 — a file whose ONLY fault is its home port
//   ZZZ_later     "L Fleet"  home 19, task force on 22 — loaded by an event, both on the cut-off coast but not the same province
// Every expected harbour is computed below from the fixture's own centres.
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path"), vm = require("vm");

const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fleethome-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
process.env.NOVA_HOME_DIR = APPDATA_DIR;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const P = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 400))); fails.push(name); }
};
const tmps = [APPDATA_DIR];
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fleethome-" + t + "-")); tmps.push(d); return d; };
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
const state = (id, provs, owner, harbours) =>
  `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n`
  + `\thistory = {\n\t\towner = ${owner}\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n`
  + (harbours || []).map((p) => `\t\t\t${p} = { naval_base = 3 }\n`).join("") + `\t\t}\n\t}\n}\n`;
const fleet = (name, base, loc, tail = "") => [`\tfleet = {`, `\t\tname = "${name}"`, `\t\tnaval_base = ${base}${tail}`,
  `\t\ttask_force = {`, `\t\t\tname = "${name} TF"`, `\t\t\tlocation = ${loc}${tail}`,
  `\t\t\tship = { name = "${name} 1" definition = destroyer equipment = { destroyer_1 = { amount = 1 owner = ZZZ } } }`, `\t\t}`, `\t}`];
const ZZZ_A = ["units = {", ...fleet("A Fleet", 20, 21, " # Old Port"), ...fleet("Control", 4, 36), "}", ""].join("\r\n");
const ZZZ_B = ["units = {", ...fleet("B Fleet", 20, 36), "}", ""].join("\n");
const HARBOURS = [33, 36];

function writeGame(g, oobs) {
  mk(g, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
  mk(g, "map/definition.csv", definition((p) => p <= 24));
  mk(g, "history/states/1.txt", state(1, range(1, 24), "ZZZ", [20]));
  mk(g, "history/countries/ZZZ - Zland.txt", "capital = 1\n" + oobs.map((o, i) => `${i ? "set_naval_oob" : "oob"} = "${o}"\n`).join(""));
  mk(g, "history/units/ZZZ_a.txt", ZZZ_A);
  mk(g, "history/units/ZZZ_b.txt", ZZZ_B);
  return g;
}
function writeMod(m) {
  mk(m, "descriptor.mod", 'name="home ports"\nreplace_path="history/states"\n');
  mk(m, "map/definition.csv", definition((p) => p <= 40));
  mk(m, "history/states/1.txt", state(1, range(1, 24), "ZZZ", []));
  mk(m, "history/states/2.txt", state(2, range(25, 40), "ZZZ", HARBOURS));
  return m;
}
const GAME = writeGame(tmp("game"), ["ZZZ_a", "ZZZ_b"]);
const ctx = (modRoot, gameRoot = GAME) => ({ modRoot, gameRoot, dependencyRoots: [] });
const read = (root, f) => { const p = path.join(root, "history", "units", f); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; };
const nums = (s, k) => (s.match(new RegExp(k + "\\s*=\\s*(\\d+)", "g")) || []).map((x) => Number(x.replace(/\D/g, "")));
const ruleOf = (c) => (md.validateMapBitmap(c) || []).filter((p) => p.rule === "fleet_home_port_has_no_sea");

// ── the oracle: the nearest of ZZZ's harbours, over the fixture's own centres ─────────────────────────────────────────────
const centre = (p) => ({ x: ((p - 1) % 8) * 32 + 16, y: Math.floor((p - 1) / 8) * 32 + 16 });
const nearest = (from) => HARBOURS.slice().sort((a, b) => ((centre(a).x - centre(from).x) ** 2 + (centre(a).y - centre(from).y) ** 2)
  - ((centre(b).x - centre(from).x) ** 2 + (centre(b).y - centre(from).y) ** 2) || a - b)[0];
const HOME = nearest(20), TF = nearest(21);

console.log("=== THE CONTROLS ===");
{
  const MOD0 = writeMod(tmp("control"));
  const model = md.buildMapModel(ctx(MOD0));
  const coast = md.landProvincesTouchingSea({ ...ctx(MOD0), model });
  rec("THE CONTROL: 20 and 21 touch no sea now, the harbours 33 and 36 do, and 4 never did", !coast.has(20) && !coast.has(21) && coast.has(33) && coast.has(36) && !coast.has(4));
  const inland = md.findUnitsStrandedByTheMap({ ...ctx(MOD0), model }).inlandBerths || new Set();
  rec("THE CONTROL: the land the map cut off from the sea holds 20 and 21 (a coast below) and not 4 (inland below too)",
    inland.has(20) && inland.has(21) && !inland.has(4), [20, 21, 4].map((p) => p + ":" + inland.has(p)));
  const c = md.provinceCentroids({ ...ctx(MOD0), wanted: new Set([20, 33, 36]) });
  rec("THE CONTROL: the oracle's centres are provinceCentroids' (z from the bottom), and they pick a harbour that is not the first listed",
    [20, 33, 36].every((p) => Math.abs(c.get(p).x - centre(p).x) <= 1 && Math.abs((255 - c.get(p).z) - centre(p).y) <= 1) && HOME === 36 && HOME !== HARBOURS[0], { HOME, TF });
}

console.log("\n=== 1. the rule ===");
const MOD = writeMod(tmp("mod"));
{
  const st = md.findUnitsStrandedByTheMap(ctx(MOD));
  rec("⭐⭐⭐ the two home ports on the cut-off coast are found — not the control's, out of the three fleets started",
    JSON.stringify((st.fleetHomes || []).map((u) => `${u.file}:${u.province}`).sort()) === '["ZZZ_a.txt:20","ZZZ_b.txt:20"]' && st.startedHomes === 3,
    { homes: (st.fleetHomes || []).map((u) => `${u.file}:${u.province}`), startedHomes: st.startedHomes });
  rec("⭐⭐ …and a home port is not counted as a fleet", st.startedFleets === 3, st.startedFleets);
  const r = ruleOf(ctx(MOD)), p = r[0] || {};
  rec("⭐⭐⭐ fleet_home_port_has_no_sea: a WARNING, both counted, the button offered", r.length === 1 && p.severity === "warning" && p.total === 2 && p.movable === 2 && p.autoFix === true,
    r.map((x) => ({ severity: x.severity, total: x.total, movable: x.movable, autoFix: x.autoFix })));
  rec("⭐⭐ …not fatal, with a label, and it never says it will crash", labels.isFatalRule("fleet_home_port_has_no_sea") === false && !!labels.LABELS.fleet_home_port_has_no_sea && !/will crash/i.test(p.message || ""), p.message);
}

console.log("\n=== 2. the repair ===");
{
  const r = md.fixDrownedFleetBerths(ctx(MOD));
  const a = read(MOD, "ZZZ_a.txt"), b = read(MOD, "ZZZ_b.txt");
  rec(`⭐⭐⭐ A Fleet: its task force AND its home port go to ${TF} / ${HOME}, the nearest harbour of its own country`,
    nums(a, "location")[0] === TF && nums(a, "naval_base")[0] === HOME, { location: nums(a, "location"), naval_base: nums(a, "naval_base") });
  rec("⭐⭐ …each line saying so, its old comment kept", /naval_base = \d+\s+# Nova: moved from 20\s+# Old Port/.test(a), a.split(/\r?\n/).filter((l) => /Nova:/.test(l)));
  rec("⭐⭐⭐ the control fleet, whose home was never on a coast, is untouched", nums(a, "naval_base")[1] === 4 && nums(a, "location")[1] === 36, { naval_base: nums(a, "naval_base") });
  rec("⭐⭐⭐ B Fleet, whose task force was fine: its home port goes to the harbour too", nums(b, "naval_base")[0] === HOME, nums(b, "naval_base"));
  rec("⭐⭐ …and its task force line is byte-identical", b.split("\n").filter((l) => /location/.test(l)).join() === ZZZ_B.split("\n").filter((l) => /location/.test(l)).join());
  rec("⭐⭐ the CRLF file stays all CRLF", !/[^\r]\n/.test(a));
  rec("⭐⭐ it counts one task force and two home bases moved — A's with its task force, and B's alone", r.rebased === 2 && r.moved === 1, { moved: r.moved, rebased: r.rebased });
  rec("⭐⭐⭐ the rule goes silent", ruleOf(ctx(MOD)).length === 0, ruleOf(ctx(MOD)).map((p) => p.total));
  const r2 = md.fixDrownedFleetBerths(ctx(MOD));
  rec("⭐⭐ a second run moves nothing", r2.moved === 0 && r2.rebased === 0 && read(MOD, "ZZZ_a.txt") === a && read(MOD, "ZZZ_b.txt") === b, r2);
}

console.log("\n=== 3. a world whose task forces are all in port already: the next click still finds the home ===");
{
  const G2 = writeGame(tmp("game-homes"), ["ZZZ_b"]);
  const M2 = writeMod(tmp("homes"));
  const st = md.findUnitsStrandedByTheMap(ctx(M2, G2));
  rec("THE CONTROL: nothing is stranded here — only B Fleet's home port", (st.fleets || []).length === 0 && (st.fleetsOffLand || []).length === 0 && (st.fleetHomes || []).length === 1);
  const fr = { ok: true, fixes: { fleetBerths: md.fixDrownedFleetBerths(ctx(M2, G2)) } };
  rec("⭐⭐⭐ B Fleet's home port is moved anyway", nums(read(M2, "ZZZ_b.txt"), "naval_base")[0] === HOME, nums(read(M2, "ZZZ_b.txt"), "naval_base"));
  const MAP_SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  const MASKED = maskJsComments(MAP_SRC);
  const at = MASKED.indexOf("const ro = (fr.fixes"), endAt = MASKED.indexOf("const summaryLine = (parts.length", at);
  const LIFT = at >= 0 && endAt >= 0 ? MAP_SRC.slice(at, MASKED.indexOf(";", endAt) + 1) : "";
  let line = "";
  try {
    const sb = { console, JSON, Set, Math, Array, Number, String, Object, fr };
    sb.globalThis = sb; vm.createContext(sb);
    vm.runInContext(P.withNoteHelpers(`var statusEl = null;\n${LIFT}`) + "\nglobalThis.__line = summaryLine;", sb);
    line = String(sb.__line);
  } catch (e) { line = "THREW " + e.message; }
  rec("⭐⭐ the summary says it moved a fleet home base, names the copied file, and blames no crash on it",
    /moved 1 fleet home base\(s\) off land the map cut off from the sea/.test(line) && /ZZZ_b\.txt/.test(line) && !/crash/i.test(line) && !/re-berthed 0 task force/.test(line), line.slice(0, 500));
}

// A fleet a SCRIPT loads is not a started one, so its home port is never listed as one (#a-script-loads-an-army-later leaves it
// to the fleet repair). Its home on a cut-off province of its own — not the one its stranded task force stands on — is judged by
// the land the map cut off alone, and nothing else would move it.
console.log("\n=== 4. a fleet an event loads: its home port, on other cut-off land, moves with its task force ===");
{
  const G3 = writeGame(tmp("game-later"), []);
  mk(G3, "events/later.txt", 'later.1 = {\n\timmediate = { ZZZ = { load_oob = "ZZZ_later" } }\n}\n');
  mk(G3, "history/units/ZZZ_later.txt", ["units = {", ...fleet("L Fleet", 19, 22), "}", ""].join("\n"));
  const M3 = writeMod(tmp("later"));
  const st = md.findUnitsStrandedByTheMap(ctx(M3, G3));
  rec("THE CONTROL: its task force on 22 is found stranded, its home 19 is on the cut-off land, and no started home port is listed",
    JSON.stringify((st.laterFleets || []).map((u) => u.province)) === "[22]" && (st.inlandBerths || new Set()).has(19) && (st.fleetHomes || []).length === 0,
    { later: (st.laterFleets || []).map((u) => u.province), homes: (st.fleetHomes || []).length });
  md.fixDrownedFleetBerths(ctx(M3, G3));
  const l = read(M3, "ZZZ_later.txt");
  rec(`⭐⭐⭐ its task force goes to ${nearest(22)} and its home port to ${nearest(19)} — the home moved for standing on land the map cut off`,
    nums(l, "location")[0] === nearest(22) && nums(l, "naval_base")[0] === nearest(19), { location: nums(l, "location"), naval_base: nums(l, "naval_base") });
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n=== a fleet's home port the map landlocked moves to a harbour: ${pass + fails.length} checks, ${fails.length} failed ===`);
if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exit(1); }
assert.ok(pass > 0);
