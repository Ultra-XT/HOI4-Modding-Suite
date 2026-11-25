// ⛔ #a-province-move-keeps-every-state-its-sites — A STATE PAINTED OVER ANOTHER'S PROVINCES LEAVES IT EVERY KIND OF BUILDING.
//
// The map page's "+ New state" sends create-state { name: "", owner } and then one move-province { provinceId, toStateId } per
// province painted into it (public/map.js queueWrite; the state it came from rides in the write's meta, not its body). Each move
// re-keys the map/buildings.txt rows standing on the province to the new state (rekeyBuildingAnchorsForProvince), and
// giveMovedStatesTheirSites gave the state they came from back only an air base or a rocket site it had lost. Every other standard
// position went for good: the review's probe (wave 6, RL-3) painted 4 provinces of a generated state into a new one and left the
// source with no anti-air, fuel silo, reactor, radar or stronghold position at all — 14 of its 22 — and Map Errors offered nothing.
// The same at c01ee08f, before wave 6. Now a state a move takes the last row of a standard kind from gets that kind back on the land
// it kept, as it gets a site back; a kind it still holds a row of is left as it is.
//
//   1. A state of six provinces furnished as Generate land furnishes one; three painted into a new state, one move each, sent as the
//      page sends them: the source holds every standard kind again, each new row on its own land; every row it kept is byte for byte
//      where it was; the new state holds every kind; the moves' answers name the kinds given back (the Save note reads them).
//   2. The same through create-state with the three provinces at once (the carve): the source keeps every kind too.
//   3. A province erased to sea (flip-province-sea { provinceId }, which drops every row standing on it): the state keeps every kind.
// Binds no port. Run: node test-a-painted-state-leaves-its-source-every-kind-of-building.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-painted-state-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
function bmp8(W, H, fn) {
  const rs = Math.floor((8 * W + 31) / 32) * 4, off = 54 + 1024, b = Buffer.alloc(off + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(rs * H, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * rs + x] = fn(x, y);
  return b;
}
const KINDS = md.STATE_BUILDING_SLOTS.map(([t]) => t);
const COAST_TYPES = new Set([...md.COASTAL_STATE_BUILDING_SLOTS.map(([t]) => t), ...md.PER_COASTAL_PROVINCE_BUILDING_SLOTS]);
// six provinces in two rows of three, 10 px each, on a sea (province 1); rows top-down
const W = 60, H = 40, SEA = 1;
const RECT = { 2: [10, 10, 20, 20], 3: [20, 10, 30, 20], 4: [30, 10, 40, 20], 5: [10, 20, 20, 30], 6: [20, 20, 30, 30], 7: [30, 20, 40, 30] };
const PROVS = [2, 3, 4, 5, 6, 7], PAINTED = [5, 6, 7];
const provAt = (x, y) => { for (const [id, [x0, y0, x1, y1]] of Object.entries(RECT)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return SEA; };
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
function makeMod(dir) {
  write(dir, "descriptor.mod", 'name="painted"\nreplace_path="history/states"\nreplace_path="map"\n');
  write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  write(dir, "map/heightmap.bmp", bmp8(W, H, (x, y) => (provAt(x, y) === SEA ? 80 : 100 + ((x * 3 + y * 5) % 40))));
  write(dir, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`].concat(PROVS.map((id) => `${id};${colour(id).join(";")};land;false;plains;1`)).join("\n") + "\n");
  write(dir, "history/states/1-S.txt", `state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${PROVS.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`);
  write(dir, "map/buildings.txt", "99;radar_station;1.00;9.50;1.00;0.00;0\n");
  const roots = { modRoot: dir, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
  const coastNow = md.landProvincesTouchingSea(roots) || new Set();
  md.ensureBuildingSlotsForState({ ...roots, stateId: 1, provinces: PROVS, townPoints: md.stateBuildingAnchor({ ...roots, provinces: PROVS, each: true }), coast: { provinces: new Set(PROVS.filter((p) => coastNow.has(p))), ports: [], types: COAST_TYPES } });
  return roots;
}
const rowsOf = (dir) => fs.readFileSync(path.join(dir, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(";")).filter((c) => c.length >= 7)
  .map((c) => ({ sid: +c[0], type: c[1], line: c.join(";"), body: c.slice(1).join(";"), province: provAt(Math.floor(+c[2]), H - 1 - Math.floor(+c[4])) }));
const kindsOf = (rows, sid) => new Set(rows.filter((r) => r.sid === sid).map((r) => r.type));
const stateOfRow = (dir, sid) => { const t = fs.readdirSync(path.join(dir, "history", "states")).map((f) => fs.readFileSync(path.join(dir, "history", "states", f), "utf8")).find((s) => new RegExp("\\bid\\s*=\\s*" + sid + "\\b").test(s)); const m = t && /provinces\s*=\s*\{([^}]*)\}/.exec(t); return m ? m[1].trim().split(/\s+/).filter(Boolean).map(Number) : []; };

function check(label, dir, before, newId, answers) {
  const after = rowsOf(dir);
  const kept = stateOfRow(dir, 1);
  ok(kept.length === PROVS.length - PAINTED.length && PAINTED.every((p) => !kept.includes(p)), `(${label}: the source keeps provinces ${kept.join(" ")})`, kept);
  const lostWhole = KINDS.filter((t) => before.some((r) => r.sid === 1 && r.type === t) && before.filter((r) => r.sid === 1 && r.type === t).every((r) => PAINTED.includes(r.province)));
  ok(lostWhole.length > 0, `(${label}, the fixture: the painted provinces held every row of ${lostWhole.length} standard kinds of the source's — ${lostWhole.join(", ")})`, lostWhole);
  const missing = KINDS.filter((t) => !kindsOf(after, 1).has(t));
  ok(!missing.length, `⭐⭐ ${label}: the source holds every standard kind again (${KINDS.length})`, missing);
  const mine = after.filter((r) => r.sid === 1);
  const offLand = mine.filter((r) => !kept.includes(r.province));
  ok(!offLand.length, `⭐⭐ ${label}: every row of the source's stands on the land it kept`, offLand.map((r) => r.line));
  const stayed = before.filter((r) => r.sid === 1 && kept.includes(r.province));
  const moved = stayed.filter((r) => !after.some((q) => q.line === r.line));
  ok(stayed.length > 0 && !moved.length, `⭐⭐ ${label}: the ${stayed.length} rows it kept are byte for byte where they were`, moved.map((r) => r.line));
  const given = mine.filter((r) => !before.some((q) => q.line === r.line));
  ok(given.length > 0 && given.every((r) => lostWhole.includes(r.type)), `⭐ ${label}: only the kinds it lost whole are given back (${given.length} rows: ${[...new Set(given.map((r) => r.type))].join(", ")})`, given.map((r) => r.line));
  const newMissing = KINDS.filter((t) => !kindsOf(after, newId).has(t));
  ok(!newMissing.length, `${label}: the new state ${newId} holds every standard kind`, newMissing);
  if (answers) {
    const named = new Set(answers.flatMap((a) => ((a && a.buildingSites && a.buildingSites.placed) || []).filter((p) => p.stateId === 1).flatMap((p) => (Array.isArray(p.types) ? p.types : []))));
    ok(lostWhole.every((t) => named.has(t)), `⭐ ${label}: the moves' answers name every kind given back to the source — the Save note reads them`, [...named]);
  }
}

console.log("\n=== 1. + New state, then three provinces painted into it, one move each ===");
{
  const dir = path.join(ROOT, "paint");
  const roots = makeMod(dir);
  const before = rowsOf(dir);
  ok(KINDS.every((t) => kindsOf(before, 1).has(t)), "(the fixture: the source holds every standard kind before)");
  const c = md.createState({ ...roots, name: "", owner: "AAA" });
  ok(!!c && c.ok && Number.isFinite(c.id), "(create-state { name: \"\", owner } made a state)", c);
  const answers = PAINTED.map((p) => md.moveProvince({ ...roots, provinceId: p, toStateId: c.id }));
  ok(answers.every((a) => a && a.changed), "(every move-province answered changed)", answers.map((a) => a && a.error));
  check("painted", dir, before, c.id, answers);
}

console.log("\n=== 2. the same provinces carved into a new state at once ===");
{
  const dir = path.join(ROOT, "carve");
  const roots = makeMod(dir);
  const before = rowsOf(dir);
  const c = md.createState({ ...roots, name: "", owner: "AAA", provinces: PAINTED });
  ok(!!c && c.ok && Number.isFinite(c.id), "(create-state with three provinces made a state)", c);
  check("carved", dir, before, c.id, c && c.buildingSites ? [c] : []);
}

console.log("\n=== 3. a province of the state erased to sea, as the page's eraser sends it ===");
{
  const dir = path.join(ROOT, "erase");
  const roots = makeMod(dir);
  const before = rowsOf(dir);
  // the province that alone holds every row of the most kinds of the state's
  const whole = (p) => KINDS.filter((t) => { const L = before.filter((r) => r.sid === 1 && r.type === t); return L.length && L.every((r) => r.province === p); });
  const pid = PROVS.slice().sort((a, b) => whole(b).length - whole(a).length || a - b)[0];
  const lostWhole = whole(pid);
  ok(lostWhole.length > 0, `(the fixture: province ${pid} alone holds every row of ${lostWhole.join(", ")})`, lostWhole);
  const r = md.flipProvinceToSea({ ...roots, provinceId: pid });
  ok(!!r && r.changed, `(flip-province-sea { provinceId: ${pid} } erased it)`, r && r.error);
  const after = rowsOf(dir), kept = stateOfRow(dir, 1);
  const missing = KINDS.filter((t) => !kindsOf(after, 1).has(t));
  ok(!kept.includes(pid) && !missing.length, `⭐⭐ erased: the state holds every standard kind again (${KINDS.length})`, missing);
  const offLand = after.filter((q) => q.sid === 1 && !kept.includes(q.province));
  ok(!offLand.length, "⭐ erased: every row of the state's stands on the land it kept", offLand.map((q) => q.line));
  const named = new Set(((r && r.buildingSites && r.buildingSites.placed) || []).filter((p) => p.stateId === 1).flatMap((p) => (Array.isArray(p.types) ? p.types : [])));
  ok(lostWhole.every((t) => named.has(t)), "⭐ erased: the answer names every kind given back — the Save note reads it", [...named]);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
