// ⛔ #a-coast-has-the-naval-rows-its-buildings-stand-on — GENERATE LAND GIVES EVERY COASTAL PROVINCE THE ROWS ITS NAVAL BUILDINGS STAND ON.
//
// The base game ships one naval_supply_hub row and one naval_headquarters row on every one of its 2,362 coastal provinces; a world
// Generate land made had none (TEST 33a: 0 of either over 734 coastal provinces), so a supply hub or a naval HQ built in play had no
// position to stand on. Which rows a world needs is its own common/buildings' answer, never a typed list: a building's models stand
// on its `spawn_point` rows, else on rows of its own name — so Millennium Dawn's naval_headquarters (spawn_point = naval_base_spawn)
// needs no row of its own, and Hearts of Minecraft, whose own 00_buildings.txt replaces the base game's and defines neither, needs
// neither.
//
//   1. coastRowTypesDrawn over three fixture common/buildings — vanilla-shaped (hub and HQ on rows of their own), MD-shaped (the HQ
//      draws on the port rows) and HoM-shaped (its own 00_buildings.txt, at the base file's own path, with neither): the coast row
//      types Nova writes are exactly its slot lists' types this test's own reader finds a building drawing on — any building, so a
//      fourth file whose dockyard is not coast-only still has its dockyard row.
//   2. ensureBuildingSlotsForState with that `coast` on a world with a long coast and a 2-pixel one: one hub and one HQ on each
//      coastal province's own coast, at least BUILDING_RING_NEAR px from the fort, the dockyard and each other where the coast allows
//      and where it does not on its pixel furthest from the rows standing there, ties to the nearest the town point, turned to the sea
//      as coastFacing says; a province already holding a hub and a fort gets neither again, only its HQ, kept off both.
//   3. the MD-shaped and HoM-shaped worlds get no row their common/buildings does not draw on.
//   4. Generate land itself, over a vanilla-shaped and an MD-shaped base game and under a mod shipping a HoM-shaped 00_buildings.txt:
//      the hub and HQ rows each world draws on, one on every coastal province, and none of a type it does not.
//   5. the runway: on an island so small its air base stands by the coast the hub would take, the hub and HQ keep off the runway and
//      the runway is not moved for them — every other row stands where a twin whose world draws no hub or HQ puts it. (Kept off them
//      instead, the runway was pushed over its province's border in 2 more states of the owner's flow, TEST 33a's 37 → 39.)
//      5b. the same island under a dependency whose airfield reaches further east, as Millennium Dawn's does: the runway the hub and
//      HQ keep off is the one the layers DRAW (airfieldReach), not the base game's.
//   6. a coast too short to space its rows, a modder's runway over its fort's end: the hub and HQ stand on its nearest pixel off the
//      runway, not on the fort's pixel under it.
//   7. a coast too short to space its rows and no runway near it: the hub and HQ stand on the pixel furthest from the rows standing
//      there, ties to the nearest the town point — not on the fort's pixel, which is the one nearest the town point (coastPixelOf's
//      `spread`, pure, and through the writer).
// Every expected set and count is read off the fixture by this test's own reader. Binds no port.
// Run: node test-a-generated-coast-has-the-naval-rows-its-buildings-stand-on.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coast-naval-rows-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
process.env.HOI4_MODS_ROOT = ROOT;
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

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
/** a .mesh as the game's carry their aabb: the float triples "min" and "max" ('!', name length, name, 'f', int32 count, values) */
function meshFile(min, max) {
  const prop = (name, v) => { const b = Buffer.alloc(2 + name.length + 1 + 4 + 4 * v.length); b[0] = 0x21; b[1] = name.length; b.write(name + "f", 2, "latin1"); b.writeInt32LE(v.length, 3 + name.length); v.forEach((f, k) => b.writeFloatLE(f, 7 + name.length + 4 * k)); return b; };
  return Buffer.concat([Buffer.from("@@b@", "latin1"), Buffer.from("[aabb", "latin1"), prop("min", min), prop("max", max)]);
}
const sorted = (a) => [...a].sort().join(",");
const NEAR = md.BUILDING_RING_NEAR;
// asked through these, so code without them FAILS its checks rather than stopping the test at the first call
const coastRowTypesDrawn = typeof md.coastRowTypesDrawn === "function" ? md.coastRowTypesDrawn : () => new Set();

// ── the three common/buildings ───────────────────────────────────────────────────────────────────────────────────────────────────
const building = (name, { coast = false, spawn = "", shared = false } = {}) =>
  `\t${name} = {\n\t\tbase_cost = 1000\n\t\tshow_on_map = 1\n${coast ? "\t\tonly_costal = yes\n" : ""}${spawn ? `\t\tspawn_point = ${spawn}\n` : ""}\t\tlevel_cap = {\n${shared ? "\t\t\tshares_slots = yes\n\t\t\tstate_max = 20\n" : "\t\t\tprovince_max = 1\n"}\t\t}\n\t}\n`;
const file = (...blocks) => `buildings = {\n${blocks.join("")}}\n`;
const PORT = building("naval_base", { coast: true, spawn: "naval_base_spawn" }), YARD = building("dockyard", { coast: true, shared: true });
const FORT = building("coastal_bunker", { coast: true }), FACTORY = building("arms_factory", { shared: true });
const BUILDINGS = {
  vanilla: file(PORT, YARD, FORT, building("naval_supply_hub", { coast: true }), building("naval_headquarters", { coast: true }), FACTORY),
  md: file(PORT, YARD, FORT, building("naval_supply_hub", { coast: true }), building("naval_headquarters", { coast: true, spawn: "naval_base_spawn" }), FACTORY),
  hom: file(PORT, YARD, FORT, FACTORY),
  // a dockyard a mod has taken only_costal off: still drawn on its own row, so its row is still written (section 1 only)
  inlandYard: file(PORT, building("dockyard", { shared: true }), FORT, FACTORY),
};
const BASE_REL = "common/buildings/00_buildings.txt";   // ⚠️ the HoM-shaped and MD-shaped files replace the base's at its own path
/** this test's own reader: the map rows the buildings of one buildings file stand on (spawn_point, else their own name) */
const drawnBy = (txt) => {
  const out = new Set();
  for (const m of txt.matchAll(/\t([a-z_]+) = \{\n([\s\S]*?)\n\t\}\n/g)) out.add((/spawn_point = ([a-z_]+)/.exec(m[2]) || [])[1] || m[1]);
  return out;
};
const NOVA_TYPES = [...md.COASTAL_STATE_BUILDING_SLOTS.map(([t]) => t), ...md.PER_COASTAL_PROVINCE_BUILDING_SLOTS];
const NAVAL = ["naval_supply_hub", "naval_headquarters"];

