// ⛔ #a-harbour-faces-its-sea — EVERY COAST ROW NOVA WRITES IS TURNED TO ITS SEA.
//
// Nova wrote every port, dockyard and coastal fort it added at rotation 0.00. At 0 the game draws a coast model's water side (its
// long quay, mesh −z) to map SOUTH, so wherever the sea was not south the quay stood on dry land. Measured on the owner's flow
// (TEST 33a): 34% of ports and 31% of dockyards with the water side on water (the base game 84% / 75%), and 76 dock models with no
// water under them at all — every one with its sea due NORTH, because fixCoastalNoPort puts a port on its province's FIRST coast
// pixel in the raster, its northernmost. The base game turns 97% of its coast rows, all one way: rotation = the direction of the sea
// + π/2, counter-clockwise in (x east, z north).
//
//   1. coastFacing on synthetic coasts: the sea due N / S / E / W gives exactly 3.14 / 0.00 / 1.57 / −1.57, a diagonal coast its
//      bisector, a sea only across the east–west seam is found, no sea in reach is null, and a LAKE is not sea (a narrow sea channel
//      south, an open lake north: 0.00, where counting the lake would give 3.14 — the control shows the fixture tells them apart).
//   2a. fixCoastalNoPort on a fixture mod: three portless provinces whose only sea is north, east and west each get a port turned
//      to it — the water side within 45° of the sea round it (this test's own 6-px centroid) and 2 px along it on the sea — and a
//      modder's own port at 0.00 facing away is left byte for byte.
//   2b. ensureBuildingSlotsForState with Generate land's `coast`: its dockyard and coastal_bunker rows turned as in 2a, and every
//      other row it writes a land row, turned the way the base game turns its own and not to the sea
//      (#a-land-model-is-turned-as-the-base-game-turns-its-own; it was 0.00 until that writer turned them).
//   3. Over the installed base game (SKIPS without it): of the four conventions (offset ±π/2, sense ±1) the one coastFacing writes is
//      the one the game's own ports, dockyards and coastal forts agree with most, and at least 60% of the time within 45°.
//
// Binds no port. Run: node test-a-harbour-faces-its-sea.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-harbour-faces-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
process.env.HOI4_MODS_ROOT = ROOT;
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
// asked through this, so code without the helper FAILS its checks rather than stopping the test at the first call
const coastFacing = typeof md.coastFacing === "function" ? md.coastFacing : () => undefined;

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
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
const wrapA = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };
const r2 = (a) => Math.round(a * 100) / 100;
const deg = (a) => +(Math.abs(a) * 180 / Math.PI).toFixed(1);
/** the rotation the convention gives a sea in direction `phi` (radians, x east, z north) — the rule this test pins */
const rotFor = (phi) => r2(wrapA(phi + Math.PI / 2));

