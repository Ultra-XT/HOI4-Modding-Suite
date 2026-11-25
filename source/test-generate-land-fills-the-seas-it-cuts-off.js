// Generate land fills the seas it cuts off from the ocean, as land like the rest of the new world. #generate-land-fills-the-seas-it-cuts-off
//
// THE DEFECT. A grown continent closes bays into pockets of sea with no way out to the ocean, and Generate land left them
// there. Auto-fix's fixInlandSeas then turned each into land AFTER the click — a whole province at a time, with a neighbour's
// terrain, in no state, never raised by Generate land's own pass and never given building rows. On the owner's flow (Delete map,
// Generate land 35% seed 1, Auto-fix) that was 71 seas, 14 of them over 1,000 px; in the split prototype the largest land
// province of the whole world (13066, 4,791 px) was one, and the 59 land provinces without per-province rows were exactly these.
//
// THE FIX. generateLand asks inlandSeaPlan — the one plan the repair runs — over the map as it is about to be (every picked
// province land), right after the growth and before anything is written, and the seas it would fill join the new land. What the
// repair keeps stays sea: a body in a strategic region at least half water, one the mod's own buildings.txt puts to use (read
// before the click writes anything), one the layers below already ship cut off. A sea that was cut off BEFORE the click is not
// this click's to fill — unless the click is what changed the repair's verdict on it (3b).
//
// THE REVIEW (R-A8-1, 3, 5). The unitstacks.txt rows a layout gives every sea are no port: after Delete map they are the old
// world's, and they kept most of a re-rolled world's cut-off seas (2b). A body is one decision: one province of it in no strategic
// region leaves the whole body, not half of it (4c). The page says how many a port kept (5).
//
// THE PONDS (#generate-land-leaves-no-sea-cut-off). The half-water keep cannot tell a designed sea from the ocean THIS click walled off
// — at Generate time the regions are the base game's over a drowned map, and it kept all 30 of TEST 32's ponds — so a sea this click
// cut off is filled whatever its region's water share (1). And before any fill, such a sea goes back to the ocean when fewer picks
// stand in the way than it has provinces: that join is test-a-cut-off-sea-goes-back-to-the-ocean-when-that-changes-less.js and
// test-generate-land-leaves-no-sea-cut-off-from-the-ocean.js. THIS file pins the fill, so the clicks whose cut-off seas it judges run
// with the join off (`joinCutOffSeas: false`); with it on, the lattice here joins four of its five seas, and the pockets of 4 and 4c
// that have a province in no strategic region must join, which leaves those one-pick clicks no land at all.
//
// Everything expected is DERIVED: a probe run with the fill off says which seas the growth cuts off (walked here over the
// lattice, wrap seam included), and the regions' water shares say which of them the repair would keep.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!ok) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cutoffseas-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
function bmp8(width, height, fn) {
  const rs = Math.floor((8 * width + 31) / 32) * 4, isz = rs * height;
  const b = Buffer.alloc(54 + 1024 + isz);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + 1024 + isz, 2); b.writeUInt32LE(54 + 1024, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(width, 18); b.writeInt32LE(height, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(isz, 34);
  b.writeUInt32LE(256, 46); b.writeUInt32LE(256, 50);
  for (let i = 0; i < 256; i++) { const o = 54 + i * 4; b[o] = i; b[o + 1] = i; b[o + 2] = i; }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) b[54 + 1024 + (height - 1 - y) * rs + x] = fn(x, y);
  return b;
}
const at8 = (file, width, height, x, y) => { const b = fs.readFileSync(file); const rs = Math.floor((8 * width + 31) / 32) * 4; return b[b.readUInt32LE(10) + (height - 1 - y) * rs + x]; };
const terrainFile = (table, water) => "categories = {\n"
  + Object.keys(table).map((c) => `\t${c} = {${water.includes(c) ? " is_water = yes" : ""} color = { 100 120 140 } movement_cost = 1.0 }`).join("\n")
  + "\n}\nterrain = {\n" + Object.entries(table).map(([c, i]) => `\t${c}_g = { type = ${c} color = { ${i} } texture = 1 }`).join("\n") + "\n}\n";
const TABLE = { plains: 0, forest: 1, hills: 2, desert: 3, mountain: 6, marsh: 9, jungle: 21, lakes: 14, ocean: 15 };