// ── the world of sections 1-3: rectangles [x0, y0, x1, y1) on land province 9, rows top-down ────────────────────────────────────
const W = 48, H = 32, SEA = 1, INLET = 7, FILL = 9;
const RECT = {
  [SEA]: [0, 0, 48, 4],        // a sea along the top
  [INLET]: [28, 4, 30, 10],    // a 2-px inlet down to province 3
  2: [4, 4, 20, 8],            // L: a 16-px coast on the sea
  3: [26, 10, 34, 18],         // S: its only sea the inlet's two pixels
  4: [36, 4, 46, 8],           // T: a 10-px coast, the other state's, already holding a hub and a fort
  5: [10, 20, 14, 24],         // inland
};
const SEAS = new Set([SEA, INLET]);
const provAt = (x, y) => { for (const [id, [x0, y0, x1, y1]] of Object.entries(RECT)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return FILL; };
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const STATES = { 1: [2, 3, 5], 2: [4] };
// …on the middle of province 4's coast, where its town point's nearest coast pixel is (the control in section 2 shows it)
const HELD = [`2;naval_supply_hub;40.00;9.50;${H - 1 - 4}.00;0.00;0`, `2;coastal_bunker;41.00;9.50;${H - 1 - 4}.00;0.00;0`];
/** this test's own reading of a province's coast: its pixels with a 4-neighbour on the sea, x wrapping */
const coastPixels = (pid) => {
  const out = [];
  for (let row = 0; row < H; row++) for (let px = 0; px < W; px++) {
    if (provAt(px, row) !== pid) continue;
    if ([[(px + 1) % W, row], [(px - 1 + W) % W, row], [px, row - 1], [px, row + 1]].some(([x, y]) => y >= 0 && y < H && SEAS.has(provAt(x, y)))) out.push({ px, row });
  }
  return out;
};
const cheb = (a, b) => Math.max(Math.abs(a.px - b.px), Math.abs(a.row - b.row));
/** this test's own reading of where a row stands on a coast too short to space it: of `pixels`, the one furthest from the nearest of
 *  `standing` ([{ px, row }], the rows on that coast before it), ties to the nearest `T`, then to the first in the raster */
const furthest = (pixels, standing, T) => {
  let best = null;
  for (const q of [...pixels].sort((a, b) => a.row - b.row || a.px - b.px)) {
    const g = Math.min(...standing.map((s) => cheb(q, s))), d = (q.px - T.px) ** 2 + (q.row - T.row) ** 2;
    if (!best || g > best.g || (g === best.g && d < best.d)) best = { px: q.px, row: q.row, g, d };
  }
  return best;
};
const ex = { W, H, pidAt: (x, row) => provAt(x, row) }, typeOf = (id) => (SEAS.has(id) ? "sea" : "land");
function writeMod(dir, buildingsFile) {
  write(dir, "descriptor.mod", 'name="coast-naval-rows"\nreplace_path="history/states"\nreplace_path="map"\n');
  if (buildingsFile) write(dir, BASE_REL, buildingsFile);
  write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  write(dir, "map/heightmap.bmp", bmp8(W, H, (x, y) => (SEAS.has(provAt(x, y)) ? 80 : 100)));
  const ids = [...new Set([...Object.keys(RECT).map(Number), FILL])].sort((a, b) => a - b);
  write(dir, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(ids.map((id) => `${id};${colour(id).join(";")};${SEAS.has(id) ? "sea" : "land"};false;${SEAS.has(id) ? "ocean" : "plains"};${SEAS.has(id) ? 0 : 1}`)).join("\n") + "\n");
  for (const [s, provs] of Object.entries(STATES)) write(dir, `history/states/${s}-S.txt`, `state = {\n\tid = ${s}\n\tname = "STATE_${s}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`);
  write(dir, "map/buildings.txt", ["99;radar_station;1.00;9.50;1.00;0.00;0", ...HELD].join("\n") + "\n");
}
const rowsIn = (dir) => fs.readFileSync(path.join(dir, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(";")).filter((c) => c.length >= 7)
  .map((c) => { const x = +c[2], z = +c[4], px = Math.floor(x), row = H - 1 - Math.floor(z); return { sid: +c[0], type: c[1], x, z, px, row, rot: c[5], anchor: c[6], province: provAt(px, row), line: c.join(";") }; });

const game = path.join(ROOT, "game");
write(game, BASE_REL, BUILDINGS.vanilla);
const mods = { vanilla: path.join(ROOT, "vanilla"), md: path.join(ROOT, "md"), hom: path.join(ROOT, "hom"), inlandYard: path.join(ROOT, "inland-yard") };
writeMod(mods.vanilla, null); writeMod(mods.md, BUILDINGS.md); writeMod(mods.hom, BUILDINGS.hom); writeMod(mods.inlandYard, BUILDINGS.inlandYard);
const rootsOf = (k) => ({ modRoot: mods[k], gameRoot: game, dependencyRoots: [] });
const typesOf = (k) => coastRowTypesDrawn(md.stateBuildingRules(rootsOf(k)));

console.log("\n=== 1. the coast rows a world's common/buildings draws on ===");
{
  ok(NAVAL.every((t) => md.PER_COASTAL_PROVINCE_BUILDING_SLOTS.includes(t)),
    "Nova's per-coastal-province rows include the hub's and the HQ's (one on every coastal province in the base game — the industry test re-derives each entry)", md.PER_COASTAL_PROVINCE_BUILDING_SLOTS);
  for (const k of Object.keys(mods)) {
    const want = new Set(NOVA_TYPES.filter((t) => drawnBy(BUILDINGS[k]).has(t))), got = typesOf(k);
    ok(sorted(got) === sorted(want), `⭐ ${k}-shaped: Nova writes the coast rows ${sorted(want)}`, { got: sorted(got), want: sorted(want) });
  }
  ok(drawnBy(BUILDINGS.vanilla).has("naval_headquarters") && !drawnBy(BUILDINGS.md).has("naval_headquarters") && !drawnBy(BUILDINGS.hom).has("naval_supply_hub") && drawnBy(BUILDINGS.md).has("naval_supply_hub"),
    "CONTROL: the three fixtures tell the shapes apart — the HQ's row in vanilla's only, the hub's in all but HoM's", { v: sorted(drawnBy(BUILDINGS.vanilla)), md: sorted(drawnBy(BUILDINGS.md)), hom: sorted(drawnBy(BUILDINGS.hom)) });
  ok(!/\tdockyard = \{[^}]*only_costal/.test(BUILDINGS.inlandYard) && (md.stateBuildingRules(rootsOf("inlandYard")).get("dockyard") || {}).coastOnly === false,
    "CONTROL: the inland-yard fixture's dockyard is not coast-only — what tells 'any building draws on it' from 'a coast-only one does'", md.stateBuildingRules(rootsOf("inlandYard")).get("dockyard"));
}

/** what Generate land hands ensureBuildingSlotsForState: the state's town points and its coast (provinces touching sea, no ports,
 *  the types its world's common/buildings draws on) */
const generate = (k, sid) => {
  const roots = rootsOf(k), now = md.landProvincesTouchingSea(roots) || new Set();
  const townPoints = md.stateBuildingAnchor({ ...roots, provinces: STATES[sid], each: true }) || new Map();
  const coast = { provinces: new Set(STATES[sid].filter((p) => now.has(p))), ports: [], types: typesOf(k) };
  return { r: md.ensureBuildingSlotsForState({ ...roots, stateId: sid, provinces: STATES[sid], townPoints, coast }), townPoints, coast };
};

console.log("\n=== 2. the hub and HQ rows, on a long coast and a short one ===");
{
  const coastRows = new Set(NOVA_TYPES);
  const { r, townPoints, coast } = generate("vanilla", 1);
  const rows = rowsIn(mods.vanilla).filter((w) => w.sid === 1);
  ok(!!r && r.changed && coast.provinces.size === 2 && coast.provinces.has(2) && coast.provinces.has(3), "(the state's coast is provinces 2 and 3, and the call writes)", { r, coast: [...coast.provinces] });
  for (const t of NAVAL) {
    const of = rows.filter((w) => w.type === t);
    ok(of.length === coast.provinces.size && [...coast.provinces].every((p) => of.filter((w) => w.province === p).length === 1),
      `⭐⭐ one ${t} row on each coastal province, none inland`, of.map((w) => [w.province, w.px, w.row]));
    ok(of.length > 0 && of.every((w) => coastPixels(w.province).some((q) => q.px === w.px && q.row === w.row) && w.anchor === "0"), `…each on its own province's coast, column 7 = 0 as the base game's`, of.map((w) => w.line));
    ok(of.length > 0 && of.every((w) => w.rot === (md.coastFacing(ex, typeOf, w.x, w.z) || 0).toFixed(2)) && of.some((w) => w.rot !== "0.00"), `…each turned to its sea as coastFacing says`, of.map((w) => w.line));
  }
  // the long coast: every coast row of province 2 at least BUILDING_RING_NEAR px from every other
  const L = rows.filter((w) => w.province === 2 && coastRows.has(w.type));
  ok(NEAR > 0 && coastPixels(2).length >= 3 * NEAR + 1 && L.filter((w) => w.type === "coastal_bunker").length === 1,
    "(the long coast has room for four rows BUILDING_RING_NEAR px apart in a line, and its fort)", { NEAR, coast: coastPixels(2).length, L: L.map((w) => w.type) });
  const close = []; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (!(cheb(L[i], L[j]) >= NEAR)) close.push([L[i].type, L[j].type]);
  ok(L.length >= 3 && close.length === 0, `⭐ on the long coast the fort, the hub and the HQ${L.some((w) => w.type === "dockyard") ? " and the dockyard" : ""} stand at least ${NEAR} px apart`, { close, L: L.map((w) => [w.type, w.px, w.row]) });
  // the short coast: two pixels a pixel apart, too few to space anything. ⚠️ MOVED with coastPixelOf's `spread`: every row stood on the
  // one nearest the town point — the fort's — and now each stands on the pixel furthest from the rows before it: the hub on the other,
  // the HQ (no pixel free of a row left) on the nearest the town point
  const t3 = townPoints.get(3), T3 = t3 ? { px: Math.floor(t3.x), row: H - 1 - Math.floor(t3.z) } : null;
  const at3 = (t) => rows.filter((w) => w.province === 3 && w.type === t);
  const before3 = at3("coastal_bunker").concat(at3("dockyard")), near = T3 ? furthest(coastPixels(3), [], T3) : null;
  const wantHub = T3 ? furthest(coastPixels(3), before3, T3) : null, wantHQ = wantHub ? furthest(coastPixels(3), before3.concat([wantHub]), T3) : null;
  ok(coastPixels(3).length === 2 && !!near && at3("coastal_bunker").length === 1 && at3("coastal_bunker")[0].px === near.px && at3("coastal_bunker")[0].row === near.row,
    "(the short coast is two pixels, too few to space anything, and its fort stands on the one nearest the town point)", { coast: coastPixels(3), near });
  const hub3 = at3("naval_supply_hub"), hq3 = at3("naval_headquarters"), on = (l, p) => l.length === 1 && !!p && l[0].px === p.px && l[0].row === p.row;
  ok(on(hub3, wantHub) && on(hq3, wantHQ) && !on(hub3, near), "⭐ on the short coast the hub stands on its other pixel, off the fort, and the HQ — none free of a row left — on the one nearest the town point",
    { hub: hub3.map((w) => [w.px, w.row]), hq: hq3.map((w) => [w.px, w.row]), wantHub, wantHQ });

  // a province already holding a hub and a fort: its HQ only, kept off both
  const g2 = generate("vanilla", 2);
  const rows2 = rowsIn(mods.vanilla).filter((w) => w.sid === 2), held = HELD.map((l) => rows2.find((w) => w.line === l));
  const hubs = rows2.filter((w) => w.type === "naval_supply_hub"), forts = rows2.filter((w) => w.type === "coastal_bunker"), hqs = rows2.filter((w) => w.type === "naval_headquarters");
  ok(held.every(Boolean) && hubs.length === 1 && forts.length === 1, "⭐ a province already holding a hub and a fort is given neither again", { g: g2.r, rows: rows2.map((w) => w.line) });
  ok(hqs.length === 1 && hqs[0].province === 4 && held.every((h) => h && cheb(h, hqs[0]) >= NEAR), "…its HQ, kept BUILDING_RING_NEAR px off the rows it holds", hqs.map((w) => w.line));
  // CONTROL: the province's coast pixel nearest its town point is within NEAR of a held row, so the HQ had to be moved off it — the
  // spacing check above is not met by where it would stand anyway
  const t4 = g2.townPoints.get(4);
  const near4 = t4 ? coastPixels(4).reduce((b, q) => { const d = (q.px - Math.floor(t4.x)) ** 2 + (q.row - (H - 1 - Math.floor(t4.z))) ** 2; return !b || d < b.d ? { ...q, d } : b; }, null) : null;
  ok(!!near4 && held.every(Boolean) && held.some((h) => cheb(h, near4) < NEAR),
    "CONTROL: the coast pixel nearest province 4's town point is within BUILDING_RING_NEAR px of a row it holds", { near4, held: held.map((h) => h && [h.px, h.row]) });
}

console.log("\n=== 3. a world whose buildings draw on no such row gets none ===");
for (const k of ["md", "hom"]) {
  const { r } = generate(k, 1);
  const rows = rowsIn(mods[k]).filter((w) => w.sid === 1), types = typesOf(k);
  const wrong = rows.filter((w) => NAVAL.includes(w.type) && !drawnBy(BUILDINGS[k]).has(w.type));
  ok(!!r && r.changed && rows.some((w) => w.type === "coastal_bunker") && wrong.length === 0, `⭐ ${k}-shaped: its forts are written, and no ${NAVAL.filter((t) => !drawnBy(BUILDINGS[k]).has(t)).join(" or ")} row`, wrong.map((w) => w.line));
  for (const t of NAVAL.filter((x) => drawnBy(BUILDINGS[k]).has(x))) ok(types.has(t) && rows.filter((w) => w.type === t).length === 2, `…and the ${t} it does draw on, one on each coastal province`, rows.filter((w) => w.type === t).map((w) => w.line));
}

// ── 4. Generate land itself: 4 × 2 blocks of 24 px, province = col + row × 4 + 1; row 0 rises, row 1 (in no region) stays sea ──
console.log("\n=== 4. Generate land writes the rows its world's buildings draw on ===");
{
  const COLS = 4, ROWS = 2, BLOCK = 24, GW = COLS * BLOCK, GH = ROWS * BLOCK;
  const gProv = (x, y) => Math.floor(x / BLOCK) + Math.floor(y / BLOCK) * COLS + 1;
  const gCol = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
  const RAISED = [1, 2, 3, 4];
  const csv = (land) => ["0;0;0;0;land;false;unknown;0"].concat(Array.from({ length: COLS * ROWS }, (_, i) => {
    const p = i + 1, [r, g, b] = gCol(p), isLand = land.includes(p);
    return `${p};${r};${g};${b};${isLand ? "land" : "sea"};false;${isLand ? "plains" : "ocean"};${isLand ? 1 : 0}`;
  })).join("\n") + "\n";
  let n = 0;
  const buildGame = (buildingsFile) => {
    const g = path.join(ROOT, `gen-game-${++n}`);
    write(g, "map/provinces.bmp", bmp24(GW, GH, (x, y) => gCol(gProv(x, y))));
    write(g, "map/definition.csv", csv(RAISED));
    write(g, "map/buildings.txt", "");
    write(g, "map/strategicregions/r1.txt", `strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ ${RAISED.join(" ")} }\n\tweather={}\n}\n`);
    write(g, "common/state_category/00.txt", "state_categories = {\n\trural = {\n\t\tlocal_building_slots = 4\n\t}\n}\n");
    write(g, BASE_REL, buildingsFile);
    for (const p of RAISED) write(g, `history/states/${p}-S.txt`, `state = {\n\tid = ${p}\n\tname = "STATE_${p}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${p} }\n\thistory = {\n\t\towner = ${p % 2 ? "AAA" : "BBB"}\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n\t\t}\n\t}\n}\n`);
    return g;
  };
  const buildMod = (buildingsFile) => {
    const m = path.join(ROOT, `gen-mod-${++n}`);
    write(m, "descriptor.mod", 'version="1"\nname="Coast"\nreplace_path="history/states"\npath="mod/coast"\n');
    write(m, "map/provinces.bmp", bmp24(GW, GH, (x, y) => gCol(gProv(x, y))));
    write(m, "map/definition.csv", csv([]));
    if (buildingsFile) write(m, BASE_REL, buildingsFile);
    return m;
  };
  // this test's own reading of the coast the click leaves: a raised province with a 4-neighbour that is not raised, x wrapping
  const coastal = new Set();
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const p = gProv(x, y);
    if (!RAISED.includes(p)) continue;
    if ([[(x + 1) % GW, y], [(x - 1 + GW) % GW, y], [x, y - 1], [x, y + 1]].some(([a, b]) => b >= 0 && b < GH && !RAISED.includes(gProv(a, b)))) coastal.add(p);
  }
  ok(coastal.size === RAISED.length, "(the fixture: every raised province is on the coast the unraised row leaves)", [...coastal]);
  const WORLDS = [
    { label: "over a vanilla-shaped base game", game: BUILDINGS.vanilla, mod: null, draws: BUILDINGS.vanilla },
    { label: "over an MD-shaped base game", game: BUILDINGS.md, mod: null, draws: BUILDINGS.md },
    { label: "under a mod shipping a HoM-shaped 00_buildings.txt", game: BUILDINGS.vanilla, mod: BUILDINGS.hom, draws: BUILDINGS.hom },
  ];
  for (const w of WORLDS) {
    const g = buildGame(w.game), m = buildMod(w.mod);
    const r = md.generateLand({ modRoot: m, gameRoot: g, dependencyRoots: [], count: RAISED.length, provincesPerState: 1, seed: 7, ownerMode: "inherit" });
    const rows = fs.readFileSync(path.join(m, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.split(";")).filter((c) => c.length >= 7)
      .map((c) => ({ type: c[1], province: gProv(Math.floor(+c[2]), GH - 1 - Math.floor(+c[4])), line: c.join(";") }));
    const onEach = (t) => [...coastal].every((p) => rows.filter((q) => q.type === t && q.province === p).length === 1) && rows.filter((q) => q.type === t).length === coastal.size;
    ok(!!r && !r.error && onEach("coastal_bunker"), `(${w.label}: Generate land writes, and one coastal_bunker row on each of the ${coastal.size} coastal provinces)`, { error: r && r.error, forts: rows.filter((q) => q.type === "coastal_bunker").map((q) => q.line) });
    for (const t of NAVAL) {
      const drawn = drawnBy(w.draws).has(t), of = rows.filter((q) => q.type === t);
      if (drawn) ok(onEach(t), `⭐⭐ ${w.label}: one ${t} row on each coastal province`, of.map((q) => q.line));
      else ok(of.length === 0, `⭐ ${w.label}: no ${t} row — its buildings draw on none`, of.map((q) => q.line));
    }
  }
}

// ── 5. the runway: an island so small its runway stands by the coast the hub would take ──────────────────────────────────────────
console.log("\n=== 5. the hub and HQ keep off the state's runway; the runway is not moved for them ===");
{
  // ⚠️ MOVED with ⛔ #the-runway-goes-first: from a town point at [13, 6] the runway, kept off the layout's rows, stood where the hub
  // would have. The layout's rows go round the runway now, which keeps its own position there, clear of the hub's spot, so the
  // controls below could no longer tell the two orders apart; from [16, 6] they can
  const IW = 64, IH = 24, ISLAND = [10, 5, 24, 14], TOWN = [16, 6];   // [x0, y0, x1, y1) on a sea (province 1); its town point [px, row]
  const iProv = (x, y) => (x >= ISLAND[0] && x < ISLAND[2] && y >= ISLAND[1] && y < ISLAND[3] ? 2 : 1);
  /** the island state written by Generate land's call, with the coast types `keep` leaves of its world's: its rows — over the mods
   *  in `deps` (5b) */
  const island = (name, keep, deps = []) => {
    const dir = path.join(ROOT, name);
    write(dir, "descriptor.mod", `name="island"\nreplace_path="history/states"\nreplace_path="map"\n${deps.length ? `dependencies = { ${deps.map((d) => `"${path.basename(d)}"`).join(" ")} }\n` : ""}`);
    write(dir, "map/provinces.bmp", bmp24(IW, IH, (x, y) => colour(iProv(x, y))));
    write(dir, "map/heightmap.bmp", bmp8(IW, IH, (x, y) => (iProv(x, y) === 1 ? 80 : 96 + ((x * 3 + y * 5) % 120))));
    write(dir, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`, `2;${colour(2).join(";")};land;false;plains;1`].join("\n") + "\n");
    write(dir, "map/unitstacks.txt", `2;0;${TOWN[0]}.00;10.00;${IH - 1 - TOWN[1]}.00;0.00;0.00\n`);
    write(dir, "history/states/1-S.txt", "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n");
    write(dir, "map/buildings.txt", "99;radar_station;1.00;9.50;1.00;0.00;0\n");
    const roots = { modRoot: dir, gameRoot: game, dependencyRoots: deps };
    const townPoints = md.stateBuildingAnchor({ ...roots, provinces: [2], each: true }) || new Map();
    const types = new Set([...coastRowTypesDrawn(md.stateBuildingRules(roots))].filter(keep));
    const r = md.ensureBuildingSlotsForState({ ...roots, stateId: 1, provinces: [2], townPoints, coast: { provinces: new Set([2]), ports: [], types } });
    const rows = fs.readFileSync(path.join(dir, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.split(";")).filter((c) => c.length >= 7 && c[0] === "1")
      .map((c) => ({ type: c[1], x: +c[2], z: +c[4], px: Math.floor(+c[2]), row: IH - 1 - Math.floor(+c[4]), line: c.join(";") }));
    return { r, rows, roots, townPoints, types };
  };
  const { r, rows, roots, townPoints } = island("island", () => true);
  const twin = island("island-twin", (t) => !NAVAL.includes(t));          // the same state, its world drawing no hub or HQ row
  const air = rows.filter((w) => w.type === "air_base"), naval = rows.filter((w) => NAVAL.includes(w.type));
  const fortYard = rows.filter((w) => w.type === "coastal_bunker" || w.type === "dockyard");
  // the runway's block, from the row (x, IH − z), at the reach the mod's layers draw — airfieldBlock's arithmetic, done here
  const REACH = md.airfieldReach(roots);
  const blockOf = (w) => { const Y = IH - w.z; return { c0: Math.floor(w.x - REACH.west), c1: Math.ceil(w.x + REACH.east) - 1, r0: Math.floor(Y - REACH.north), r1: Math.ceil(Y + REACH.south) - 1 }; };
  const under = (q, w) => { const b = blockOf(w); return q.px >= b.c0 && q.px <= b.c1 && q.row >= b.r0 && q.row <= b.r1; };
  ok(!!r && r.changed && air.length === 1 && fortYard.length === 2 && NAVAL.every((t) => naval.filter((w) => w.type === t).length === 1),
    "(the island state is written its air base, its fort and dockyard, and one hub and one HQ)", { r, rows: rows.map((w) => w.line).filter((l) => !/supply_node|bunker;|special/.test(l)) });
  // the twin's world draws no hub or HQ row: every row it writes is where this state's stand, the hub and HQ aside
  const lines = (list) => list.map((w) => w.line).sort().join("\n");
  // ⚠️ MOVED with ⛔ #a-fort-stands-off-its-depot: the province's fort and special-project site (md.SITE_TYPES) keep off every row the
  // call writes, the hub and HQ among them, so they are the rows that may stand elsewhere in the twin
  const SITES = md.SITE_TYPES || [], site = (w) => SITES.includes(w.type);
  ok(SITES.length > 0 && !!twin.r && twin.r.changed && !twin.rows.some((w) => NAVAL.includes(w.type)) && lines(twin.rows.filter((w) => !site(w))) === lines(rows.filter((w) => !NAVAL.includes(w.type) && !site(w))),
    "⭐⭐ the runway, the fort, the dockyard and every other row stand where they do when the world draws no hub or HQ: none is moved for them (but the sites, which keep off them)",
    { air: air.map((w) => w.line), twinAir: twin.rows.filter((w) => w.type === "air_base").map((w) => w.line) });
  ok(rows.filter(site).length > 0 && rows.filter(site).every((w) => naval.every((q) => q.px !== w.px || q.row !== w.row)), "⭐ …and no site stands on the hub or the HQ", rows.filter(site).map((w) => w.line));
  ok(air.length === 1 && naval.length === 2 && naval.every((q) => !under(q, air[0])), "⭐⭐ …and neither the hub nor the HQ stands under it", naval.filter((q) => air[0] && under(q, air[0])).map((q) => q.line));
  // CONTROLS — the island makes the order matter. The hub and HQ kept off the fort, the dockyard and each other alone (coastPixelOf,
  // as coastSlotPositions asks it): one stands under the runway, and a runway told of them too (stateBuildingAnchor's airfield,
  // asked with the rows to keep clear of as a plain list) stands elsewhere
  const xz = (w) => ({ x: w.x, z: w.z });
  const a = md.stateBuildingAnchor({ ...roots, provinces: [2], positions: true, townPoints, stateId: 1, keepClearOf: fortYard.map(xz) }) || {};
  const t = townPoints.get(2), tp = t && { px: Math.floor(t.x), row: IH - 1 - Math.floor(t.z) }, isSeaI = (id) => id === 1;
  const spaced = fortYard.map((w) => ({ px: w.px, row: w.row, d: NEAR }));
  const gHub = a.ex && tp ? md.coastPixelOf(a.ex, 2, isSeaI, tp, spaced, true) : null;
  const gHQ = gHub ? md.coastPixelOf(a.ex, 2, isSeaI, tp, spaced.concat([{ px: gHub.x, row: gHub.row, d: NEAR }]), true) : null;
  const ghosts = [gHub, gHQ].filter(Boolean).map((g) => ({ px: g.x, row: g.row, x: g.x, z: IH - 1 - g.row }));
  ok(ghosts.length === 2 && air.length === 1 && !!a.airfield && a.airfield.x === air[0].x && a.airfield.z === air[0].z && ghosts.some((g) => under(g, air[0])),
    "CONTROL: kept off the fort and the dockyard alone, the hub or the HQ would stand under the runway", { ghosts: ghosts.map((g) => [g.px, g.row]), air: air.map((w) => [w.px, w.row]) });
  const told = md.stateBuildingAnchor({ ...roots, provinces: [2], positions: true, townPoints, stateId: 1, keepClearOf: fortYard.map(xz).concat(ghosts.map(xz)) }) || {};
  ok(!!told.airfield && air.length === 1 && (told.airfield.x !== air[0].x || told.airfield.z !== air[0].z),
    "CONTROL: …and a runway kept off them as well would be moved — the twin check above can tell the two orders apart", { told: told.airfield && [told.airfield.x, told.airfield.z], air: air.map((w) => [w.x, w.z]) });

  // ── 5b. the same island under a dependency whose airfield reaches further east, as Millennium Dawn's does (4.26 px; the base game's
  //    2.72): its own gfx/entities names a pdxmesh, a .gfx under gfx/models gives that mesh's file, and the mesh's aabb is the model
  console.log("\n=== 5b. …and the runway they keep off is the one the layers DRAW ===");
  const MESH = { min: [-1.3, 0, -1.3], max: [3.0, 1.0, 0.85] }, SCALE = 1.4, dep = path.join(ROOT, "wide-hangar");
  write(dep, "descriptor.mod", 'name="wide-hangar"\n');
  write(dep, "gfx/entities/buildings.asset", 'entity = {\n\tname = "building_air_base"\n\tpdxmesh = "wide_hangar"\n\tscale = 1.0\n}\n');
  write(dep, "gfx/models/wide_hangar/wide_hangar.gfx", `objectTypes = {\n\tpdxmesh = {\n\t\tname = "wide_hangar"\n\t\tfile = "gfx/models/wide_hangar/hangar.mesh"\n\t\tscale = ${SCALE}\n\t}\n}\n`);
  write(dep, "gfx/models/wide_hangar/hangar.mesh", meshFile(MESH.min, MESH.max));
  const wide = island("island-wide", () => true, [dep]);
  // the model's reach as the game reads it: the mesh's float32 aabb at its scale, rounded up to the hundredth
  const up = (v) => Math.ceil(100 * Math.max(0, Math.fround(v)) * SCALE) / 100, RW = { west: up(-MESH.min[0]), east: up(MESH.max[0]), south: up(-MESH.min[2]), north: up(MESH.max[2]) };
  const readW = md.airfieldReach(wide.roots);
  ok(JSON.stringify(readW) === JSON.stringify(RW) && RW.east > md.AIRFIELD_REACH.east, "(the fixture: airfieldReach reads the dependency's airfield, wider east than the base game's)", { readW, RW });
  const blockAt = (w, R) => { const Y = IH - w.z; return { c0: Math.floor(w.x - R.west), c1: Math.ceil(w.x + R.east) - 1, r0: Math.floor(Y - R.north), r1: Math.ceil(Y + R.south) - 1 }; };
  const inBlk = (b, q) => q.px >= b.c0 && q.px <= b.c1 && q.row >= b.r0 && q.row <= b.r1;
  const airW = wide.rows.filter((w) => w.type === "air_base"), navalW = wide.rows.filter((w) => NAVAL.includes(w.type));
  const bD = airW.length === 1 ? blockAt(airW[0], RW) : null, bV = airW.length === 1 ? blockAt(airW[0], md.AIRFIELD_REACH) : null;
  ok(!!wide.r && wide.r.changed && airW.length === 1 && NAVAL.every((t2) => navalW.filter((w) => w.type === t2).length === 1), "(the island is written its air base, and one hub and one HQ)", wide.rows.map((w) => w.line));
  // CONTROL: kept off the base game's block instead — coastPixelOf as coastSlotPositions asks it, after the fort and the dockyard —
  // the hub or the HQ would stand under the runway the layers draw
  const aW = md.stateBuildingAnchor({ ...wide.roots, provinces: [2], positions: true, townPoints: wide.townPoints, stateId: 1 }) || {};
  const tW = wide.townPoints.get(2), tpW = tW && { px: Math.floor(tW.x), row: IH - 1 - Math.floor(tW.z) };
  const fyW = wide.rows.filter((w) => w.type === "coastal_bunker" || w.type === "dockyard").map((w) => ({ px: w.px, row: w.row, d: NEAR }));
  const vHub = aW.ex && tpW && bV ? md.coastPixelOf(aW.ex, 2, isSeaI, tpW, fyW.concat([bV]), true) : null;
  const vHQ = vHub ? md.coastPixelOf(aW.ex, 2, isSeaI, tpW, fyW.concat([{ px: vHub.x, row: vHub.row, d: NEAR }, bV]), true) : null;
  ok(!!bD && fyW.length === 2 && [vHub, vHQ].some((g) => !!g && inBlk(bD, { px: g.x, row: g.row })), "CONTROL: kept off the base game's runway, the hub or the HQ would stand under the one the layers draw", { vHub, vHQ, bD });
  ok(!!bD && navalW.length === 2 && navalW.every((q) => !inBlk(bD, q)), "⭐⭐ neither the hub nor the HQ stands under the runway the layers draw", navalW.filter((q) => !bD || inBlk(bD, q)).map((q) => q.line));
}

// ── 6. a coast too short to space its rows: province 2 [8, 4, 16, 12) on land (province 9), the sea (1) above columns 10..13 only, and
//    a modder's air base standing over the coast's west end ──────────────────────────────────────────────────────────────────────
console.log("\n=== 6. a coast too short to space its rows: the hub and HQ keep off the runway still ===");
{
  // where no coast pixel keeps every distance, the rows took the one nearest the town point and left the runway too: the fort's pixel,
  // under the runway that stands over it (the owner's flow rebuilt: a naval HQ so, 9 of its province's 11 coast pixels off the runway)
  const SW = 24, SH = 16, SEA6 = [10, 14], STAND = [11, 8], AIR = { px: 10, row: 5 };
  const sProv = (x, y) => (y < 4 && x >= SEA6[0] && x < SEA6[1] ? 1 : x >= 8 && x < 16 && y >= 4 && y < 12 ? 2 : 9);
  const dir = path.join(ROOT, "short-coast");
  write(dir, "descriptor.mod", 'name="short coast"\nreplace_path="history/states"\nreplace_path="map"\n');
  write(dir, "map/provinces.bmp", bmp24(SW, SH, (x, y) => colour(sProv(x, y))));
  write(dir, "map/heightmap.bmp", bmp8(SW, SH, (x, y) => (sProv(x, y) === 1 ? 80 : 100)));
  write(dir, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`, `2;${colour(2).join(";")};land;false;plains;1`, `9;${colour(9).join(";")};land;false;plains;1`].join("\n") + "\n");
  write(dir, "map/unitstacks.txt", `2;0;${STAND[0]}.00;10.00;${SH - 1 - STAND[1]}.00;0.00;0.00\n`);
  write(dir, "history/states/1-S.txt", "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n");
  write(dir, "map/buildings.txt", `99;radar_station;1.00;9.50;1.00;0.00;0\n1;air_base;${AIR.px}.00;10.04;${SH - 1 - AIR.row}.00;0.00;0\n`);
  const roots = { modRoot: dir, gameRoot: game, dependencyRoots: [] };
  const townPoints = md.stateBuildingAnchor({ ...roots, provinces: [2], each: true }) || new Map(), t = townPoints.get(2);
  const T = t ? { px: Math.floor(t.x), row: SH - 1 - Math.floor(t.z) } : { px: -99, row: -99 };
  // the runway's block, from the row (x, SH − z) at the reach the layers draw — airfieldBlock's arithmetic, done here
  const R = md.airfieldReach(roots), blk = { c0: Math.floor(AIR.px - R.west), c1: Math.ceil(AIR.px + R.east) - 1, r0: Math.floor(AIR.row + 1 - R.north), r1: Math.ceil(AIR.row + 1 + R.south) - 1 };
  const under = (q) => q.px >= blk.c0 && q.px <= blk.c1 && q.row >= blk.r0 && q.row <= blk.r1;
  const at = (a, b) => !!a && !!b && a.px === b.px && a.row === b.row;
  const coast6 = [];
  for (let row = 0; row < SH; row++) for (let px = 0; px < SW; px++) {
    if (sProv(px, row) === 2 && [[px + 1, row], [px - 1, row], [px, row - 1], [px, row + 1]].some(([x, y]) => y >= 0 && y < SH && sProv(((x % SW) + SW) % SW, y) === 1)) coast6.push({ px, row });
  }
  const nearest = (list) => list.reduce((b, q) => (!b || (q.px - T.px) ** 2 + (q.row - T.row) ** 2 < (b.px - T.px) ** 2 + (b.row - T.row) ** 2 ? q : b), null);   // raster order: a tie keeps the first
  const fortAt = nearest(coast6), offRunway = coast6.filter((q) => !under(q)), want = nearest(offRunway);
  ok(!!fortAt && under(fortAt) && coast6.every((q) => cheb(q, fortAt) < NEAR) && offRunway.length > 0,
    "(the fixture: the fort's pixel, the coast's nearest the town point, is under the runway; no coast pixel is BUILDING_RING_NEAR px from it; some are off the runway)", { coast: coast6, T, fortAt, blk });
  const types = coastRowTypesDrawn(md.stateBuildingRules(roots));
  const r = md.ensureBuildingSlotsForState({ ...roots, stateId: 1, provinces: [2], townPoints, coast: { provinces: new Set([2]), ports: [], types } });
  const rows = rowsIn(dir).filter((w) => w.sid === 1).map((w) => ({ ...w, row: SH - 1 - Math.floor(w.z) }));
  const of = (t2) => rows.filter((w) => w.type === t2);
  ok(!!r && r.changed && NAVAL.every((t2) => types.has(t2)) && of("air_base").length === 1 && of("coastal_bunker").length === 1 && at(of("coastal_bunker")[0], fortAt),
    "the modder's air base stands as it was, and the fort on the coast pixel nearest the town point, as before", rows.map((w) => w.line));
  ok(NAVAL.every((t2) => of(t2).length === 1 && !under(of(t2)[0]) && at(of(t2)[0], want)), "⭐⭐ the hub and the HQ stand on the coast's nearest pixel off the runway, not on the fort's pixel under it",
    NAVAL.map((t2) => [t2, of(t2).map((w) => [w.px, w.row])]));
}

// ── 7. a coast too short to space its rows, and no runway near it: province 2 [8, 4, 16, 12) on land (province 9), the sea (1) above
//    columns 10..13 only, a modder's air base at its south end ─────────────────────────────────────────────────────────────────────
console.log("\n=== 7. a coast too short to space its rows: the hub and HQ stand off the fort's pixel where the coast has another ===");
{
  // the nearest pixel to the town point is the one the fort took for being that: where no coast pixel kept every distance the hub and
  // the HQ took it as well (the owner's flow rebuilt: the HQ on its fort's pixel in 87 of 734 coastal provinces, the base game 4.4%)
  const SW = 24, SH = 16, SEA7 = [10, 14], STAND = [11, 8], AIR = { px: 12, row: 10 };
  const sProv = (x, y) => (y < 4 && x >= SEA7[0] && x < SEA7[1] ? 1 : x >= 8 && x < 16 && y >= 4 && y < 12 ? 2 : 9);
  const coast7 = [];
  for (let row = 0; row < SH; row++) for (let px = 0; px < SW; px++) {
    if (sProv(px, row) === 2 && [[px + 1, row], [px - 1, row], [px, row - 1], [px, row + 1]].some(([x, y]) => y >= 0 && y < SH && sProv(((x % SW) + SW) % SW, y) === 1)) coast7.push({ px, row });
  }
  const T = { px: STAND[0], row: STAND[1] }, isSea7 = (id) => id === 1;
  const box = { minX: 8, maxX: 15, minY: 4, maxY: 11 }, ex7 = { W: SW, H: SH, pidAt: (x, row) => sProv(x, row), box: new Map([[2, box]]) };
  const pick = (g) => (g && g.x >= 0 ? { px: g.x, row: g.row } : null), same7 = (a, b) => !!a && !!b && a.px === b.px && a.row === b.row;

  // a. coastPixelOf's `spread`, pure: two rows on the coast, BUILDING_RING_NEAR apart from no pixel, asked from a point nearest one of them
  const rowsA = [coast7[1], coast7[coast7.length - 1]], nearA = { px: coast7[coast7.length - 1].px, row: coast7[0].row + 4 };
  const awayA = rowsA.map((q) => ({ px: q.px, row: q.row, d: NEAR }));
  const wantA = furthest(coast7, rowsA, nearA), rasterA = coast7.find((q) => Math.min(...rowsA.map((s) => cheb(q, s))) === (wantA && wantA.g));
  const oldA = furthest(coast7, [], nearA);
  ok(coast7.length === 4 && coast7.every((q) => rowsA.some((s) => cheb(q, s) < NEAR)) && same7(oldA, rowsA[1]) && !!wantA && !same7(wantA, rasterA),
    "(the fixture: a 4-pixel coast, every pixel within BUILDING_RING_NEAR of a row; nearest the point is a row's own pixel; the furthest pixels tie, and the first of them in the raster is not the nearest the point)",
    { coast7, rowsA, wantA, rasterA, oldA });
  ok(same7(pick(md.coastPixelOf(ex7, 2, isSea7, nearA, awayA, true)), wantA), "⭐⭐ spread: the pixel furthest from the nearest row, ties to the nearest the point", { got: md.coastPixelOf(ex7, 2, isSea7, nearA, awayA, true), wantA });
  ok(same7(pick(md.coastPixelOf(ex7, 2, isSea7, nearA, awayA)), oldA), "⭐ …and without it the nearest the point, as the fort and the dockyard still ask", md.coastPixelOf(ex7, 2, isSea7, nearA, awayA));
  // a runway's block over that pixel: the furthest of the pixels outside it
  const blockA = { c0: wantA.px, c1: wantA.px, r0: wantA.row, r1: wantA.row };
  const wantB = furthest(coast7.filter((q) => !same7(q, wantA)), rowsA, nearA);
  ok(same7(pick(md.coastPixelOf(ex7, 2, isSea7, nearA, awayA.concat([blockA]), true)), wantB) && !same7(wantB, wantA), "⭐⭐ …outside every runway's block", { wantB });

  // b. through the writer: the fort on the coast's pixel nearest the town point, the dockyard (no pixel BUILDING_RING_NEAR off it) on it
  //    too, as before; the hub and the HQ each on the pixel furthest from the rows before it
  const dir = path.join(ROOT, "short-coast-2");
  write(dir, "descriptor.mod", 'name="short coast 2"\nreplace_path="history/states"\nreplace_path="map"\n');
  write(dir, "map/provinces.bmp", bmp24(SW, SH, (x, y) => colour(sProv(x, y))));
  write(dir, "map/heightmap.bmp", bmp8(SW, SH, (x, y) => (sProv(x, y) === 1 ? 80 : 100)));
  write(dir, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`, `2;${colour(2).join(";")};land;false;plains;1`, `9;${colour(9).join(";")};land;false;plains;1`].join("\n") + "\n");
  write(dir, "map/unitstacks.txt", `2;0;${STAND[0]}.00;10.00;${SH - 1 - STAND[1]}.00;0.00;0.00\n`);
  write(dir, "history/states/1-S.txt", "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n");
  write(dir, "map/buildings.txt", `99;radar_station;1.00;9.50;1.00;0.00;0\n1;air_base;${AIR.px}.00;10.04;${SH - 1 - AIR.row}.00;0.00;0\n`);
  const roots = { modRoot: dir, gameRoot: game, dependencyRoots: [] };
  const townPoints = md.stateBuildingAnchor({ ...roots, provinces: [2], each: true }) || new Map(), t = townPoints.get(2);
  const R = md.airfieldReach(roots), blk = { c0: Math.floor(AIR.px - R.west), c1: Math.ceil(AIR.px + R.east) - 1, r0: Math.floor(AIR.row + 1 - R.north), r1: Math.ceil(AIR.row + 1 + R.south) - 1 };
  const types = coastRowTypesDrawn(md.stateBuildingRules(roots));
  const r = md.ensureBuildingSlotsForState({ ...roots, stateId: 1, provinces: [2], townPoints, coast: { provinces: new Set([2]), ports: [], types } });
  const rows = rowsIn(dir).filter((w) => w.sid === 1).map((w) => ({ ...w, row: SH - 1 - Math.floor(w.z) }));
  const of = (t2) => rows.filter((w) => w.type === t2), fort = of("coastal_bunker")[0], yard = of("dockyard")[0];
  ok(!!t && Math.floor(t.x) === T.px && SH - 1 - Math.floor(t.z) === T.row && coast7.every((q) => q.row < blk.r0 || q.px < blk.c0 || q.px > blk.c1),
    "(the fixture: the town point is the Standstill, and the runway covers none of the coast)", { t, blk });
  ok(!!r && r.changed && NAVAL.every((t2) => types.has(t2)) && !!fort && !!yard && same7(fort, furthest(coast7, [], T)) && same7(yard, fort) && coast7.every((q) => cheb(q, fort) < NEAR),
    "the fort stands on the coast's pixel nearest the town point and the dockyard on it too, as before — no coast pixel is BUILDING_RING_NEAR px from it", rows.filter((w) => w.type !== "supply_node").map((w) => w.line));
  const wantHub = fort ? furthest(coast7, [fort, yard], T) : null, wantHQ = wantHub ? furthest(coast7, [fort, yard, wantHub], T) : null;
  const hub = of("naval_supply_hub"), hq = of("naval_headquarters");
  ok(hub.length === 1 && hq.length === 1 && same7(hub[0], wantHub) && same7(hq[0], wantHQ), "⭐⭐ the hub and the HQ each stand on the coast pixel furthest from the rows before it, ties to the nearest the town point",
    { hub: hub.map((w) => [w.px, w.row]), hq: hq.map((w) => [w.px, w.row]), wantHub, wantHQ });
  ok(hub.length === 1 && hq.length === 1 && [hub[0], hq[0]].every((w) => !same7(w, fort)) && !same7(hub[0], hq[0]), "⭐⭐ …so neither stands on the fort's pixel, nor the two on one", { hub: hub.map((w) => [w.px, w.row]), hq: hq.map((w) => [w.px, w.row]) });
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