// ── 1. the helper on synthetic coasts ────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== 1. coastFacing on synthetic coasts ===");
{
  const W = 32, H = 32, SEA = 1, LAND = 2, LAKE = 3, T = { [SEA]: "sea", [LAND]: "land", [LAKE]: "lake" };
  const typeOf = (id) => T[id];
  const world = (f) => ({ W, H, pidAt: (x, row) => f(x, H - 1 - row) });   // f(x, z index), x NOT wrapped: the helper must do it
  const x = 16, z = 16;                                                     // a row at a pixel corner, as Nova writes them
  const cases = [
    ["north", world((px, zi) => (zi > z ? SEA : LAND)), x, Math.PI / 2],
    ["south", world((px, zi) => (zi < z ? SEA : LAND)), x, -Math.PI / 2],
    ["east", world((px) => (px > x ? SEA : LAND)), x, 0],
    ["west", world((px) => (px < x ? SEA : LAND)), x, Math.PI],
  ];
  for (const [name, ex, px, phi] of cases) {
    const got = coastFacing(ex, typeOf, px, z), want = rotFor(phi);
    ok(got === want, `the sea due ${name}: ${want.toFixed(2)}`, { got, want });
  }
  // a coast along x + z = const: its sea's bisector is 45° (north-east)
  const diag = coastFacing(world((px, zi) => (px + zi > x + z + 1 ? SEA : LAND)), typeOf, x, z), wantDiag = rotFor(Math.PI / 4);
  ok(diag != null && deg(wrapA(diag - wantDiag)) <= 10, `a north-east coast: within 10° of ${wantDiag.toFixed(2)}`, { diag, wantDiag });
  // the only sea is across the seam: the point at x 0, the sea at the map's east edge (its west, as the map wraps)
  const seam = coastFacing(world((px) => (px >= W - 3 ? SEA : LAND)), typeOf, 0, z);
  ok(seam === rotFor(Math.PI), "a sea only across the east–west seam is found: " + rotFor(Math.PI).toFixed(2), seam);
  ok(coastFacing(world(() => LAND), typeOf, x, z) === null, "no sea in reach: null (the writer keeps 0.00)", coastFacing(world(() => LAND), typeOf, x, z));
  // ⛔ a lake is not the sea: a 1-px sea channel south of the row, an open lake north
  const lakeWorld = world((px, zi) => (zi > z ? LAKE : zi === z - 1 ? SEA : LAND));
  const lake = coastFacing(lakeWorld, typeOf, x, z);
  const lakeAsSea = coastFacing(lakeWorld, (id) => (id === LAKE ? "sea" : T[id]), x, z);
  ok(lakeAsSea === rotFor(Math.PI / 2), "CONTROL: were the lake sea, it would outweigh the channel and turn the row north (" + rotFor(Math.PI / 2).toFixed(2) + ")", lakeAsSea);
  ok(lake === rotFor(-Math.PI / 2), "⭐ a lake north and a narrow sea south: the row faces the sea (" + rotFor(-Math.PI / 2).toFixed(2) + "), not the lake", lake);
}