const typesIn = (mod) => {
  const t = new Map();
  for (const ln of fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
    const c = ln.split(";");
    if (c.length > 4 && /^\d+$/.test(c[0])) t.set(+c[0], c[4]);
  }
  return t;
};
const statesIn = (mod) => {
  const d = path.join(mod, "history", "states");
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith(".txt")).map((f) =>
    ((/provinces\s*=\s*\{([^}]*)\}/.exec(fs.readFileSync(path.join(d, f), "utf8")) || [])[1] || "").match(/\d+/g) || []).map((l) => l.map(Number));
};
const same = (a, b) => JSON.stringify([...a].sort((x, y) => x - y)) === JSON.stringify([...b].sort((x, y) => x - y));

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE LATTICE — the shape Delete map leaves: all sea, in small provinces. Laid as running bond (bricks two pixels wide, every
// other row shifted by one), because a square grid puts FOUR provinces at every pixel corner and Auto-fix's X-crossing repaint
// would cut pockets off of its own (317 repaints and 50 provinces cut off on a one-pixel grid, measured). Column 0 is one tall
// sea province with no strategic region — never grown — so no brick straddles the wrap seam and the seam corner is no X either.
// Eight strategic regions; the province graph is walked here off the bitmap itself, wrap seam included.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const M = 16, W = 2 * M + 1, H = 20, N = 180, SEED = 26;
const GRID = new Int32Array(W * H);
let PROVINCES = 1;
for (let y = 0; y < H; y++) {
  GRID[y * W] = 1;
  if (y % 2 === 0) for (let k = 0; k < M; k++) { const id = ++PROVINCES; GRID[y * W + 1 + 2 * k] = id; GRID[y * W + 2 + 2 * k] = id; }
  else {
    GRID[y * W + 1] = ++PROVINCES;
    for (let k = 0; k < M - 1; k++) { const id = ++PROVINCES; GRID[y * W + 2 + 2 * k] = id; GRID[y * W + 3 + 2 * k] = id; }
    GRID[y * W + W - 1] = ++PROVINCES;
  }
}
const firstPixel = new Map();
for (let i = 0; i < W * H; i++) if (!firstPixel.has(GRID[i])) firstPixel.set(GRID[i], [i % W, Math.floor(i / W)]);
const xyOf = (id) => firstPixel.get(id);
const colourOf = (id) => [id & 255, (id >> 8) & 255, 91];
const regionOf = (id) => { if (id === 1) return 0; const [x, y] = xyOf(id); return Math.floor(x / Math.ceil(W / 4)) + 4 * Math.floor(y / (H / 2)) + 1; };
const NEIGHBOURS = new Map();
{
  const link = (a, b) => { if (a === b) return; for (const [p, q] of [[a, b], [b, a]]) { if (!NEIGHBOURS.has(p)) NEIGHBOURS.set(p, new Set()); NEIGHBOURS.get(p).add(q); } };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { link(GRID[y * W + x], GRID[y * W + (x + 1) % W]); if (y + 1 < H) link(GRID[y * W + x], GRID[(y + 1) * W + x]); }
}

function makeLattice(tag, { portOn = 0 } = {}) {
  const mod = fs.mkdtempSync(path.join(SANDBOX, tag + "-"));
  mk(path.join(mod, "descriptor.mod"), 'name="CutOff"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="common/terrain"\n');
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= PROVINCES; id++) { const [r, g, b] = colourOf(id); rows.push(`${id};${r};${g};${b};sea;false;ocean;0`); }
  mk(path.join(mod, "map", "definition.csv"), rows.join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(GRID[y * W + x])));
  mk(path.join(mod, "map", "heightmap.bmp"), bmp8(W, H, () => md.HEIGHTMAP_SEA_VALUE));
  mk(path.join(mod, "map", "terrain.bmp"), bmp8(W, H, () => TABLE.ocean));
  mk(path.join(mod, "common", "terrain", "00_terrain.txt"), terrainFile(TABLE, ["ocean", "lakes"]));
  const byRegion = new Map();
  for (let id = 2; id <= PROVINCES; id++) { const r = regionOf(id); if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r).push(id); }
  for (const [r, provs] of byRegion) mk(path.join(mod, "map", "strategicregions", `r${r}.txt`), `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${provs.join(" ")} }\n\tweather={}\n}\n`);
  // a port the modder placed BEFORE the click, its ships lying in sea `portOn` (the 7th column)
  if (portOn) { const [x, y] = xyOf(portOn); mk(path.join(mod, "map", "buildings.txt"), `1;naval_base_spawn;${x}.00;9.90;${y}.00;0.00;${portOn}\r\n`); }
  return mod;
}
// the sea bodies cut off from the ocean (every sea component but the largest), walked over the bitmap's own neighbours
function cutOffBodies(types) {
  const isSea = (id) => types.get(id) === "sea";
  const seen = new Set(), comps = [];
  for (let id = 1; id <= PROVINCES; id++) {
    if (!isSea(id) || seen.has(id)) continue;
    const q = [id], c = []; seen.add(id);
    while (q.length) { const p = q.pop(); c.push(p); for (const n of NEIGHBOURS.get(p) || []) if (isSea(n) && !seen.has(n)) { seen.add(n); q.push(n); } }
    comps.push(c.sort((a, b) => a - b));
  }
  comps.sort((a, b) => b.length - a.length || a[0] - b[0]);
  return comps.slice(1);
}
const generate = (mod, extra = {}) => md.generateLand({ modRoot: mod, gameRoot: null, dependencyRoots: [], count: N, provincesPerState: 8, seed: SEED, ...extra });

