// ⛔ #a-land-province-leaves-the-seas-layout — LAND THE MAP BELOW NEVER LAID OUT AS LAND GETS ITS STAR AND ITS STATION PUT ON ITS TOWN.
//
// The owner played TEST 31 (09-30): stars standing beside their towns, and "train tracks … not connected correctly within some
// cities". HOI4 draws a victory point's star at map/unitstacks.txt's type 38, and the supply hub's icon, the rail node and the
// white rail arrow at type 0, the Standstill. Nova wrote neither: a world it builds keeps the rows of the map below, and for a
// province that was SEA below those are where a fleet is drawn — in Cacav the star stood 23 px west of the station. Measured on
// TEST 31: star to Standstill 7.56 px at the median, 397 of 1,081 over 10 px (vanilla 3.08, 76 of 1,500).
//
// unitPositionsNeverLaidOut finds two fingerprints in the mod's OWN unitstacks.txt, each a row still exactly the layer below's:
//   F-sea      land now, sea below, in a state the mod's own file defines, type 0 and type 38 the layer below's — whichever slot
//              the layer below's marker sat in — → type 0 onto the province's one supply_node row (else its town point), type 38
//              beside it
//   F-land-VP  a victory point of such a state on land that was land below and held no victory point there, type 38 still the
//              layer below's default slot, WHERE THAT MATTERS: the star off its province and the layout bringing it back on,
//              farther from its Standstill than nine in ten of the layer below's own default-slot stars, or off the ground its
//              city is drawn on and the layout putting it on that ground → type 38 only
// "Beside" is the layer below's own median (type 38 − type 0) over its victory point provinces, stepped back by quarters until
// it stands on the province. layOutUnitPositions rewrites x and z of those rows, sets y to the ground there, and nothing else —
// and a province whole, or not at all.
// ⛔ #a-new-province-has-its-unit-positions — …and F-sea now lays the province out WHOLE: TEST 34a's 1,475 raised provinces kept
// every slot but 0 and 38 at the sea's offset, 8–14 px off the land layout. Each slot still the layer below's goes where the layer
// below lays out its own LAND (its template, read back off its land rows here: the slots most of it carries, at their median offset
// from the Standstill, turned as their median, the last column the province's own size's); a row that is not the layer below's
// stays; and the Standstill and the star are one choice, moved only while BOTH are still the layer below's. So the checks below that
// once said "S is the modder's, nothing is named" now say "S's other slots are still the sea's: they are laid out round the
// Standstill the modder placed". The new provinces and the cut ones are test-a-new-province-has-its-unit-positions.js's.
//
// ⛔ #a-default-slot-star-is-the-layer-belows-own-habit (review of 12a2bab) — the base game leaves 891 of its own 1,500 victory
// point stars in the default slot, so "in the default slot" alone named the commonest edit there is, one victory point added to
// base-game land, and the fix moved the star 0.03 px. The seven shipping maps could not show it: not one still carries a base-game
// marker row in its default slot. So the controls here are the population the rule really meets: M, a new victory point laid out
// exactly as the layer below lays out its own, and a verbatim copy of the layer below's files with one victory point added.
//
// The fixture, a base game and mods over it (every expected number is read back off the fixture's own files and pixels):
//   S (2)  SEA below, land in the mod, a victory point in the mod's own state 52. Its sea-layout Standstill, its supply_node row
//          and its centroid pixel are pairwise 8 px or more apart, so a Standstill put on the wrong one is seen.
//   N (3)  land, NO victory point below, one in the mod's own state 50 — its marker in the layer below's default slot, FARTHER
//          from its Standstill than the layer below's own default-slot star stands.
//   V (4)  land WITH a victory point below, its marker in the default slot too: the control, never moved — and the one star the
//          layer below itself leaves there, so how far it stands is the reach.
//   K (7)  land, no victory point below, one in the mod: its default slot is a pixel and a half off its west edge, on the sea,
//          and its Standstill at that edge, so the full offset leaves it too.
//   M (8)  land, no victory point below, one in the mod: its default slot exactly as far from its Standstill as V's. Not named.
//   P, Q   the layer below's other victory points, in a state the mod inherits; the offset is the median over V, P and Q.
// Auto-fix is driven through POST /api/map/auto-fix { modPath } — exactly what the Map Errors button sends — on a server of
// this test's own, over the fixture game (HOI4_ROOT).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-seas-layout-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const game = path.join(ROOT, "game");
process.env.HOI4_ROOT = game;   // the endpoint asks the server where the game is; it has to be the fixture's

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
const sha = (f) => crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex");

// ── the world ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const W = 96, H = 48, SEA = 1, S = 2, N = 3, V = 4, P = 5, Q = 6, K = 7, M = 8;
const inBox = (x, y, x0, x1, y0, y1) => x >= x0 && x < x1 && y >= y0 && y < y1;
const provAt = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return -1;
  if (inBox(x, y, 4, 44, 4, 24)) return S;
  if (inBox(x, y, 48, 68, 4, 20)) return N;
  if (inBox(x, y, 48, 68, 20, 36)) return V;
  if (inBox(x, y, 48, 68, 36, 44)) return K;
  if (inBox(x, y, 72, 92, 4, 20)) return P;
  if (inBox(x, y, 72, 92, 20, 36)) return Q;
  if (inBox(x, y, 72, 92, 36, 44)) return M;
  return SEA;
};
const COLOUR = { 1: [10, 20, 200], 2: [200, 40, 40], 3: [40, 200, 40], 4: [40, 160, 90], 5: [160, 160, 40], 6: [160, 90, 160], 7: [90, 60, 30], 8: [30, 120, 160] };
const ALL = [SEA, S, N, V, P, Q, K, M], LAND_BELOW = [N, V, P, Q, K, M];
const zOf = (row) => H - 1 - row;                 // pixelYToBuildingZ, bottom-up
const rowOf = (z) => H - 1 - Math.floor(z);       // buildingZToPixelY
const provOfRow = (p, at = provAt) => at(Math.floor(p.x), rowOf(p.z));
// the ground: the base game's land, the sea at 89, and in the mod S raised out of it — a slope, so a row moved a few pixels
// stands at another height
const heightBelow = (x, y) => (LAND_BELOW.includes(provAt(x, y)) ? 100 + ((x + y) % 12) : 89);
const heightNow = (x, y) => (provAt(x, y) === S ? 106 + Math.floor(x / 4) : heightBelow(x, y));

// the layer below's unit positions. S is laid out as Paradox lays out a sea: its marker (38) on its default slot (9), a fleet's
// length west of the Standstill. N, V, K and M are laid out as most of its land is, the marker on the default slot; P and Q carry
// a victory point's hand-placed marker.
const POS = {
  [SEA]: { 0: { x: 2, z: 46 }, slot: { x: 2, z: 46 }, 38: { x: 2, z: 46 } },
  [S]: { 0: { x: 30, z: 30 }, slot: { x: 19, z: 30 }, 38: { x: 19, z: 30 } },
  [N]: { 0: { x: 57.5, z: 36.5 }, slot: { x: 52, z: 36.5 }, 38: { x: 52, z: 36.5 } },
  [V]: { 0: { x: 57.5, z: 20.5 }, slot: { x: 54, z: 21.2 }, 38: { x: 54, z: 21.2 } },
  [K]: { 0: { x: 48.6, z: 8.4 }, slot: { x: 46.6, z: 8.4 }, 38: { x: 46.6, z: 8.4 } },
  [M]: { 0: { x: 81.5, z: 7.5 }, slot: { x: 78, z: 8.2 }, 38: { x: 78, z: 8.2 } },
  [P]: { 0: { x: 81.5, z: 36.5 }, slot: { x: 78, z: 36.5 }, 38: { x: 79.3, z: 36.9 } },
  [Q]: { 0: { x: 81.5, z: 20.5 }, slot: { x: 78, z: 20.5 }, 38: { x: 80.5, z: 20.6 } },
};
const SEA_TYPES = [0, 1, 2, 9, 10, 11, 12, 21, 22, 23, 30, 31, 38], SEA_ONLY = new Set([11, 12, 30, 31]), LAND_TYPES = [0, 1, 9, 38];
const posOf = (pid, type, over = {}) => (over[pid + ";" + type] || (type === 0 ? POS[pid][0] : type === 38 ? POS[pid][38] : POS[pid].slot));
const md = require("./map-data.js");
/** map/unitstacks.txt, as rows. `heightAt`: the ground each row's y is read off; `over`: "pid;type" → { x, z } a modder nudged;
 *  `dropSeaOnly`: provinces whose sea-only slots are gone (what Auto-fix's unit-stack repair leaves of a sea turned to land). */
function unitstacks({ heightAt = heightBelow, over = {}, dropSeaOnly = [] } = {}) {
  const rows = [];
  for (const pid of ALL) {
    for (const t of (pid === SEA || pid === S ? SEA_TYPES : LAND_TYPES)) {
      if (dropSeaOnly.includes(pid) && SEA_ONLY.has(t)) continue;
      const p = posOf(pid, t, over);
      rows.push(`${pid};${t};${p.x.toFixed(2)};${md.modelYForHeight(heightAt(Math.floor(p.x), rowOf(p.z))).toFixed(2)};${p.z.toFixed(2)};${t === 0 ? "0.00" : "1.57"};0.24`);
    }
  }
  return rows;
}
const S_HUB = { x: 12, z: 36 };   // S's supply_node row in the mod's buildings.txt
const S_AIR = { x: 20, z: 40 };   // …and its air base, on S too: a building that is not the hub, so a row of any type taken for it is seen
const buildingRows = ({ sHub = [S_HUB] } = {}) => [
  `50;air_base;58.00;10.40;30.00;0.00;0`, `50;rocket_site_spawn;59.00;10.40;30.00;0.00;0`,
  `51;air_base;82.00;10.40;30.00;0.00;0`, `51;rocket_site_spawn;83.00;10.40;30.00;0.00;0`,
  ...[N, V, K, M].map((p) => `50;supply_node;${POS[p][0].x.toFixed(2)};10.40;${POS[p][0].z.toFixed(2)};0.00;0`),
  ...[P, Q].map((p) => `51;supply_node;${POS[p][0].x.toFixed(2)};10.40;${POS[p][0].z.toFixed(2)};0.00;0`),
  ...sHub.map((h) => `52;supply_node;${h.x.toFixed(2)};11.00;${h.z.toFixed(2)};0.00;0`),
  ...(sHub.length ? [`52;air_base;${S_AIR.x.toFixed(2)};11.00;${S_AIR.z.toFixed(2)};0.00;0`] : []),
];
const definition = (landIds) => ["0;0;0;0;land;false;unknown;0"].concat(ALL.map((id) =>
  `${id};${COLOUR[id].join(";")};${landIds.includes(id) ? "land;true;plains;1" : "sea;false;ocean;0"}`)).join("\n") + "\n";
