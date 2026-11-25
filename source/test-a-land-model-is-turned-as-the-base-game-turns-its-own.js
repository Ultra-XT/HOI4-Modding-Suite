// ⛔ #a-land-model-is-turned-as-the-base-game-turns-its-own — EVERY LAND ROW NOVA WRITES IS TURNED, WHERE ITS MODEL STILL FITS.
//
// Nova wrote every land row of map/buildings.txt at rotation 0.00. On the owner's flow (TEST 34, audit L11) it turned 0 of 1,081 air
// bases and 0 of 6,486 arms factories, where the base game turns 1,080 and 6,475: every airfield lay on one heading and a state's
// factories looked stamped. The base game turns all but 0.0–0.2% of every land type, each row a heading of its own spread evenly over
// the whole turn. ensureBuildingSlotsForState — the one writer of every land row (createState, Generate land, a province move, Auto-fix's
// slot passes) — now turns each row it writes (landRowRotation): its own heading, a hash of stable ids, where its model fits there, else
// the best of the other headings, never worse placed than at rotation 0.
//
//   1. Over the installed base game (SKIPS without it): every land type ensureBuildingSlotsForState writes (STATE_BUILDING_SLOTS and
//      PER_LAND_PROVINCE_BUILDING_SLOTS, derived) is turned on 99% or more of its rows, evenly (8 bins within ±25% of their mean), with
//      2 decimals; and LAND_ROW_REACH is what buildingRowReach reads off the installed game, type by type.
//   2. A fixture state of three provinces with a coast: every land row the call writes is turned (2 decimals, in [0, 6.28], 90% or
//      more not 0.00, headings not stamped), each model as much on the state's land as at rotation 0 and the air base's on its own
//      province (this test's own sampler, every 0.1 px, the counter-clockwise convention); the coast's rows keep coastFacing's answer;
//      a CONTROL shows the checks fail on the old all-zero rows.
//   3. A modder's own rows (one turned, one at 0.00) are left byte for byte, and the same call on a second copy writes the same bytes.
//   4. A strip 4 px tall: no heading of the 16 but the ones near the strip's own keeps the runway on it, and the written one does.
// Binds no port. Run: node test-a-land-model-is-turned-as-the-base-game-turns-its-own.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-land-turned-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 500) : "")); }
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
const LAND_TYPES = [...md.STATE_BUILDING_SLOTS.map(([t]) => t), ...md.PER_LAND_PROVINCE_BUILDING_SLOTS];
const COAST_TYPES = new Set([...md.COASTAL_STATE_BUILDING_SLOTS.map(([t]) => t), ...md.PER_COASTAL_PROVINCE_BUILDING_SLOTS]);
const reachOf = (t) => (t === "air_base" ? md.AIRFIELD_REACH : md.LAND_ROW_REACH && md.LAND_ROW_REACH[t]);

