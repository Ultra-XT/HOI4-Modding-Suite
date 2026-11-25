// ⛔ #a-generated-world-invents-no-terrain — GENERATE LAND WRITES ONLY THE TERRAINS THE CORPUS TABLES MEASURED.
//
// generatedTerrainTypes chooses from TERRAIN_HOPS_FROM_SEA's names — the terrains TERRAIN_BY_ELEVATION was measured over — and a
// category the corpus does not name (Old World Blues declares `radiation`) is never chosen, because nothing measured says where it
// belongs. Its sibling pass, keepTerrainToItsLatitudes, was handed the mod's WHOLE paintable palette instead, and when a province's
// terrain is not at home in its latitude band and no neighbour offers one that is, it falls back to the band's commonest palette
// terrain of ANY kind. Measured 09-29 over Hearts of Minecraft (35%, seed 1): 18 of 4,440 generated provinces became
// soul_sand_valley or nether_wastes, in patches of 10, 3, 3, 1 and 1, in the far south of an overworld-typed world. On vanilla,
// Millennium Dawn, Novum Vexillum, Rise of Nations, Road to 56 and Old World Blues the output is byte-identical either way.
//
// Pinned on the latitude test's lattice, whose layer below is every standard terrain in its northern three quarters and 75%
// `nether_wastes` (declared, graphical index 30, never measured) in its southern quarter:
//   1. not one generated row carries a terrain outside TERRAIN_HOPS_FROM_SEA;
//   2. every generated province in the south is plains, the one measured terrain at home there;
//   3. CONTROL against over-filtering: the north still carries every measured terrain the palette declares, urban aside.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-no-invented-terrain-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
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

// ── a lattice of one-pixel provinces, 48 x 32, id = y * 48 + x + 1 (the lattice of test-a-generated-world-keeps-its-latitudes.js) ─
//   below   the two edge columns sea; rows 0-23 cycle the seven standard land terrains, so every one is at home there; rows 24-31
//           (the southernmost two latitude bands) are 75% nether_wastes and 25% plains.
//   mod     the same shapes, all sea (what Delete map leaves).
const W = 48, H = 32, SOUTH = 24;
const idAt = (x, y) => y * W + x + 1;
const colourOf = (id) => [id & 255, (id >> 8) & 255, 91];
const regionOf = (id) => { const i = id - 1; return Math.floor((i % W) / 12) + 4 * Math.floor(Math.floor(i / W) / 8) + 1; };
const seaBelow = (x) => x === 0 || x === W - 1;
const STANDARD = ["forest", "plains", "hills", "mountain", "desert", "marsh", "jungle"];
const terrainBelow = (x, y) => (seaBelow(x) ? "ocean" : y < SOUTH ? STANDARD[(x + y) % 7] : ((x + y) % 4 === 3 ? "plains" : "nether_wastes"));
// No urban: its rows are chosen per state, after this pass, and would only blur what the south is.
const TABLE = { plains: 0, forest: 1, hills: 2, desert: 3, mountain: 6, marsh: 9, jungle: 21, nether_wastes: 30, ocean: 15 };