const stateTxt = (id, provs, vps, owner = "AAA") => `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower=10000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=${owner}\n` +
  vps.map(([p, v]) => `\t\tvictory_points = { ${p} ${v} }\n`).join("") + "\t}\n}\n";
const WEATHER = "\tweather={\n\t\tperiod={\n\t\t\tbetween={ 0.0 364.0 }\n\t\t\ttemperature={ -5.0 25.0 }\n\t\t\tno_phenomenon=0.700\n\t\t}\n\t}\n";
const region = (id, provs, sea) => `strategic_region={\n\tid=${id}\n\tname="REGION_${id}"\n\tprovinces={ ${provs.join(" ")} }\n${sea ? "\tnaval_terrain = water_deep_ocean\n" : ""}${WEATHER}}\n`;
const STATE_50 = [N, V, K, M];   // the state the mod redefines; 51 (P, Q) it inherits; 52 is S's

// the ground a city is drawn on: the terrain.bmp index the terrain files mark spawn_city (13 here, as vanilla's)
const SPAWN = 13, FOREST = 1, PLAINS = 0, OCEAN = 15;
const TERRAIN_TXT = ["categories = {", "  plains = { color = { 200 200 100 } }", "  forest = { color = { 0 120 0 } }", "  urban = { color = { 120 110 100 } }",
  "  ocean = { color = { 0 0 200 } is_water = yes }", "}", "terrain = {", "  plains = { type = plains color = { 0 } }", "  forest = { type = forest color = { 1 } }",
  "  terrain_city = { type = urban color = { 13 } spawn_city = yes }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n");

/** o.vps: false for a layer below whose states hold no victory point; o.land: the provinces typed land; o.stacks: its unitstacks rows;
 *  o.terrain: (x, y) → terrain.bmp index, a terrain.bmp and the terrain file that reads it (neither, left out) */
function makeGame(tag, o = {}) {
  const g = path.join(ROOT, tag), vps = o.vps !== false;
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => COLOUR[provAt(x, y)]));
  write(g, "map/definition.csv", definition(o.land || LAND_BELOW));
  write(g, "map/heightmap.bmp", bmp8(W, H, heightBelow));
  write(g, "map/unitstacks.txt", (o.stacks || unitstacks()).join("\n") + "\n");
  if (o.terrain) { write(g, "map/terrain.bmp", bmp8(W, H, o.terrain)); write(g, "common/terrain/00_terrain.txt", TERRAIN_TXT); }
  write(g, "map/buildings.txt", buildingRows({ sHub: [] }).join("\n") + "\n");
  write(g, "map/default.map", 'definitions = "definition.csv"\nprovinces = "provinces.bmp"\n');
  write(g, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  write(g, "map/continent.txt", "continents = {\n\tfixture\n}\n");
  write(g, "map/supply_nodes.txt", `1 ${V}\n`);
  write(g, "map/railways.txt", "");
  write(g, "map/strategicregions/1-Land.txt", region(1, LAND_BELOW, false));
  write(g, "map/strategicregions/2-Sea.txt", region(2, [SEA, S], true));
  write(g, "history/states/50-A.txt", stateTxt(50, STATE_50, vps ? [[V, 10]] : []));
  write(g, "history/states/51-B.txt", stateTxt(51, [P, Q], vps ? [[P, 5], [Q, 5]] : []));
  write(g, "history/states/52-S.txt", stateTxt(52, [S], []));
  write(g, "history/countries/AAA - A.txt", "capital = 50\n");
  return g;
}
makeGame("game");

const MOD_VPS = [[N, 5], [V, 10], [K, 1], [M, 2]];   // the mod's state 50: V's is the layer below's, the other three are new
/** A mod over the layer below that raised S out of the sea and put a victory point on S, N, K and M.
 *  o.stacks: its own map/unitstacks.txt as rows (null: it owns none); o.eol / o.prefix / o.noFinalNewline: how that file is written;
 *  o.buildings: its buildings.txt rows; o.ownS: false leaves state 52 to the layer below; o.descriptor: extra descriptor lines;
 *  o.land: the provinces its definition.csv types land (the layer below's and S, left out); o.state50 / o.state52: { provs, vps }
 *  of those two files (as above, left out); o.bmp: (x, y) → province, a provinces.bmp of its own (none, left out); o.terrain:
 *  (x, y) → terrain.bmp index, a terrain.bmp of its own (none, left out). */
function makeMod(tag, o = {}) {
  const m = path.join(ROOT, tag), eol = o.eol || "\n";
  const s50 = o.state50 || { provs: STATE_50, vps: MOD_VPS }, s52 = o.state52 || { provs: [S], vps: [[S, 3]] };
  write(m, "descriptor.mod", `name="${tag}"\nsupported_version="1.19.*"\n${o.descriptor || ""}`);
  write(m, "map/definition.csv", definition(o.land || LAND_BELOW.concat([S])));
  write(m, "map/heightmap.bmp", bmp8(W, H, heightNow));
  if (o.bmp) write(m, "map/provinces.bmp", bmp24(W, H, (x, y) => COLOUR[o.bmp(x, y)]));
  if (o.terrain) write(m, "map/terrain.bmp", bmp8(W, H, o.terrain));
  write(m, "map/buildings.txt", (o.buildings || buildingRows()).join("\n") + "\n");
  write(m, "map/strategicregions/1-Land.txt", region(1, [S].concat(LAND_BELOW), false));
  write(m, "map/strategicregions/2-Sea.txt", region(2, [SEA], true));
  write(m, "history/states/50-A.txt", stateTxt(50, s50.provs, s50.vps));
  if (o.ownS !== false) write(m, "history/states/52-S.txt", stateTxt(52, s52.provs, s52.vps));
  if (o.stacks !== null) {
    const rows = o.stacks || unitstacks({ heightAt: heightNow, dropSeaOnly: [S] });
    write(m, "map/unitstacks.txt", Buffer.from((o.prefix || "") + rows.join(eol) + (o.noFinalNewline ? "" : eol), "latin1"));
  }
  return m;
}
const BOM = "\xEF\xBB\xBF";   // a UTF-8 byte order mark, as the three Latin-1 letters it is when the file is read a byte a character
const unBom = (s) => (s.startsWith(BOM) ? s.slice(BOM.length) : s);
const stacksFile = (m) => path.join(m, "map", "unitstacks.txt");
const readRows = (file) => fs.readFileSync(file, "latin1").split("\n").map((l) => unBom(l.replace(/\r$/, "")).split(";")).filter((c) => c.length >= 7 && /^\d+$/.test(c[0].trim()));
const rowAt = (file, pid, type) => { const c = readRows(file).find((r) => +r[0] === pid && +r[1] === type); return c ? { x: +c[2], y: c[3], z: +c[4], line: c.join(";") } : null; };

// ── what the fixture says, derived from its own files and pixels ───────────────────────────────────────────────────────
const { isFatalRule, mapRuleLabel, mapRuleFixHint, LABELS, FIX_HINTS } = require("./public/map-rule-labels.js");
const RULE = "unit_positions_never_laid_out_for_land";
const G = (mod, g = game, deps = []) => ({ modRoot: mod, gameRoot: g, dependencyRoots: deps });
// on older code the finder and the writer do not exist: every check below still runs, and says so
const find = (g) => (typeof md.unitPositionsNeverLaidOut === "function" ? md.unitPositionsNeverLaidOut(g) : { total: 0, provinces: [], reason: "there is no unitPositionsNeverLaidOut" });
const layOut = (g) => (typeof md.layOutUnitPositions === "function" ? md.layOutUnitPositions(g) : { changed: false, error: "there is no layOutUnitPositions" });
const beneath = (g) => (typeof md.unitLayoutBeneath === "function" ? md.unitLayoutBeneath(g) : null);
const namedIn = (g) => (find(g).provinces || []).map((e) => e.province);
const r2 = (v) => Math.round(v * 100) / 100;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const same = (a, b) => !!a && !!b && Math.abs(a.x - b.x) < 0.005 && Math.abs(a.z - b.z) < 0.005;
const lowerMedian = (v) => { const s = v.slice().sort((a, b) => a - b); return r2(s[Math.floor((s.length - 1) / 2)]); };
/** nine in ten: the nearest-rank ninth decile (the rule, written again here) */
const ninth = (v) => { const s = v.slice().sort((a, b) => a - b); return r2(s[Math.floor((s.length - 1) * 0.9)]); };
const below = (g, p, type) => rowAt(path.join(g, "map", "unitstacks.txt"), p, type);
/** the median (type 38 − type 0) of a layer below over `ids`, read back off its unitstacks.txt */
const offsetOver = (g, ids) => {
  const d = ids.map((p) => ({ a: below(g, p, 0), b: below(g, p, 38) })).filter((r) => r.a && r.b);
  return { dx: lowerMedian(d.map((r) => r.b.x - r.a.x)), dz: lowerMedian(d.map((r) => r.b.z - r.a.z)) };
};
/** how far the star stands from the Standstill in a layer below, for nine in ten of `ids`, read back off its unitstacks.txt */
const reachOver = (g, ids) => ninth(ids.map((p) => ({ a: below(g, p, 0), b: below(g, p, 38) })).filter((r) => r.a && r.b).map((r) => dist(r.a, r.b)));
/** the provinces the layer below's state files give a victory point */
const vpsBelow = (g) => {
  const out = [];
  for (const f of fs.readdirSync(path.join(g, "history", "states"))) for (const m of fs.readFileSync(path.join(g, "history", "states", f), "utf8").matchAll(/victory_points\s*=\s*\{\s*(\d+)\s+(\d+)/g)) out.push(+m[1]);
  return out.sort((a, b) => a - b);
};
/** …and those of them whose star the layer below left in the default slot (its 38 on its 9) */
const slotVpsBelow = (g) => vpsBelow(g).filter((p) => same(below(g, p, 38), below(g, p, 9)));
const OFF = offsetOver(game, vpsBelow(game)), REACH = reachOver(game, slotVpsBelow(game));
/** the star beside a Standstill: the offset, stepped back by quarters until it stands on the province (the rule, written again here) */
const starBeside = (pid, t0, off = OFF, at = provAt) => {
  for (const k of [1, 0.75, 0.5, 0.25]) { const q = { x: r2(t0.x + off.dx * k), z: r2(t0.z + off.dz * k) }; if (provOfRow(q, at) === pid) return { ...q, step: k }; }
  return { x: t0.x, z: t0.z, step: 0 };
};
const pixelsOf = (pid) => { const out = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (provAt(x, y) === pid) out.push({ x, y }); return out; };
const full3x3 = (px, row, pid) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (provAt(px + dx, row + dy) !== pid) return false; return true; };
/** the province's own pixel nearest its centroid whose 3x3 is all of it, first in the raster on a tie — its town point with no Standstill to take */
const ownCentrePixel = (pid) => {
  const px = pixelsOf(pid), c = { x: px.reduce((a, p) => a + p.x, 0) / px.length, y: px.reduce((a, p) => a + p.y, 0) / px.length };
  let best = null, d = Infinity;
  for (const p of px) { if (!full3x3(p.x, p.y, pid)) continue; const e = (p.x - c.x) ** 2 + (p.y - c.y) ** 2; if (e < d) { d = e; best = p; } }
  return { x: best.x, z: zOf(best.y) };
};
const yAt = (p) => md.modelYForHeight(heightNow(Math.floor(p.x), rowOf(p.z))).toFixed(2);
/** the file as it must read afterwards: `moves` ("pid;type" → { x, z, rot?, last? }) applied to columns 3 to 5 of those rows (and
 *  6 and 7 where given), every other byte kept */