// ── 1. the base game ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== 1. the base game turns every land type, evenly ===");
const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
if (!fs.existsSync(path.join(GAME, "map", "buildings.txt"))) console.log("  SKIP: no Hearts of Iron IV install at " + GAME + " — section 1 did not run");
else {
  const by = new Map();
  for (const l of fs.readFileSync(path.join(GAME, "map", "buildings.txt"), "latin1").split(/\r?\n/)) {
    const c = l.split(";");
    if (c.length < 7) continue;
    if (!by.has(c[1])) by.set(c[1], []);
    by.get(c[1]).push(c[5].trim());
  }
  for (const t of LAND_TYPES) {
    const L = by.get(t) || [];
    const turned = L.filter((s) => parseFloat(s) !== 0).length, twoDec = L.filter((s) => /^-?\d+\.\d\d$/.test(s)).length;
    const bins = new Array(8).fill(0);
    for (const s of L) { const a = ((parseFloat(s) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); bins[Math.min(7, Math.floor(a / (Math.PI / 4)))]++; }
    const mean = L.length / 8;
    ok(L.length > 500 && turned / L.length >= 0.99 && twoDec === L.length && bins.every((b) => Math.abs(b - mean) <= 0.25 * mean),
      `${t}: the base game turns ${turned} of ${L.length} rows, 2 decimals, evenly over the turn`, { turned, n: L.length, bins });
  }
  const model = md.buildMapModel({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [] });
  const rules = md.stateBuildingRules(model);
  for (const t of LAND_TYPES) {
    if (t === "air_base") continue;
    const read = md.buildingRowReach({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [], rules, rowType: t, fallback: null });
    ok(!!read && JSON.stringify(read) === JSON.stringify(reachOf(t)), `LAND_ROW_REACH.${t} is the reach buildingRowReach reads off the installed game`, { read, table: reachOf(t) });
  }
}

// ── the fixture: rectangles [x0, y0, x1, y1) on a sea (province 1), rows top-down ──────────────────────────────────────────────────
const W = 72, H = 56, SEA = 1;
const RECT = {
  2: [4, 4, 24, 24], 3: [24, 4, 44, 24], 4: [4, 24, 24, 44],   // state 1: three provinces, sea round them
  5: [50, 30, 66, 46],                                          // state 9: the modder's
  6: [48, 6, 70, 10],                                           // state 7: a strip 4 px tall
};
const STATES = { 1: [2, 3, 4], 9: [5], 7: [6] };
const provAt = (x, y) => { for (const [id, [x0, y0, x1, y1]] of Object.entries(RECT)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return SEA; };
const stateOf = (p) => { for (const [s, L] of Object.entries(STATES)) if (L.includes(p)) return +s; return null; };
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const MODDERS = ["9;arms_factory;55.00;10.20;15.00;1.23;0", "9;industrial_complex;58.00;10.20;15.00;0.00;0"];
function makeMod(dir) {
  write(dir, "descriptor.mod", 'name="land-turned"\nreplace_path="history/states"\nreplace_path="map"\n');
  write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  write(dir, "map/heightmap.bmp", bmp8(W, H, (x, y) => (provAt(x, y) === SEA ? 80 : 100 + ((x * 3 + y * 5) % 40))));
  write(dir, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`]
    .concat(Object.keys(RECT).map((id) => `${id};${colour(+id).join(";")};land;false;plains;1`)).join("\n") + "\n");
  for (const [s, provs] of Object.entries(STATES)) write(dir, `history/states/${s}-S.txt`, `state = {\n\tid = ${s}\n\tname = "STATE_${s}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`);
  write(dir, "map/buildings.txt", ["99;radar_station;1.00;9.50;1.00;0.00;0", ...MODDERS].join("\n") + "\n");
}
const rowsIn = (dir) => fs.readFileSync(path.join(dir, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(";")).filter((c) => c.length >= 7)
  .map((c) => ({ sid: +c[0], type: c[1], x: +c[2], z: +c[4], rot: +c[5], rotText: c[5], line: c.join(";"), province: provAt(Math.floor(+c[2]), H - 1 - Math.floor(+c[4])) }));
/** this test's own sampler: of the model at (x, z) turned by `a` counter-clockwise (x east, z north), the shares of its area off the
 *  state's land and off province `home` */
function offShares(r, a, sid) {
  const R = reachOf(r.type), st = 0.1, cs = Math.cos(a), sn = Math.sin(a);
  let n = 0, offLand = 0, offHome = 0;
  for (let u = -R.west + st / 2; u < R.east; u += st) for (let v = -R.south + st / 2; v < R.north; v += st) {
    const X = r.x + u * cs - v * sn, Z = r.z + u * sn + v * cs, row = H - 1 - Math.floor(Z), col = Math.floor(X);
    const p = row >= 0 && row < H && col >= 0 && col < W ? provAt(col, row) : -1;
    n++;
    if (stateOf(p) !== sid) offLand++;
    if (p !== r.province) offHome++;
  }
  return { land: offLand / n, home: offHome / n };
}
const call = (dir, sid) => {
  const roots = { modRoot: dir, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
  const provs = STATES[sid];
  const coastNow = md.landProvincesTouchingSea(roots) || new Set();
  const coast = { provinces: new Set(provs.filter((p) => coastNow.has(p))), ports: [], types: COAST_TYPES };
  return md.ensureBuildingSlotsForState({ ...roots, stateId: sid, provinces: provs, townPoints: md.stateBuildingAnchor({ ...roots, provinces: provs, each: true }), coast });
};

console.log("\n=== 2. every land row the writer writes is turned, where its model fits ===");
const modA = path.join(ROOT, "a"), modB = path.join(ROOT, "b");
makeMod(modA); makeMod(modB);
const g = call(modA, 1);
const rowsA = rowsIn(modA), mine = rowsA.filter((r) => r.sid === 1), land = mine.filter((r) => !COAST_TYPES.has(r.type)), coastRows = mine.filter((r) => COAST_TYPES.has(r.type));
ok(!!g && g.changed && land.length >= md.STATE_BUILDING_SLOTS.reduce((n, [, k]) => n + k, 0) && LAND_TYPES.every((t) => land.some((r) => r.type === t)) && coastRows.length > 0,
  "(the fixture: the call writes every land type and the coast's rows)", { g, land: land.length, coast: coastRows.length });
const legal = (r) => /^\d+\.\d\d$/.test(r.rotText) && r.rot >= 0 && r.rot <= 6.28;
const turned = (L) => L.filter((r) => r.rotText !== "0.00").length;
ok(land.every(legal), "⭐ every land row's rotation has 2 decimals, in [0, 6.28], as the base game writes", land.filter((r) => !legal(r)).map((r) => r.line));
ok(turned(land) >= 0.9 * land.length, `⭐⭐ ${turned(land)} of ${land.length} land rows are turned (90% or more)`, land.filter((r) => r.rotText === "0.00").map((r) => r.line));
const distinct = new Set(land.map((r) => r.rotText)).size;
ok(distinct >= 0.6 * land.length, `⭐ …each a heading of its own, not one stamped on all: ${distinct} different rotations on ${land.length} rows`, distinct);
for (const t of LAND_TYPES) {
  const L = land.filter((r) => r.type === t);
  const worse = L.filter((r) => { const now = offShares(r, r.rot, 1), zero = offShares(r, 0, 1); return now.land > zero.land + 0.03; });
  ok(L.length > 0 && !worse.length, `⭐⭐ ${t}: every model as much on the state's land as at rotation 0 (${L.length})`, worse.map((r) => [r.line, offShares(r, r.rot, 1), offShares(r, 0, 1)]));
}
const air = land.find((r) => r.type === "air_base");
ok(!!air && offShares(air, air.rot, 1).home <= offShares(air, 0, 1).home + 0.03, "⭐⭐ the air base's runway is as much on its own province as at rotation 0", air && [air.line, offShares(air, air.rot, 1), offShares(air, 0, 1)]);
// the coast's rows: their rotation is coastFacing's, untouched by the land pass
{
  const ex = { W, H, pidAt: (x, row) => provAt(x, row) };
  const typeOf = (id) => (id === SEA ? "sea" : "land");
  const off = coastRows.filter((r) => (md.coastFacing(ex, typeOf, r.x, r.z) || 0).toFixed(2) !== r.rotText);
  ok(coastRows.length && !off.length, `the coast's ${coastRows.length} rows keep coastFacing's answer`, off.map((r) => r.line));
}
// CONTROL: the same rows at 0.00, as the writer wrote them before
{
  const zero = land.map((r) => ({ ...r, rot: 0, rotText: "0.00" }));
  ok(turned(zero) < 0.9 * zero.length && new Set(zero.map((r) => r.rotText)).size < 0.6 * zero.length, "⭐ CONTROL: the old all-zero rows fail both counts above — the checks tell the two apart", { turned: turned(zero) });
}

console.log("\n=== 3. a modder's own rows stay as they are; the same call writes the same bytes ===");
{
  const lines = fs.readFileSync(path.join(modA, "map", "buildings.txt"), "utf8").split(/\r?\n/);
  ok(MODDERS.every((m, i) => lines[1 + i] === m), "⭐⭐ the modder's two rows — one turned, one at 0.00 — byte for byte, where they stood", lines.slice(0, 3));
  const g2 = call(modB, 1);
  ok(!!g2 && g2.changed && fs.readFileSync(path.join(modB, "map", "buildings.txt"), "utf8") === fs.readFileSync(path.join(modA, "map", "buildings.txt"), "utf8"),
    "⭐⭐ the same call on a second copy writes the same bytes — no Math.random", g2);
}

console.log("\n=== 4. a strip 4 px tall: the runway stays on it ===");
{
  const g4 = call(modA, 7);
  const a = rowsIn(modA).find((r) => r.sid === 7 && r.type === "air_base");
  ok(!!g4 && g4.changed && !!a, "(the strip's state is furnished)", g4);
  if (a) {
    const now = offShares(a, a.rot, 7), zero = offShares(a, 0, 7), across = offShares(a, Math.PI / 2, 7);
    ok(across.home > zero.home + 0.05, "(the fixture: turned a quarter, the runway would hang off the strip)", { across, zero });
    ok(now.home <= zero.home + 0.03 && now.land <= zero.land + 0.03, `⭐⭐ the written heading (${a.rotText}) keeps the runway on the strip as rotation 0 does`, { now, zero });
  }
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
