// ⛔ #a-state-building-keeps-off-the-factory-spots — AN ANTI-AIR GUN, A REFINERY OR ANY OTHER STATE BUILDING STANDS ON A SPOT OF ITS OWN,
// NOT ON A FACTORY'S.
//
// stateSlotLayout gives a state's factories its positions first (industrial_complex the even ones, arms_factory the odd) and every
// other type of its own rows — three anti-air guns, the silo, the reactor, the radar, the rocket site, the stronghold, the refinery —
// "the positions in turn, from where the factories stop". A state with fewer than 22 positions ran out, and those rows went round onto
// the factories' positions, one pixel aside: on the owner's flow (TEST 34 audit L10; the TEST 35 rehearsal alike) 947 of 3,243
// anti-air rows stood within 1 px of a factory row (the base game 391, 12%; its median 5 px), 48% of the arms factories and 44% of the
// civilian ones were more than half under another row of their state (the base game 20%), and 21 drawn models stood under a drawn
// anti-air gun (the base game 3). Such a row now takes a spot of its own over the state's land (siteSpotRows, as a pile's rows do,
// #a-small-states-models-are-spread-over-its-land), off every point by BUILDING_RING_NEAR px where there is room; the layout's spot
// is kept only where the land has none. A state with a position for every row keeps its layout exactly.
//
//   1. Over the installed base game (SKIPS without it): its anti-air rows stand a median 4 px or more from their state's nearest
//      factory row, and fewer than 15% within 1 px.
//   2. A state of two 12 x 12 provinces (8 positions): the CONTROL — the layout puts some of its other rows on a factory's position —
//      then after the click every other row stands 3 px or more from every factory row of its state, no anti-air model (its reach,
//      at its written rotation, this test's own sampler) covers a factory's point, and every row is on the state's own land; the
//      first factory on each position keeps its layout spot, and a copy that moved (#a-factorys-copy-stands-on-a-spot-of-its-own)
//      stands 2 px or more from every factory and 3 px or more from every other row.
//   3. A roomy state of six provinces: every other row stands exactly on one of its positions, as the layout gives it.
//   4. The same click on a second copy writes the same bytes, and a second click writes nothing.
// Binds no port. Run: node test-a-state-building-keeps-off-the-factory-spots.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-off-factory-spots-"));
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
const FACTORY = new Set(["industrial_complex", "arms_factory"]);
const OTHER = md.STATE_BUILDING_SLOTS.map(([t]) => t).filter((t) => !FACTORY.has(t) && t !== "air_base");
const median = (a) => { const s = a.slice().sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : null; };

// ── 1. the base game ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== 1. the base game stands its anti-air guns off its factories ===");
const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
if (!fs.existsSync(path.join(GAME, "map", "buildings.txt"))) console.log("  SKIP: no Hearts of Iron IV install at " + GAME + " — section 1 did not run");
else {
  const by = new Map();
  for (const l of fs.readFileSync(path.join(GAME, "map", "buildings.txt"), "latin1").split(/\r?\n/)) {
    const c = l.split(";");
    if (c.length < 7) continue;
    if (!by.has(+c[0])) by.set(+c[0], []);
    by.get(+c[0]).push({ type: c[1], x: +c[2], z: +c[4] });
  }
  const d = [];
  for (const L of by.values()) {
    const f = L.filter((r) => FACTORY.has(r.type));
    for (const r of L) if (r.type === "anti_air_building" && f.length) d.push(Math.min(...f.map((q) => Math.hypot(q.x - r.x, q.z - r.z))));
  }
  const near1 = d.filter((v) => v <= 1).length;
  ok(d.length > 3000 && median(d) >= 4 && near1 / d.length < 0.15, `the base game stands its ${d.length} anti-air rows a median ${median(d).toFixed(2)} px from their state's nearest factory row, ${(100 * near1 / d.length).toFixed(1)}% within 1 px`, { n: d.length, median: median(d), near1 });
}