const expectedBytes = (before, moves) => Buffer.from(before.toString("latin1").split("\n").map((raw) => {
  const cr = raw.endsWith("\r") ? "\r" : "", c = (cr ? raw.slice(0, -1) : raw).split(";");
  const mv = c.length >= 7 ? moves.get(parseInt(unBom(c[0]), 10) + ";" + parseInt(c[1], 10)) : null;
  if (!mv) return raw;
  c[2] = mv.x.toFixed(2); c[3] = yAt(mv); c[4] = mv.z.toFixed(2);
  if (mv.rot != null) c[5] = mv.rot;
  if (mv.last != null) c[6] = mv.last;
  return c.join(";") + cr;
}).join("\n"), "latin1");
/** ⛔ #a-new-province-has-its-unit-positions — how the layer below lays out its LAND, read back off its own rows (the rule, written
 *  again here; the fixture's land below is all coastal, as S is): the slots at least half of its land provinces carry, each at the
 *  lower median of its offset from the Standstill, turned as the lower median of its rotation; and the last column, the lower median
 *  of last ÷ √(pixels) over that land, for a province of `px` pixels */
const landTemplate = (g) => {
  const rows = readRows(path.join(g, "map", "unitstacks.txt")).filter((c) => LAND_BELOW.includes(+c[0]));
  const at = new Map(), k = [];
  for (const p of LAND_BELOW) {
    const mine = rows.filter((c) => +c[0] === p), t0 = mine.find((c) => +c[1] === 0);
    if (!t0) continue;
    k.push(+t0[6] / Math.sqrt(pixelsOf(p).length));
    for (const c of mine) {
      if (!at.has(+c[1])) at.set(+c[1], { n: 0, dx: [], dz: [], rot: [] });
      const e = at.get(+c[1]); e.n++; e.dx.push(+c[2] - +t0[2]); e.dz.push(+c[4] - +t0[4]); e.rot.push(+c[5]);
    }
  }
  const n = LAND_BELOW.length, kk = k.sort((a, b) => a - b)[Math.floor((k.length - 1) / 2)];
  const types = [...at].filter(([, e]) => e.n * 2 >= n).map(([t]) => t).sort((a, b) => a - b);
  return { types, off: (t) => ({ dx: lowerMedian(at.get(t).dx), dz: lowerMedian(at.get(t).dz) }), rot: (t) => lowerMedian(at.get(t).rot).toFixed(2),
    last: (px) => Math.max(0.02, Math.round(kk * Math.sqrt(px) * 50) / 50).toFixed(2) };
};
const TPL = landTemplate(game);
/** the slots the land layout lays out round a Standstill besides 0 and 38: the template's own, each stepped back onto the province */
const LAID = TPL.types.filter((t) => t !== 0 && t !== 38);
const landPlace = (pid, t0, t) => starBeside(pid, t0, TPL.off(t));
const S_LAST = TPL.last(pixelsOf(S).length);

const S_TOWN = ownCentrePixel(S);
const WANT = {
  S0: S_HUB, S38: starBeside(S, S_HUB), N38: starBeside(N, POS[N][0]), K38: starBeside(K, POS[K][0]), V38: starBeside(V, POS[V][0]), M38: starBeside(M, POS[M][0]),
};
// S laid out as land: its Standstill, its star and every other slot of the template, each turned as the layer below turns its land's
// and given the last column of S's own size; N's and K's stars only move
const sLaid = (t0, types) => types.map((t) => [`${S};${t}`, { ...(t === 0 ? t0 : t === 38 ? starBeside(S, t0) : landPlace(S, t0, t)), rot: TPL.rot(t), last: S_LAST }]);
const MOVES = new Map([...sLaid(WANT.S0, [0, 38, ...LAID]), [`${N};38`, WANT.N38], [`${K};38`, WANT.K38]]);
const FAR = "far from its station", OFF_IT = "off its province", OFF_CITY = "off its city";

