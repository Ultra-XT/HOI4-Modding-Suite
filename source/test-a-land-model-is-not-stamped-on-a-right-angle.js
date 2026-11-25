// ⛔ #a-land-model-is-turned-as-the-base-game-turns-its-own — A LAND MODEL KEEPS A HEADING OF ITS OWN: NOT A RIGHT ANGLE, NOT A FEW HEADINGS.
//
// landRowRotation turns a row to its own heading where its model fits there, else to the best of 16 headings from it, else to one of
// the four right angles where one fits better. With no margin on that fall-back, a big model in a crowded state took a right angle
// wherever its 16 headings could not fit perfectly: on the owner's flow 28.0% of the AA guns, 22.2% of the reactors and 15.3% of the
// strongholds stood on a right angle, and 70 of 375 land rows on one-province islands — the base game 1.9–3.5% for every land type, a
// uniform heading 2.5% (±0.02 rad of the four). And turnLandRows kept every row on the province under its point, so a factory near its
// province's border fitted every heading but the ones crossing it and the next heading along took theirs: the military factories' 8
// bins (2π/8 each) 0.85–1.40 of their mean (the base game 0.93–1.06). Now only the air base keeps its province (the base game keeps
// none: 41.7% of its forts' models and 11.6% of its military factories' are more than 5% off theirs), and every row but the air base
// takes a right angle only where it fits more than LAND_ROW_RIGHT_ANGLE_MARGIN (5%) of its samples better on the state's land — so no
// model stands more than 5% of itself further off its land than at rotation 0.
//
//   1. Fifteen one-province islands, each furnished as Generate land furnishes a state: 6% or fewer of the land rows the margin holds
//      for (every row but the air base, which falls back wherever a right angle fits better at all and is checked on its own) on a right
//      angle (66 of 360 without the margin; 70 of 375 with the air bases), every model within 5% of rotation 0 on its island, the air
//      base no further off than at rotation 0; a CONTROL shows the count sees rows at 0.00. (Counted with them, the air bases took 6
//      of the 15: 23 of 375, once #a-pile-spreads-over-its-dry-land spread a pile's factories over the dry land its reactors had.)
//  1b. A state of three strips 4 px tall: the air base, which takes no margin, keeps its runway on its own strip as at rotation 0 —
//      with the margin it took a heading 0.20 rad off the strip's line and crossed into the next strip (1% of it).
//   2. The installed base game (SKIPS without it): every land type 4% or fewer on a right angle — the bar section 3 is held to, doubled.
//   3. A generated world (SKIPS without the game: its map blanked to sea, Generate land at 520 provinces, 3 a state, seed 1 — 215 states):
//      every land type 8% or fewer on a right angle (AA 28.4%, reactor 21.9% before); every land type with 1,024 rows or more evenly
//      over the turn, 8 bins within ±25% of their mean (military factories 0.82–1.38 before); every model within 5% of rotation 0 on its
//      state's land. A CONTROL shows the spread check fails on rows bunched into two headings.
// The 5% is held here, not read: LAND_ROW_RIGHT_ANGLE_MARGIN may be lowered, not raised past it.
// This test's own sampler (every 0.1 px, the counter-clockwise convention). Binds no port.
// Run: node test-a-land-model-is-not-stamped-on-a-right-angle.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-land-right-angle-"));
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
const MARGIN = md.LAND_ROW_RIGHT_ANGLE_MARGIN, BOUND = 0.05;   // the guarantee: no model more than 5% of itself further off its land than at rotation 0
const LAND_TYPES = [...md.STATE_BUILDING_SLOTS.map(([t]) => t), ...md.PER_LAND_PROVINCE_BUILDING_SLOTS];
const COAST_TYPES = new Set([...md.COASTAL_STATE_BUILDING_SLOTS.map(([t]) => t), ...md.PER_COASTAL_PROVINCE_BUILDING_SLOTS]);
const RIGHT = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2, 2 * Math.PI];
const onRight = (a) => RIGHT.some((r) => Math.abs(a - r) <= 0.02);
const bins8 = (L) => { const b = new Array(8).fill(0); for (const a of L) b[Math.min(7, Math.floor((((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)))]++; const m = L.length / 8; return { lo: Math.min(...b) / m, hi: Math.max(...b) / m }; };
const even = (L) => { const { lo, hi } = bins8(L); return lo >= 0.75 && hi <= 1.25; };
/** of the model at (x, z) turned `a` counter-clockwise (x east, z north), the share of its area where `bad(col, row)` holds */
function offShare(R, x, z, a, H, bad) {
  const st = 0.1, cs = Math.cos(a), sn = Math.sin(a);
  let n = 0, k = 0;
  for (let u = -R.west + st / 2; u < R.east; u += st) for (let v = -R.south + st / 2; v < R.north; v += st) {
    const X = x + u * cs - v * sn, Z = z + u * sn + v * cs;
    n++;
    if (bad(Math.floor(X), H - 1 - Math.floor(Z))) k++;
  }
  return n ? k / n : 0;
}
ok(typeof MARGIN === "number" && MARGIN > 0 && MARGIN <= BOUND, `LAND_ROW_RIGHT_ANGLE_MARGIN (${MARGIN}) is exported and no more than ${BOUND}`, MARGIN);

// ── 1. one-province islands ───────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== 1. one-province islands: a model keeps its own heading, within the margin of rotation 0 ===");
{
  const W = 40, H = 24, SEA = 1;
  const SIZES = [[5, 5], [6, 5], [6, 6], [7, 5], [7, 6], [7, 7], [8, 6], [8, 8], [9, 7], [10, 6], [10, 8], [12, 8], [4, 9], [3, 12], [14, 4]];
  const all = [], worse = [], air = [];
  for (const [w, h] of SIZES) {
    const box = [10, 6, 10 + w, 6 + h];
    const provAt = (x, y) => (x >= box[0] && x < box[2] && y >= box[1] && y < box[3] ? 2 : SEA);
    const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
    const mod = path.join(ROOT, `island-${w}x${h}`);
    write(mod, "descriptor.mod", 'name="islands"\nreplace_path="history/states"\nreplace_path="map"\n');
    write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
    write(mod, "map/heightmap.bmp", bmp8(W, H, (x, y) => (provAt(x, y) === SEA ? 80 : 96 + ((x * 3 + y * 5) % 120))));
    write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`, `2;${colour(2).join(";")};land;false;plains;1`].join("\n") + "\n");
    const tx = box[0] + Math.floor(w / 2), ty = box[1] + Math.floor(h / 2);
    write(mod, "map/unitstacks.txt", `2;0;${tx}.00;10.00;${H - 1 - ty}.00;0.00;0.00\n`);
    write(mod, "history/states/1-S.txt", "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n");
    const BT = write(mod, "map/buildings.txt", "99;radar_station;1.00;9.50;1.00;0.00;0\n");
    const roots = { modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
    const tp = md.stateBuildingAnchor({ ...roots, provinces: [2], each: true }) || new Map();
    const now = md.landProvincesTouchingSea(roots) || new Set();
    md.ensureBuildingSlotsForState({ ...roots, stateId: 1, provinces: [2], townPoints: tp, coast: { provinces: new Set([2].filter((p) => now.has(p))), ports: [], types: COAST_TYPES } });
    const off = (col, row) => provAt(col, row) !== 2 || col < 0 || row < 0 || col >= W || row >= H;
    for (const l of fs.readFileSync(BT, "utf8").split(/\r?\n/)) {
      const c = l.split(";");
      if (c.length < 7 || +c[0] !== 1 || COAST_TYPES.has(c[1])) continue;
      const R = c[1] === "air_base" ? md.AIRFIELD_REACH : md.LAND_ROW_REACH[c[1]];
      const x = +c[2], z = +c[4], a = +c[5];
      const r = { island: `${w}x${h}`, line: l, rot: a, now: offShare(R, x, z, a, H, off), zero: offShare(R, x, z, 0, H, off) };
      all.push(r);
      if (c[1] === "air_base") air.push(r);
      else if (r.now > r.zero + BOUND + 0.02) worse.push(r);
    }
  }
  // (the rows the margin holds for: every one but the air base, whose fall-back is exact and which the check below asks of its own)
  const held = all.filter((r) => !air.includes(r)), right = held.filter((r) => onRight(r.rot));
  ok(all.length >= 300 && held.length === all.length - SIZES.length, `(the islands are furnished: ${all.length} land rows on ${SIZES.length} islands, ${held.length} of them not an air base)`, { all: all.length, held: held.length });
  ok(right.length <= 0.06 * held.length, `⭐⭐ ${right.length} of the ${held.length} land rows but the air bases on a right angle (6% or fewer; 66 of 360 before the margin)`, right.map((r) => [r.island, r.line]));
  ok(!worse.length, `⭐⭐ every model but the air base within ${BOUND} of rotation 0 on its island`, worse.map((r) => [r.island, r.line, r.now.toFixed(3), r.zero.toFixed(3)]));
  const airWorse = air.filter((r) => r.now > r.zero + 0.03);
  ok(air.length === SIZES.length && !airWorse.length, `⭐⭐ every air base's runway as much on its island as at rotation 0 (${air.length})`, airWorse.map((r) => [r.island, r.line, r.now, r.zero]));
  const zeros = held.map(() => 0);
  ok(zeros.filter(onRight).length === held.length && zeros.filter(onRight).length > 0.06 * held.length, "⭐ CONTROL: the same rows at 0.00 all count as on a right angle and fail the 6% — the count tells the two apart");
}

// ── 1b. a state of three strips: the runway keeps its own province ────────────────────────────────────────────────────────────────
console.log("\n=== 1b. a state of three strips 4 px tall: the air base takes no margin — its runway keeps its own strip ===");
{
  const W = 48, H = 26, SEA = 1;
  const STRIPS = { 2: [4, 7, 44, 11], 3: [4, 11, 44, 15], 4: [4, 15, 44, 19] };   // [x0, y0, x1, y1), rows top-down
  const provAt = (x, y) => { for (const [id, [x0, y0, x1, y1]] of Object.entries(STRIPS)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return SEA; };
  const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
  const mod = path.join(ROOT, "strips");
  write(mod, "descriptor.mod", 'name="strips"\nreplace_path="history/states"\nreplace_path="map"\n');
  write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  write(mod, "map/heightmap.bmp", bmp8(W, H, (x, y) => (provAt(x, y) === SEA ? 80 : 96 + ((x * 3 + y * 5) % 120))));
  write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`].concat(Object.keys(STRIPS).map((id) => `${id};${colour(+id).join(";")};land;false;plains;1`)).join("\n") + "\n");
  write(mod, "history/states/1-S.txt", "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 2 3 4 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n");
  const BT = write(mod, "map/buildings.txt", "99;radar_station;1.00;9.50;1.00;0.00;0\n");
  const roots = { modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
  const provs = [2, 3, 4];
  const tp = md.stateBuildingAnchor({ ...roots, provinces: provs, each: true }) || new Map();
  const now = md.landProvincesTouchingSea(roots) || new Set();
  md.ensureBuildingSlotsForState({ ...roots, stateId: 1, provinces: provs, townPoints: tp, coast: { provinces: new Set(provs.filter((p) => now.has(p))), ports: [], types: COAST_TYPES } });
  const line = fs.readFileSync(BT, "utf8").split(/\r?\n/).find((l) => l.split(";")[1] === "air_base" && +l.split(";")[0] === 1);
  ok(!!line, "(the strips' state is furnished, its air base among the rows)", line);
  if (line) {
    const c = line.split(";"), x = +c[2], z = +c[4], a = +c[5];
    const home = provAt(Math.floor(x), H - 1 - Math.floor(z));
    const offHome = (col, row) => provAt(col, row) !== home;
    const R = md.AIRFIELD_REACH;
    const zero = offShare(R, x, z, 0, H, offHome), turned = offShare(R, x, z, a, H, offHome);
    // 16 headings a whole turn apart leave one within 11.25° (0.196 rad) of the strip's line, and no nearer one is promised
    const best16 = Math.min(...Array.from({ length: 16 }, (_, j) => offShare(R, x, z, (j * Math.PI) / 8 + 0.19, H, offHome)));
    ok(zero === 0 && best16 > 0 && offShare(R, x, z, Math.PI / 2, H, offHome) > 0.05, "(the fixture: the runway at rotation 0 wholly on its strip; turned 0.19 rad off the strip's line, or any of 16 headings that far, it crosses into the next strip — the same state's land)", { zero, best16 });
    ok(turned <= zero + 0.002, `⭐⭐ the written heading (${c[5]}) keeps the runway on its own strip as rotation 0 does — the air base takes no margin`, { turned, zero });
  }
}

// ── 2. the base game ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const haveGame = fs.existsSync(path.join(GAME, "map", "buildings.txt")) && fs.existsSync(path.join(GAME, "map", "provinces.bmp"));
console.log("\n=== 2. the base game: every land type rarely on a right angle ===");
if (!haveGame) console.log("  SKIP: no Hearts of Iron IV install at " + GAME + " — sections 2 and 3 did not run");
else {
  const by = new Map();
  for (const l of fs.readFileSync(path.join(GAME, "map", "buildings.txt"), "latin1").split(/\r?\n/)) {
    const c = l.split(";");
    if (c.length < 7 || !LAND_TYPES.includes(c[1])) continue;
    if (!by.has(c[1])) by.set(c[1], []);
    by.get(c[1]).push(parseFloat(c[5]));
  }
  for (const t of LAND_TYPES) {
    const L = by.get(t) || [], k = L.filter(onRight).length;
    ok(L.length > 500 && k <= 0.04 * L.length, `${t}: the base game ${k} of ${L.length} on a right angle (${(100 * k / Math.max(1, L.length)).toFixed(1)}%)`);
  }
}

// ── 3. a generated world ──────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== 3. a generated world: every land type keeps headings of its own, evenly ===");
if (haveGame) {
  const mod = path.join(ROOT, "generated");
  fs.mkdirSync(path.join(mod, "map"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'version="1"\nname="right angles"\nsupported_version="1.19.*"\npath="mod/x"\nreplace_path="history/states"\n');
  fs.copyFileSync(path.join(GAME, "map", "provinces.bmp"), path.join(mod, "map", "provinces.bmp"));
  md.blankMapToSea({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
  const gen = md.generateLand({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], count: 520, provincesPerState: 3, seed: 1, ownerMode: "inherit" });
  const made = new Set(((gen && gen.newStates) || []).map((s) => s.id));
  ok(made.size >= 150, `(Generate land made ${made.size} states)`, gen && gen.error);
  const roots = { modRoot: mod, gameRoot: GAME, dependencyRoots: [] };
  const model = md.buildMapModel(roots);
  const prov = new Map(model.provinces.map((p) => [p.id, p]));
  const buf = fs.readFileSync(path.join(mod, "map", "provinces.bmp"));
  const off0 = buf.readUInt32LE(10), W = buf.readInt32LE(18), H = buf.readInt32LE(22), rs = Math.floor((24 * W + 31) / 32) * 4;
  const byColour = new Map(model.provinces.map((p) => [((p.r << 16) | (p.g << 8) | p.b) >>> 0, p.id]));
  const pidAt = (x, row) => { if (row < 0 || row >= H) return -1; x = ((x % W) + W) % W; const o = off0 + (H - 1 - row) * rs + x * 3; const id = byColour.get(((buf[o + 2] << 16) | (buf[o + 1] << 8) | buf[o]) >>> 0); return id == null ? -1 : id; };
  const by = new Map(), worse = [];
  for (const l of fs.readFileSync(path.join(mod, "map", "buildings.txt"), "latin1").split(/\r?\n/)) {
    const c = l.split(";");
    if (c.length < 7 || !made.has(+c[0]) || !LAND_TYPES.includes(c[1])) continue;
    if (!by.has(c[1])) by.set(c[1], []);
    const a = parseFloat(c[5]);
    by.get(c[1]).push(a);
    if (c[1] === "air_base") continue;
    const sid = +c[0], R = md.LAND_ROW_REACH[c[1]];
    const bad = (col, row) => { const p = pidAt(col, row), q = prov.get(p); return !(q && q.type === "land" && model.provinceToState[p] === sid); };
    const x = +c[2], z = +c[4], now = offShare(R, x, z, a, H, bad);
    if (now > BOUND + 0.02) { const zero = offShare(R, x, z, 0, H, bad); if (now > zero + BOUND + 0.02) worse.push([l, now.toFixed(3), zero.toFixed(3)]); }
  }
  for (const t of LAND_TYPES) {
    const L = by.get(t) || [], k = L.filter(onRight).length;
    ok(L.length >= made.size && k <= 0.08 * L.length, `⭐⭐ ${t}: ${k} of ${L.length} on a right angle (${(100 * k / Math.max(1, L.length)).toFixed(1)}%, 8% or fewer)`, { k, n: L.length });
  }
  for (const t of LAND_TYPES) {
    const L = by.get(t) || [];
    if (L.length < 1024) continue;
    const b = bins8(L);
    ok(even(L), `⭐⭐ ${t}: ${L.length} rows evenly over the turn — 8 bins ${b.lo.toFixed(2)}–${b.hi.toFixed(2)} of their mean (±25%)`, b);
  }
  ok(LAND_TYPES.filter((t) => (by.get(t) || []).length >= 1024).length >= 2, "(the world is big enough: two or more land types with 1,024 rows)");
  ok(!worse.length, `⭐⭐ every model but the air base within ${BOUND} of rotation 0 on its state's land`, worse.slice(0, 10));
  // CONTROL: the military factories' rows bunched into two headings fail the spread check
  {
    const L = (by.get("arms_factory") || []).map((a, i) => (i % 2 ? 0.3 : 1.9));
    ok(L.length >= 1024 && !even(L), "⭐ CONTROL: the same count of rows on two headings fails the spread check");
  }
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