// ── the fixture: rectangles [x0, y0, x1, y1) on an 80 x 48 sea (province 1), rows top-down ────────────────────────────────────
const W = 80, H = 48, SEA = 1;
const RECT = { 2: [4, 6, 16, 18], 3: [16, 6, 28, 18] };                 // state 1: two 12 x 12 provinces
let id = 4;
for (const y0 of [6, 18]) for (const x0 of [34, 46, 58]) RECT[id++] = [x0, y0, x0 + 12, y0 + 12];   // state 2: six of them, 4..9
const STATES = { 1: [2, 3], 2: [4, 5, 6, 7, 8, 9] };
const provAt = (x, y) => { for (const [p, [x0, y0, x1, y1]] of Object.entries(RECT)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +p; return SEA; };
const stateOf = (p) => { for (const [s, L] of Object.entries(STATES)) if (L.includes(p)) return +s; return null; };
const colour = (p) => [(p * 37) % 256, (p * 71) % 256, 40 + p];
const heightOf = (x, y) => (provAt(x, y) === SEA ? 80 : 110 + ((x * 3 + y * 5) % 80));
function makeMod(dir) {
  write(dir, "descriptor.mod", 'name="off-factory-spots"\nreplace_path="history/states"\nreplace_path="map"\n');
  write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  write(dir, "map/heightmap.bmp", bmp8(W, H, heightOf));
  write(dir, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`]
    .concat(Object.keys(RECT).map((p) => `${p};${colour(+p).join(";")};land;false;plains;1`)).join("\n") + "\n");
  for (const [s, provs] of Object.entries(STATES)) write(dir, `history/states/${s}-S.txt`, `state = {\n\tid = ${s}\n\tname = "STATE_${s}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`);
  write(dir, "map/buildings.txt", "99;radar_station;1.00;9.50;1.00;0.00;0\n");
}
const modA = path.join(ROOT, "a"), modB = path.join(ROOT, "b");
makeMod(modA); makeMod(modB);
const rootsA = { modRoot: modA, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
const readRows = (dir) => fs.readFileSync(path.join(dir, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(";")).filter((c) => c.length >= 7)
  .map((c) => { const x = +c[2], z = +c[4]; return { sid: +c[0], type: c[1], x, z, rot: +c[5], px: Math.floor(x), row: H - 1 - Math.floor(z) }; });
const cheb = (a, b) => Math.max(Math.abs(a.px - b.px), Math.abs(a.row - b.row));
const spreadOf = (sid) => { const a = md.stateBuildingAnchor({ ...rootsA, provinces: STATES[sid], positions: true, stateId: sid }) || {}; return { ...a, positions: Array.isArray(a.positions) ? a.positions : [] }; };
/** this test's own sampler: whether the model of `reach` at (x, z) turned `a` counter-clockwise (x east, z north) covers the point (qx, qz) */
const covers = (x, z, a, reach, qx, qz) => { const dx = qx - x, dz = qz - z, u = dx * Math.cos(a) + dz * Math.sin(a), v = -dx * Math.sin(a) + dz * Math.cos(a); return u >= -reach.west && u <= reach.east && v >= -reach.south && v <= reach.north; };
const pix = (t) => ({ px: Math.floor(t.x), row: H - 1 - Math.floor(t.z) });

const pos1 = spreadOf(1), pos2 = spreadOf(2), L1 = md.stateSlotLayout(pos1), L2 = md.stateSlotLayout(pos2);
console.log("\n=== the click: Auto-fix's slot pass furnishes both states ===");
const fixed = md.fixStatesWithoutBuildingSlots(rootsA);
ok(fixed && fixed.fixed === 2 && !(fixed.failed || []).length, "fixStatesWithoutBuildingSlots gave both states their rows", fixed);
const rows = readRows(modA);

console.log("\n=== 2. a state of 8 positions: its other rows on spots of their own ===");
{
  const mine = rows.filter((r) => r.sid === 1), fac = mine.filter((r) => FACTORY.has(r.type)), other = mine.filter((r) => OTHER.includes(r.type));
  const facSpots = L1 ? [...L1.get("industrial_complex"), ...L1.get("arms_factory")].map(pix) : [];
  const onFactory = L1 ? OTHER.flatMap((t) => L1.get(t) || []).map(pix).filter((p) => facSpots.some((f) => cheb(p, f) <= 1)).length : 0;
  ok(pos1.positions.length >= 3 && pos1.positions.length < md.STATE_BUILDING_SLOTS.reduce((n, [, k]) => n + k, 0) && !!L1 && onFactory > 0,
    `CONTROL: ${pos1.positions.length} positions, laid out (not a pile), and the layout puts ${onFactory} of its other rows within 1 px of a factory's spot`, { positions: pos1.positions.length, onFactory });
  ok(fac.length === 12 && other.length === OTHER.reduce((n, t) => n + (md.STATE_BUILDING_SLOTS.find(([q]) => q === t) || [0, 0])[1], 0), "(its 12 factory rows and its other rows written)", { fac: fac.length, other: other.length });
  const tooNear = other.filter((r) => fac.some((f) => cheb(r, f) < md.BUILDING_RING_NEAR));
  ok(!tooNear.length, `⭐⭐ every other row stands ${md.BUILDING_RING_NEAR} px or more from every factory row of its state`, tooNear.map((r) => [r.type, r.px, r.row]));
  const aaReach = md.LAND_ROW_REACH.anti_air_building;
  const under = fac.filter((f) => other.some((r) => r.type === "anti_air_building" && covers(r.x, r.z, r.rot, aaReach, f.x, f.z)));
  ok(!under.length, "⭐⭐ no anti-air model, turned as written, covers a factory's point", under.map((r) => [r.type, r.px, r.row]));
  ok(mine.every((r) => stateOf(provAt(r.px, r.row)) === 1), "⭐ every row on the state's own land", mine.filter((r) => stateOf(provAt(r.px, r.row)) !== 1).map((r) => [r.type, r.px, r.row]));
  // ⚠️ MOVED with ⛔ #a-factorys-copy-stands-on-a-spot-of-its-own: a factory's copy on a position its kind took already (the layout's
  // `shared`) takes a spot of its own where the land has a good one, so only the first of each position keeps its layout spot now —
  // and a copy that moved stands 2 px or more from every factory row and 3 px or more from every other row
  const firstSpots = L1 ? ["industrial_complex", "arms_factory"].flatMap((t) => L1.get(t).filter((_, k) => !L1.shared.get(t)[k]).map((s) => ({ type: t, ...pix(s) }))) : [];
  ok(firstSpots.length >= 2 && firstSpots.every((s) => fac.some((r) => r.type === s.type && r.px === s.px && r.row === s.row)), `the first factory on each of its positions keeps its layout spot (${firstSpots.length})`, firstSpots);
  const moved = fac.filter((r) => !facSpots.some((s) => s.px === r.px && s.row === r.row));
  ok(moved.every((r) => fac.every((f) => f === r || cheb(f, r) >= 2) && mine.filter((o) => !FACTORY.has(o.type)).every((o) => cheb(o, r) >= md.BUILDING_RING_NEAR)), `…a copy that moved (${moved.length}) 2 px or more from every factory and ${md.BUILDING_RING_NEAR} from every other row`, moved.map((r) => [r.type, r.px, r.row]));
}

console.log("\n=== 3. a roomy state: its other rows keep the positions the layout gives them ===");
{
  const other = rows.filter((r) => r.sid === 2 && OTHER.includes(r.type)), P = pos2.positions.map(pix);
  ok(!!L2 && pos2.positions.length > md.STATE_BUILDING_SLOTS.reduce((n, [, k]) => n + k, 0), `(the fixture: ${pos2.positions.length} positions, one for every row)`, pos2.positions.length);
  ok(other.length && other.every((r) => P.some((p) => p.px === r.px && p.row === r.row)), "⭐ every other row stands exactly on one of its positions, as the layout gives it", other.map((r) => [r.type, r.px, r.row]));
}

console.log("\n=== 4. deterministic, and idempotent ===");
{
  const r2 = md.fixStatesWithoutBuildingSlots({ modRoot: modB, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] });
  ok(r2 && r2.fixed === 2 && fs.readFileSync(path.join(modB, "map", "buildings.txt"), "utf8") === fs.readFileSync(path.join(modA, "map", "buildings.txt"), "utf8"),
    "⭐⭐ the same click on a second copy writes the same bytes", r2);
  const before = fs.readFileSync(path.join(modA, "map", "buildings.txt"), "utf8");
  const again = md.fixStatesWithoutBuildingSlots(rootsA);
  ok(again && !again.fixed && fs.readFileSync(path.join(modA, "map", "buildings.txt"), "utf8") === before, "a second click writes nothing", again);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