const game = path.join(ROOT, "game");
{
  write(game, "hoi4.exe", "");
  write(game, "map/provinces.bmp", bmp24(W, H, (x, y) => colourOf(idAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const id = idAt(x, y), t = terrainBelow(x, y); rows.push(`${id};${colourOf(id).join(";")};${t === "ocean" ? "sea;false;ocean;0" : `land;false;${t};1`}`); }
  write(game, "map/definition.csv", rows.join("\n") + "\n");
  write(game, "map/heightmap.bmp", bmp8(W, H, (x) => (seaBelow(x) ? 89 : 106)));
  write(game, "map/terrain.bmp", bmp8(W, H, (x, y) => TABLE[terrainBelow(x, y)]));
  write(game, "common/terrain/00_terrain.txt", "categories = {\n"
    + Object.keys(TABLE).map((c) => `\t${c} = {${c === "ocean" ? " is_water = yes" : ""} color = { 100 120 140 } }`).join("\n")
    + "\n}\nterrain = {\n" + Object.entries(TABLE).map(([c, i]) => `\t${c}_g = { type = ${c} color = { ${i} } texture = 1 }`).join("\n") + "\n}\n");
}
const mod = path.join(ROOT, "mod");
{
  write(mod, "descriptor.mod", 'name="no invented terrain"\nreplace_path="history/states"\n');
  write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colourOf(idAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= W * H; id++) rows.push(`${id};${colourOf(id).join(";")};sea;false;ocean;0`);
  write(mod, "map/definition.csv", rows.join("\n") + "\n");
  write(mod, "map/heightmap.bmp", bmp8(W, H, () => 89));
  write(mod, "map/terrain.bmp", bmp8(W, H, () => TABLE.ocean));
  const byRegion = new Map();
  for (let id = 1; id <= W * H; id++) { const r = regionOf(id); if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r).push(id); }
  for (const [r, provs] of byRegion) write(mod, `map/strategicregions/r${r}.txt`, `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${provs.join(" ")} }\n\tweather={}\n}\n`);
  fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
}
const landRows = () => {
  const out = new Map();
  for (const line of fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
    const c = line.split(";");
    if (c.length >= 7 && /^\d+$/.test(c[0]) && c[0] !== "0" && c[4] === "land") out.set(+c[0], c[6]);
  }
  return out;
};
const rowOf = (id) => Math.floor((id - 1) / W);

// Derived from the source, not typed: the names the corpus tables measured, and what this mod's palette offers.
const MEASURED = Object.keys(md.TERRAIN_HOPS_FROM_SEA);
const palette = md.generatedTerrainPalette({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
ok(palette.includes("nether_wastes") && !MEASURED.includes("nether_wastes"), "the fixture: the mod's palette offers a land terrain the corpus tables never measured", palette);

// the call POST /api/map/generate-land passes through
const r = md.generateLand({ modRoot: mod, gameRoot: game, dependencyRoots: [], count: 1100, provincesPerState: 8, seed: 7 });
// #generate-land-fills-the-seas-it-cuts-off — the 1,100 asked for, and the seas the grown coast cut off, which became land with it
// #generate-land-leaves-no-sea-cut-off — …less the picks left sea to keep a sea it would have cut off open to the ocean
ok(r && r.changed && r.flippedProvinces === 1100 - ((r.inlandSeas || {}).leftSea || []).length + ((r.inlandSeas || {}).filled || 0), "Generate land raised 1,100 provinces", r && (r.error || r.flippedProvinces));
// #a-generated-terrain-follows-the-latitude-below — the latitude below chooses WITH the height now, under the pass's own floor, so the
// south is plains by the choice itself and the pass after it — the guard — finds nothing to move
ok(r && r.latitude && r.latitude.lifted === true && typeof r.latitude.moved === "number" && !r.latitude.error, "…and the latitude below took part in the choice, and the pass after it ran", r && r.latitude);
const rows = landRows();

console.log("\n-- ⭐ 1. no generated row carries a terrain the corpus tables never measured --");
{
  const invented = [...rows].filter(([, t]) => !MEASURED.includes(t));
  ok(invented.length === 0, "⭐⭐ not one generated province carries a terrain outside TERRAIN_HOPS_FROM_SEA", invented.slice(0, 10).map(([id, t]) => `${id}:${t}@row${rowOf(id)}`).concat([`total ${invented.length}`]));
}

console.log("\n-- ⭐ 2. the south is the one measured terrain at home there --");
{
  const south = [...rows].filter(([id]) => rowOf(id) >= SOUTH);
  ok(south.length > 100 && south.every(([, t]) => t === "plains"), "⭐ every generated province in the south is plains", { south: south.length, kinds: [...new Set(south.map(([, t]) => t))] });
}

console.log("\n-- 3. CONTROL: the filter takes out only what was never measured --");
{
  const want = palette.filter((t) => MEASURED.includes(t) && t !== "urban").sort();
  const north = [...new Set([...rows].filter(([id]) => rowOf(id) < SOUTH).map(([, t]) => t))].sort();
  ok(want.length === STANDARD.length && JSON.stringify(north) === JSON.stringify(want),
    "the north still carries every measured terrain the palette declares, urban aside — nothing standard was filtered out", { north, want });
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