const { createApp } = require("./server.js");
const server = createApp().listen(0, async () => {
  const PORT = server.address().port;
  // exactly what public/map.js sends: the Map Errors popup GETs /api/map/validate?modPath=… and its Auto-fix button POSTs { modPath }
  const validate = (mod) => fetch(`http://127.0.0.1:${PORT}/api/map/validate?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
  const autoFix = (mod) => fetch(`http://127.0.0.1:${PORT}/api/map/auto-fix`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modPath: mod }) }).then((r) => r.json());
  const ruleIn = (v) => ((v && v.problems) || []).filter((p) => p.rule === RULE);
  try {
    console.log("\n-- the fixture can tell right from wrong --");
    ok(dist(POS[S][0], S_HUB) >= 8 && dist(POS[S][0], S_TOWN) >= 8 && dist(S_HUB, S_TOWN) >= 8, "S's sea-layout Standstill, its supply_node row and its centroid pixel are pairwise at least 8 px apart", { sea: POS[S][0], S_HUB, S_TOWN });
    ok(provOfRow(POS[S][0]) === S && provOfRow(POS[S][38]) === S && provOfRow(S_HUB) === S, "…all three, and the sea layout's marker, on S itself");
    ok(same(POS[S][38], POS[S].slot) && dist(POS[S][38], POS[S][0]) >= 8, "S below is laid out as a sea: its marker on its default slot, a fleet's length from its Standstill");
    const offVp = offsetOver(game, vpsBelow(game)), offLand = offsetOver(game, LAND_BELOW);
    ok(JSON.stringify(vpsBelow(game)) === JSON.stringify([V, P, Q]) && (offVp.dx !== 0 || offVp.dz !== 0) && offVp.dz !== 0, "the layer below holds three victory points, and its star stands off its Standstill on both axes", { vps: vpsBelow(game), offVp });
    ok(offVp.dx !== offLand.dx && offVp.dz !== offLand.dz, "…by another distance than its land's default slot does, so an offset taken from the wrong provinces is seen", { offVp, offLand });
    ok(WANT.N38.step === 1 && !same(WANT.N38, POS[N][38]) && !same(WANT.V38, POS[V][38]) && same(POS[V][38], POS[V].slot), "N's and V's markers are on the default slot, and not where the offset would put them: V would move if it were judged", { N: WANT.N38, V: WANT.V38 });
    ok(WANT.K38.step === 0.25 && provOfRow({ x: POS[K][0].x + OFF.dx, z: POS[K][0].z + OFF.dz }) !== K && !same(WANT.K38, POS[K][38]), "K's full offset leaves K: its star is stepped back three quarters of the way", WANT.K38);
    ok(yAt(WANT.S0) !== yAt(POS[S][0]) && yAt(WANT.S38) !== yAt(POS[S][38]), "the ground under S's new places is at another height than under its old ones", { was: [yAt(POS[S][0]), yAt(POS[S][38])], now: [yAt(WANT.S0), yAt(WANT.S38)] });
    // ⛔ #a-default-slot-star-is-the-layer-belows-own-habit — what tells N, K and M apart is only how their default slot stands
    const gap = (p) => dist(POS[p][38], POS[p][0]);
    ok(JSON.stringify(slotVpsBelow(game)) === JSON.stringify([V]) && REACH === r2(gap(V)) && REACH > Math.hypot(OFF.dx, OFF.dz), "of the layer below's three victory points one, V, has its star in the default slot: how far it stands from its Standstill is the reach, and farther than the offset", { REACH, OFF });
    ok([N, K, M].every((p) => same(POS[p][38], POS[p].slot) && !vpsBelow(game).includes(p)), "N, K and M hold no victory point below, and their markers stand in the default slot");
    ok(gap(N) > REACH + 1 && provOfRow(POS[N][38]) === N, "N's stands on N, farther from its Standstill than the reach", { gap: gap(N), REACH });
    ok(Math.abs(gap(M) - gap(V)) < 0.005 && provOfRow(POS[M][38]) === M && dist(WANT.M38, POS[M][38]) >= 1 && WANT.M38.step === 1,
      "M's stands on M exactly as far from its Standstill as V's does — and a pixel or more from where the layout would put it, so it is not left for want of a move", { gap: gap(M), move: dist(WANT.M38, POS[M][38]) });
    ok(gap(K) < REACH - 1 && provOfRow(POS[K][38]) !== K && provOfRow(POS[K][0]) === K && provOfRow(WANT.K38) === K && dist(WANT.K38, POS[K][38]) >= 1, "K's stands within the reach but off K, on the sea; its Standstill, and the place the layout gives its star, on K, over a pixel away", { gap: gap(K), at: provOfRow(POS[K][38]), move: dist(WANT.K38, POS[K][38]) });
    // ⛔ #a-new-province-has-its-unit-positions — S's other slots: the land layout puts them elsewhere than the sea's rows of them stand
    ok(LAID.length > 0 && LAID.every((t) => SEA_TYPES.includes(t) && !same(landPlace(S, S_HUB, t), POS[S].slot) && provOfRow(landPlace(S, S_HUB, t)) === S) && S_LAST !== "0.24",
      "(the fixture: the layer below's land carries slots besides 0 and 38, S's sea rows of them stand elsewhere than the land layout's place on S, and S's size gives it another last column than the rows have)", { LAID, S_LAST });

    console.log("\n-- how the layer below lays a victory point out, read off its own rows --");
    {
      const lb = beneath(G(makeMod("probe-offset")));
      ok(lb && lb.offset && lb.offset.dx === OFF.dx && lb.offset.dz === OFF.dz && lb.offset.from === "victory points" && lb.offset.n === 3, "⭐ the offset is the median over the layer below's victory point provinces, both axes", lb && lb.offset);
      ok(lb && lb.reach && lb.reach.px === REACH && lb.reach.from === "default slot" && lb.reach.n === 1, "⭐ the reach is how far its victory point stars in the default slot stand from their Standstill", lb && lb.reach);
      // a layer below with no victory point: the default slot of its land
      const gNoVp = makeGame("game-no-vp", { vps: false }), lNo = beneath(G(makeMod("probe-no-vp"), gNoVp));
      const wantLand = offsetOver(gNoVp, LAND_BELOW);
      ok(lNo && lNo.offset.dx === wantLand.dx && lNo.offset.dz === wantLand.dz && lNo.offset.from === "land" && lNo.victoryPoints.size === 0, "…with no victory point below, the median over its land provinces — their default slot", { got: lNo && lNo.offset, wantLand });
      ok(lNo && lNo.reach && lNo.reach.px === reachOver(gNoVp, LAND_BELOW) && lNo.reach.from === "land" && lNo.reach.n === LAND_BELOW.length, "…and the reach over its land provinces", { got: lNo && lNo.reach, want: reachOver(gNoVp, LAND_BELOW) });
      // …and one with no land at all
      const gSea = makeGame("game-no-land", { land: [], vps: false }), lSea = beneath(G(makeMod("probe-no-land"), gSea));
      ok(lSea && lSea.offset.dx === 0 && lSea.offset.dz === 0 && lSea.offset.from === "nothing", "…and with no land row below, none: the star on the Standstill", lSea && lSea.offset);
      ok(lSea && lSea.reach && lSea.reach.px === 0 && lSea.reach.from === "nothing", "…and no reach", lSea && lSea.reach);
      // a layer below that placed every one of its stars by hand: V's marker off its default slot too
      const V9 = { [`${V};9`]: { x: 60, z: 25 } };
      const gHandAll = makeGame("game-every-star-by-hand", { stacks: unitstacks({ over: V9 }) }), lHand = beneath(G(makeMod("probe-every-star-by-hand"), gHandAll));
      ok(slotVpsBelow(gHandAll).length === 0 && lHand && lHand.reach && lHand.reach.px === reachOver(gHandAll, vpsBelow(gHandAll)) && lHand.reach.from === "victory points" && lHand.reach.n === 3 && lHand.reach.px !== REACH,
        "…with no victory point star in the default slot below, the reach is that of all its victory point stars", { got: lHand && lHand.reach, want: reachOver(gHandAll, vpsBelow(gHandAll)) });
    }
    {
      // nine in ten, and of which provinces: a layer below of its own, read only through its unitstacks.txt, definition.csv and states.
      // 1–12: land victory points, the star in the default slot i px from the Standstill. 13, 14: land victory points placed by hand,
      // far off. 15: land with no victory point, its default slot farther still. 16: a sea province the states give a victory point.
      const rows = [], defs = ["0;0;0;0;land;false;unknown;0"], vps = [];
      const lay = (id, gapPx, o = {}) => {
        const s0 = { x: 100 * id, z: 50 }, star = { x: s0.x - gapPx, z: 50 }, slot = o.byHand ? { x: s0.x + 1, z: 51 } : star;
        for (const [t, p] of [[0, s0], [9, slot], [38, star]]) rows.push(`${id};${t};${p.x.toFixed(2)};9.50;${p.z.toFixed(2)};0.00;0.24`);
        defs.push(`${id};${id};${id};${id};${o.sea ? "sea;false;ocean;0" : "land;false;plains;1"}`);
        if (o.vp !== false) vps.push([id, 1]);
      };
      for (let i = 1; i <= 12; i++) lay(i, i);
      lay(13, 20, { byHand: true }); lay(14, 30, { byHand: true }); lay(15, 40, { vp: false }); lay(16, 50, { sea: true });
      const gMany = path.join(ROOT, "game-many");
      write(gMany, "hoi4.exe", ""); write(gMany, "map/unitstacks.txt", rows.join("\n") + "\n"); write(gMany, "map/definition.csv", defs.join("\n") + "\n");
      write(gMany, "history/states/1-All.txt", stateTxt(1, vps.map(([p]) => p).concat([15]), vps));
      const over = path.join(ROOT, "probe-many"); write(over, "descriptor.mod", 'name="probe-many"\n');
      const lb = beneath(G(over, gMany)), onSlot = Array.from({ length: 12 }, (_, i) => i + 1);
      const want = ninth(onSlot);
      ok(want !== Math.max(...onSlot) && want !== lowerMedian(onSlot) && want !== ninth(onSlot.concat([20, 30])) && want !== ninth(onSlot.concat([50])) && want !== ninth(onSlot.concat([40])),
        "(the fixture: nine in ten of the twelve default-slot stars is neither their farthest nor their median, nor what the hand-placed, the sea's or the plain land's rows would make it)", want);
      ok(lb && lb.reach && lb.reach.px === want && lb.reach.n === 12 && lb.reach.from === "default slot", "⭐⭐ the reach is the distance nine in ten of the layer below's default-slot victory point stars on LAND stand within", lb && lb.reach);
    }

    console.log("\n-- the states below, merged as the game merges them --");
    {
      // a dependency between the base game and the mod. Its 51-B.txt REDEFINES state 51 (the same file name: its block is the one
      // that loads). Its 50-A.txt, the same name too, holds another id — so the base game's state 50 does not load at all.
      const dep = path.join(ROOT, "dep"), over = path.join(ROOT, "mod-over-dep");
      write(dep, "descriptor.mod", 'name="dep"\nsupported_version="1.19.*"\n');
      write(dep, "history/states/50-A.txt", stateTxt(60, [N, V], [[N, 7]], "BBB"));
      write(dep, "history/states/51-B.txt", stateTxt(51, [P, Q], [[P, 5]], "BBB"));
      write(over, "descriptor.mod", 'name="mod-over-dep"\nsupported_version="1.19.*"\n');
      const g = G(over, game, [dep]), facts = md.provinceFactsBeneath(g), lb = beneath(g), vps = lb ? [...lb.victoryPoints].sort((a, b) => a - b) : null;
      const f = (p) => facts.get(p) || {};
      ok(f(P).owner === "BBB" && f(Q).owner === "BBB" && f(P).stateId === 51, "⭐ a state the dependency redefines is the dependency's: P and Q are BBB's below the mod", { P: f(P), Q: f(Q) });
      ok(f(N).stateId === 60 && f(V).stateId === 60 && !facts.has(K) && !facts.has(M), "⭐ the base game's state 50, its file replaced by one holding another id, does not load: N and V are state 60's, K and M in no state", { N: f(N), K: facts.get(K) });
      ok(JSON.stringify(vps) === JSON.stringify([N, P]), "⭐⭐ …so the victory points below are N's and P's: not V's, in the file that was replaced, nor Q's, in the block that lost", vps);
    }

    console.log("\n-- ⭐ the finder, asked directly --");
    const main = makeMod("mod");
    {
      const f = find(G(main)), by = new Map((f.provinces || []).map((e) => [e.province, e]));
      ok(f.total === 3 && f.exSea === 1 && f.victoryPoints === 2 && JSON.stringify([...by.keys()]) === JSON.stringify([S, N, K]), "it names S (sea below), N and K (a new victory point on land) — and nothing else", { total: f.total, reason: f.reason, ids: [...by.keys()] });
      const s = by.get(S) || {}, n = by.get(N) || {}, k = by.get(K) || {};
      ok(s.kind === "sea" && s.state === 52 && s.standstill && s.standstill.by === "supply_node" && same(s.standstill.to, S_HUB) && same(s.standstill.from, POS[S][0]), "⭐⭐ S: its Standstill goes onto its one supply_node row", s.standstill);
      ok(s.marker && same(s.marker.to, WANT.S38) && s.marker.step === 1, "⭐⭐ S: its marker goes beside that row, by the layer below's own offset", { got: s.marker, want: WANT.S38 });
      ok(n.kind === "vp" && n.why === FAR && !n.standstill && n.marker && same(n.marker.to, WANT.N38) && same(n.marker.from, POS[N][38]), "⭐⭐ N, its star beyond the reach: its marker goes beside its Standstill; its Standstill, Paradox's land layout, is not named", n);
      ok(k.kind === "vp" && k.why === OFF_IT && k.marker && same(k.marker.to, WANT.K38) && k.marker.step === WANT.K38.step && provOfRow(k.marker.to) === K, "⭐ K, its star off K: it is stepped back onto K", { got: k, want: WANT.K38 });
      ok(!by.has(M) && f.reach && f.reach.px === REACH, "⭐⭐⭐ M, its star in the default slot as far from its Standstill as the layer below's own V's, is not named — though the layout would put it elsewhere", { M: by.get(M), reach: f.reach });
      ok(!by.has(V), "⭐⭐ (c) V already held a victory point below: its marker, on the same default slot, is Paradox's and is not named");
      ok(!by.has(P) && !by.has(Q), "…nor P or Q, in a state the mod inherits");
    }
    {
      // a province with no supply_node row of its own, or with two, takes its town point
      for (const [tag, sHub] of [["mod-no-hub-row", []], ["mod-two-hub-rows", [S_HUB, { x: 36, z: 40 }]]]) {
        const e = (find(G(makeMod(tag, { buildings: buildingRows({ sHub }) }))).provinces || []).find((x) => x.province === S) || {};
        ok(sHub.every((h) => provOfRow(h) === S) && e.standstill && e.standstill.by === "town point" && same(e.standstill.to, S_TOWN),
          `⭐ with ${sHub.length} supply_node rows on S its Standstill goes onto S's town point, its own centroid pixel`, { got: e.standstill, want: S_TOWN });
      }
      // S in a state the mod does not define: the layer below's town, not the mod's to move
      const ids = namedIn(G(makeMod("mod-inherits-the-state", { ownS: false })));
      ok(JSON.stringify(ids) === JSON.stringify([N, K]), "⭐⭐ S in a state whose file is the layer below's is not named; N and K, in the mod's own state, still are", ids);
      // a mod that replaces map/ has no layer below
      const fr = find(G(makeMod("mod-replaces-map", { descriptor: 'replace_path="map"\n' })));
      ok(fr.total === 0 && /no layer below/.test(fr.reason || ""), "a mod that replaces map/ has no layer below to have laid anything out: nothing is named", { total: fr.total, reason: fr.reason });
    }
    {
      // a victory point a state lists for a province it does not hold is no star of that state's: N handed to state 52, its
      // victory point left behind in state 50's file
      const ids = namedIn(G(makeMod("mod-vp-of-another-state", { state50: { provs: STATE_50.filter((p) => p !== N), vps: MOD_VPS }, state52: { provs: [S, N], vps: [[S, 3]] } })));
      ok(MOD_VPS.some(([p]) => p === N) && JSON.stringify(ids) === JSON.stringify([S, K]), "⭐ a victory point the state's file lists for a province another state holds is not named: S and K only", ids);
      // …and one worth nothing draws no star
      const ids0 = namedIn(G(makeMod("mod-vp-worth-nothing", { state50: { provs: STATE_50, vps: MOD_VPS.map(([p, v]) => [p, p === N ? 0 : v]) } })));
      ok(JSON.stringify(ids0) === JSON.stringify([S, K]), "⭐ a victory point worth 0 is not named: S and K only", ids0);
    }
    {
      // the province a place stands on is the one the mod's OWN provinces.bmp paints there: three pixels of N handed to V, right
      // where the full offset (and three quarters of it) puts N's star
      const paint = (x, y) => (x === Math.floor(WANT.N38.x) && Math.abs(y - rowOf(WANT.N38.z)) <= 1 ? V : provAt(x, y));
      const want = starBeside(N, POS[N][0], OFF, paint);
      const e = (find(G(makeMod("mod-repainted", { bmp: paint }))).provinces || []).find((x) => x.province === N) || {};
      ok(provOfRow(WANT.N38, paint) === V && want.step === 0.5 && provOfRow(want) === N && !same(want, WANT.N38), "(the fixture: in the mod's repainted provinces.bmp the full offset puts N's star on V, and half of it on N)", want);
      ok(e.marker && e.marker.step === want.step && same(e.marker.to, want), "⭐⭐ N's star is stepped back to stay on N as the mod's own bitmap draws it, not as the layer below's does", { got: e.marker, want });
    }
    {
      // a province already standing where the layout would put it is not named, or the rule would name it after every click: a
      // layer below whose rows for the sea province S happen to stand on S's supply_node row and beside it, the mod's the same —
      // and (#a-new-province-has-its-unit-positions) its other slots where the land layout puts them round that row
      const over = { [`${S};0`]: S_HUB, [`${S};38`]: WANT.S38, ...Object.fromEntries(LAID.map((t) => [`${S};${t}`, landPlace(S, S_HUB, t)])) };
      const gThere = makeGame("game-already-there", { stacks: unitstacks({ over }) });
      const mThere = makeMod("mod-already-there", { stacks: unitstacks({ heightAt: heightNow, dropSeaOnly: [S], over }) });
      const before = sha(stacksFile(mThere)), ids = namedIn(G(mThere, gThere));
      ok(same(below(gThere, S, 0), S_HUB) && same(below(gThere, S, 38), WANT.S38) && same(rowAt(stacksFile(mThere), S, 0), S_HUB) && same(rowAt(stacksFile(mThere), S, 38), WANT.S38)
        && LAID.every((t) => same(below(gThere, S, t), landPlace(S, S_HUB, t)) && same(rowAt(stacksFile(mThere), S, t), landPlace(S, S_HUB, t))),
        "(the fixture: the layer below's rows for S are exactly where the layout would put them, and the mod's rows are the same rows)");
      ok(JSON.stringify(ids) === JSON.stringify([N, K]), "⭐⭐ S's rows already stand where the layout would put them: it is not named; N and K are", ids);
      const r = layOut(G(mThere, gThere));
      ok(r.changed === true && r.provinces === 2 && sha(stacksFile(mThere)) !== before && find(G(mThere, gThere)).total === 0, "…and once they are laid out, nothing is left to name", r);
    }
    {
      // …nor is a victory point named for a move nobody could see: K's default slot half a pixel off K, the layout's place for
      // its star a little over half a pixel from it
      const NEAR = { x: 47.5, z: 8.4 }, over = { [`${K};9`]: NEAR, [`${K};38`]: NEAR };
      const gNear = makeGame("game-a-hair-off", { stacks: unitstacks({ over }) });
      const ids = namedIn(G(makeMod("mod-a-hair-off", { stacks: unitstacks({ heightAt: heightNow, dropSeaOnly: [S], over }) }), gNear));
      ok(provOfRow(NEAR) !== K && provOfRow(WANT.K38) === K && dist(WANT.K38, NEAR) < 1 && dist(WANT.K38, NEAR) > 0.3,
        "(the fixture: K's star off K, and the place on K the layout would give it under a pixel away)", dist(WANT.K38, NEAR));
      ok(JSON.stringify(ids) === JSON.stringify([S, N]), "⭐⭐ a star the layout would move under a pixel is not named, though that would bring it onto its province: S and N only", ids);
    }
    {
      // no quarter of the offset stays on the province: K's Standstill a fifth of a pixel from its west edge, below and in the mod
      const K0 = { x: 48.2, z: 8.4 }, over = { [`${K};0`]: K0 };
      const gEdge = makeGame("game-edge", { stacks: unitstacks({ over }) });
      const e = (find(G(makeMod("mod-edge", { stacks: unitstacks({ heightAt: heightNow, dropSeaOnly: [S], over }) }), gEdge)).provinces || []).find((x) => x.province === K) || {};
      ok([1, 0.75, 0.5, 0.25].every((k) => provOfRow({ x: r2(K0.x + OFF.dx * k), z: r2(K0.z + OFF.dz * k) }) !== K) && provOfRow(K0) === K && !same(K0, POS[K][38]),
        "(the fixture: every quarter of the offset carries K's star off K, and its Standstill stands on K)");
      ok(e.kind === "vp" && !e.standstill && e.marker && e.marker.step === 0 && same(e.marker.to, K0), "⭐ …then the star goes on the Standstill itself, not over the border", e.marker);
      // …and a Standstill that itself stands off the province (the base game has ten): the layout has no place on K to give the
      // star, so moving it would cure nothing, and it is not named for being off K
      const OUT = { x: 47.8, z: 8.4 }, overOut = { [`${K};0`]: OUT };
      const gOut = makeGame("game-standstill-off", { stacks: unitstacks({ over: overOut }) });
      const idsOut = namedIn(G(makeMod("mod-standstill-off", { stacks: unitstacks({ heightAt: heightNow, dropSeaOnly: [S], over: overOut }) }), gOut));
      ok(provOfRow(OUT) !== K && provOfRow(POS[K][38]) !== K && provOfRow(starBeside(K, OUT)) !== K && dist(POS[K][38], OUT) < REACH && !same(starBeside(K, OUT), POS[K][38]),
        "(the fixture: K's Standstill off K as well, its star within the reach of it, and the layout's place for the star off K too)", starBeside(K, OUT));
      ok(JSON.stringify(idsOut) === JSON.stringify([S, N]), "⭐ a star off its province that the layout cannot bring back onto it is not named: S and N only", idsOut);
    }

    console.log("\n-- ⭐ a star within the reach, off the ground its city is drawn on --");
    {
      // M again: its star stands as far from its Standstill as the layer below's own, and is not named for that. Here M has a
      // city, a patch of spawn_city ground, and the layout's place for the star is on it while the default slot is not.
      const patch = (index, x0, x1) => (x, y) => (provAt(x, y) === M && x >= x0 && x < x1 && y >= 38 && y < 43 ? index : LAND_BELOW.includes(provAt(x, y)) ? PLAINS : OCEAN);
      const at = (fn, p) => fn(Math.floor(p.x), rowOf(p.z));
      const cityOnM = patch(SPAWN, 79, 85), cityUnderBoth = patch(SPAWN, 77, 85), cityElsewhere = patch(SPAWN, 86, 91), forestOnM = patch(FOREST, 79, 85);
      ok(at(cityOnM, WANT.M38) === SPAWN && at(cityOnM, POS[M][38]) === PLAINS && at(cityUnderBoth, POS[M][38]) === SPAWN && at(cityUnderBoth, WANT.M38) === SPAWN
        && at(cityElsewhere, WANT.M38) === PLAINS && at(cityElsewhere, POS[M][38]) === PLAINS && at(cityElsewhere, { x: 88, z: POS[M][0].z }) === SPAWN && provOfRow({ x: 88, z: POS[M][0].z }) === M && at(forestOnM, WANT.M38) === FOREST,
        "(the fixture: four grounds for M — a city under the layout's place and not under the default slot, one under both, one under neither, and a forest where the first has its city)");
      const gCity = makeGame("game-city-on-m", { terrain: cityOnM }), fCity = find(G(makeMod("mod-city-on-m"), gCity));
      const e = (fCity.provinces || []).find((x) => x.province === M) || {};
      ok(JSON.stringify((fCity.provinces || []).map((x) => x.province)) === JSON.stringify([S, N, K, M]) && e.kind === "vp" && e.why === OFF_CITY && e.marker && same(e.marker.to, WANT.M38) && same(e.marker.from, POS[M][38]),
        "⭐⭐ M's star stands off the ground M's city is drawn on, and the layout would put it on that ground: M is named, its star to go beside its Standstill", { ids: (fCity.provinces || []).map((x) => x.province), e });
      const idsBoth = namedIn(G(makeMod("mod-city-under-both"), makeGame("game-city-under-both", { terrain: cityUnderBoth })));
      ok(JSON.stringify(idsBoth) === JSON.stringify([S, N, K]), "⭐ …a star already on its city's ground is not named", idsBoth);
      const gElse = makeGame("game-city-elsewhere", { terrain: cityElsewhere }), idsElse = namedIn(G(makeMod("mod-city-elsewhere"), gElse));
      ok(JSON.stringify(idsElse) === JSON.stringify([S, N, K]), "⭐ …nor one the layout would not put on it either", idsElse);
      const idsForest = namedIn(G(makeMod("mod-forest-on-m"), makeGame("game-forest-on-m", { terrain: forestOnM })));
      ok(JSON.stringify(idsForest) === JSON.stringify([S, N, K]), "⭐ …nor one on ground no city is drawn on: the terrain files say which index is a city's", idsForest);
      // the terrain.bmp that loads is the mod's own when it has one: the layer below's city is elsewhere, the mod's is on M's station
      const idsOwn = namedIn(G(makeMod("mod-paints-its-own-city", { terrain: cityOnM }), gElse));
      ok(JSON.stringify(idsOwn) === JSON.stringify([S, N, K, M]), "⭐ the ground asked about is the mod's own terrain.bmp where it has one", idsOwn);
      // …and "its city" is on its own province: K's Standstill a pixel off K, on the sea, on city ground there; K's star, off K too
      // and off that ground, has no place on K to be given — it is not named for the city next door
      const OUT = { x: 45.5, z: 8.4 }, overOut = { [`${K};0`]: OUT };
      const next = (x, y) => (x === Math.floor(OUT.x) && y === rowOf(OUT.z) ? SPAWN : LAND_BELOW.includes(provAt(x, y)) ? PLAINS : OCEAN);
      const gNext = makeGame("game-city-next-door", { stacks: unitstacks({ over: overOut }), terrain: next });
      const idsNext = namedIn(G(makeMod("mod-city-next-door", { stacks: unitstacks({ heightAt: heightNow, dropSeaOnly: [S], over: overOut }) }), gNext));
      ok(provOfRow(OUT) !== K && at(next, OUT) === SPAWN && at(next, POS[K][38]) !== SPAWN && provOfRow(starBeside(K, OUT)) !== K && same(starBeside(K, OUT), OUT) && dist(POS[K][38], OUT) < REACH,
        "(the fixture: K's Standstill on city ground off K, its star beside it off that ground, within the reach, and no quarter of the offset on K)");
      ok(JSON.stringify(idsNext) === JSON.stringify([S, N]), "⭐ a star the layout could only put on another province's city is not named: S and N only", idsNext);
    }

    console.log("\n-- ⭐ nothing that was laid out is touched (the cry-wolf controls) --");
    {
      const fGame = find(G(game));
      ok(fGame.total === 0, "the base game itself, opened as the mod: nothing", { total: fGame.total, reason: fGame.reason });
      // a mod holding verbatim copies of the layer below's unitstacks.txt and of all its states: every row equals the layer
      // below's, every victory point was one below, no province changed type
      const verbatim = (tag, extraVp) => {
        const copy = path.join(ROOT, tag);
        write(copy, "descriptor.mod", `name="${tag}"\n`);
        for (const rel of ["map/unitstacks.txt", "history/states/50-A.txt", "history/states/51-B.txt", "history/states/52-S.txt"]) write(copy, rel, fs.readFileSync(path.join(game, ...rel.split("/"))));
        if (extraVp) write(copy, "history/states/50-A.txt", stateTxt(50, STATE_50, [[V, 10], [extraVp, 1]]));
        return copy;
      };
      const fc = find(G(verbatim("mod-verbatim")));
      ok(fc.total === 0 && !fc.reason, "⭐⭐ a verbatim copy of the layer below's unitstacks.txt and states: every row is the layer below's, and nothing is named", fc);
      // ⛔ #a-default-slot-star-is-the-layer-belows-own-habit — THE POPULATION THE RULE REALLY MEETS: the layer below's own files,
      // and one victory point added to its land. On a star the layer below would have left there too, nothing; on one it would not, that one.
      const fM = find(G(verbatim("mod-verbatim-and-a-vp-on-m", M)));
      ok(fM.total === 0 && !fM.reason, "⭐⭐⭐ …with one victory point added on M, whose default slot stands as the layer below's own do: still nothing", fM.provinces);
      const idsN = namedIn(G(verbatim("mod-verbatim-and-a-vp-on-n", N)));
      ok(JSON.stringify(idsN) === JSON.stringify([N]), "⭐⭐ …and with one added on N, whose default slot stands beyond their reach: N, and only N", idsN);
      // (b) the modder's nudge: a row that differs from the layer below's is theirs. ⛔ #a-new-province-has-its-unit-positions — S's
      // OTHER slots are still the sea's, so S is still named for them: they are laid out round the Standstill the modder placed, and
      // the Standstill and the star — one choice, the modder's once either is placed — stay byte for byte; and so does any other
      // slot the modder placed (its 1, nudged a pixel too): only the slots still the sea's are laid out
      const nudge = (over) => unitstacks({ heightAt: heightNow, dropSeaOnly: [S], over });
      const N_MINE = { x: 60, z: 38 }, K_MINE = { x: 52, z: 9 }, S0_MINE = { x: 31, z: 30 }, S1_MINE = { x: POS[S].slot.x + 1, z: POS[S].slot.z };
      const S1 = LAID[0], STILL_SEA = LAID.filter((t) => t !== S1);
      const all = makeMod("mod-nudged", { stacks: nudge({ [`${S};0`]: S0_MINE, [`${S};${S1}`]: S1_MINE, [`${N};38`]: N_MINE, [`${K};38`]: K_MINE }) });
      ok(LAID.length >= 2 && provOfRow(S1_MINE) === S && !same(S1_MINE, POS[S].slot) && !same(S1_MINE, landPlace(S, S0_MINE, S1)),
        "(the fixture: the template lays out more than one slot besides 0 and 38; the modder's first of them stands on S, neither the sea's place nor the layout's)", { LAID, S1_MINE });
      const before = fs.readFileSync(stacksFile(all)), fa = find(G(all)), ea = (fa.provinces || []).find((e) => e.province === S) || {};
      const slots = (e) => (e.rows || []).map((x) => x.type).sort((a, b) => a - b);
      ok(fa.total === 1 && ea.kind === "sea" && !ea.standstill && !ea.marker && JSON.stringify(slots(ea)) === JSON.stringify(STILL_SEA),
        "⭐⭐ (b) S's Standstill and its first slot nudged a pixel, N's and K's markers placed by hand: only S is named, and only for its slots still the sea's — not its Standstill, its star or the slot the modder placed", { ids: (fa.provinces || []).map((e) => e.province), slots: slots(ea), STILL_SEA });
      const r = layOut(G(all)), want = expectedBytes(before, new Map(sLaid(S0_MINE, STILL_SEA)));
      ok(r.changed === true && r.provinces === 1 && r.standstills === 0 && r.markers === 0 && fs.readFileSync(stacksFile(all)).equals(want),
        "…and the writer lays those out round the modder's Standstill, and moves nothing else", { r, firstDiff: [...fs.readFileSync(stacksFile(all))].findIndex((b, i) => b !== want[i]) });
      const lineOf = (buf, t) => buf.toString("latin1").split("\n").find((l) => l.startsWith(`${S};${t};`));
      ok(lineOf(fs.readFileSync(stacksFile(all)), S1) === lineOf(before, S1), "⭐⭐ the slot the modder placed is the line it was, byte for byte", { now: lineOf(fs.readFileSync(stacksFile(all)), S1), was: lineOf(before, S1) });
      const f38 = find(G(makeMod("mod-nudged-marker", { stacks: nudge({ [`${S};38`]: { x: 20, z: 31 }, [`${N};38`]: N_MINE, [`${K};38`]: K_MINE }) })));
      const e38 = (f38.provinces || []).find((e) => e.province === S) || {};
      ok(f38.total === 1 && e38.kind === "sea" && !e38.standstill && !e38.marker && JSON.stringify(slots(e38)) === JSON.stringify(LAID),
        "⭐ …S with only its marker moved: its Standstill stays with the star the modder placed beside it — and, sea below, S is not a victory point on land that was land", { ids: (f38.provinces || []).map((e) => e.province), e38 });
      const f0 = find(G(makeMod("mod-nudged-standstill", { stacks: nudge({ [`${S};0`]: S0_MINE }) }))), e0 = (f0.provinces || []).find((e) => e.province === S) || {};
      ok(JSON.stringify((f0.provinces || []).map((e) => e.province)) === JSON.stringify([S, N, K]) && !e0.standstill && !e0.marker && JSON.stringify(slots(e0)) === JSON.stringify(LAID),
        "⭐ …and with only its Standstill moved: its star stays with it, S's other slots and N and K are still named", { ids: (f0.provinces || []).map((e) => e.province), e0 });
      // a marker the LAYER BELOW placed by hand on LAND (its 38 off its 9) is not a default slot, though the mod's row is still that row
      const N_BELOW = { [`${N};38`]: { x: 61, z: 39 } };
      const gHand = makeGame("game-hand-placed", { stacks: unitstacks({ over: N_BELOW }) });
      const mHand = makeMod("mod-hand-placed-below", { stacks: unitstacks({ heightAt: heightNow, dropSeaOnly: [S], over: N_BELOW }) });
      const hand = below(gHand, N, 38), idsH = namedIn(G(mHand, gHand));
      ok(same(hand, N_BELOW[`${N};38`]) && !same(hand, below(gHand, N, 9)) && same(rowAt(stacksFile(mHand), N, 38), hand) && provOfRow(hand) === N && dist(hand, POS[N][0]) > REACH + 0.005,
        "(the fixture: the layer below's marker for N stands off its default slot, beyond the reach, and the mod's row is the same row)", hand);
      ok(JSON.stringify(idsH) === JSON.stringify([S, K]), "⭐⭐ N's marker, placed by hand in the layer below, is not named; S and K still are", idsH);
      // (c) a victory point the layer below already gave is Paradox's wherever its star stands. In the fixture above V's own star
      // IS the reach, so its being within it would hide this clause: a layer below whose V stands in the default slot far BEYOND
      // the reach — Q's star, left in its default slot too and nearer its Standstill, is the one nine in ten stand within.
      const FAR_V = { x: 50, z: 21.2 }, overC = { [`${V};9`]: FAR_V, [`${V};38`]: FAR_V, [`${Q};9`]: POS[Q][38] };
      const gC = makeGame("game-far-star-below", { stacks: unitstacks({ over: overC }) });
      const mC = makeMod("mod-far-star-below", { stacks: unitstacks({ heightAt: heightNow, dropSeaOnly: [S], over: overC }) });
      const reachC = reachOver(gC, slotVpsBelow(gC)), idsC = namedIn(G(mC, gC));
      ok(JSON.stringify(slotVpsBelow(gC)) === JSON.stringify([V, Q]) && dist(FAR_V, POS[V][0]) > reachC + 1 && provOfRow(FAR_V) === V && same(rowAt(stacksFile(mC), V, 38), FAR_V) && MOD_VPS.some(([p]) => p === V),
        "(the fixture: V, a victory point below and in the mod, its star in the default slot well beyond the layer below's reach)", { reachC, gap: dist(FAR_V, POS[V][0]) });
      ok(JSON.stringify(idsC) === JSON.stringify([S, N, K, M]), "⭐⭐ (c) V held a victory point below: its star, though beyond the reach, is not named; S, N, K and M — beyond that shorter reach too — are", idsC);
      // …but in the SEA it is the sea's marker whichever slot it sat in: S over a layer below that placed S's marker by hand
      const S_BELOW = { [`${S};38`]: { x: 25, z: 33 } };
      const gSeaHand = makeGame("game-sea-marker-by-hand", { stacks: unitstacks({ over: S_BELOW }) });
      const mSeaHand = makeMod("mod-sea-marker-by-hand", { stacks: unitstacks({ heightAt: heightNow, dropSeaOnly: [S], over: S_BELOW }) });
      const es = (find(G(mSeaHand, gSeaHand)).provinces || []).find((x) => x.province === S) || {};
      ok(!same(below(gSeaHand, S, 38), below(gSeaHand, S, 9)) && same(rowAt(stacksFile(mSeaHand), S, 38), below(gSeaHand, S, 38)) && same(rowAt(stacksFile(mSeaHand), S, 0), below(gSeaHand, S, 0)),
        "(the fixture: the layer below's marker for the sea province S stands off its default slot, and the mod's two rows are the layer below's)", below(gSeaHand, S, 38));
      ok(es.kind === "sea" && es.standstill && same(es.standstill.to, S_HUB) && es.marker && same(es.marker.from, S_BELOW[`${S};38`]) && same(es.marker.to, WANT.S38),
        "⭐⭐ S, sea below with its marker placed by hand there, still carries the sea's rows: its Standstill and its star are laid out", es);
      // a victory point on a province that is sea NOW (the land was drowned, the state still lists it): not land's layout to give
      const idsD = namedIn(G(makeMod("mod-drowned-k", { land: LAND_BELOW.filter((p) => p !== K).concat([S]) })));
      ok(JSON.stringify(idsD) === JSON.stringify([S, N]), "⭐ K drowned in the mod, its victory point still in the state file: K is not named, S and N are", idsD);
    }

    console.log("\n-- ⭐⭐ (a) an add-on that does not own unitstacks.txt: nothing written, nothing materialised --");
    {
      const addon = path.join(ROOT, "addon");
      write(addon, "descriptor.mod", 'name="addon"\nsupported_version="1.19.*"\n');
      write(addon, "history/states/50-A.txt", stateTxt(50, STATE_50, MOD_VPS));
      const f = find(G(addon));
      ok(f.total === 0 && /does not own map\/unitstacks\.txt/.test(f.reason || ""), "a new victory point on N in an add-on that inherits unitstacks.txt: the finder names nothing, and says why", { total: f.total, reason: f.reason });
      const v = await validate(addon);
      ok(v && v.ok && ruleIn(v).length === 0, "…the rule is not reported", ruleIn(v));
      const r = layOut(G(addon));
      ok(r.changed === false && !r.error && !fs.existsSync(stacksFile(addon)), "…the writer writes nothing and copies nothing in", r);
      const af = await autoFix(addon);
      ok(af && af.ok && !fs.existsSync(stacksFile(addon)), "⭐⭐ …and one Auto-fix click leaves the add-on with no unitstacks.txt of its own", { ok: af && af.ok, error: af && af.error, map: fs.existsSync(path.join(addon, "map")) && fs.readdirSync(path.join(addon, "map")) });
    }

    console.log("\n-- ⭐⭐ the rule, as the Map Errors popup asks for it --");
    const file = stacksFile(main), before = fs.readFileSync(file);
    {
      const onS = readRows(path.join(main, "map", "buildings.txt")).filter((c) => provOfRow({ x: +c[2], z: +c[4] }) === S), hub = onS.filter((c) => c[1] === "supply_node");
      ok(hub.length === 1 && +hub[0][2] === S_HUB.x && +hub[0][4] === S_HUB.z && onS.length === 2 && onS.some((c) => c[1] === "air_base"),
        "(the mod's buildings.txt holds exactly one supply_node row on S, read back off the file — and one row of another type, which is not counted)", onS);
      const v = await validate(main), p = ruleIn(v)[0];
      ok(v && v.ok && ruleIn(v).length === 1 && p.severity === "warning" && p.total === 3 && p.autoFix === true, "it is reported once, a warning, counting the three provinces", p && { severity: p.severity, total: p.total, autoFix: p.autoFix });
      ok(!!p && JSON.stringify(p.provinces) === JSON.stringify([S, N, K]) && /\bAuto-fix\b/.test(p.message) && /1 that was sea/.test(p.message) && /2 victory point/.test(p.message), "…naming them, saying which kind each is, and that Auto-fix lays them out (which is what puts the button there)", p && p.message);
      ok(!!p && p.message.includes(`more than ${REACH} px from its station`) && /off its own province/.test(p.message), "…and what is wrong with those two stars: off the province, or farther from the station than the map below's own, by the reach it measured", p && p.message);
      ok(!!p && typeof p.totalNoun === "string" && p.totalNoun.length > 0 && typeof p.totalNounOne === "string", "…and what it counted", p && p.totalNoun);
      ok(!isFatalRule(RULE), "it is not in the fatal set: the game loads it");
      // asked of the tables themselves: mapRuleLabel makes a name up out of the rule id for a rule that has none
      ok(typeof LABELS[RULE] === "string" && LABELS[RULE].length > 10 && mapRuleLabel(RULE) === LABELS[RULE], "…it has a label of its own", { label: mapRuleLabel(RULE) });
      ok(typeof FIX_HINTS[RULE] === "string" && /Auto-fix all/.test(FIX_HINTS[RULE]) && mapRuleFixHint(RULE) === FIX_HINTS[RULE], "…and a hint that says what Auto-fix does", mapRuleFixHint(RULE).slice(0, 80));
    }

    console.log("\n-- ⭐⭐⭐ one Auto-fix click, as the button sends it --");
    {
      const af = await autoFix(main), fx = (af && af.fixes && af.fixes.unitPositions) || {};
      ok(af && af.ok && fx.changed === true && fx.provinces === 3 && fx.exSea === 1 && fx.victoryPoints === 2 && fx.standstills === 1 && fx.markers === 3, "the click laid out the three provinces: one Standstill, three markers", af && (af.error || fx));
      const s0 = rowAt(file, S, 0), s38 = rowAt(file, S, 38), n0 = rowAt(file, N, 0), n38 = rowAt(file, N, 38), k38 = rowAt(file, K, 38);
      ok(same(s0, S_HUB), "⭐⭐⭐ S's type 0 is its supply_node row", { got: s0 && s0.line, want: S_HUB });
      ok(same(s38, WANT.S38) && same(s38, { x: s0.x + OFF.dx, z: s0.z + OFF.dz }), "⭐⭐⭐ S's type 38 is its type 0 plus the offset the fixture's own layer below gives its victory points", { got: s38 && s38.line, want: WANT.S38, OFF });
      ok(same(n38, WANT.N38) && !same(n38, POS[N][38]), "⭐⭐ N's type 38 moved beside its Standstill", { got: n38 && n38.line, want: WANT.N38 });
      ok(!!n0 && n0.line === before.toString("latin1").split("\n").find((l) => l.startsWith(`${N};0;`)), "⭐⭐ …and N's type 0 did not: the row is byte for byte what it was", n0 && n0.line);
      ok(same(k38, WANT.K38) && provOfRow(k38) === K, "⭐ K's star stands on K", { got: k38 && k38.line, want: WANT.K38 });
      ok(!!s0 && s0.y === yAt(S_HUB) && !!s38 && s38.y === yAt(WANT.S38) && !!n38 && n38.y === yAt(WANT.N38), "⭐⭐ each moved row's height is the ground of the mod's heightmap at its new pixel", { s0: s0 && s0.y, s38: s38 && s38.y, n38: n38 && n38.y, want: [yAt(S_HUB), yAt(WANT.S38), yAt(WANT.N38)] });
      ok(same(rowAt(file, V, 38), POS[V][38]), "⭐⭐ (c) V's marker stands where it stood");
      ok(same(rowAt(file, M, 38), POS[M][38]), "⭐⭐ …and so does M's, in the slot the layer below would have left it");
      const after = fs.readFileSync(file), want = expectedBytes(before, MOVES);
      ok(after.equals(want), "⭐⭐⭐ every other byte of unitstacks.txt is unchanged: only x, y and z of those four rows differ", { bytes: [before.length, after.length, want.length], firstDiff: [...after].findIndex((b, i) => b !== want[i]) });
      ok(/laid out 3 province\(s\) in map\/unitstacks\.txt/.test(require("./testlib-map-page.js").autoFixSummary(af)), "the summary the modder reads says so", String(require("./testlib-map-page.js").autoFixSummary(af)).slice(0, 300));
      const v = await validate(main);
      ok(v && v.ok && ruleIn(v).length === 0 && find(G(main)).total === 0, "⭐⭐ the rule is gone afterwards", ruleIn(v));
      const h1 = sha(file), af2 = await autoFix(main), fx2 = (af2 && af2.fixes && af2.fixes.unitPositions) || {};
      ok(af2 && af2.ok && (af2.nothingToFix || fx2.changed === false) && sha(file) === h1, "⭐⭐⭐ a second click writes nothing to unitstacks.txt", af2 && (af2.error || fx2));
    }

    console.log("\n-- ⭐⭐ every byte it was not asked to move: CRLF, a byte that is not UTF-8, no final newline --");
    {
      // a comment in Latin-1 (0xE5, "å": not valid UTF-8 on its own) above the rows, CRLF endings, and no newline at the end
      const crlf = makeMod("mod-crlf", { eol: "\r\n", prefix: "# Sm\xE5land, nudged 1936\r\n", noFinalNewline: true });
      const f = stacksFile(crlf), was = fs.readFileSync(f);
      ok(was.includes(Buffer.from([0xE5])) && was.includes(Buffer.from("\r\n")) && was[was.length - 1] !== 0x0a && !/[^\r]\n/.test(was.toString("latin1")), "(the fixture: every line ends CRLF, the file holds a lone 0xE5 and ends without a newline)");
      const r = layOut(G(crlf)), now = fs.readFileSync(f), want = expectedBytes(was, MOVES);
      ok(r.changed === true && r.provinces === 3 && now.equals(want), "⭐⭐⭐ the same four rows move and every other byte is kept — each line's CRLF, the Latin-1 byte, the missing final newline", { r, bytes: [was.length, now.length, want.length], firstDiff: [...now].findIndex((b, i) => b !== want[i]) });
      ok(!/[^\r]\n/.test(now.toString("latin1")) && now.includes(Buffer.from([0xE5])) && !now.includes(Buffer.from([0xEF, 0xBF, 0xBD])), "…no lone LF was put into the CRLF file, and the 0xE5 did not become U+FFFD");
    }
    {
      // the row the rule saw, or nothing: a SECOND type 38 row for N, standing elsewhere (the game and the finder read the first),
      // and columns padded with spaces — the move is made inside the number, and only in the row that was judged
      const SECOND = `${N};38;60.00;${yAt({ x: 60, z: 38 })};38.00;1.57;0.24`;
      const rows = unitstacks({ heightAt: heightNow, dropSeaOnly: [S] }).map((l) => (l.startsWith(`${S};0;`) ? l.split(";").map((c, i) => (i >= 2 && i <= 4 ? ` ${c}  ` : c)).join(";") : l)).concat([SECOND]);
      const twice = makeMod("mod-second-row", { stacks: rows });
      const f = stacksFile(twice), was = fs.readFileSync(f, "latin1").split("\n");
      const padded = was.find((l) => l.startsWith(`${S};0;`));
      ok(was.filter((l) => l.startsWith(`${N};38;`)).length === 2 && was[was.length - 2] === SECOND && / \d+\.\d\d  ;/.test(padded), "(the fixture: two type 38 rows for N, the second elsewhere, and S's Standstill row padded with spaces)", padded);
      const r = layOut(G(twice)), now = fs.readFileSync(f, "latin1").split("\n");
      ok(r.changed === true && r.provinces === 3 && same(rowAt(f, N, 38), WANT.N38) && now[now.length - 2] === SECOND, "⭐⭐ N's first type 38 row moves, and the second, which is not the row that was judged, is byte for byte what it was", now.filter((l) => l.startsWith(`${N};38;`)));
      const c = (now.find((l) => l.startsWith(`${S};0;`)) || "").split(";");
      ok(c[2] === ` ${S_HUB.x.toFixed(2)}  ` && c[3] === ` ${yAt(S_HUB)}  ` && c[4] === ` ${S_HUB.z.toFixed(2)}  `, "⭐ …and S's padded row keeps the spaces round each number it was given", c.slice(2, 5));
    }

    console.log("\n-- ⭐⭐ a province whole, or not at all (#a-half-laid-out-province) --");
    {
      // a UTF-8 byte order mark before the first row, and that row S's Standstill. The finder reads the file as UTF-8, where the
      // mark is white space before the 2; the writer reads a byte a character, where it is three letters in front of it.
      const rows = unitstacks({ heightAt: heightNow, dropSeaOnly: [S] }), first = rows.findIndex((l) => l.startsWith(`${S};0;`));
      const bom = makeMod("mod-bom", { stacks: [rows[first]].concat(rows.filter((_, i) => i !== first)), prefix: BOM });
      const f = stacksFile(bom), was = fs.readFileSync(f);
      ok(was[0] === 0xEF && was[1] === 0xBB && was[2] === 0xBF && was.slice(3, 3 + `${S};0;`.length).toString("latin1") === `${S};0;`, "(the fixture: the file starts with a byte order mark, and S's type 0 row is its first line)", was.slice(0, 12).toString("latin1"));
      const planned = (find(G(bom)).provinces || []).find((x) => x.province === S) || {};
      ok(planned.standstill && same(planned.standstill.to, S_HUB) && planned.marker, "(…and the finder, which reads past the mark, plans both of S's rows)", planned);
      const r = layOut(G(bom)), now = fs.readFileSync(f), want = expectedBytes(was, MOVES);
      ok(r.changed === true && r.provinces === 3 && r.standstills === 1 && r.markers === 3 && same(rowAt(f, S, 0), S_HUB) && same(rowAt(f, S, 38), WANT.S38),
        "⭐⭐⭐ the writer finds the row behind the mark: S's Standstill moves with its star, not the star alone", { r, s0: rowAt(f, S, 0) });
      ok(now.equals(want) && now[0] === 0xEF && now[1] === 0xBB && now[2] === 0xBF, "⭐⭐ …every other byte, the mark among them, is kept", { bytes: [was.length, now.length, want.length], firstDiff: [...now].findIndex((b, i) => b !== want[i]) });
      ok(find(G(bom)).total === 0, "…and nothing is left to name");
    }
    {
      // the file is saved by something else between the look and the write (the finder's reading is kept per version of the file).
      // Served to the writer's own read, and to nothing else: the same file with one of S's two rows moved since.
      const torn = (tag, type, to) => {
        const mod = makeMod(tag), f = stacksFile(mod), was = fs.readFileSync(f, "latin1");
        const since = was.split("\n").map((l) => { const c = l.split(";"); if (l.startsWith(`${S};${type};`)) { c[2] = to.x.toFixed(2); c[4] = to.z.toFixed(2); } return c.join(";"); }).join("\n");
        const real = fs.readFileSync;
        let served = 0, r;
        fs.readFileSync = function (p, enc) { if (enc === "latin1" && path.resolve(String(p)) === path.resolve(f)) { served++; return since; } return real.apply(this, arguments); };
        try { r = layOut(G(mod)); } finally { fs.readFileSync = real; }
        return { f, r, served, since, line: (t) => since.split("\n").find((l) => l.startsWith(`${S};${t};`)) };
      };
      const a = torn("mod-standstill-moved-since", 0, { x: 33, z: 31 });
      ok(a.served === 1 && a.since !== fs.readFileSync(a.f, "latin1") && !same({ x: 33, z: 31 }, POS[S][0]), "(the fixture: the writer's read, and only that, saw S's Standstill moved since the finder looked)", a.served);
      ok(a.r.changed === true && a.r.provinces === 2 && a.r.exSea === 0 && a.r.standstills === 0 && a.r.markers === 2 && rowAt(a.f, S, 38).line === a.line(38) && rowAt(a.f, S, 0).line === a.line(0),
        "⭐⭐⭐ S's Standstill is no longer the row the finder read: its star is not put beside a place the Standstill never went to — N and K are laid out", { r: a.r, s38: rowAt(a.f, S, 38).line });
      ok(same(rowAt(a.f, N, 38), WANT.N38) && same(rowAt(a.f, K, 38), WANT.K38), "…N's and K's stars moved");
      const b = torn("mod-marker-moved-since", 38, { x: 21, z: 32 });
      ok(b.served === 1 && b.r.changed === true && b.r.provinces === 2 && b.r.standstills === 0 && rowAt(b.f, S, 0).line === b.line(0) && rowAt(b.f, S, 38).line === b.line(38),
        "⭐⭐ …nor is S's Standstill moved from under a star somebody has placed since", { r: b.r, s0: rowAt(b.f, S, 0).line });
    }

    console.log("\n-- ⭐⭐ the click's order: after the unit-stack repair takes its copy, before the old-ground step --");
    {
      // a mod that raised S and never took unitstacks.txt in: the unit-stack repair copies it (S still carries the sea-only slots
      // below), and the layout, which reads only a file the mod owns, must find that copy in the SAME click
      const fresh = makeMod("mod-takes-a-copy", { stacks: null });
      ok(!fs.existsSync(stacksFile(fresh)) && find(G(fresh)).total === 0, "(the fixture: the mod owns no unitstacks.txt, so before the click nothing is named)");
      const af = await autoFix(fresh), us = (af && af.fixes && af.fixes.unitStacks) || {}, fx = (af && af.fixes && af.fixes.unitPositions) || {};
      ok(us.changed === true && us.materialised === true && fs.existsSync(stacksFile(fresh)), "the unit-stack repair takes the layer below's unitstacks.txt in", us);
      ok(fx.changed === true && fx.provinces === 3 && same(rowAt(stacksFile(fresh), S, 0), S_HUB) && same(rowAt(stacksFile(fresh), S, 38), WANT.S38) && same(rowAt(stacksFile(fresh), N, 38), WANT.N38),
        "⭐⭐⭐ …and the same click lays the copy out: one click, not two", { fx, s0: rowAt(stacksFile(fresh), S, 0) });
      const h1 = sha(stacksFile(fresh)), af2 = await autoFix(fresh);
      ok(af2 && af2.ok && sha(stacksFile(fresh)) === h1, "…a second click writes nothing to it");
    }
    {
      // an older world: the mod's copy still stores the layer below's heights, so the old-ground step (the last of the click) has
      // S's rows to stand on the ground. The two rows the layout moves are given the ground at their NEW place by the layout, and
      // are then no longer the layer below's rows — the old-ground step re-seats the others, and counts only those.
      const old = makeMod("mod-old-heights", { stacks: unitstacks({ heightAt: heightBelow, dropSeaOnly: [S] }) });
      const sRows = readRows(stacksFile(old)).filter((c) => +c[0] === S);
      const stale = ((await validate(old)).problems || []).find((p) => p.rule === "models_stand_on_the_old_ground");
      const staleUnits = (((stale || {}).items || []).find((i) => i.file === "map/unitstacks.txt") || {}).rows;
      // ⛔ #a-new-province-has-its-unit-positions — the rows the layout lays out are S's Standstill, its star and the template's other
      // slots; the rest of S's rows (slots no land below carries) are the old-ground step's
      const laid = ((((find(G(old)).provinces || []).find((x) => x.province === S)) || {}).rows || []).filter((x) => x.from).length;
      ok(sRows.length > laid && laid === 2 + LAID.length && staleUnits === sRows.length, "(the fixture: every one of S's rows still stores the sea's height, the old-ground rule names them all, and the layout plans some of them, not all)", { sRows: sRows.length, staleUnits, laid });
      const af = await autoFix(old), fx = (af && af.fixes && af.fixes.unitPositions) || {}, og = (af && af.fixes && af.fixes.modelsOnOldGround) || {};
      ok(fx.changed === true && fx.provinces === 3 && rowAt(stacksFile(old), S, 0).y === yAt(S_HUB) && rowAt(stacksFile(old), S, 38).y === yAt(WANT.S38)
        && LAID.every((t) => rowAt(stacksFile(old), S, t).y === yAt(landPlace(S, S_HUB, t))), "the layout lays S out and stands each row it moves on the ground at its new place", fx);
      ok(og.changed === true && og.rows && og.rows.unitstacks === sRows.length - laid, "⭐⭐ …and the old-ground step, after it, stands back S's OTHER rows and counts only those", { og: og.rows, want: sRows.length - laid });
      const off = readRows(stacksFile(old)).filter((c) => +c[0] === S && c[3] !== yAt({ x: +c[2], z: +c[4] }));
      ok(off.length === 0, "…so after one click every row of S stands on the ground under it", off.map((c) => c.join(";")));
    }
  } catch (e) {
    fail++;
    console.log("HARNESS ERROR " + (e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e));
  } finally {
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
    console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
    process.exitCode = fail ? 1 : 0;
  }
});