try {
  console.log("=== Generate land fills the seas it cuts off ===\n");

  console.log("0. The probe: what this growth cuts off, with the fill off");
  const probe = makeLattice("probe");
  const g0 = generate(probe, { fillCutOffSeas: false });
  rec("the probe ran and grew its land", g0.changed === true && !g0.error && g0.grown === true && g0.flippedProvinces === N, g0.error || g0.flippedProvinces);
  const t0 = typesIn(probe);
  const bodies = cutOffBodies(t0);
  // the repair keeps a body with a province in a strategic region at least half water — counted on the map after the click
  // (column 0's province is in no region, so it keeps nothing)
  const water = new Map(), size = new Map();
  for (let id = 2; id <= PROVINCES; id++) { const r = regionOf(id); size.set(r, (size.get(r) || 0) + 1); if (t0.get(id) !== "land") water.set(r, (water.get(r) || 0) + 1); }
  const halfWater = (b) => b.some((p) => p !== 1 && 2 * (water.get(regionOf(p)) || 0) >= size.get(regionOf(p)));
  const caspian = bodies.filter(halfWater), open = bodies.filter((b) => !halfWater(b));
  const portBody = open.slice().sort((a, b) => a.length - b.length || a[0] - b[0])[0] || [];
  // #generate-land-leaves-no-sea-cut-off — every sea this click cut off is the click's to fill but the port's, the mostly-water ones
  // too; the repair (Auto-fix) still keeps those, so what it fills after a click that left them is the smaller set
  const toFill = bodies.filter((b) => b !== portBody).flat();
  const repairFills = open.filter((b) => b !== portBody).flat();
  console.log(`     cut off: ${bodies.map((b) => b.length).join(", ")} provinces; in a mostly-water region: ${caspian.map((b) => b.length).join(", ")}; the port's: ${portBody.length}; to fill: ${toFill.length}`);
  rec("THE CONTROL: the growth cuts seas off — at least one to fill, one a port uses, one in a mostly-water region",
    toFill.length > 0 && portBody.length > 0 && caspian.length > 0, { bodies: bodies.map((b) => b.length), caspian: caspian.length, open: open.length });

  console.log("\n1. The same click, with the fill off and on, over the same mod (a port faces one of the cut-off seas)");
  const off = makeLattice("off", { portOn: portBody[0] });
  const on = makeLattice("on", { portOn: portBody[0] });
  const gOff = generate(off, { fillCutOffSeas: false });
  const gOn = generate(on, { joinCutOffSeas: false });
  const tOff = typesIn(off), tOn = typesIn(on);
  rec("THE CONTROL: with the fill off the port changes nothing — the same seas are cut off and still sea",
    JSON.stringify(cutOffBodies(tOff)) === JSON.stringify(bodies) && toFill.every((p) => tOff.get(p) === "sea"), cutOffBodies(tOff).map((b) => b.length));
  rec("⭐⭐⭐ with the fill on, every sea the click cut off is LAND but the one the port faces",
    gOn.changed === true && toFill.every((p) => tOn.get(p) === "land"), toFill.filter((p) => tOn.get(p) !== "land"));
  rec("⭐⭐ …and Generate land says how many, and which", (gOn.inlandSeas || {}).filled === toFill.length && same((gOn.inlandSeas || {}).provinces || [], toFill), gOn.inlandSeas);
  rec("…and counts them with the land it made", gOn.flippedProvinces === N + toFill.length, { flipped: gOn.flippedProvinces, N, filled: toFill.length });
  const inStates = statesIn(on);
  rec("⭐⭐⭐ each is in exactly one of the new states", toFill.every((p) => inStates.filter((s) => s.includes(p)).length === 1),
    toFill.filter((p) => inStates.filter((s) => s.includes(p)).length !== 1));
  const hOn = path.join(on, "map", "heightmap.bmp"), hOff = path.join(off, "map", "heightmap.bmp");
  rec("THE CONTROL: with the fill off, those seas were not raised", toFill.every((p) => at8(hOff, W, H, ...xyOf(p)) === md.HEIGHTMAP_SEA_VALUE),
    toFill.map((p) => at8(hOff, W, H, ...xyOf(p))));
  // #a-raise-knows-where-the-map-ends — past the map's top and bottom rows is water to the raise, so a filled sea's pixel on either
  // is the beach's foot; anywhere else it stands above sea level with the rest
  const raisedAt = (p) => { const [x, y] = xyOf(p), v = at8(hOn, W, H, x, y); return y === 0 || y === H - 1 ? v === md.HEIGHTMAP_BEACH_RAMP[0] : v >= md.HEIGHTMAP_SEA_LEVEL; };
  rec("⭐⭐⭐ …and with it on, each is raised above sea level with the rest — on the map's edge row, to the beach's foot", toFill.every(raisedAt),
    toFill.map((p) => at8(hOn, W, H, ...xyOf(p)) + (xyOf(p)[1] === 0 || xyOf(p)[1] === H - 1 ? "@edge" : "")));
  rec("⭐⭐⭐ the sea the modder's port faces stays sea", portBody.every((p) => tOn.get(p) === "sea") && (gOn.inlandSeas || {}).kept && gOn.inlandSeas.kept.inUse === portBody.length,
    { types: portBody.map((p) => tOn.get(p)), kept: (gOn.inlandSeas || {}).kept });
  // #generate-land-leaves-no-sea-cut-off — the half-water keep is the repair's guess at a designed sea; a sea THIS click walled off is
  // not one, whatever the drowned map's regions say
  rec("⭐⭐⭐ …and so is every sea it cut off in a strategic region at least half water — that keep is for a sea cut off before the click",
    caspian.length > 0 && caspian.flat().every((p) => tOn.get(p) === "land") && ((gOn.inlandSeas || {}).kept || {}).caspian === 0,
    { types: caspian.flat().map((p) => tOn.get(p)), kept: (gOn.inlandSeas || {}).kept });
  rec("THE CONTROL: with the fill off, Generate land filled nothing and said so", (gOff.inlandSeas || {}).filled === 0, gOff.inlandSeas);

  console.log("\n2. The Auto-fix after it");
  const aOff = md.autoFixMap({ modRoot: off, gameRoot: null, dependencyRoots: [] });
  const isOff = ((aOff || {}).fixes || {}).inlandSeas || {};
  rec("THE CONTROL: after a click that left them, Auto-fix fills exactly those seas outside a mostly-water region — the fixture tells right from wrong",
    isOff.fixed === repairFills.length && same((isOff.details || []).map((d) => d.province), repairFills), isOff);
  const aOn = md.autoFixMap({ modRoot: on, gameRoot: null, dependencyRoots: [] });
  const isOn = ((aOn || {}).fixes || {}).inlandSeas || {};
  rec("⭐⭐⭐ after Generate land filled them, Auto-fix fills nothing", !isOn.error && isOn.fixed === 0, isOn);

  console.log("\n2b. The unit positions a layout gives every sea are no port — after Delete map they are the old world's");
  {
    // Auto-fix lays out map/unitstacks.txt, and a full layout gives EVERY sea province its sea-only rows; Delete map leaves the file,
    // so a world re-rolled with another seed meets the old world's rows on every sea it cuts off. Read as use, they kept 46 of the 56
    // sea provinces a seed-2 re-roll of the owner's flow cut off (the review's p-second.js). The sea-only types are map-data.js's own.
    const { stripJsComments } = require("./testlib-strip-comments.js");
    const src = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
    const SEA_ONLY = ((/const UNITSTACK_SEA_ONLY_TYPES\s*=\s*new Set\(\[([^\]]*)\]\)/.exec(src) || [])[1] || "").match(/\d+/g) || [];
    const layOut = (mod) => {
      const rows = [];
      for (let id = 1; id <= PROVINCES; id++) { const [x, y] = xyOf(id); for (const t of SEA_ONLY) rows.push(`${id};${t};${x}.00;9.50;${H - 1 - y}.00;0.00;0.00`); }
      mk(path.join(mod, "map", "unitstacks.txt"), rows.join("\r\n") + "\r\n");
      return mod;
    };
    rec("THE CONTROL: map-data.js names the sea-only unit types", SEA_ONLY.length > 0, SEA_ONLY);
    const offL = layOut(makeLattice("layout-off"));
    const used = md.seaProvincesPutToUse({ modRoot: offL });
    rec("THE CONTROL: the repair's reading of the mod's files calls every province of the lattice in use", used.size === PROVINCES, used.size);
    generate(offL, { fillCutOffSeas: false });
    const planL = md.fixInlandSeas({ modRoot: offL, gameRoot: null, dependencyRoots: [], plan: true });
    rec("THE CONTROL: …so after the same click with the fill off, the repair keeps every cut-off sea outside a mostly-water region as in use",
      same((planL.kept || {}).inUse || [], open.flat()) && !(planL.fill || []).length, planL);
    const onL = layOut(makeLattice("layout-on"));
    const gL = generate(onL, { joinCutOffSeas: false });   // the fill, as in 1 (the join's own reading: test-generate-land-leaves-no-sea-cut-off-from-the-ocean.js)
    const tL = typesIn(onL);
    rec("⭐⭐⭐ Generate land fills them all the same — a layout is not a port",
      bodies.flat().every((p) => tL.get(p) === "land") && same((gL.inlandSeas || {}).provinces || [], bodies.flat()) && ((gL.inlandSeas || {}).kept || {}).inUse === 0,
      { seas: gL.inlandSeas, stillSea: bodies.flat().filter((p) => tL.get(p) !== "land") });
  }

  console.log("\n3. A sea cut off BEFORE the click is not this click's to fill");
  {
    // Columns of a 16 x 4 map: an island-to-be (1) in the ocean, a pocket of sea (2) between two lands that was cut off
    // before anyone clicked, and the ocean round the rest. Only 1 and 2 have a strategic region, so the growth can pick
    // only them, and seed 1 takes the first of two.
    const C = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40], 5: [50, 50, 50], 6: [60, 60, 60] };
    const at = (x, y) => (x >= 9 && x <= 10 && y >= 1 && y <= 2 ? 1 : x <= 2 ? 3 : x <= 4 ? 2 : x <= 6 ? 4 : x <= 12 ? 5 : 6);
    const T = { 1: "sea", 2: "sea", 3: "land", 4: "land", 5: "sea", 6: "sea" };
    const pocketMod = (tag) => {
      const m = fs.mkdtempSync(path.join(SANDBOX, tag + "-"));
      mk(path.join(m, "descriptor.mod"), 'name="Pocket"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
      mk(path.join(m, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat([1, 2, 3, 4, 5, 6].map((i) => `${i};${C[i].join(";")};${T[i]};false;${T[i] === "sea" ? "ocean" : "plains"};${T[i] === "sea" ? 0 : 1}`)).join("\r\n") + "\r\n");
      mk(path.join(m, "map", "provinces.bmp"), bmp24(16, 4, (x, y) => C[at(x, y)]));
      mk(path.join(m, "map", "strategicregions", "1.txt"), "strategic_region={\n\tid=1\n\tname=\"REGION_1\"\n\tprovinces={ 1 }\n\tweather={}\n}\n");
      mk(path.join(m, "map", "strategicregions", "2.txt"), "strategic_region={\n\tid=2\n\tname=\"REGION_2\"\n\tprovinces={ 2 3 4 }\n\tweather={}\n}\n");
      return m;
    };
    const twin = pocketMod("pocket-repair");
    const rep = md.fixInlandSeas({ modRoot: twin, gameRoot: null, dependencyRoots: [] });
    rec("THE CONTROL: the pocket is a sea the repair fills — it is cut off and nothing keeps it", rep.fixed === 1 && ((rep.details || [])[0] || {}).province === 2, rep);
    const m = pocketMod("pocket");
    const g = md.generateLand({ modRoot: m, gameRoot: null, dependencyRoots: [], count: 1, provincesPerState: 8, seed: 1 });
    const t = typesIn(m);
    rec("THE CONTROL: the click raised the island, not the pocket", g.changed === true && t.get(1) === "land", { err: g.error, one: t.get(1), two: t.get(2) });
    rec("⭐⭐ the pocket the click did not cut off stays sea — Auto-fix's to judge, as before", t.get(2) === "sea" && (g.inlandSeas || {}).filled === 0, { two: t.get(2), seas: g.inlandSeas });
    rec("…and Generate land counts it as already cut off", (g.inlandSeas || {}).alreadyCutOff === 1, g.inlandSeas);
  }

  console.log("\n3b. …but one the Caspian rule kept until the click made its region mostly land IS this click's");
  {
    // Columns of a 16 x 4 map: land (4), a pocket of sea (2) with no way out, land (3), a sea (1), the ocean (5, 6, 7). 1, 2 and 3
    // share the one strategic region — two thirds water, so the repair keeps the pocket as an inland sea. Only 1 and 2 have a region,
    // and seed 1 takes the first of two: raising 1 leaves that region one third water, and the same repair then FILLS the pocket.
    // Left here, it fell to Auto-fix — a neighbour's terrain, no state, never raised: the very thing this block exists to stop.
    const C = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40], 5: [50, 50, 50], 6: [60, 60, 60], 7: [70, 70, 70] };
    const at = (x) => (x <= 1 ? 4 : x <= 3 ? 2 : x <= 5 ? 3 : x <= 7 ? 1 : x <= 11 ? 5 : x <= 13 ? 6 : 7);
    const POCKET = 2, RAISED = 1;
    const flipMod = (tag, over = {}) => {
      const T = { 1: "sea", 2: "sea", 3: "land", 4: "land", 5: "sea", 6: "sea", 7: "sea", ...over };
      const m = fs.mkdtempSync(path.join(SANDBOX, tag + "-"));
      mk(path.join(m, "descriptor.mod"), 'name="Flip"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
      mk(path.join(m, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat([1, 2, 3, 4, 5, 6, 7].map((i) => `${i};${C[i].join(";")};${T[i]};false;${T[i] === "sea" ? "ocean" : "plains"};${T[i] === "sea" ? 0 : 1}`)).join("\r\n") + "\r\n");
      mk(path.join(m, "map", "provinces.bmp"), bmp24(16, 4, (x) => C[at(x)]));
      mk(path.join(m, "map", "strategicregions", "2.txt"), "strategic_region={\n\tid=2\n\tname=\"REGION_2\"\n\tprovinces={ 1 2 3 }\n\tweather={}\n}\n");
      return m;
    };
    const opts = (m) => ({ modRoot: m, gameRoot: null, dependencyRoots: [] });
    const was = md.fixInlandSeas({ ...opts(flipMod("flip-before")), plan: true });
    rec("THE CONTROL: before the click the pocket is cut off and the repair keeps it — its region is mostly water",
      same((was.kept || {}).caspian || [], [POCKET]) && !(was.fill || []).length, was);
    const then = md.fixInlandSeas({ ...opts(flipMod("flip-after", { [RAISED]: "land" })), plan: true });
    rec("THE CONTROL: with 1 already land, the same repair fills it", same(then.fill || [], [POCKET]), then);
    const m = flipMod("flip-generate");
    const g = md.generateLand({ ...opts(m), count: 1, provincesPerState: 8, seed: 1 });
    const t = typesIn(m);
    rec("THE CONTROL: the click raised 1", g.changed === true && t.get(RAISED) === "land", { err: g.error, one: t.get(RAISED) });
    rec("⭐⭐ the pocket whose verdict the click changed becomes land with it", t.get(POCKET) === "land" && same((g.inlandSeas || {}).provinces || [], [POCKET])
      && !(g.inlandSeas || {}).alreadyCutOff, { pocket: t.get(POCKET), seas: g.inlandSeas });
    const after = md.fixInlandSeas({ ...opts(m), inUse: md.seaProvincesPutToUse({ modRoot: m }) });
    rec("…and the Auto-fix repair after it fills nothing", !after.error && after.fixed === 0, after);
  }

  console.log("\n4. A sea joined to the ocean by an adjacencies.csv row alone is judged as the repair judges it");
  {
    // Columns of a 16 x 4 map: land (4, 3), a pocket of sea (2), a sea bridge (1) to the ocean (5, 6). Only 1 and 2 have a strategic
    // region, so the growth can pick only them and seed 1 takes the first of two (1) — which walls the pocket off in provinces.bmp,
    // while a sea row in adjacencies.csv still joins it to the ocean. The repair judges by the bitmap and fills it; so must the click,
    // or the Auto-fix after it would fill a sea Generate land just decided to keep.
    const C = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40], 5: [50, 50, 50], 6: [60, 60, 60] };
    const at = (x) => (x <= 1 ? 4 : x <= 2 ? 3 : x <= 4 ? 2 : x <= 6 ? 1 : x <= 12 ? 5 : 6);
    const POCKET = 2, BRIDGE = 1, OCEAN = 5;
    const rowMod = (tag, over = {}, { pocketRegion = true } = {}) => {
      const T = { 1: "sea", 2: "sea", 3: "land", 4: "land", 5: "sea", 6: "sea", ...over };
      const m = fs.mkdtempSync(path.join(SANDBOX, tag + "-"));
      mk(path.join(m, "descriptor.mod"), 'name="Row"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
      mk(path.join(m, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat([1, 2, 3, 4, 5, 6].map((i) => `${i};${C[i].join(";")};${T[i]};false;${T[i] === "sea" ? "ocean" : "plains"};${T[i] === "sea" ? 0 : 1}`)).join("\r\n") + "\r\n");
      mk(path.join(m, "map", "provinces.bmp"), bmp24(16, 4, (x) => C[at(x)]));
      mk(path.join(m, "map", "adjacencies.csv"), `From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\r\n${POCKET};${OCEAN};sea;-1;-1;-1;-1;-1;;strait\r\n-1;-1;;-1;-1;-1;-1;-1;-1\r\n`);
      mk(path.join(m, "map", "strategicregions", "1.txt"), `strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ ${BRIDGE} }\n\tweather={}\n}\n`);
      mk(path.join(m, "map", "strategicregions", "2.txt"), `strategic_region={\n\tid=2\n\tname="REGION_2"\n\tprovinces={ ${pocketRegion ? POCKET + " " : ""}3 4 }\n\tweather={}\n}\n`);
      return m;
    };
    const probe = rowMod("row-graph");
    const model = md.buildMapModel({ modRoot: probe, gameRoot: null, dependencyRoots: [], cacheStableLayers: true });
    const graph = md.provinceNeighbourGraph({ modRoot: probe, gameRoot: null, dependencyRoots: [], model });
    const key = [POCKET, OCEAN].sort((a, b) => a - b).join("-");
    rec("THE CONTROL: the graph Generate land grows along joins the pocket to the ocean by the row alone, no pixel between them",
      !!graph && graph.get(POCKET).has(OCEAN) && graph.borderPixels.get(key) === 0, graph && [...(graph.get(POCKET) || [])]);
    const twin = rowMod("row-repair", { [BRIDGE]: "land" });
    const rep = md.fixInlandSeas({ modRoot: twin, gameRoot: null, dependencyRoots: [] });
    rec("THE CONTROL: with the bridge already land, the repair fills the pocket — it judges by provinces.bmp, the row notwithstanding",
      rep.fixed === 1 && ((rep.details || [])[0] || {}).province === POCKET, rep);
    const m = rowMod("row-generate");
    const g = md.generateLand({ modRoot: m, gameRoot: null, dependencyRoots: [], count: 1, provincesPerState: 8, seed: 1 });
    const t = typesIn(m);
    rec("THE CONTROL: the click raised the bridge", g.changed === true && t.get(BRIDGE) === "land", { err: g.error, bridge: t.get(BRIDGE) });
    rec("⭐⭐ the click fills the pocket it walled off, as the repair would — one judgement, not two",
      t.get(POCKET) === "land" && same((g.inlandSeas || {}).provinces || [], [POCKET]), { pocket: t.get(POCKET), seas: g.inlandSeas });
    const after = md.fixInlandSeas({ modRoot: m, gameRoot: null, dependencyRoots: [], inUse: md.seaProvincesPutToUse({ modRoot: m }) });
    rec("…and the Auto-fix repair after it fills nothing", !after.error && after.fixed === 0, after);

    // …and the same pocket in no strategic region: land must have one, and Generate land makes its states region by region, so a
    // cut-off sea that has none is left as it was — the repair's to judge, as before — and counted. (With the join on, such a body
    // must join, and this one-pick click then keeps its bridge sea and makes no land: the ponds test's emptied click.)
    const lost = rowMod("noregion-plan", { [BRIDGE]: "land" }, { pocketRegion: false });
    const lostPlan = md.fixInlandSeas({ modRoot: lost, gameRoot: null, dependencyRoots: [], plan: true });
    rec("THE CONTROL: out of every region, the pocket is still a sea the plan would fill once the bridge is land", same(lostPlan.fill || [], [POCKET]), lostPlan);
    const nr = rowMod("noregion-generate", {}, { pocketRegion: false });
    const gn = md.generateLand({ modRoot: nr, gameRoot: null, dependencyRoots: [], count: 1, provincesPerState: 8, seed: 1, joinCutOffSeas: false });
    const tn = typesIn(nr);
    rec("⭐⭐ a cut-off sea in no strategic region stays sea, and is counted", gn.changed === true && tn.get(BRIDGE) === "land" && tn.get(POCKET) === "sea"
      && (gn.inlandSeas || {}).filled === 0 && (gn.inlandSeas || {}).noRegion === 1, { bridge: tn.get(BRIDGE), pocket: tn.get(POCKET), seas: gn.inlandSeas });
  }

  console.log("\n4c. A cut-off body is one decision: a province of it in no strategic region leaves the whole body as it was");
  {
    // Columns of a 16 x 4 map: land (4, 3), a pocket of two seas — 2 in a strategic region, 7 in none — a sea (1), the ocean (5, 6, 8).
    // Only 1 and 2 can grow, and seed 1 takes 1, which walls the pocket off. Filling 2 and leaving 7 split one body between two
    // judges: the click made half of it land, and the Auto-fix after it filled the other half its own way.
    const C = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40], 5: [50, 50, 50], 6: [60, 60, 60], 7: [70, 70, 70], 8: [80, 80, 80] };
    const at = (x) => (x <= 1 ? 4 : x <= 2 ? 3 : x <= 3 ? 2 : x <= 4 ? 7 : x <= 6 ? 1 : x <= 10 ? 5 : x <= 13 ? 6 : 8);
    const BODY = [2, 7], RAISED = 1;
    const partMod = (tag, over = {}) => {
      const T = { 1: "sea", 2: "sea", 3: "land", 4: "land", 5: "sea", 6: "sea", 7: "sea", 8: "sea", ...over };
      const m = fs.mkdtempSync(path.join(SANDBOX, tag + "-"));
      mk(path.join(m, "descriptor.mod"), 'name="Part"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
      mk(path.join(m, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat([1, 2, 3, 4, 5, 6, 7, 8].map((i) => `${i};${C[i].join(";")};${T[i]};false;${T[i] === "sea" ? "ocean" : "plains"};${T[i] === "sea" ? 0 : 1}`)).join("\r\n") + "\r\n");
      mk(path.join(m, "map", "provinces.bmp"), bmp24(16, 4, (x) => C[at(x)]));
      mk(path.join(m, "map", "strategicregions", "1.txt"), "strategic_region={\n\tid=1\n\tname=\"REGION_1\"\n\tprovinces={ 1 }\n\tweather={}\n}\n");
      mk(path.join(m, "map", "strategicregions", "2.txt"), "strategic_region={\n\tid=2\n\tname=\"REGION_2\"\n\tprovinces={ 2 3 4 }\n\tweather={}\n}\n");
      return m;
    };
    const opts = (m) => ({ modRoot: m, gameRoot: null, dependencyRoots: [] });
    const then = md.fixInlandSeas({ ...opts(partMod("part-after", { [RAISED]: "land" })), plan: true });
    rec("THE CONTROL: with 1 land, the repair fills the pocket — both provinces, one body", same(then.fill || [], BODY), then);
    const m = partMod("part-generate");
    const g = md.generateLand({ ...opts(m), count: 1, provincesPerState: 8, seed: 1, joinCutOffSeas: false });   // the join would keep 1 sea (see 4)
    const t = typesIn(m);
    rec("THE CONTROL: the click raised 1", g.changed === true && t.get(RAISED) === "land", { err: g.error, one: t.get(RAISED) });
    rec("⭐⭐ no province of the body is filled, and the whole body is counted", BODY.every((p) => t.get(p) === "sea")
      && (g.inlandSeas || {}).filled === 0 && (g.inlandSeas || {}).noRegion === BODY.length, { types: BODY.map((p) => t.get(p)), seas: g.inlandSeas });
    const after = md.fixInlandSeas({ ...opts(m), inUse: md.seaProvincesPutToUse({ modRoot: m }) });
    rec("…so the repair after it judges the whole body in one place, as it did before the click could fill any",
      !after.error && same((after.details || []).map((d) => d.province), BODY), after);
  }

  console.log("\n5. The page says it");
  {
    const lib = require("./testlib-map-page.js");
    const { stripJsComments } = require("./testlib-strip-comments.js");
    let note = null;
    try { note = vm.runInNewContext(lib.lift("function generatedInlandSeasNote(") + "\ngeneratedInlandSeasNote", {}); } catch (e) { note = null; rec("public/map.js has generatedInlandSeasNote", false, e.message); }
    if (note) {
      const said = note(gOn), n = toFill.length;
      rec("⭐⭐ the line names how many cut-off sea provinces became land", said.startsWith(` ${n.toLocaleString()} sea province${n === 1 ? "" : "s"}`) && /cut off from the ocean/.test(said) && /became land/.test(said), said);
      // a cut-off sea kept because the mod's own port opens onto it stays sea for good, and the modder should know which click left it
      const kept = ((gOn.inlandSeas || {}).kept || {}).inUse || 0;
      rec("⭐⭐ …and how many stayed sea because a port in the mod's own buildings.txt opens onto them", kept === portBody.length
        && said.includes(` ${kept.toLocaleString()} more stayed sea`) && /map\/buildings\.txt/.test(said), said);
      const alone = note({ inlandSeas: { filled: 0, provinces: [], kept: { caspian: 0, inUse: kept, inherited: 0 } } });
      rec("…which it says on its own when nothing became land", alone.startsWith(` ${kept.toLocaleString()} sea province${kept === 1 ? "" : "s"}`)
        && /stayed sea/.test(alone) && !/became land/.test(alone), alone);
      rec("THE CONTROL: nothing filled says nothing", note(gOff) === "" && note({}) === "" && note(null) === "", [note(gOff)]);
      const why = "the plan threw";
      const failed = note({ ...gOn, inlandSeas: { ...gOn.inlandSeas, filled: 0, provinces: [], error: why } });
      rec("⭐ a plan that failed is said, with its reason — the click then filled nothing, and the result says why", failed.includes("⚠") && failed.includes(why) && /none became land/.test(failed), failed);
      // The click's success line is the LAST reload before its .catch: the first one after the POST is a click that stopped
      // part-way (#a-click-that-stopped-part-way-said-nothing-changed), which filled no sea to report
      const page = stripJsComments(lib.MAP), post = page.indexOf('fetch("/api/map/generate-land"');
      const caught = post < 0 ? -1 : page.indexOf(".catch(", post), done = caught < 0 ? -1 : page.lastIndexOf("reloadAfterImmediateWrite(", caught);
      // ⚠️ MOVED WITH 🌍 Generate a world: the handler hands generatedLandResultNote(res) to the reload, and the notes are built in that
      // function (the world shows the same words for its own Generate land step) — so the report is read through it (testlib-map-page.js)
      const line = lib.generateLandReportLine(page);
      const name = (/(\w+)\s*=\s*generatedInlandSeasNote\(res\)/.exec(line) || [])[1];
      rec("⭐⭐ the Generate land report on the page carries it", !!name && line.slice(line.lastIndexOf("reloadAfterImmediateWrite(")).includes("${" + name + "}"), line.slice(-200));
    }
  }

  console.log(`\n=== Generate land fills the seas it cuts off: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
}