// ── the fixture world: rectangles [x0, y0, x1, y1) on land province 9, rows top-down ───────────────────────────────────────────────
const W = 48, H = 32, NSEA = 1, CHANNEL = 6, FILL = 9;
const RECT = {
  [NSEA]: [0, 0, 48, 4],        // a sea along the top, the full width (it meets itself across the seam)
  [CHANNEL]: [22, 8, 26, 32],   // a sea channel running south from row 8
  2: [4, 4, 14, 8],             // N: land whose only sea is north
  3: [14, 14, 22, 22],          // E: land whose only sea is east (the channel)
  4: [26, 14, 34, 22],          // Wst: land whose only sea is west (the channel)
  5: [36, 4, 44, 8],            // M: the modder's, sea north, its own port at 0.00
  8: [40, 22, 44, 26],          // inland: no sea anywhere near
};
const SEAS = new Set([NSEA, CHANNEL]);
const provAt = (x, y) => { for (const [id, [x0, y0, x1, y1]] of Object.entries(RECT)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return FILL; };
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
/** this test's own reading of the sea round a point (x, z as buildings.txt writes them), x wrapping: the direction to the centroid
 *  of the sea pixels within R px, or null */
const seaDir = (x, z, R = 6) => {
  let sx = 0, sz = 0;
  const c0 = Math.floor(x), z0 = Math.floor(z);
  for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) {
    const row = H - 1 - (z0 + dz), ux = c0 + dx + 0.5 - x, uz = z0 + dz + 0.5 - z;
    if (row < 0 || row >= H || ux * ux + uz * uz > R * R || !SEAS.has(provAt(((c0 + dx) % W + W) % W, row))) continue;
    sx += ux; sz += uz;
  }
  return sx || sz ? Math.atan2(sz, sx) : null;
};
const seaAt = (x, z) => { const row = H - 1 - Math.floor(z); return row >= 0 && row < H && SEAS.has(provAt(((Math.floor(x) % W) + W) % W, row)); };
/** a row faces its sea: its water side (rot − π/2) within 45° of the sea round it, and the point 2 px along it on the sea */
const facesSea = (w) => { const d = seaDir(w.x, w.z), water = w.rot - Math.PI / 2; return d != null && deg(wrapA(water - d)) <= 45 && seaAt(w.x + 2 * Math.cos(water), w.z + 2 * Math.sin(water)); };
function writeMod(dir, states, rows) {
  write(dir, "descriptor.mod", 'name="harbour-faces"\nreplace_path="history/states"\nreplace_path="map"\n');
  write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  write(dir, "map/heightmap.bmp", bmp8(W, H, (x, y) => (SEAS.has(provAt(x, y)) ? 80 : 100)));
  const ids = [...new Set([...Object.keys(RECT).map(Number), FILL])].sort((a, b) => a - b);
  write(dir, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(ids.map((id) => `${id};${colour(id).join(";")};${SEAS.has(id) ? "sea" : "land"};false;${SEAS.has(id) ? "ocean" : "plains"};${SEAS.has(id) ? 0 : 1}`)).join("\n") + "\n");
  for (const [s, provs] of Object.entries(states)) {
    write(dir, `history/states/${s}-S.txt`, `state = {\n\tid = ${s}\n\tname = "STATE_${s}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`);
  }
  write(dir, "map/buildings.txt", rows.join("\n") + "\n");
}
const rowsIn = (dir) => fs.readFileSync(path.join(dir, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(";")).filter((c) => c.length >= 7)
  .map((c) => { const x = +c[2], z = +c[4]; return { sid: +c[0], type: c[1], x, z, rot: +c[5], rotText: c[5], province: provAt(Math.floor(x), H - 1 - Math.floor(z)), line: c.join(";") }; });
const noGame = path.join(ROOT, "no-game");

console.log("\n-- the fixture --");
{
  const coastOf = (pid) => { const s = new Set(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (provAt(x, y) !== pid) continue; if (x + 1 < W && SEAS.has(provAt(x + 1, y))) s.add("E"); if (x > 0 && SEAS.has(provAt(x - 1, y))) s.add("W"); if (y > 0 && SEAS.has(provAt(x, y - 1))) s.add("N"); if (y + 1 < H && SEAS.has(provAt(x, y + 1))) s.add("S"); } return [...s].join(""); };
  ok(coastOf(2) === "N" && coastOf(3) === "E" && coastOf(4) === "W" && coastOf(5) === "N" && coastOf(8) === "",
    "(the fixture: province 2's only sea is north, 3's east, 4's west, 5's north, and 8 has none)", { 2: coastOf(2), 3: coastOf(3), 4: coastOf(4), 5: coastOf(5), 8: coastOf(8) });
}

// ── 2a. fixCoastalNoPort ──────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== 2a. the ports Auto-fix adds face their sea ===");
{
  const mod = path.join(ROOT, "ports");
  // the modder's port on province 5: its own land, its sea north, at 0.00 — its water side over the land
  const MODDERS = `4;naval_base_spawn;${RECT[5][0]}.00;9.50;${H - 1 - RECT[5][1]}.00;0.00;${NSEA}`;
  writeMod(mod, { 1: [2], 2: [3], 3: [4], 4: [5] }, ["4;arms_factory;40.00;9.50;26.00;0.00;0", MODDERS]);
  const roots = { modRoot: mod, gameRoot: noGame, dependencyRoots: [] };
  const dry = md.fixCoastalNoPort({ ...roots, dryRun: true });
  ok(dry && JSON.stringify((dry.targets || []).slice().sort((a, b) => a - b)) === "[2,3,4]", "(the rule names provinces 2, 3 and 4 and not the modder's 5)", dry);
  const r = md.fixCoastalNoPort(roots);
  const rows = rowsIn(mod), added = rows.filter((w) => w.type === "naval_base_spawn" && w.line !== MODDERS);
  ok(r && r.added === 3 && added.length === 3 && [2, 3, 4].every((p) => added.filter((w) => w.province === p).length === 1), "Auto-fix adds one port on each of the three", { r, added: added.map((w) => w.line) });
  for (const w of added) {
    const asWritten = facesSea(w), atZero = facesSea({ ...w, rot: 0 });
    ok(asWritten, `⭐⭐ the port on province ${w.province} faces its sea (rotation ${w.rotText})`, { line: w.line, sea: seaDir(w.x, w.z) });
    if (w.province === 2) ok(!atZero, "CONTROL: at 0.00 the north coast's port would face away from its sea — the check tells the two apart", w.line);
  }
  ok(rows.some((w) => w.line === MODDERS) && rows.filter((w) => w.province === 5 && w.type === "naval_base_spawn").length === 1, "the modder's own port at 0.00, facing away, is left byte for byte", rows.filter((w) => w.province === 5).map((w) => w.line));
  ok(!facesSea(rows.find((w) => w.line === MODDERS) || { x: 0, z: 0, rot: 0 }), "(…and it does face away: the check is not what keeps it)");
}

// ── 2b. ensureBuildingSlotsForState with the coast ───────────────────────────────────────────────────────────────────────────────
console.log("\n=== 2b. the dockyard and coastal forts Generate land writes face their sea ===");
{
  const mod = path.join(ROOT, "slots");
  const STATE = [2, 4, 8];
  writeMod(mod, { 1: STATE }, ["99;radar_station;1.00;9.50;1.00;0.00;0"]);
  const roots = { modRoot: mod, gameRoot: noGame, dependencyRoots: [] };
  const now = md.landProvincesTouchingSea(roots) || new Set();
  const COAST_TYPES = new Set([...md.COASTAL_STATE_BUILDING_SLOTS.map(([t]) => t), ...md.PER_COASTAL_PROVINCE_BUILDING_SLOTS]);
  const coast = { provinces: new Set(STATE.filter((p) => now.has(p))), ports: [], types: COAST_TYPES };
  ok(coast.provinces.size === 2 && coast.provinces.has(2) && coast.provinces.has(4), "(the state's coast, as Generate land reads it: provinces 2 and 4)", [...coast.provinces]);
  const g = md.ensureBuildingSlotsForState({ ...roots, stateId: 1, provinces: STATE, townPoints: md.stateBuildingAnchor({ ...roots, provinces: STATE, each: true }), coast });
  const rows = rowsIn(mod).filter((w) => w.sid === 1), coastRows = rows.filter((w) => COAST_TYPES.has(w.type)), other = rows.filter((w) => !COAST_TYPES.has(w.type));
  const bunkers = coastRows.filter((w) => w.type === "coastal_bunker"), yards = coastRows.filter((w) => w.type === "dockyard");
  ok(!!g && g.changed && bunkers.length === coast.provinces.size && [...coast.provinces].every((p) => bunkers.some((w) => w.province === p)) && yards.length === 1,
    "the call writes a coastal_bunker on each coastal province and one dockyard", { g, coast: coastRows.map((w) => w.line) });
  for (const w of coastRows) {
    ok(facesSea(w), `⭐⭐ the ${w.type} on province ${w.province} faces its sea (rotation ${w.rotText})`, { line: w.line, sea: seaDir(w.x, w.z) });
  }
  ok(coastRows.some((w) => w.province === 2 && !facesSea({ ...w, rot: 0 })), "CONTROL: at 0.00 a north coast's row would face away — the check tells the two apart", coastRows.map((w) => w.line));
  // ⛔ #a-land-model-is-turned-as-the-base-game-turns-its-own — the land rows are turned by their own writer, each its own heading (at 0.00
  // until it did); none of them is the coast's: test-a-land-model-is-turned-as-the-base-game-turns-its-own.js holds where they point
  const legal = (w) => /^\d+\.\d\d$/.test(w.rotText) && w.rot >= 0 && w.rot <= 6.28;
  ok(other.length > 0 && other.every((w) => !COAST_TYPES.has(w.type) && legal(w)) && other.filter((w) => w.rotText !== "0.00").length >= 0.9 * other.length,
    `⭐ every other row the call writes (${other.length}) is a land row, turned as the base game turns its own (2 decimals, in [0, 6.28], 90% or more not 0.00)`, other.filter((w) => !legal(w) || w.rotText === "0.00").map((w) => w.line));
}

// ── 3. the convention, from the installed base game ──────────────────────────────────────────────────────────────────────────────
console.log("\n=== 3. the convention is the base game's ===");
const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
if (!fs.existsSync(path.join(GAME, "map", "provinces.bmp")) || !fs.existsSync(path.join(GAME, "map", "buildings.txt"))) {
  console.log("  SKIP: no Hearts of Iron IV install at " + GAME + " — section 3 did not run");
} else {
  const buf = fs.readFileSync(path.join(GAME, "map", "provinces.bmp"));
  const off = buf.readUInt32LE(10), GW = buf.readInt32LE(18), GH = buf.readInt32LE(22), rs = Math.floor((24 * GW + 31) / 32) * 4;
  const byColour = new Map(), type = new Map();
  for (const l of fs.readFileSync(path.join(GAME, "map", "definition.csv"), "latin1").split(/\r?\n/)) {
    const c = l.split(";");
    if (c.length < 5 || !/^\d+$/.test(c[0]) || +c[0] === 0) continue;
    byColour.set(((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0, +c[0]);
    type.set(+c[0], c[4].trim().toLowerCase());
  }
  const pidAt = (x, row) => { const o = off + (GH - 1 - row) * rs + x * 3; const id = byColour.get(((buf[o + 2] << 16) | (buf[o + 1] << 8) | buf[o]) >>> 0); return id == null ? -1 : id; };
  const ex = { W: GW, H: GH, pidAt }, typeOf = (id) => type.get(id);
  // this test's own centroid of the sea within 3 px of the row, x wrapping — the direction the four conventions are built from
  const ownDir = (x, z, R = 3) => {
    let sx = 0, sz = 0; const c0 = Math.floor(x), z0 = Math.floor(z);
    for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) {
      const row = GH - 1 - (z0 + dz), ux = c0 + dx + 0.5 - x, uz = z0 + dz + 0.5 - z;
      if (row < 0 || row >= GH || ux * ux + uz * uz > R * R || type.get(pidAt(((c0 + dx) % GW + GW) % GW, row)) !== "sea") continue;
      sx += ux; sz += uz;
    }
    return Math.abs(sx) > 1e-9 || Math.abs(sz) > 1e-9 ? Math.atan2(sz, sx) : null;
  };
  const rows = fs.readFileSync(path.join(GAME, "map", "buildings.txt"), "latin1").split(/\r?\n/).map((l) => l.trim().split(";")).filter((c) => c.length >= 7);
  const CONVENTIONS = [[1, Math.PI / 2], [1, -Math.PI / 2], [-1, Math.PI / 2], [-1, -Math.PI / 2]];
  for (const t of ["naval_base_spawn", "dockyard", "coastal_bunker"]) {
    let n = 0, mine = 0, same = 0;
    const agree = CONVENTIONS.map(() => 0);
    for (const c of rows) {
      if (c[1] !== t) continue;
      const x = +c[2], z = +c[4], own = +c[5];
      const got = coastFacing(ex, typeOf, x, z), phi = ownDir(x, z);
      if (got == null || phi == null) continue;
      n++;
      if (deg(wrapA(got - own)) <= 45) mine++;
      if (got === r2(wrapA(phi + Math.PI / 2))) same++;
      CONVENTIONS.forEach(([s, o], i) => { if (deg(wrapA(s * phi + o - own)) <= 45) agree[i]++; });
    }
    const pct = (k) => +(100 * k / Math.max(1, n)).toFixed(1);
    const best = agree.indexOf(Math.max(...agree));
    console.log(`   ${t}: ${n} rows · coastFacing agrees with the game's own rotation within 45° on ${pct(mine)}% · the four conventions ${agree.map(pct).join(" / ")}%`);
    ok(n > 100 && same === n, `(${t}: this test's own centroid gives coastFacing's answer on every one of ${n} rows)`, { n, same });
    ok(best === 0 && Math.max(...agree.slice(1)) < agree[0], `CONTROL ${t}: the convention the game's rows agree with most is sea + π/2, counter-clockwise — the measure tells the four apart`, agree.map(pct));
    ok(pct(mine) >= 60, `⭐ ${t}: coastFacing turns a row as the base game turns its own, within 45°, ${pct(mine)}% of the time (≥ 60%)`, { mine: pct(mine), conventions: agree.map(pct) });
  }
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
