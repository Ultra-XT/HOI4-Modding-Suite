// A raise, a sea made a lake or a ✏ Paint shape stroke never changes a sea the modder did not touch. It says what it cut off, on the Save
// line, with the warned sign, and the modder decides. #a-raise-says-the-sea-it-cuts-off
//
// WHY THERE IS NO FILL ANY MORE. These tools once made such a sea land in the same write, as 🌍 Generate land does when it makes a world. The
// reason was one a review ranked "minor to wrong-in-game": a raised mouth leaves a bay no ship can leave. MEASURED by the review of that fill,
// on copies of real maps: a 263 px stroke turned the base game's 5,769 px sea 8517 to land and a 666 px stroke Old World Blues' 51,749 px sea
// 561, on a modder's own map, with no question first and no way back. It stripped a state's navy (AS-1, section 11), ignored a fleet in the bay
// (AS-2, section 11), was judged on a map the same Save went on to change (AS-3, section 8), fired after the dropdown was turned back (AS-4,
// section 12), filled a designed inland sea whole (AS-5, sections 6 and 11), said so in a plain note behind "…and N more" (AS-6, sections 1
// and 8), left land under water when the heights could not be written (AS-7, section 13), stuck a Save for good (AS-8, section 11) and could
// make a sea a city (AS-9: section 1 holds that a cut-off sea's row is not written at all).
//
// THE QUESTION STAYS (seasARaiseCutsOff, read-only). A sea is cut off when no way the game's ships take joins it to the ocean: a border, or an
// adjacencies.csv row between two seas (the base game's Kiel, Suez and Panama canals; walking borders alone, raising Gibraltar, 5407, read the
// Mediterranean as cut off). It is asked of every body of sea the raise takes a province out of, not only the ocean
// (#a-raise-is-judged-against-the-sea-it-was-in, sections 5 and 6: on copies of the base game's map and Hearts of Minecraft's, raising 3201
// inside the sea 8513's raise cut off left 8739 and 8812 each with no other sea beside it, and 9872 in Hearts of Minecraft's 553 left 12242
// touching only land), of a sea made a lake (section 7: 3201 made a lake leaves 8812 the same), and of a stroke, over the borders before it
// (section 10: the 8 px of sea 3201 touching 8812, painted with land 1830's colour). The lobes map below is the shape of 8513's sea.
//
// THE NOTE IS TRUE ON THE MAP THE SAVE LEAVES (section 8): the Save asks again when it ends (seasStillCutOff), of only the seas its writes
// named. A canal row or a channel queued behind the raise opens the way, and the note goes; a later write makes that sea land, and it goes.
//
// KEPT, and held here: the raised province's continent (section 9: the one it had as the same land below, then the land it touches, the
// generator's two readers in the generator's order), and a piece of land cut off from its state's region joining that region first (section
// 10, #a-cut-off-land-joins-its-states-region).
//
// THE LONE SEA (section 14, #a-lone-sea-nobody-uses). A sea of one province that no way joins to another, with no harbour and no fleet, that the layers below do not ship: no
// shipping map has one, so nobody has launched one. Map Errors says so as a warning, and Auto-fix makes it land when clicked, and says that.
//
// …AND ANY OTHER CUT-OFF SEA THE MODDER DID NOT MAKE STAYS SEA THROUGH A CLICK (section 11, #a-sea-the-modder-did-not-make-stays-sea): the note says they can leave it.
//
// HOW IT IS TESTED: saveProvinceTerrain, queueWrite, flushMapSaves and the Save gate are the page's own code, lifted by
// testlib-map-page.js and RUN against a real in-process server; the other cases go through the same endpoints. The map (256 x 256, the mod
// owning it):
//   1 sea [0,256)x[0,64), the ocean · 2 sea [96,160)x[64,96), RAISED · 3 sea [96,160)x[96,256) down to the map's edge — region 1
//   land in 32 px strips under the ocean, each with its own harbour facing it: 6 5 4 (state 1) | 7 8 9 (state 2) — region 2
//   4 is forest and 7 hills. A heightmap.bmp of its own: the seas at 89, the land at 110.
"use strict";

const fs = require("fs");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

const L2 = require("./testlib-two-layer-map.js");
const world = L2.makeWorld("raisedsea");   // before server.js: it reads HOI4_MODS_ROOT when it loads
const P = require("./testlib-map-page.js");
const M = require("./map-data.js");
const { BACKUP_DIR } = require("./safe-write.js");
const { createApp } = require("./server.js");

const TERRAIN = ["categories = {", "\tunknown = { color = { 255 0 0 } }", "\tocean = { naval_terrain = yes color = { 40 83 176 } is_water = yes }",
  "\tlakes = { color = { 58 91 255 } is_water = yes }", "\tplains = { color = { 255 129 66 } }", "\tforest = { color = { 89 199 85 } }",
  "\thills = { color = { 248 255 153 } }", "}", ""].join("\n");
const COL = { 1: [0, 0, 200], 2: [0, 0, 150], 3: [0, 0, 110], 4: [200, 0, 0], 5: [0, 200, 0], 6: [200, 200, 0], 7: [0, 200, 200], 8: [200, 0, 200], 9: [120, 60, 0], 10: [0, 0, 70],
  11: [0, 0, 40], 12: [90, 90, 90], 13: [0, 0, 20], 14: [0, 30, 60], 15: [160, 160, 160], 16: [10, 10, 230], 17: [20, 20, 220], 18: [30, 30, 210], 19: [40, 40, 190],
  20: [70, 140, 210] };
const SEA_HEIGHT = 89, LAND_HEIGHT = 110;

function bmp8(W, H, fn) {
  const rs = Math.floor((8 * W + 31) / 32) * 4, off = 54 + 1024, b = Buffer.alloc(off + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(rs * H, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * rs + x] = fn(x, y);
  return b;
}
/** The 8-bit heightmap on disk, read back: (x, y) -> height. */
function heightsOf(mod) {
  const b = fs.readFileSync(path.join(mod, "map", "heightmap.bmp"));
  const off = b.readUInt32LE(10), W = b.readInt32LE(18), H = b.readInt32LE(22), rs = Math.floor((8 * W + 31) / 32) * 4;
  return (x, y) => b[off + (H - 1 - y) * rs + x];
}

/** The map above, and its variants: `extraPorts` more naval_base_spawn rows, `split` the sea behind the raise in two (3 above, 10
 *  below, so the ocean is ONE province of 16,384 px and the sea behind it TWO of 5,120), `regionOf3` false leaves 3 out of every
 *  strategic region, `adjacencies` the rows of a map/adjacencies.csv of the mod's own; `island` a land province 15 [120,136)x[200,216)
 *  standing in sea 3 alone (state 1, flagged coastal, no harbour), `bunker` a coastal fort of 4's at (95, row 100) facing east onto 3
 *  (BUNKER), `continent` the continent every land row is on; `loneSea` a sea province 20 [8,24)x[200,216) standing in land 6 with no
 *  other sea beside it, in the land region, a harbour of 6's facing it — a sea the map ships on its own, as Millennium Dawn ships 13277
 *  and Old World Blues 5894, each with a harbour; `ownRegions` a region for each part: the ocean 6, the mouth and the sea behind it 1,
 *  state 1's land 2 and state 2's 4 — the base game's shape at 8812, where Alaska is the whole of its land region (33) and the ocean off
 *  it a region of its own (88); `recolour` { id: [r, g, b] } gives a province another colour (the layer below's province of the same id
 *  and colour is then the same province, as continentsOfTheLandBelow reads it). Returns { mod, at } — `at(x, y)` the province a pixel
 *  belongs to. */
const BUNKER = "1;coastal_bunker;95.00;9.50;155.00;1.57;0";
const LONE_HARBOUR = "1;naval_base_spawn;7.00;9.50;48.00;0.00;20";
function mouth(name, { extraPorts = [], split = false, regionOf3 = true, adjacencies = null, island = false, bunker = false, continent = 1, loneSea = false, ownRegions = false, recolour = null } = {}) {
  const colOf = (id) => (recolour && recolour[id]) || COL[id];
  const rects = [[1, 0, 0, 256, 64], [6, 0, 64, 32, 256], [5, 32, 64, 64, 256], [4, 64, 64, 96, 256], [2, 96, 64, 160, 96], [3, 96, 96, 160, 256],
    ...(split ? [[10, 96, 176, 160, 256]] : []), ...(island ? [[15, 120, 200, 136, 216]] : []), ...(loneSea ? [[20, 8, 200, 24, 216]] : []),
    [7, 160, 64, 192, 256], [8, 192, 64, 224, 256], [9, 224, 64, 256, 256]];
  const at = (x, y) => { let id = 0; for (const [p, x0, y0, x1, y1] of rects) if (x >= x0 && x < x1 && y >= y0 && y < y1) id = p; return id; };
  const rows = [[1, "sea", true], [2, "sea", true], [3, "sea", true], [4, "land", true, "forest"], [5, "land", true], [6, "land", true], [7, "land", true, "hills"],
    [8, "land", true], [9, "land", true], ...(split ? [[10, "sea", true]] : []), ...(island ? [[15, "land", true]] : []), ...(loneSea ? [[20, "sea", true]] : [])];
  const seas = new Set(rows.filter((r) => r[1] === "sea").map((r) => r[0]));
  const files = {
    "descriptor.mod": `name="${name}"\nsupported_version="1.*"\nreplace_path="history/states"\nreplace_path="map/strategicregions"\n`,
    "map/provinces.bmp": L2.bmp24(256, 256, (x, y) => colOf(at(x, y))),
    "map/definition.csv": ["0;0;0;0;land;false;unknown;0"].concat(rows.map(([id, type, coastal, terrain]) => `${id};${colOf(id).join(";")};${type};${coastal};${terrain || (type === "sea" ? "ocean" : "plains")};${type === "sea" ? 0 : continent}`)).join("\r\n") + "\r\n",
    "map/heightmap.bmp": bmp8(256, 256, (x, y) => (seas.has(at(x, y)) ? SEA_HEIGHT : LAND_HEIGHT)),
    "map/buildings.txt": ["1;air_base;48.00;9.50;100.00;0.00;0", "1;rocket_site_spawn;48.00;9.50;100.00;0.00;0", "2;air_base;208.00;9.50;100.00;0.00;0", "2;rocket_site_spawn;208.00;9.50;100.00;0.00;0",
      ...[[6, 16], [5, 48], [4, 80], [7, 176], [8, 208], [9, 240]].map(([p, x]) => `${p <= 6 ? 1 : 2};naval_base_spawn;${x}.00;9.50;191.00;0.00;1`), ...extraPorts, ...(bunker ? [BUNKER] : []),
      ...(loneSea ? [LONE_HARBOUR] : [])].join("\n"),
    ...(ownRegions
      ? { "map/strategicregions/1-R.txt": L2.region(1, split ? "2 3 10" : "2 3"), "map/strategicregions/6-R.txt": L2.region(6, "1"),
        "map/strategicregions/2-R.txt": L2.region(2, "4 5 6" + (island ? " 15" : "") + (loneSea ? " 20" : "")), "map/strategicregions/4-R.txt": L2.region(4, "7 8 9") }
      : { "map/strategicregions/1-R.txt": L2.region(1, regionOf3 ? (split ? "1 2 3 10" : "1 2 3") : "1 2"),
        "map/strategicregions/2-R.txt": L2.region(2, "4 5 6 7 8 9" + (island ? " 15" : "") + (loneSea ? " 20" : "")) }),
    "history/states/1-S.txt": L2.st(1, "4 5 6" + (island ? " 15" : "")), "history/states/2-S.txt": L2.st(2, "7 8 9"),
    "common/terrain/00_terrain.txt": TERRAIN,
  };
  // the base game's header and terminator rows around the mod's own (vanilla's map/adjacencies.csv has both, and LF line ends)
  if (adjacencies) files["map/adjacencies.csv"] = ["From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment", ...adjacencies,
    "-1;-1;;-1;-1;-1;-1;-1;-1 "].join("\n") + "\n";
  return { mod: world.mod(name, files), at };
}
/** ⛔ #a-raise-is-judged-against-the-sea-it-was-in — a mouth with a sea of three behind it, as the base game's 8513 has 3201, 8739 and
 *  8812 behind it (the review's F1):
 *    the ocean across the top, y [0,64): five provinces 1 [0,64) 16 [64,112) 17 [112,160) 18 [160,208) 19 [208,256) — more provinces than
 *    any sea behind the mouth, as the real ocean has (`oceans: 1` makes it ONE province, 16,384 px: the ocean is the body with the most water)
 *    2 sea [96,160)x[64,96), the mouth · 3 sea [96,160)x[96,128), the strip behind it
 *    10 sea [96,120)x[128,256) (3,072 px) and 11 sea [144,160)x[128,256) (2,048 px), two lobes that touch only 3 and land
 *    12 land [120,144)x[128,256) between them, state 1, its harbour facing 3 (as 1830's faced 3201)
 *    land strips under the ocean as in `mouth`: 6 5 4 (state 1) | 7 8 9 (state 2), each with its harbour on the ocean — land region 2
 *  `designed`: 2 is land (state 1, its harbour on the ocean), so 3, 10 and 11 are a sea of their own the map ships, in a region of their
 *  own — as Hearts of Minecraft ships two oceans beside its main one (the review's F2). `split10` / `split11`: the lobe in two, 13 / 14
 *  its lower half [192,256). */
function lobes(name, { designed = false, split10 = false, split11 = false, oceans = 5 } = {}) {
  const ocean = oceans === 1 ? [[1, 0, 0, 256, 64]] : [[1, 0, 0, 64, 64], [16, 64, 0, 112, 64], [17, 112, 0, 160, 64], [18, 160, 0, 208, 64], [19, 208, 0, 256, 64]];
  const rects = [...ocean, [6, 0, 64, 32, 256], [5, 32, 64, 64, 256], [4, 64, 64, 96, 256], [2, 96, 64, 160, 96], [3, 96, 96, 160, 128],
    [10, 96, 128, 120, 256], ...(split10 ? [[13, 96, 192, 120, 256]] : []), [12, 120, 128, 144, 256], [11, 144, 128, 160, 256], ...(split11 ? [[14, 144, 192, 160, 256]] : []),
    [7, 160, 64, 192, 256], [8, 192, 64, 224, 256], [9, 224, 64, 256, 256]];
  const at = (x, y) => { let id = 0; for (const [p, x0, y0, x1, y1] of rects) if (x >= x0 && x < x1 && y >= y0 && y < y1) id = p; return id; };
  const inner = [3, 10, 11, ...(split10 ? [13] : []), ...(split11 ? [14] : [])].sort((a, b) => a - b);
  const rows = [...ocean.map(([id]) => [id, "sea", true]), [2, designed ? "land" : "sea", true], ...inner.map((id) => [id, "sea", true]), [4, "land", true, "forest"], [5, "land", true], [6, "land", true],
    [7, "land", true, "hills"], [8, "land", true], [9, "land", true], [12, "land", true]].sort((a, b) => a[0] - b[0]);
  const seas = new Set(rows.filter((r) => r[1] === "sea").map((r) => r[0]));
  const files = {
    "descriptor.mod": `name="${name}"\nsupported_version="1.*"\nreplace_path="history/states"\nreplace_path="map/strategicregions"\n`,
    "map/provinces.bmp": L2.bmp24(256, 256, (x, y) => COL[at(x, y)]),
    "map/definition.csv": ["0;0;0;0;land;false;unknown;0"].concat(rows.map(([id, type, coastal, terrain]) => `${id};${COL[id].join(";")};${type};${coastal};${terrain || (type === "sea" ? "ocean" : "plains")};${type === "sea" ? 0 : 1}`)).join("\r\n") + "\r\n",
    "map/heightmap.bmp": bmp8(256, 256, (x, y) => (seas.has(at(x, y)) ? SEA_HEIGHT : LAND_HEIGHT)),
    // each harbour on the ocean faces the ocean province above it (at(x, 63)); 12's faces 3
    "map/buildings.txt": ["1;air_base;48.00;9.50;100.00;0.00;0", "1;rocket_site_spawn;48.00;9.50;100.00;0.00;0", "2;air_base;208.00;9.50;100.00;0.00;0", "2;rocket_site_spawn;208.00;9.50;100.00;0.00;0",
      ...[[6, 16], [5, 48], [4, 80], [7, 176], [8, 208], [9, 240], ...(designed ? [[2, 128]] : [])].map(([p, x]) => `${p === 2 || p <= 6 ? 1 : 2};naval_base_spawn;${x}.00;9.50;191.00;0.00;${at(x, 63)}`),
      "1;naval_base_spawn;132.00;9.50;127.00;0.00;3"].join("\n"),
    ...(designed
      ? { "map/strategicregions/1-R.txt": L2.region(1, ocean.map(([id]) => id).join(" ")), "map/strategicregions/3-R.txt": L2.region(3, inner.join(" ")), "map/strategicregions/2-R.txt": L2.region(2, "2 4 5 6 7 8 9 12") }
      : { "map/strategicregions/1-R.txt": L2.region(1, [...ocean.map(([id]) => id), 2, ...inner].join(" ")), "map/strategicregions/2-R.txt": L2.region(2, "4 5 6 7 8 9 12") }),
    "history/states/1-S.txt": L2.st(1, (designed ? "2 " : "") + "4 5 6 12"), "history/states/2-S.txt": L2.st(2, "7 8 9"),
    "common/terrain/00_terrain.txt": TERRAIN,
  };
  return { mod: world.mod(name, files), at };
}
const defCols = (mod, id) => (fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/).find((l) => l.split(";")[0] === String(id)) || "").split(";");
const harbours = (mod) => fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter((l) => l.split(";")[1] === "naval_base_spawn");
const TYPE_TO_LAND = (id) => ({ provinceId: id, terrain: "plains", type: "land", coastal: true });   // the page's body for a coastal sea made land
/** The seas of `mod`'s map that no way the game's ships take — a border, an adjacencies.csv row — joins to the ocean, province 1: the
 *  graph fixFractionedRegions judges by (provinceNeighbourGraph), read off the disk afresh. */
function seasCutOff(mod) {
  if (M.clearMapLayerCache) M.clearMapLayerCache();
  const opts = { modRoot: mod, gameRoot: world.GAME, dependencyRoots: [] };
  const model = M.buildMapModel({ ...opts, cacheStableLayers: true });
  const graph = M.provinceNeighbourGraph({ ...opts, model });
  const sea = new Set((model.provinces || []).filter((p) => p.id > 0 && p.type === "sea").map((p) => p.id));
  const reached = new Set([1]), q = [1];
  for (let i = 0; i < q.length; i++) for (const n of graph.get(q[i]) || []) if (sea.has(n) && !reached.has(n)) { reached.add(n); q.push(n); }
  return [...sea].filter((p) => !reached.has(p)).sort((a, b) => a - b);
}
/** The strategic regions of `mod`'s map as the game loads them, read afresh: { region id: [provinces, ascending] }. */
function regionsOf(mod) {
  if (M.clearMapLayerCache) M.clearMapLayerCache();
  const model = M.buildMapModel({ modRoot: mod, gameRoot: world.GAME, dependencyRoots: [], cacheStableLayers: true });
  const out = {};
  for (const [p, r] of Object.entries(model.provinceToRegion || {})) (out[r] = out[r] || []).push(+p);
  for (const r of Object.keys(out)) out[r].sort((a, b) => a - b);
  return out;
}
/** …and the harbours in map/buildings.txt that face one of them. */
const cutOffHarbours = (mod) => { const cut = new Set(seasCutOff(mod)); return harbours(mod).filter((l) => cut.has(+l.split(";")[6])); };

/** The page functions a province-inspector edit and its Save run through. */
const FUNCTIONS = [
  "function queueWrite(", "async function saveProvinceTerrain()",
  ["async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"],
  "function orphanedQueuedWrites(", "function emptyNewStateWrites(", "function markSaveBoundary(", "function blankAdjacencyNote(",
  "function heightmapNote(", "async function mapCrashGate(", "function openMapErrorsModal(", "function terrainWriteNotes(", "function paintTerrainAt(",
  "function eraseProvinceLocal(", "function beginEraseStroke(", "function commitEraseStroke(",
  // (⛔ #a-big-brush-takes-every-province-under-it — the provinces under the Terrain disc)
  "function provincesUnderDisc(",
  // (⛔ #a-sea-made-land-keeps-the-naval-buildings-of-the-coast-it-took, #a-moved-coast-takes-its-dockyards — the Type change and the Erase
  // brush ask what naval buildings a coast carries; these are not …Note helpers, so runPage does not lift them itself)
  ["const NAVAL_ONLY_STATE_KEYS =", ";"], "function stateNavalLevels(", "function navalLevelsWords(", "function coastsASeaMadeLandTakes(",
  "function seaMadeLandNavalWords(", "function paintDropRefusal(", "function unmirrorDroppedMove(", "function moveProvinceLevels(",
  "function reconcileNavalCarry(", "function giveNavalDated(", "function navalDatedAfterCarry(", "function emptiedStatesYardWords(",
  // (⛔ #a-raise-taken-back-takes-its-region-move-back — the Move tool's paint of a raised sea, as the modder paints one: the click, the move, the region
  // question and the region move it stages; section 12)
  "function handleMoveClick(", "function doMoveProvince(", "function stateMoveRegionTarget(", "function setProvinceRegionLocally(", "function stageProvinceRegionMove(",
  "function coastDockyardsThatGo(",
];

(async () => {
  const srv = await L2.startServer(createApp);
  try {
    const notesSb = P.runPage(["function terrainWriteNotes("]).sb;
    const notesOf = (res, body) => notesSb.terrainWriteNotes(res, { url: "/api/map/set-province-terrain", body });
    /** The page's own map page over `mod`, loaded as the modder loads it: `stage(edits)` makes province-inspector edits [[provinceId, type,
     *  terrain?], …] as the modder makes them — fillInspector's three controls from the page's model as it was loaded, then the Type (and
     *  Terrain) dropdown changed — queued by saveProvinceTerrain, as section 1 does for one; `save()` is 💾 Save. `paint`: a ✏ Paint shape
     *  stroke staged before the Save, as the brush stages one ({ x, y, r, g, b } a pixel, keyed y·256+x); `failOnce(url, sent)`: the one
     *  request whose connection drops, the first time it is sent. save() → { requests, statuses, loads, last: the final Save line,
     *  pending: the writes still queued, model }. */
    const pageSession = async (mod, { paint = null, failOnce = null } = {}) => {
      const model = await fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const provinceDef = new Map((model.provinces || []).map((p) => [p.id, Object.assign({}, p)]));
      const provinceType = new Map((model.provinces || []).map((p) => [p.id, p.type]));
      const requests = [], loads = [], els = {};
      let dropped = false;
      const el = (id, props) => { els[id] = Object.assign(P.element(), props || {}); return els[id]; };
      const { sb, statuses } = P.runPage(FUNCTIONS, P.loadGlobals({
        modPath: () => mod, $: (id) => els[id] || el(id), model, provinceDef, provinceType, selected: null,
        pushUndo: () => {}, erasedThisStroke: new Set(), eraseEmptied: new Set(), eraseSkippedInland: new Set(), eraseHeld: new Map(), provNeighborsCache: new Map(), buildProvNeighbors: () => {},
        autoFix: false, deleteEmptiedStates: () => ({ deleted: [], keptCapitals: [], keptInherited: [] }),
        computeSeaAdjacency: () => {}, seaAdjacent: new Set([...provinceDef.keys()]),
        isVanillaTarget: () => false, stateFormDirty: () => false, stateFormBaseline: null, stageStateWrite: () => {}, stagingStateForm: false,
        remapQueuedStateId: () => {}, remapLocalStateId: () => {}, adoptMergeRegions: () => {}, renderCheckpoints: () => {}, updateSaveButton: () => {},
        STATE_ID_FIELDS: ["stateId", "toStateId", "fromStateId", "sourceStateId", "targetStateId"],
        paintDiff: new Map((paint || []).map((d) => [d.y * 256 + d.x, d])),
        // the Terrain brush's own: one pixel, where the test says (`brushAt`), of the province the test says
        imgXYAt: (x, y) => ({ x, y }), pidGrid: new Int32Array(256 * 256), imgW: 256, imgH: 256, brushRadius: 1, terrainStroke: new Set(), terrainPaintType: "forest", terrainChanged: 0, recolorAll: () => {}, draw: () => {},
        load: async (line, o) => { loads.push({ line, o }); },
        fetch: async (url, opts) => {
          const sent = opts && opts.body ? JSON.parse(opts.body) : null;
          if (failOnce && !dropped && failOnce(String(url).split("?")[0], sent)) { dropped = true; throw new Error("the connection was reset"); }
          const res = await fetch(srv.base + String(url), opts);
          const body = await res.json().catch(() => ({}));
          requests.push({ url: String(url).split("?")[0], sent, body });
          return { ok: res.ok, status: res.status, json: async () => body };
        },
      }));
      const stage = async (edits) => {
        for (const [pid, type, terrain] of edits) {
          const d = provinceDef.get(pid) || {};
          sb.selected = { provinceId: pid };
          el("miTypeSel", { value: d.type }); el("miTerrainSel", { value: d.terrain }); el("miCoastalChk", { checked: !!d.coastal });
          els.miTypeSel.value = type;
          if (terrain) els.miTerrainSel.value = terrain;
          await sb.saveProvinceTerrain();
        }
      };
      const save = async () => {
        await sb.flushMapSaves();
        return { requests, statuses, loads, last: statuses[statuses.length - 1] || "", pending: sb.pendingWrites.length, model };
      };
      return { sb, statuses, model, stage, save };
    };
    /** …one Save of `edits` (and `opts.paint`) on a page loaded for it. */
    const pageSave = async (mod, edits, opts) => { const s = await pageSession(mod, opts); await s.stage(edits); return s.save(); };

    /** What a write answered of the seas it cut off, and the same without the words of who did it: [{ provinces, pixels, from, against?, lone? }]. */
    const cutOf = (r) => ((r.body && r.body.cutOffSeas) || {}).cut || [];
    const sameSeas = (r, want) => JSON.stringify(cutOf(r).map(({ by, ...c }) => c)) === JSON.stringify(want);
    const OPTIONS = /You can click (it|each of them) and set its Type to land; open a way through with ✏ Paint shape; or leave (it|them): the game loads such seas \(Millennium Dawn's 13277 and Old World Blues' 5894 ship with ports\)\./;
    /** Everything a Save posted to ask again, and each sea it said. */
    const askedAgain = (run) => run.requests.filter((q) => q.url === "/api/map/seas-cut-off");

    console.log("1. ⛔ The inspector: sea 2, the only way out of sea 3, made land, then 💾 Save");
    {
      const { mod: MOD, at } = mouth("Raised Mouth");
      const model = await fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(MOD)}`).then((r) => r.json());
      const provinceDef = new Map((model.provinces || []).map((p) => [p.id, Object.assign({}, p)]));
      const provinceType = new Map((model.provinces || []).map((p) => [p.id, p.type]));
      const d = (id) => provinceDef.get(id) || {};
      rec("THE CONTROL: 2 and 3 are sea on ocean, and 3 touches no water but 2", d(2).type === "sea" && d(3).type === "sea" && d(3).terrain === "ocean"
        && [[95, 120], [160, 120], [120, 95]].map(([x, y]) => at(x, y)).join() === "4,7,2", [2, 3].map((id) => d(id)));
      rec("THE CONTROL: no harbour faces 2 or 3", !harbours(MOD).some((l) => ["2", "3"].includes(l.split(";")[6])), harbours(MOD));
      const h0 = heightsOf(MOD), row3 = defCols(MOD, 3).join(";");

      const requests = [], loads = [], els = {};
      const el = (id, props) => { els[id] = Object.assign(P.element(), props || {}); return els[id]; };
      const page = P.runPage(FUNCTIONS, P.loadGlobals({
        modPath: () => MOD, $: (id) => els[id] || el(id), model, provinceDef, provinceType, selected: null,
        pushUndo: () => {}, erasedThisStroke: new Set(), eraseEmptied: new Set(), eraseSkippedInland: new Set(), eraseHeld: new Map(), provNeighborsCache: new Map(), buildProvNeighbors: () => {},
        autoFix: false, deleteEmptiedStates: () => ({ deleted: [], keptCapitals: [], keptInherited: [] }),
        computeSeaAdjacency: () => {}, seaAdjacent: new Set([2, 3, 4, 5, 6, 7, 8, 9]),
        isVanillaTarget: () => false, stateFormDirty: () => false, stateFormBaseline: null, stageStateWrite: () => {}, stagingStateForm: false,
        remapQueuedStateId: () => {}, remapLocalStateId: () => {}, adoptMergeRegions: () => {}, renderCheckpoints: () => {}, updateSaveButton: () => {},
        STATE_ID_FIELDS: ["stateId", "toStateId", "fromStateId", "sourceStateId", "targetStateId"],
        load: async (line, o) => { loads.push({ line, o }); },
        fetch: async (url, opts) => {
          const res = await fetch(srv.base + String(url), opts);
          const body = await res.json().catch(() => ({}));
          requests.push({ url: String(url).split("?")[0], sent: opts && opts.body ? JSON.parse(opts.body) : null, body });
          return { ok: res.ok, status: res.status, json: async () => body };
        },
      }));
      const { sb, statuses } = page;
      // what fillInspector puts in the three controls for a province, then the one control the modder changes
      sb.selected = { provinceId: 2 };
      el("miTypeSel", { value: d(2).type }); el("miTerrainSel", { value: d(2).terrain }); el("miCoastalChk", { checked: !!d(2).coastal });
      els.miTypeSel.value = "land";
      await sb.saveProvinceTerrain();
      const q = sb.pendingWrites.map((w) => ({ url: w.url, body: w.body }));
      rec("THE CONTROL: the inspector queued one write — { provinceId: 2, terrain: plains, type: land, coastal: true }",
        q.length === 1 && q[0].url === "/api/map/set-province-terrain" && JSON.stringify(q[0].body) === JSON.stringify(TYPE_TO_LAND(2)), q);

      await sb.flushMapSaves();
      const w = requests.find((r) => r.url === "/api/map/set-province-terrain") || { body: {} };
      rec("THE CONTROL: Save posted the write as queued, with the mod's path, and it succeeded",
        !!w.sent && w.sent.provinceId === 2 && w.sent.type === "land" && w.sent.modPath === MOD && w.body.ok === true, { sent: w.sent, ok: w.body.ok, error: w.body.error });
      rec("⭐⭐⭐ the answer names sea 3, its size, what it was cut off from and what did it",
        JSON.stringify(cutOf(w)) === JSON.stringify([{ provinces: [3], pixels: 10240, from: "ocean", by: "Turning province 2 into land" }]), w.body.cutOffSeas);
      rec("⭐⭐⭐ on disk province 3's row is the row it was, every column: Nova changed nothing there", defCols(MOD, 3).join(";") === row3, defCols(MOD, 3).join(";"));
      rec("THE CONTROL: …and province 2 is land on plains, as the page sent it", defCols(MOD, 2).slice(4, 7).join(";") === "land;true;plains", defCols(MOD, 2).join(";"));
      const csv = fs.readFileSync(path.join(MOD, "map", "definition.csv"), "utf8");
      rec("⭐ definition.csv keeps its CRLF line ends, every row, and every other row as it was",
        !/[^\r]\n/.test(csv) && [1, 4, 5, 6, 7, 8, 9].every((id) => defCols(MOD, id)[4] === (id === 1 ? "sea" : "land")), csv);
      const h1 = heightsOf(MOD);
      // the raise writes a beach: a raised pixel beside water stands on the ramp's first step, just under the waterline (#new-land-needs-a-beach)
      const besideWater = (x, y) => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(([a, b]) => b >= 0 && b < 256 && [1, 3].includes(at((a + 256) % 256, b)));
      let low2 = 0, low2Inland = 0, moved3 = 0, movedOcean = 0, movedLand = 0;
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
        const p = at(x, y);
        if (p === 2 && h1(x, y) < M.HEIGHTMAP_SEA_LEVEL) { low2++; if (!besideWater(x, y)) low2Inland++; }
        if (p === 3 && h1(x, y) !== h0(x, y)) moved3++;
        if (p === 1 && h1(x, y) !== h0(x, y)) movedOcean++;
        if (p >= 4 && p <= 9 && h1(x, y) !== h0(x, y)) movedLand++;
      }
      rec("⭐⭐ heightmap.bmp: every pixel of the sea left behind is the height it was", moved3 === 0, { moved3 });
      rec("⭐ …and 2 stands up but for its beaches on the water beside it", low2Inland === 0 && low2 > 0, { low2, low2Inland });
      rec("⭐ …and the ocean's pixels and the old land's are the heights they were", movedOcean === 0 && movedLand === 0, { movedOcean, movedLand });
      rec("⭐ no harbour faces 2 or 3 on disk", !harbours(MOD).some((l) => ["2", "3"].includes(l.split(";")[6])), harbours(MOD));
      const last = statuses[statuses.length - 1] || "";
      rec("⭐⭐⭐ the Save line says, with the warned sign: which sea, how big, what it was cut off from",
        /⚠ Turning province 2 into land cut sea 3 \(10,240 px\) off from the ocean: no ship there can reach the ocean\. Nova changed nothing there\./.test(last), { last });
      rec("⭐⭐⭐ …and what the modder can do: its Type, a way through, or leave it, which the game loads", OPTIONS.test(last), { last });
      const asks = requests.filter((r) => r.url === "/api/map/seas-cut-off");
      rec("⭐⭐ the Save asked again once, when its writes were done, of the sea its write named",
        asks.length === 1 && requests[requests.length - 1 - requests.slice().reverse().findIndex((r) => r.url === "/api/map/seas-cut-off")].sent.modPath === MOD
          && requests.findIndex((r) => r.url === "/api/map/seas-cut-off") > requests.findIndex((r) => r.url === "/api/map/set-province-terrain")
          && JSON.stringify(asks[0].sent.cut) === JSON.stringify(cutOf(w)), asks.map((a) => a.sent));
      rec("⭐ nothing the page holds went stale: no reload of the map after the Save", loads.length === 0, loads);
      const v = await srv.validate(MOD);
      rec("⭐ Map Errors names 2 as land in no state, which Auto-fix adopts", JSON.stringify(L2.idsOf(v, "land_not_in_state")) === "[2]", L2.rulesIn(v));
      rec("⭐ …and 3, one province with no other sea beside it, no harbour and no fleet, as a warning Auto-fix offers", JSON.stringify(L2.idsOf(v, "lone_sea_nobody_uses")) === "[3]", L2.rulesIn(v));
      const fx = await srv.autoFix(MOD);
      const v2 = await srv.validate(MOD);
      rec("⭐⭐ one Auto-fix click homes it, and nothing is left that Save stops for", fx.status === 200 && !L2.rulesIn(v2).some((r) => ["land_not_in_state", "fractioned_naval_region", "coastal_no_port", "state_split_strategic_regions"].includes(r)), { rules: L2.rulesIn(v2), status: fx.status });
      rec("⭐⭐ …and the click made 3 land, as the warning offered", defCols(MOD, 3)[4] === "land" && JSON.stringify(((fx.body.fixes || {}).loneSeas || {}).details) === JSON.stringify([{ province: 3, pixels: 10240, terrain: "forest" }]) && !L2.rulesIn(v2).includes("lone_sea_nobody_uses"), { row: defCols(MOD, 3).join(";"), lone: (fx.body.fixes || {}).loneSeas });
      const said = P.autoFixSummary(fx.body);
      rec("⭐⭐ …and says so: which sea, how big, and why", /made land sea 3 \(10,240 px\), which had no other sea beside it, no harbour and no fleet/.test(said), said);
      const t1 = L2.tree(MOD);
      await srv.autoFix(MOD);
      rec("⭐⭐ …and a second click writes nothing", L2.written(t1, L2.tree(MOD)).length === 0, L2.written(t1, L2.tree(MOD)));
    }

    console.log("\n2. Every sea it cuts off is named, whatever it is: a harbour on it, more provinces than the raise, in no region");
    {
      // a harbour faces the sea behind the raise (state 1's, on 4 across x = 95/96)
      const PORT = "1;naval_base_spawn;95.00;9.50;79.00;0.00;3";
      const { mod } = mouth("Raised Mouth Harbour", { extraPorts: [PORT] });
      const r = await srv.post("/api/map/set-province-terrain", TYPE_TO_LAND(2), mod);
      rec("the write succeeded", r.status === 200 && r.body.ok === true, r.body);
      rec("⭐⭐⭐ a sea a harbour faces is named like any other", sameSeas(r, [{ provinces: [3], pixels: 10240, from: "ocean" }]), r.body.cutOffSeas);
      rec("⭐⭐ …it is still sea on disk, and its harbour is still in buildings.txt", defCols(mod, 3)[4] === "sea" && harbours(mod).includes(PORT), { row: defCols(mod, 3).join(";"), harbours: harbours(mod) });
      // …and raising the whole of that sea, already cut off, leaves no piece of it to cut off
      const again = await srv.post("/api/map/set-province-terrain", TYPE_TO_LAND(3), mod);
      rec("⭐ raising the whole of a sea already cut off cuts nothing else off: no cutOffSeas in the answer", again.status === 200 && again.body.ok === true && again.body.cutOffSeas === undefined, again.body.cutOffSeas);
    }
    {
      // the sea behind the raise is two provinces, and the ocean ONE
      const { mod } = mouth("Raised Mouth Wide", { split: true });
      const r = await srv.post("/api/map/set-province-terrain", TYPE_TO_LAND(2), mod);
      rec("⭐⭐⭐ a sea of more provinces than the one raised is named whole", sameSeas(r, [{ provinces: [3, 10], pixels: 10240, from: "ocean" }]), r.body.cutOffSeas);
      rec("⭐⭐⭐ the ocean is the side with the most water: province 1, one province beside a two-province sea, is not named cut off",
        defCols(mod, 1)[4] === "sea" && !cutOf(r).flatMap((c) => c.provinces).includes(1), r.body.cutOffSeas);
      rec("…and 3 and 10 are still sea", defCols(mod, 3)[4] === "sea" && defCols(mod, 10)[4] === "sea");
      const n = M.cutOffSeasNotes(cutOf(r)).join("\n");
      rec("⭐⭐ the note names both, with their water", /⚠ Turning province 2 into land cut seas 3, 10 \(10,240 px\) off from the ocean/.test(n) && /each of them/.test(n), n);
    }
    {
      const { mod } = mouth("Raised Mouth Regionless", { regionOf3: false });
      const r = await srv.post("/api/map/set-province-terrain", TYPE_TO_LAND(2), mod);
      rec("⭐⭐ a cut-off sea with a province in no strategic region is named, and stays sea", sameSeas(r, [{ provinces: [3], pixels: 10240, from: "ocean" }]) && defCols(mod, 3)[4] === "sea", r.body.cutOffSeas);
    }
    {
      // the note's own shapes, read-only and pure: a long list is cut in the note and counted, and a big number gets its commas
      const many = Array.from({ length: 11 }, (_, i) => i + 100);
      const n = M.cutOffSeasNotes([{ provinces: many, pixels: 1234567, from: "ocean" }])[0];
      rec("⭐ a sea of many provinces lists eight and says how many, and what did it falls back on the Save", /^⚠ This Save cut seas 100, 101, 102, 103, 104, 105, 106, 107, … \(11 in all\) \(1,234,567 px\) off from the ocean/.test(n), n);
      const lone = M.cutOffSeasNotes([{ provinces: [7], pixels: 102, from: "sea", lone: true, by: "Your stroke" }])[0];
      rec("⭐ one province left alone says so", /^⚠ Your stroke left sea 7 \(102 px\) with no other sea beside it: no ship there can reach another sea\./.test(lone), lone);
      const part = M.cutOffSeasNotes([{ provinces: [7, 9], pixels: 500, from: "sea", by: "Your stroke" }])[0];
      rec("⭐ a piece of a sea that is not the ocean says what it was part of", /^⚠ Your stroke cut seas 7, 9 \(500 px\) off from the rest of the sea they were part of: no ship there can reach the rest of that sea\./.test(part), part);
    }

    console.log("\n3. A sea an adjacencies.csv row joins to the ocean is not cut off");
    {
      // a canal: a row from the sea behind the raise to the ocean, through the land between them, as the base game's Kiel
      // (2729;2408;sea;6257) and Suez (5388;803;sea;1155) rows run — ships still reach the ocean, so nothing is cut off. Measured on a copy
      // of the base game's map: raised alone, Gibraltar (5407) cut the Mediterranean off by its borders, and Suez joins it to the ocean.
      const CANAL = "3;1;sea;4;-1;-1;-1;-1;;Canal";
      const { mod } = mouth("Raised Mouth Canal", { adjacencies: [CANAL] });
      const run = await pageSave(mod, [[2, "land"]]);
      const w = run.requests.find((q) => q.url === "/api/map/set-province-terrain") || { body: {} };
      rec("the write succeeded", w.body.ok === true, w.body);
      rec("⭐⭐⭐ a sea a canal row joins to the ocean is not cut off by the raise: nothing named, 3 still sea",
        w.body.cutOffSeas === undefined && defCols(mod, 3)[4] === "sea" && defCols(mod, 3)[6] === "ocean", { cutOffSeas: w.body.cutOffSeas, row3: defCols(mod, 3).join(";") });
      rec("⭐⭐ …and the Save line says nothing of the ocean, and the Save asks nothing again", !/off from the ocean/.test(run.last) && askedAgain(run).length === 0, run.last);
      rec("THE CONTROL: the mod's own adjacencies.csv holds the canal as written", fs.readFileSync(path.join(mod, "map", "adjacencies.csv"), "utf8").split("\n").includes(CANAL));
    }

    console.log("\n4. The writer alone asks nothing: fixInlandSeas and flipProvinceToLand call it for one province");
    {
      const { mod } = mouth("Raised Mouth Opt Out");
      const before = defCols(mod, 3).join(";");
      const res = M.setProvinceDefinition({ modRoot: mod, gameRoot: world.GAME, dependencyRoots: [], provinceId: 2, type: "land", terrain: "plains", coastal: false, continent: 1, keepCoast: false });
      rec("⭐ setProvinceDefinition raises the one province, leaves the sea behind it alone, and answers no cut-off question", res.changed === true && res.cutOffSeas === undefined && defCols(mod, 3).join(";") === before && defCols(mod, 2)[4] === "land", { cutOffSeas: res.cutOffSeas, row3: defCols(mod, 3).join(";") });
    }

    // ⛔ THE REVIEW'S F1. MEASURED on a copy of the base game's map with the page's bodies: 8513 raised cut 3201, 8739 and 8812 off; 3201
    // raised next answered nothing at all, and left 8739 (1,104 px) and 8812 (102 px) each a sea with no other sea beside it.
    console.log("\n5. ⛔ A second raise inside the sea the first raise cut off is judged against that sea (review F1)");
    {
      const { mod } = lobes("Raised Lobes");
      rec("THE CONTROL: before the writes every sea reaches the ocean, and 10 and 11 touch no sea but 3", seasCutOff(mod).length === 0, seasCutOff(mod));
      const first = await srv.post("/api/map/set-province-terrain", TYPE_TO_LAND(2), mod);
      rec("THE CONTROL: raising the mouth cut 3, 10 and 11 off from the ocean", first.status === 200 && sameSeas(first, [{ provinces: [3, 10, 11], pixels: 7168, from: "ocean" }]), first.body.cutOffSeas);
      const r = await srv.post("/api/map/set-province-terrain", TYPE_TO_LAND(3), mod);
      rec("the second write succeeded", r.status === 200 && r.body.ok === true, r.body.error);
      rec("⭐⭐⭐ raising 3 cut 11 off from the rest of the sea it was in, and left that rest, 10, with no other sea beside it: both are named",
        sameSeas(r, [{ provinces: [10], pixels: 3072, from: "sea", lone: true }, { provinces: [11], pixels: 2048, from: "sea", against: [10] }]), r.body.cutOffSeas);
      rec("⭐⭐ on disk 10 and 11 are the sea they were", [10, 11].every((id) => defCols(mod, id).slice(4, 7).join(";") === "sea;true;ocean"), { 10: defCols(mod, 10).join(";"), 11: defCols(mod, 11).join(";") });
      const n = M.cutOffSeasNotes(cutOf(r)).join("\n");
      rec("⭐⭐ the notes say 11 was cut off from the rest of its sea and 10 left with no other sea beside it",
        /⚠ Turning province 3 into land cut sea 11 \(2,048 px\) off from the rest of the sea it was part of/.test(n) && /⚠ Turning province 3 into land left sea 10 \(3,072 px\) with no other sea beside it/.test(n), n);
      const fx = await srv.autoFix(mod);
      const v = await srv.validate(mod);
      rec("⭐⭐ …one Auto-fix click after them leaves nothing Save stops for", fx.status === 200 && !L2.rulesIn(v).some((rule) => ["fractioned_naval_region", "land_not_in_state", "state_split_strategic_regions", "coastal_no_port"].includes(rule)), L2.rulesIn(v));
      const t1 = L2.tree(mod);
      await srv.autoFix(mod);
      rec("⭐⭐ …and a second click writes nothing", L2.written(t1, L2.tree(mod)).length === 0, L2.written(t1, L2.tree(mod)));
    }
    {
      // …and the ocean as it was is the body with the most WATER, before the raise as after it: with the ocean ONE province of 16,384 px and
      // the sea behind the mouth three of 7,168, counting provinces took that sea for the ocean, and the answer said 11 was cut off from the ocean
      const { mod } = lobes("Raised Lobes One Ocean", { oceans: 1 });
      await srv.post("/api/map/set-province-terrain", TYPE_TO_LAND(2), mod);
      const r = await srv.post("/api/map/set-province-terrain", TYPE_TO_LAND(3), mod);
      rec("⭐⭐ with the ocean one province beside a sea of three, the second raise is still judged against the sea it was in, not taken for the ocean's",
        r.status === 200 && sameSeas(r, [{ provinces: [10], pixels: 3072, from: "sea", lone: true }, { provinces: [11], pixels: 2048, from: "sea", against: [10] }]) && defCols(mod, 1)[4] === "sea", r.body.cutOffSeas);
    }
    {
      // …and a second raise that splits nothing, but leaves ONE province of the sea the first one cut off: the sea behind the mouth is two
      // provinces (3 over 10); raising 3 next leaves 10 with no other sea beside it
      const { mod } = mouth("Raised Mouth Wide Twice", { split: true });
      const first = await srv.post("/api/map/set-province-terrain", TYPE_TO_LAND(2), mod);
      rec("THE CONTROL: raising the mouth named 3 and 10", sameSeas(first, [{ provinces: [3, 10], pixels: 10240, from: "ocean" }]), first.body.cutOffSeas);
      const r = await srv.post("/api/map/set-province-terrain", TYPE_TO_LAND(3), mod);
      rec("⭐⭐⭐ raising 3 leaves 10, all that is left of that sea, one province with no other sea beside it: it is named, and stays sea",
        r.status === 200 && sameSeas(r, [{ provinces: [10], pixels: 5120, from: "sea", lone: true }]) && defCols(mod, 10)[4] === "sea", { co: r.body.cutOffSeas, row10: defCols(mod, 10).join(";") });
    }

    // ⛔ THE REVIEW'S F2. MEASURED on a copy of Hearts of Minecraft, which ships three bodies of sea (2,071, 979 and 553 provinces): raising
    // 9872 in the 553 ("End Ocean") answered nothing, because only the largest body was asked about, and left 12242 (436 px) touching only land.
    console.log("\n6. ⛔ A raise inside a sea the map ships cut off from the ocean: the pocket it cuts off that sea is named too (review F2)");
    {
      const { mod } = lobes("Raised Inland Sea", { designed: true, split10: true });
      rec("THE CONTROL: before the write 3, 10, 11 and 13 are a sea of their own, cut off from the ocean by the map itself", JSON.stringify(seasCutOff(mod)) === "[3,10,11,13]", seasCutOff(mod));
      const r = await srv.post("/api/map/set-province-terrain", TYPE_TO_LAND(3), mod);
      rec("⭐⭐⭐ raising 3 cut 11 off from the rest of its sea (10 and 13), and only 11 is named",
        r.status === 200 && sameSeas(r, [{ provinces: [11], pixels: 2048, from: "sea", against: [10, 13] }]), r.body.cutOffSeas);
      rec("⭐⭐⭐ …and the designed sea is the sea it was: 10, 13 and 11 alike", [10, 11, 13].every((id) => defCols(mod, id)[4] === "sea"), [10, 11, 13].map((id) => defCols(mod, id).join(";")));
      rec("⭐ the note says 11 was cut off from the rest of the sea it was part of", /cut sea 11 \(2,048 px\) off from the rest of the sea it was part of/.test(M.cutOffSeasNotes(cutOf(r)).join("\n")), M.cutOffSeasNotes(cutOf(r)));
    }
    {
      const { mod } = lobes("Raised Inland Sea Wide", { designed: true, split10: true, split11: true });
      const r = await srv.post("/api/map/set-province-terrain", TYPE_TO_LAND(3), mod);
      rec("⭐⭐⭐ a piece of more provinces than the raise is named whole, cut off from the rest of its sea",
        r.status === 200 && sameSeas(r, [{ provinces: [11, 14], pixels: 2048, from: "sea", against: [10, 13] }]), r.body.cutOffSeas);
    }

    // ⛔ THE REVIEW'S F3. MEASURED on a copy of the base game's map with the page's body: sea 3201 made a lake left 8812 with no sea beside it,
    // and nothing was named. A lake is not sea to a ship.
    console.log("\n7. ⛔ A sea made a lake cuts the sea behind it off from the ocean as a raise does (review F3)");
    {
      const { mod, at } = mouth("Lake Mouth");
      const h0 = heightsOf(mod), row3 = defCols(mod, 3).join(";");
      const run = await pageSave(mod, [[2, "lake"]]);
      const w = run.requests.find((q) => q.url === "/api/map/set-province-terrain") || { body: {} };
      rec("the write succeeded", w.body.ok === true, w.body.error);
      rec("⭐⭐⭐ the answer says turning 2 into a lake cut 3 off from the ocean",
        JSON.stringify(cutOf(w)) === JSON.stringify([{ provinces: [3], pixels: 10240, from: "ocean", by: "Turning province 2 into a lake" }]), w.body.cutOffSeas);
      rec("⭐⭐ on disk 2 is a lake on lakes, and 3 the row it was", defCols(mod, 2)[4] === "lake" && defCols(mod, 2)[6] === "lakes" && defCols(mod, 3).join(";") === row3, { 2: defCols(mod, 2).join(";"), 3: defCols(mod, 3).join(";") });
      const h1 = heightsOf(mod);
      let moved = 0;
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) if ((at(x, y) === 2 || at(x, y) === 3) && h1(x, y) !== h0(x, y)) moved++;
      rec("⭐⭐ heightmap.bmp: the lake keeps its bed, and the sea behind it", moved === 0, { moved });
      rec("⭐⭐ the Save line says so, with the warned sign", /⚠ Turning province 2 into a lake cut sea 3 \(10,240 px\) off from the ocean/.test(run.last) && OPTIONS.test(run.last), run.last);
    }

    // ⛔ AS-3. A write is judged on the map as it stands when it lands, and a Save goes on: writes first in the order queued, the painted shapes
    // last (flushMapSaves). MEASURED by the review on a hand-made map: raise the mouth, then a canal row from the bay to the ocean, and the bay
    // was judged cut off with a ship still able to sail out; and on a copy of the base game's map, raise 3201 with a 25 px channel of 8812's
    // colour to sea 8739 in ONE Save. So the note is asked again when the Save ends, of the seas its writes named.
    console.log("\n8. ⛔ One Save: what its note says is true on the map that Save leaves (AS-3)");
    {
      const { mod } = mouth("Two Writes land");
      const run = await pageSave(mod, [[2, "land"], [3, "land"]]);
      const sent = run.requests.filter((q) => q.url === "/api/map/set-province-terrain").map((q) => q.sent);
      rec("THE CONTROL: the Save posted 2's write, then 3's, and both succeeded", sent.length === 2 && sent[0].provinceId === 2 && sent[1].provinceId === 3 && run.requests.every((q) => q.body.ok === true), sent);
      rec("⭐⭐⭐ 2 land, then 3 land in one Save: both as sent, and no note about 3", defCols(mod, 2)[4] === "land" && defCols(mod, 3).slice(4, 7).join(";") === "land;false;plains" && !/sea 3\b/.test(run.last) && run.pending === 0, { row3: defCols(mod, 3).join(";"), last: run.last });
      const v = await srv.validate(mod);
      rec("⭐⭐ Map Errors does not say 3 is coastal with no sea beside it", !L2.idsOf(v, "coastal_province_has_no_sea").includes(3), L2.rulesIn(v));
    }
    {
      const { mod } = mouth("Two Writes lake");
      const run = await pageSave(mod, [[2, "land"], [3, "lake"]]);
      rec("⭐⭐⭐ 2 land, then 3 a lake in one Save: both written, and no note about 3", defCols(mod, 2)[4] === "land" && defCols(mod, 3)[4] === "lake" && !/sea 3\b/.test(run.last) && run.pending === 0 && !/Save stopped/.test(run.last), { row3: defCols(mod, 3).join(";"), last: run.last });
    }
    {
      const { mod } = mouth("Two Lakes");
      const run = await pageSave(mod, [[2, "lake"], [3, "lake"]]);
      rec("⭐⭐⭐ mouth a lake, then the bay a lake: both lakes, and no note", defCols(mod, 2)[4] === "lake" && defCols(mod, 3)[4] === "lake" && !/off from the ocean/.test(run.last) && !/Save stopped/.test(run.last), { rows: [defCols(mod, 2).join(";"), defCols(mod, 3).join(";")], last: run.last });
    }
    {
      // a canal row queued BEHIND the raise: the write named 3, and the Save's end finds a ship can sail out
      const { mod } = mouth("Raise Then Canal");
      const s = await pageSession(mod);
      await s.stage([[2, "land"]]);
      s.sb.queueWrite("/api/map/adjacency", { action: "add", from: 3, to: 1, type: "sea", through: 4 });
      const run = await s.save();
      const w = run.requests.find((q) => q.url === "/api/map/set-province-terrain") || { body: {} };
      rec("THE CONTROL: the raise, written before the row, named 3", sameSeas(w, [{ provinces: [3], pixels: 10240, from: "ocean" }]) && run.requests.filter((q) => q.url === "/api/map/adjacency").length === 1, w.body.cutOffSeas);
      rec("⭐⭐⭐ a canal queued behind the raise: the Save asked again, and the line says nothing of 3", askedAgain(run).length === 1 && !/off from the ocean/.test(run.last) && defCols(mod, 3)[4] === "sea", run.last);
    }
    {
      // a channel in the same Save, which flushMapSaves writes last: 3 painted through 4 up to the ocean
      const channel = [];
      for (let y = 64; y < 100; y++) for (let x = 90; x < 96; x++) channel.push({ x, y, r: COL[3][0], g: COL[3][1], b: COL[3][2] });
      const { mod } = mouth("Raise Then Channel");
      const run = await pageSave(mod, [[2, "land"]], { paint: channel });
      const w = run.requests.find((q) => q.url === "/api/map/set-province-terrain") || { body: {} }, p = run.requests.find((q) => q.url === "/api/map/paint-provinces") || { body: {} };
      rec("THE CONTROL: the raise named 3, and the channel went after it", sameSeas(w, [{ provinces: [3], pixels: 10240, from: "ocean" }]) && p.body.ok === true, { co: w.body.cutOffSeas, err: p.body.error });
      rec("⭐⭐⭐ a channel in the same Save: the line says nothing of 3", !/off from the ocean/.test(run.last) && defCols(mod, 3)[4] === "sea", run.last);
    }
    {
      // the two pieces of a sea that is not the ocean, joined again in the same Save: a strait row between them
      const { mod } = lobes("Raise Then Strait", { designed: true });
      const s = await pageSession(mod);
      await s.stage([[3, "land"]]);
      s.sb.queueWrite("/api/map/adjacency", { action: "add", from: 10, to: 11, type: "sea", through: 12 });
      const run = await s.save();
      const w = run.requests.find((q) => q.url === "/api/map/set-province-terrain") || { body: {} };
      rec("THE CONTROL: the raise, written before the row, named the two pieces", cutOf(w).map((c) => c.provinces.join()).join("|") === "10|11" && cutOf(w)[0].lone === true && cutOf(w)[1].from === "sea", w.body.cutOffSeas);
      rec("⭐⭐⭐ a strait queued behind the raise joins them: the Save asked again, and the line names neither", askedAgain(run).length === 1 && !/seas? 1[01]\b/.test(run.last) && run.requests.filter((q) => q.url === "/api/map/adjacency").length === 1, run.last);
    }
    {
      // a Save that stops has left a map too: the raise is on disk, and what it cut off is said on the line that says it stopped
      const { mod } = mouth("Stopped Save");
      const s = await pageSession(mod, { failOnce: (url, sent) => url === "/api/map/set-province-terrain" && !!sent && sent.provinceId === 9 });
      await s.stage([[2, "land"], [9, "land", "forest"]]);
      const first = await s.save();
      rec("THE CONTROL: the first Save raised 2, then stopped at 9's write (its connection dropped)", /Save stopped at step 2/.test(first.last) && first.pending === 1 && defCols(mod, 2)[4] === "land", { last: first.last, pending: first.pending });
      rec("⭐⭐⭐ a Save that stops says what it cut off too: it has left a map", /⚠ Turning province 2 into land cut sea 3 \(10,240 px\) off from the ocean/.test(first.last), first.last);
      const second = await s.save();
      rec("⭐⭐ the next Save writes what was kept, and finishes", second.pending === 0 && defCols(mod, 9)[6] === "forest" && !/Save stopped/.test(second.last), { last: second.last, row9: defCols(mod, 9).join(";") });
    }
    {
      // a question the server cannot answer is said, and stands in for nothing
      const { mod } = mouth("Asked Again Refused");
      const s = await pageSession(mod, { failOnce: (url) => url === "/api/map/seas-cut-off" });
      await s.stage([[2, "land"]]);
      const run = await s.save();
      rec("⭐⭐ the end-of-Save question lost: the line still names the sea, says it could not ask, and the Save finished", /⚠ This Save cut sea 3 off from the rest of the water as its writes went, and Nova could not ask whether that still holds: the connection was reset\./.test(run.last) && run.pending === 0, run.last);
    }
    {
      // …and a Save that stops at a 🏘 town write has left one as well: the town run in flushMapSaves has two exits of its own (#a-victory-point-has-a-town)
      const { mod } = mouth("Stopped At A Town");
      const s = await pageSession(mod, { failOnce: (url) => url === "/api/map/victory-point-towns" });
      await s.stage([[2, "land"]]);
      s.sb.queueWrite("/api/map/victory-point-towns", { stateId: 1, provinces: [4] });
      const run = await s.save();
      rec("THE CONTROL: the Save raised 2, then stopped at the town write (its connection dropped)", /Save stopped at step 2: the connection was reset/.test(run.last) && run.pending === 1 && defCols(mod, 2)[4] === "land", { last: run.last, pending: run.pending });
      rec("⭐⭐⭐ a Save whose connection drops at a town write says what it cut off too", /⚠ Turning province 2 into land cut sea 3 \(10,240 px\) off from the ocean/.test(run.last) && askedAgain(run).length === 1, run.last);
    }
    {
      const { mod } = mouth("Town Refused");
      const s = await pageSession(mod);
      await s.stage([[2, "land"]]);
      s.sb.queueWrite("/api/map/victory-point-towns", { stateId: 1, provinces: [] });   // the server: "No province was given a town."
      const run = await s.save();
      const town = run.requests.find((q) => q.url === "/api/map/victory-point-towns") || { body: {} };
      rec("THE CONTROL: the Save raised 2, then the server refused the town write", town.body.ok === false && /Save stopped at step 2: No province was given a town/.test(run.last) && run.pending === 1 && defCols(mod, 2)[4] === "land", { last: run.last, body: town.body });
      rec("⭐⭐⭐ a Save refused at a town write says what it cut off too", /⚠ Turning province 2 into land cut sea 3 \(10,240 px\) off from the ocean/.test(run.last) && askedAgain(run).length === 1, run.last);
    }
    {
      // …and every way out, read off the page: a Save always ends at the gate (#a-stopped-save-skips-the-crash-gate), so each call of it asks first, and a run of writes with exits of its own cannot forget to
      const from = P.MASKED.indexOf("async function flushMapSaves"), to = P.MASKED.indexOf("} finally { if (btn) btn.disabled = false; updateSaveButton(); }", from);
      const beforeGate = P.MASKED.slice(from, to).split("await mapCrashGate(").slice(0, -1);
      rec("THE CONTROL: flushMapSaves was found, and it goes to the gate by more than one way", from !== -1 && to > from && beforeGate.length > 1, { from, to, gates: beforeGate.length });
      const silent = beforeGate.filter((text) => !/await sayCutOffSeas\(\);\s*(const \w+ = )?$/.test(text));
      rec("⭐⭐⭐ every way a Save ends asks about the seas its writes named before it goes to the gate", silent.length === 0, silent.map((text) => text.slice(-160)));
    }

    console.log("\n9. The raise stands on the right continent; nothing beside the sea it cut off moves");
    {
      const { mod } = mouth("Raised Mouth Island", { island: true, bunker: true, continent: 2 });
      rec("THE CONTROL: island 15 stands in sea 3 alone, flagged coastal, the coastal fort on 4 faces 3, and the land is on continent 2",
        defCols(mod, 15)[5] === "true" && fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8").split("\n").includes(BUNKER) && defCols(mod, 4)[7] === "2");
      const r = await srv.post("/api/map/set-province-terrain", TYPE_TO_LAND(2), mod);
      rec("THE CONTROL: the write named 3", r.status === 200 && cutOf(r).length === 1 && JSON.stringify(cutOf(r)[0].provinces) === "[3]", r.body.cutOffSeas);
      const rows = fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8").split(/\r?\n/);
      rec("⭐⭐ island 15, whose sea is still there, is still coastal", defCols(mod, 15)[5] === "true" && !((r.body.coastalFlags || {}).lost || []).includes(15), { row: defCols(mod, 15).join(";"), coastalFlags: r.body.coastalFlags });
      rec("⭐⭐ the coastal fort on 4 still faces the sea it faced", rows.includes(BUNKER), rows.filter((l) => l.split(";")[1] === "coastal_bunker"));
      rec("⭐⭐ the raised province is on its land neighbours' continent (2), not continent 1", defCols(mod, 2)[7] === "2", defCols(mod, 2).join(";"));
      const v = await srv.validate(mod);
      rec("⭐ Map Errors says no province is coastal with no sea beside it", !L2.rulesIn(v).includes("coastal_province_has_no_sea"), L2.rulesIn(v));
    }
    {
      // …and land the mod had made sea goes back on the continent it had below, before the continent of the land beside it: the two
      // readers Generate land asks, in its order (continentsOfTheLandBelow, then continentsFromNeighbouringLand seeded with it;
      // #a-raised-province-keeps-its-continent). Province 2 here has the colour the layer below's land province 2 has, on continent 1,
      // and the land round it is on 2.
      const { mod } = mouth("Raised Mouth Below", { continent: 2, recolour: { 2: L2.COL[2], 4: [210, 20, 20] } });
      rec("THE CONTROL: the layer below has a land province 2 of the same colour, on continent 1", L2.DEF_ROWS[2] === `2;${L2.COL[2].join(";")};land;true;plains;1` && defCols(mod, 2).slice(1, 4).join(";") === L2.COL[2].join(";"), defCols(mod, 2).join(";"));
      const r = await srv.post("/api/map/set-province-terrain", TYPE_TO_LAND(2), mod);
      rec("⭐⭐ the raised province goes back on the continent it had below (1), not its neighbours' (2)", r.status === 200 && defCols(mod, 2)[7] === "1", defCols(mod, 2).join(";"));
    }

    // ⛔ THE REVIEW'S F4. MEASURED on a copy of the base game's map with the page's body: the 8 px of sea 3201 touching sea 8812, painted with
    // land 1830's colour, left 8812 touching land alone. A ✏ Paint shape stroke asks the raise's question of the borders it moved.
    console.log("\n10. ⛔ A ✏ Paint shape stroke that cuts a sea off names it, and leaves it as it is (review F4)");
    // the review's stroke: every pixel of the mouth 2 that touches 3, painted with 4's colour (the brush is always a province's colour)
    const MOUTH_STROKE = [];
    for (let x = 96; x < 160; x++) MOUTH_STROKE.push({ x, y: 95, r: COL[4][0], g: COL[4][1], b: COL[4][2] });
    const paintPost = (mod, diff) => srv.post("/api/map/paint-provinces", { diff }, mod);   // flushMapSaves's body: { modPath, diff }
    {
      const { mod } = mouth("Painted Mouth", { loneSea: true, bunker: true });
      rec("THE CONTROL: before the stroke sea 20 stands in land 6 with no sea beside it and a harbour facing it (a sea the map ships on its own), and every other sea reaches the ocean",
        JSON.stringify(seasCutOff(mod)) === "[20]", seasCutOff(mod));
      const row3 = defCols(mod, 3).join(";"), h0 = heightsOf(mod);
      const run = await pageSave(mod, [], { paint: MOUTH_STROKE });
      const p = run.requests.find((q) => q.url === "/api/map/paint-provinces") || { body: {} };
      rec("THE CONTROL: the page's Save posted the stroke with the mod's path, and it applied", !!p.sent && p.sent.modPath === mod && p.sent.diff.length === 64 && p.body.ok === true && p.body.applied === 64, { ok: p.body.ok, error: p.body.error });
      rec("⭐⭐⭐ the answer says the stroke cut 3 off from the ocean, its size after the stroke, and what did it",
        JSON.stringify(cutOf(p)) === JSON.stringify([{ provinces: [3], pixels: 10240, from: "ocean", by: "Your stroke" }]), p.body.cutOffSeas);
      rec("⭐⭐⭐ on disk 3 is the row it was", defCols(mod, 3).join(";") === row3, defCols(mod, 3).join(";"));
      rec("⭐⭐⭐ …and sea 20, which the stroke did not cut, is sea and named nowhere: a stroke judges only the seas it cut", defCols(mod, 20)[4] === "sea" && !cutOf(p).some((k) => (k.provinces || []).includes(20)), { row20: defCols(mod, 20).join(";"), co: p.body.cutOffSeas });
      const h = heightsOf(mod);
      let moved3 = 0;
      for (let y = 96; y < 256; y++) for (let x = 96; x < 160; x++) if (h(x, y) !== h0(x, y)) moved3++;
      rec("⭐⭐ heightmap.bmp: every pixel of 3 is the height it was", moved3 === 0, { moved3 });
      rec("⭐⭐ the coastal fort on 4 that faced 3 still does", fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8").split(/\r?\n/).includes(BUNKER));
      rec("⭐⭐⭐ the Save line says so, with the warned sign and what to do", /⚠ Your stroke cut sea 3 \(10,240 px\) off from the ocean/.test(run.last) && OPTIONS.test(run.last), run.last);
      rec("⭐ the page reads no map again for it", run.loads.length === 0, run.loads);
      const v = await srv.validate(mod);
      rec("⭐⭐ Map Errors says the sea is a piece of its region, as the game's own check would", L2.idsOf(v, "fractioned_naval_region").includes(3), { rules: L2.rulesIn(v), fractioned: L2.idsOf(v, "fractioned_naval_region") });
      const fx = await srv.autoFix(mod);
      const v2 = await srv.validate(mod);
      rec("⭐⭐ one Auto-fix click settles it", fx.status === 200 && !L2.rulesIn(v2).includes("fractioned_naval_region"), L2.rulesIn(v2));
      const t1 = L2.tree(mod);
      await srv.autoFix(mod);
      rec("⭐⭐ …and a second click writes nothing", L2.written(t1, L2.tree(mod)).length === 0, L2.written(t1, L2.tree(mod)));
    }
    {
      // ⛔ …and a piece of land the click homes goes where the rest of its state stands. MEASURED on a copy of the base game's map: with 8812
      // land and cut off from the Northwest Coast (171), one Auto-fix click put it in Alaska (463) and then moved Alaska — the whole of North
      // America (33) — into the Bering Sea (88), a region of sea, leaving 33 empty; Map Errors read 0/0. Here state 1 (4 5 6) is the whole of
      // land region 2, and the ocean is a region (6) of its own that state 1 borders more than any other region; the modder has made the
      // sea the stroke cut off land. #a-cut-off-land-joins-its-states-region
      const { mod } = mouth("Painted Mouth Regions", { ownRegions: true });
      const r0 = regionsOf(mod);
      rec("THE CONTROL: before the stroke each part is a region of its own, and Map Errors names nothing Save stops for",
        JSON.stringify(r0) === JSON.stringify({ 1: [2, 3], 2: [4, 5, 6], 4: [7, 8, 9], 6: [1] }) && !L2.rulesIn(await srv.validate(mod)).includes("fractioned_naval_region"), r0);
      const p = await paintPost(mod, MOUTH_STROKE);
      rec("THE CONTROL: the stroke named 3, and left it sea", sameSeas(p, [{ provinces: [3], pixels: 10240, from: "ocean" }]) && defCols(mod, 3)[4] === "sea", p.body.cutOffSeas);
      const raised = await srv.post("/api/map/set-province-terrain", TYPE_TO_LAND(3), mod);
      rec("THE CONTROL: the modder made it land", raised.status === 200 && defCols(mod, 3)[4] === "land", raised.body.error);
      const fx = await srv.autoFix(mod);
      const st1 = fs.readFileSync(path.join(mod, "history", "states", "1-S.txt"), "utf8"), st2 = fs.readFileSync(path.join(mod, "history", "states", "2-S.txt"), "utf8");
      const holder = /provinces = \{[^}]*\b3\b/.test(st1) ? 1 : /provinces = \{[^}]*\b3\b/.test(st2) ? 2 : 0;
      const r1 = regionsOf(mod), want = holder === 1 ? { 1: [2], 2: [3, 4, 5, 6], 4: [7, 8, 9], 6: [1] } : { 1: [2], 2: [4, 5, 6], 4: [3, 7, 8, 9], 6: [1] };
      // (before the fix the click moved state 1 and 3 whole into region 4, the region they border most here, and left region 2 empty)
      rec("⭐⭐⭐ one Auto-fix click puts 3 in the region the rest of its state stands in, and moves no other province: the state is not moved whole into a region beside it, and no region is emptied",
        fx.status === 200 && holder > 0 && JSON.stringify(r1) === JSON.stringify(want), { state: holder, regions: r1, fr: ((fx.body || {}).fixes || {}).fractionedRegions });
      const v = await srv.validate(mod);
      rec("⭐⭐ …and Map Errors names nothing Save stops for", !L2.rulesIn(v).some((r) => ["fractioned_naval_region", "land_not_in_state", "state_split_strategic_regions"].includes(r)), L2.rulesIn(v));
      const t1 = L2.tree(mod);
      await srv.autoFix(mod);
      rec("⭐ a second click writes nothing", L2.written(t1, L2.tree(mod)).length === 0, L2.written(t1, L2.tree(mod)));
    }
    {
      // a harbour faces 3: named like any other
      const PORT = "1;naval_base_spawn;95.00;9.50;79.00;0.00;3";
      const { mod } = mouth("Painted Mouth Harbour", { extraPorts: [PORT] });
      const r = await paintPost(mod, MOUTH_STROKE);
      rec("⭐⭐⭐ a sea a harbour faces is named, stays sea, and keeps its harbour",
        r.status === 200 && sameSeas(r, [{ provinces: [3], pixels: 10240, from: "ocean" }]) && defCols(mod, 3)[4] === "sea" && harbours(mod).includes(PORT), r.body.cutOffSeas);
    }
    {
      const { mod } = mouth("Painted Mouth Wide", { split: true });
      const r = await paintPost(mod, MOUTH_STROKE);
      rec("⭐⭐⭐ a piece of more than one province is named whole, and stays sea",
        r.status === 200 && sameSeas(r, [{ provinces: [3, 10], pixels: 10240, from: "ocean" }]) && defCols(mod, 3)[4] === "sea" && defCols(mod, 10)[4] === "sea", r.body.cutOffSeas);
    }
    {
      // ⛔ one stroke that splits two bodies of sea and joins a piece of each into a piece smaller than what is left of either: the ocean 1
      // loses 21 below it, the sea 22 + 23 the map ships on its own loses 23, and a channel of 21's colour joins 21 to 23. The piece 21 + 23
      // is cut off from both bodies, and is named once — as cut off from the ocean, the first body it was part of.
      const C = { 1: [0, 0, 200], 4: [200, 0, 0], 21: [100, 150, 220], 22: [110, 160, 230], 23: [120, 170, 240] };
      const rects = [[1, 0, 0, 256, 64], [4, 0, 64, 256, 256], [21, 16, 64, 48, 96], [22, 160, 160, 224, 224], [23, 128, 160, 160, 192]];
      const at = (x, y) => { let id = 0; for (const [p, x0, y0, x1, y1] of rects) if (x >= x0 && x < x1 && y >= y0 && y < y1) id = p; return id; };
      const seas = new Set([1, 21, 22, 23]);
      const mod = world.mod("Painted Join", {
        "descriptor.mod": `name="Painted Join"\nsupported_version="1.*"\nreplace_path="history/states"\nreplace_path="map/strategicregions"\n`,
        "map/provinces.bmp": L2.bmp24(256, 256, (x, y) => C[at(x, y)]),
        "map/definition.csv": ["0;0;0;0;land;false;unknown;0", ...[1, 4, 21, 22, 23].map((id) => `${id};${C[id].join(";")};${seas.has(id) ? "sea;true;ocean;0" : "land;true;forest;1"}`)].join("\r\n") + "\r\n",
        "map/heightmap.bmp": bmp8(256, 256, (x, y) => (seas.has(at(x, y)) ? SEA_HEIGHT : LAND_HEIGHT)),
        "map/buildings.txt": ["1;air_base;48.00;9.50;100.00;0.00;0", "1;rocket_site_spawn;48.00;9.50;100.00;0.00;0", "1;naval_base_spawn;100.00;9.50;191.00;0.00;1"].join("\n"),
        "map/strategicregions/1-R.txt": L2.region(1, "1 21"), "map/strategicregions/3-R.txt": L2.region(3, "22 23"), "map/strategicregions/2-R.txt": L2.region(2, "4"),
        "history/states/1-S.txt": L2.st(1, "4"),
        "common/terrain/00_terrain.txt": TERRAIN,
      });
      rec("THE CONTROL: before the stroke 22 and 23 are a sea the map ships on its own, and 21 reaches the ocean", JSON.stringify(seasCutOff(mod)) === "[22,23]", seasCutOff(mod));
      const stroke = [], put = (x, y, c) => stroke.push({ x, y, r: c[0], g: c[1], b: c[2] });
      for (let x = 16; x < 48; x++) put(x, 64, C[4]);                                       // 21 off the ocean
      for (let y = 160; y < 192; y++) put(159, y, C[4]);                                    // 23 off 22
      for (let y = 96; y < 160; y++) for (let x = 44; x < 48; x++) put(x, y, C[21]);       // …and a channel of 21's down to 23
      for (let y = 156; y < 160; y++) for (let x = 48; x < 144; x++) put(x, y, C[21]);
      const r = await paintPost(mod, stroke);
      const names = cutOf(r).map((c) => `${c.provinces.join("+")}:${c.from}${c.lone ? ":lone" : ""}`);
      rec("⭐⭐ a stroke that cuts a piece off two seas at once names it once: 21 and 23 cut off from the ocean, and 22 left one province with no other sea beside it, and all three stay sea",
        r.status === 200 && JSON.stringify(names) === JSON.stringify(["21+23:ocean", "22:sea:lone"]) && [21, 22, 23].every((id) => defCols(mod, id)[4] === "sea"), { co: r.body.cutOffSeas, error: r.body.error });
    }
    {
      // ⛔ one stroke that cuts two seas off names both. The ocean 1 across the top, land 4 (continent 2) below it, and two bays, 21 and 22,
      // each one province opening onto the ocean; island 15 stands in bay 22, flagged coastal. The stroke closes both mouths.
      const C = { 1: [0, 0, 200], 4: [200, 120, 40], 15: [160, 160, 160], 21: [100, 150, 220], 22: [110, 160, 230] };
      const rects = [[1, 0, 0, 256, 64], [4, 0, 64, 256, 256], [21, 32, 64, 64, 128], [22, 160, 64, 192, 128], [15, 168, 96, 184, 112]];
      const at = (x, y) => { let id = 0; for (const [p, x0, y0, x1, y1] of rects) if (x >= x0 && x < x1 && y >= y0 && y < y1) id = p; return id; };
      const seas = new Set([1, 21, 22]);
      const mod = world.mod("Painted Two Bays", {
        "descriptor.mod": `name="Painted Two Bays"\nsupported_version="1.*"\nreplace_path="history/states"\nreplace_path="map/strategicregions"\n`,
        "map/provinces.bmp": L2.bmp24(256, 256, (x, y) => C[at(x, y)]),
        "map/definition.csv": ["0;0;0;0;land;false;unknown;0", `1;${C[1].join(";")};sea;true;ocean;0`, `4;${C[4].join(";")};land;true;forest;2`, `15;${C[15].join(";")};land;true;plains;2`,
          `21;${C[21].join(";")};sea;true;ocean;0`, `22;${C[22].join(";")};sea;true;ocean;0`].join("\r\n") + "\r\n",
        "map/heightmap.bmp": bmp8(256, 256, (x, y) => (seas.has(at(x, y)) ? SEA_HEIGHT : LAND_HEIGHT)),
        "map/buildings.txt": ["1;air_base;128.00;9.50;100.00;0.00;0", "1;rocket_site_spawn;128.00;9.50;100.00;0.00;0", "1;naval_base_spawn;100.00;9.50;191.00;0.00;1"].join("\n"),
        "map/strategicregions/1-R.txt": L2.region(1, "1 21 22"), "map/strategicregions/2-R.txt": L2.region(2, "4 15"),
        "history/states/1-S.txt": L2.st(1, "4 15"),
        "common/terrain/00_terrain.txt": TERRAIN,
      });
      rec("THE CONTROL: before the stroke every sea reaches the ocean, and island 15 stands in bay 22 alone, flagged coastal", seasCutOff(mod).length === 0 && defCols(mod, 15)[5] === "true", seasCutOff(mod));
      const stroke = [];
      for (const x0 of [32, 160]) for (let x = x0; x < x0 + 32; x++) stroke.push({ x, y: 64, r: C[4][0], g: C[4][1], b: C[4][2] });   // both mouths, with 4's colour
      const csv0 = fs.readFileSync(path.join(mod, "map", "definition.csv"));
      const r = await paintPost(mod, stroke);
      rec("⭐⭐⭐ the stroke cut both bays off and names both", r.status === 200 && cutOf(r).map((c) => c.provinces.join("+")).join() === "21,22" && cutOf(r).every((c) => c.from === "ocean"), { co: r.body.cutOffSeas, error: r.body.error });
      rec("⭐⭐⭐ definition.csv is byte for byte the file it was", fs.readFileSync(path.join(mod, "map", "definition.csv")).equals(csv0));
    }
    {
      // THE CONTROLS: a stroke that moves land between land provinces, and one that takes sea pixels and cuts nothing off
      const { mod } = mouth("Painted Land");
      const csv0 = fs.readFileSync(path.join(mod, "map", "definition.csv"));
      const land = [];
      for (let y = 100; y < 110; y++) for (let x = 40; x < 64; x++) land.push({ x, y, r: COL[4][0], g: COL[4][1], b: COL[4][2] });   // 5's pixels to 4
      const r1 = await paintPost(mod, land);
      rec("THE CONTROL: a stroke that moves land between land provinces answers no cut-off question and writes no row",
        r1.status === 200 && r1.body.ok === true && r1.body.cutOffSeas === undefined && fs.readFileSync(path.join(mod, "map", "definition.csv")).equals(csv0), r1.body.cutOffSeas);
      const bite = [];
      for (let y = 150; y < 154; y++) for (let x = 96; x < 100; x++) bite.push({ x, y, r: COL[4][0], g: COL[4][1], b: COL[4][2] });   // 4 grows into 3
      const r2 = await paintPost(mod, bite);
      rec("THE CONTROL: a stroke that takes sea pixels and cuts nothing off names nothing",
        r2.status === 200 && r2.body.ok === true && r2.body.cutOffSeas === undefined && defCols(mod, 3)[4] === "sea" && fs.readFileSync(path.join(mod, "map", "definition.csv")).equals(csv0), r2.body.cutOffSeas);
    }

    // ⛔ THE REVIEW OF THE FILL, ON HAND-MADE MAPS. A country in a bay: the ocean over the top, mouth 2 and bay 3 as in `mouth`; 4 land on the
    // left; 7 a strip over 10 on the right; state 2 is 10 alone, its only coast on the mouth and the bay.
    const BAY_RECTS = [[1, 0, 0, 256, 64], [4, 0, 64, 96, 256], [2, 96, 64, 160, 96], [3, 96, 96, 160, 256], [7, 160, 64, 256, 80], [10, 160, 80, 256, 256]];
    const BAY_AIR = ["1;air_base;48.00;9.50;100.00;0.00;0", "1;rocket_site_spawn;48.00;9.50;100.00;0.00;0", "2;air_base;208.00;9.50;100.00;0.00;0", "2;rocket_site_spawn;208.00;9.50;100.00;0.00;0", "1;naval_base_spawn;48.00;9.50;191.00;0.00;1"];
    /** A hand-made map of rectangles, a later one over an earlier: `rows` [[id, "sea"|"land"]]; 0 is the file's blank row. */
    const handMade = (name, { rects, rows, regions, states, buildings, extra = {} }) => {
      const at = (x, y) => { let id = 0; for (const [p, x0, y0, x1, y1] of rects) if (x >= x0 && x < x1 && y >= y0 && y < y1) id = p; return id; };
      const seas = new Set(rows.filter((r) => r[1] === "sea").map((r) => r[0]));
      const files = {
        "descriptor.mod": `name="${name}"\nsupported_version="1.*"\nreplace_path="history/states"\nreplace_path="map/strategicregions"\n`,
        "map/provinces.bmp": L2.bmp24(256, 256, (x, y) => COL[at(x, y)]),
        "map/definition.csv": ["0;0;0;0;land;false;unknown;0"].concat(rows.map(([id, type]) => `${id};${COL[id].join(";")};${type};true;${type === "sea" ? "ocean" : "plains"};${type === "sea" ? 0 : 1}`)).join("\r\n") + "\r\n",
        "map/heightmap.bmp": bmp8(256, 256, (x, y) => (seas.has(at(x, y)) ? SEA_HEIGHT : LAND_HEIGHT)),
        "map/buildings.txt": buildings.join("\n"),
        "common/terrain/00_terrain.txt": TERRAIN,
        ...extra,
      };
      for (const [id, p] of Object.entries(regions)) files[`map/strategicregions/${id}-R.txt`] = L2.region(+id, p);
      for (const [id, s] of Object.entries(states)) files[`history/states/${id}-S.txt`] = L2.st(+id, s.provinces, s.opts || {});
      return world.mod(name, files);
    };
    const stateText = (mod, id) => fs.readFileSync(path.join(mod, "history", "states", `${id}-S.txt`), "utf8");
    // (a country that owns no state never loads its start files: state 2 is BBB's)
    const ownedBy = (id, provinces, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provinces} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
    const fleetAt = (location, home) => ["units = {", "\tfleet = {", '\t\tname = "Bay Fleet"', `\t\tnaval_base = ${home}`, "\t\ttask_force = {", '\t\t\tname = "Bay Fleet TF"', `\t\t\tlocation = ${location}`, '\t\t\tship = { name = "HMS A" definition = destroyer equipment = { ship_hull_light_1 = { amount = 1 owner = BBB } } }', "\t\t}", "\t}", "}", ""].join("\n");
    /** The country in the bay, BBB's, with a fleet based at 10 and lying at `location`: no naval building in any state. */
    const bayFleet = (name, location) => handMade(name, { rects: BAY_RECTS, rows: [[1, "sea"], [2, "sea"], [3, "sea"], [4, "land"], [7, "land"], [10, "land"]],
      regions: { 1: "1 2 3", 2: "4 7 10" }, states: {},
      buildings: [...BAY_AIR, "2;naval_base_spawn;160.00;9.50;165.00;0.00;2"],
      extra: { "history/states/1-S.txt": ownedBy(1, "4 7", "AAA"), "history/states/2-S.txt": ownedBy(2, "10", "BBB"), "history/countries/AAA - A.txt": "capital = 1\n", "history/countries/BBB - B.txt": 'capital = 2\noob = "BBB_1936"\n',
        "history/units/BBB_1936.txt": fleetAt(location, 10), "common/country_tags/00_countries.txt": 'AAA = "countries/A.txt"\nBBB = "countries/B.txt"\n' } });
    console.log("\n11. ⛔ What the fill took, on maps a modder could own (AS-1, AS-2, AS-5, AS-8)");
    {
      // AS-1. The harbour of state 2 faces the mouth, so the raise turns it to the bay. With the fill the bay went land, the harbour with it,
      // and Auto-fix then stripped the dockyard and the naval base from a state with no coast left.
      const HISTORY = "\t\tbuildings = {\n\t\t\tdockyard = 3\n\t\t\tindustrial_complex = 1\n\t\t\t10 = {\n\t\t\t\tnaval_base = 2\n\t\t\t}\n\t\t}\n";
      const mod = handMade("Bay Country", { rects: BAY_RECTS, rows: [[1, "sea"], [2, "sea"], [3, "sea"], [4, "land"], [7, "land"], [10, "land"]],
        regions: { 1: "1 2 3", 2: "4 7 10" }, states: { 1: { provinces: "4 7" }, 2: { provinces: "10", opts: { history: HISTORY } } },
        buildings: [...BAY_AIR, "2;naval_base_spawn;160.00;9.50;165.00;0.00;2"] });
      const run = await pageSave(mod, [[2, "land"]]);
      rec("⭐⭐⭐ AS-1: the raise leaves the bay sea and names it", defCols(mod, 3)[4] === "sea" && /⚠ Turning province 2 into land cut sea 3/.test(run.last), { row3: defCols(mod, 3).join(";"), last: run.last });
      await srv.autoFix(mod);
      const st = stateText(mod, 2);
      // (the click's own region passes move the bay into a land region, where nothing but a navy's need keeps it: #a-sea-a-navy-needs-is-put-to-use)
      rec("⭐⭐⭐ …and after one Auto-fix click state 2 keeps its dockyard and its naval base, and the bay and the coast they stand on", /dockyard = 3/.test(st) && /naval_base = 2/.test(st) && defCols(mod, 3)[4] === "sea" && defCols(mod, 10)[5] === "true", { st, row3: defCols(mod, 3).join(";"), row10: defCols(mod, 10).join(";") });
      rec("⭐⭐ …with a harbour of its own on the bay, which that click gave it", harbours(mod).some((l) => l.split(";")[0] === "2" && l.split(";")[6] === "3"), harbours(mod));
      const v = await srv.validate(mod);
      rec("⭐⭐ …and nothing is left that Save stops for", !L2.rulesIn(v).some((r) => ["fractioned_naval_region", "land_not_in_state", "state_split_strategic_regions", "coastal_no_port", "state_naval_building_without_coast"].includes(r)), L2.rulesIn(v));
      const t1 = L2.tree(mod);
      await srv.autoFix(mod);
      rec("⭐⭐⭐ …and a second click writes nothing", L2.written(t1, L2.tree(mod)).length === 0, L2.written(t1, L2.tree(mod)));
    }
    {
      // AS-2. A fleet lying in the bay, and no harbour faces it from the row's own sea: with the fill the task force was on land, a fatal.
      const mod = bayFleet("Bay Fleet", 3);
      await pageSave(mod, [[2, "land"]]);
      const v = await srv.validate(mod);
      rec("⭐⭐⭐ AS-2: a fleet lying in the bay is on the sea it was on, and Map Errors does not say it starts on land", defCols(mod, 3)[4] === "sea" && !L2.rulesIn(v).some((r) => /fleet_starts_on_land/.test(r)), L2.rulesIn(v));
      await srv.autoFix(mod);
      const v1 = await srv.validate(mod);
      rec("⭐⭐⭐ …and after one Auto-fix click the bay is still sea, and the fleet's home port has a sea beside it", defCols(mod, 3)[4] === "sea" && defCols(mod, 10)[5] === "true" && !L2.rulesIn(v1).includes("fleet_home_port_has_no_sea"), { row3: defCols(mod, 3).join(";"), rules: L2.rulesIn(v1) });
      const t1 = L2.tree(mod);
      await srv.autoFix(mod);
      rec("⭐⭐ …and a second click writes nothing", L2.written(t1, L2.tree(mod)).length === 0, L2.written(t1, L2.tree(mod)));
    }
    {
      // …and a fleet whose home is the land on the bay, with no naval building and no harbour: the click's region passes unprotect the bay, and nothing else speaks for it
      const mod = bayFleet("Bay Fleet Home", 10);
      await pageSave(mod, [[2, "land"]]);
      await srv.autoFix(mod);
      const v = await srv.validate(mod);
      rec("⭐⭐⭐ a fleet at home on the bay: after one Auto-fix click the bay is still sea, and the home port has a sea beside it", defCols(mod, 3)[4] === "sea" && defCols(mod, 10)[5] === "true" && !L2.rulesIn(v).includes("fleet_home_port_has_no_sea") && !L2.rulesIn(v).includes("fleet_starts_on_land_with_no_sea"), { row3: defCols(mod, 3).join(";"), rules: L2.rulesIn(v) });
    }
    {
      // AS-5. A designed inland sea in a region of its own, no harbour on it: a 64 px stroke along the seam of its two provinces filled it whole.
      const INLAND = { rects: [[1, 0, 0, 256, 64], [4, 0, 64, 128, 256], [7, 128, 64, 256, 256], [5, 96, 128, 128, 192], [6, 128, 128, 160, 192]],
        rows: [[1, "sea"], [4, "land"], [5, "sea"], [6, "sea"], [7, "land"]], regions: { 1: "1", 2: "4 7", 3: "5 6" }, states: { 1: { provinces: "4" }, 2: { provinces: "7" } }, buildings: BAY_AIR.concat("2;naval_base_spawn;208.00;9.50;191.00;0.00;1") };
      const seam = [];
      for (let y = 128; y < 192; y++) seam.push({ x: 127, y, r: COL[4][0], g: COL[4][1], b: COL[4][2] });
      const mod = handMade("Designed Sea", INLAND);
      const rows0 = [5, 6].map((id) => defCols(mod, id).join(";"));
      const run = await pageSave(mod, [], { paint: seam });
      rec("⭐⭐⭐ AS-5: a stroke along the seam of a designed sea leaves both its provinces as they were, and names both",
        [5, 6].every((id, i) => defCols(mod, id).join(";") === rows0[i]) && /⚠ Your stroke cut sea 5 \(1,984 px\) off from the rest of the sea it was part of/.test(run.last) && /⚠ Your stroke left sea 6 \(2,048 px\) with no other sea beside it/.test(run.last), { rows: [5, 6].map((id) => defCols(mod, id).join(";")), last: run.last });
      const mod2 = handMade("Designed Sea Raised", INLAND);
      const row6 = defCols(mod2, 6).join(";");
      const run2 = await pageSave(mod2, [[5, "land"]]);
      rec("⭐⭐⭐ …and raising one of them leaves the other as it was, and names it", defCols(mod2, 6).join(";") === row6 && /⚠ Turning province 5 into land left sea 6 \(2,048 px\) with no other sea beside it/.test(run2.last), run2.last);
      const mod3 = handMade("Designed Sea Nudged", INLAND);
      const nudge = [[100, 128], [101, 128], [102, 128], [103, 128]].map(([x, y]) => ({ x, y, r: COL[4][0], g: COL[4][1], b: COL[4][2] }));
      const run3 = await pageSave(mod3, [], { paint: nudge });
      rec("THE CONTROL: a shoreline nudge on it names nothing", askedAgain(run3).length === 0 && !/⚠ Your stroke/.test(run3.last), run3.last);
    }
    {
      // ⛔ #a-sea-the-modder-did-not-make-stays-sea — the note says they can leave it, so a click must not take it. A fresh add-on over a map that owns these seas, as a fresh mod is
      // over the base game: no unitstacks.txt of its own to speak for them. MEASURED on a fresh mod over the base game: 8513 raised, then one click made 3201, 8739 and 8812 land.
      const { mod: below } = mouth("Fresh Over This", { split: true });
      const belowTree = L2.tree(below);
      const addOn = world.mod("Fresh Add-on", { "common/terrain/00_terrain.txt": TERRAIN }, ["Fresh Over This"]);
      const run = await pageSave(addOn, [[2, "land"]]);
      rec("THE CONTROL: the Save names the two seas behind the raise, and tells the modder they can leave them", /⚠ Turning province 2 into land cut seas 3, 10 \(10,240 px\) off from the ocean/.test(run.last) && OPTIONS.test(run.last), run.last);
      rec("THE CONTROL: the add-on has no unit layout of its own to speak for them", !fs.existsSync(path.join(addOn, "map", "unitstacks.txt")));
      const fx = await srv.autoFix(addOn);
      const v = await srv.validate(addOn);
      const labels = require("./public/map-rule-labels.js");
      rec("⭐⭐⭐ one Auto-fix click leaves them sea", defCols(addOn, 3)[4] === "sea" && defCols(addOn, 10)[4] === "sea" && !((fx.body.fixes || {}).inlandSeas || {}).fixed, { rows: [defCols(addOn, 3).join(";"), defCols(addOn, 10).join(";")], inland: (fx.body.fixes || {}).inlandSeas });
      rec("⭐⭐ …with nothing fatal left", !L2.rulesIn(v).some((r) => labels.isFatalRule(r)), L2.rulesIn(v));
      const t1 = L2.tree(addOn);
      await srv.autoFix(addOn);
      rec("⭐⭐⭐ …and a second click writes nothing", L2.written(t1, L2.tree(addOn)).length === 0, L2.written(t1, L2.tree(addOn)));
      rec("THE CONTROL: the map below it is as it was", L2.written(belowTree, L2.tree(below)).length === 0, L2.written(belowTree, L2.tree(below)));
    }
    {
      // AS-8. One Save: raise the mouth, erase 10, whose only sea was the bay, then 4's terrain. With the fill the erase was refused ("isn't
      // coastal"), and every later Save stopped at the same write for good.
      const mod = handMade("Stuck", { rects: BAY_RECTS, rows: [[1, "sea"], [2, "sea"], [3, "sea"], [4, "land"], [7, "land"], [10, "land"]],
        regions: { 1: "1 2 3", 2: "4 7 10" }, states: { 1: { provinces: "4 7" }, 2: { provinces: "10" } }, buildings: BAY_AIR.concat("2;naval_base_spawn;208.00;9.50;60.00;0.00;1") });
      const s = await pageSession(mod);
      await s.stage([[2, "land"]]);
      s.sb.queueWrite("/api/map/flip-province-sea", { provinceId: 10 });
      await s.stage([[4, "land", "forest"]]);
      const run = await s.save();
      rec("⭐⭐⭐ AS-8: all three writes land, the Save finishes and says three changes", defCols(mod, 2)[4] === "land" && defCols(mod, 10)[4] === "sea" && defCols(mod, 4)[6] === "forest" && run.pending === 0 && !/Save stopped/.test(run.last) && /Saved 3 changes/.test(run.last), { last: run.last, pending: run.pending });
    }

    // ⛔ AS-4. Measured by the review on a copy of the base game's map: 3201 sea → land → sea with the dropdown, then 💾 Save. Both writes went: the
    // raise filled 8812 (the fill is out) and took the harbours facing 3201 away, and the flip left 3201 sea with no harbours, coastal false. The page
    // keeps only the latest type of a province, as the Terrain brush keeps only its latest terrain. #a-type-turned-back-writes-nothing
    console.log("\n12. ⛔ The Type dropdown turned back before the Save writes nothing (AS-4)");
    {
      const PORT = "1;naval_base_spawn;95.00;9.50;175.00;0.00;2";   // a harbour faces the mouth: what the raise would take away
      const { mod } = mouth("Turned Back", { extraPorts: [PORT] });
      const before = L2.tree(mod);
      const s = await pageSession(mod);
      const row = () => s.sb.provinceDef.get(2);
      await s.stage([[2, "land"]]);
      rec("THE CONTROL: the raise is queued, and the page's copy of the province is land", s.sb.pendingWrites.length === 1 && row().type === "land" && row().terrain === "plains", s.sb.pendingWrites);
      await s.stage([[2, "sea"]]);
      rec("⭐⭐⭐ turned back: nothing is queued", s.sb.pendingWrites.length === 0, s.sb.pendingWrites.map((w) => [w.url, w.body]));
      rec("⭐⭐ …the province is what it was, every field, on the page and in the three controls", row().type === "sea" && row().terrain === "ocean" && row().coastal === true && s.sb.provinceType.get(2) === "sea"
        && s.sb.$("miTypeSel").value === "sea" && s.sb.$("miTerrainSel").value === "ocean" && s.sb.$("miCoastalChk").checked === true, row());
      const run = await s.save();
      rec("⭐⭐⭐ …and the Save writes nothing: no write posted, and the mod's files byte for byte as they were, its harbour on the mouth among them",
        !run.requests.some((q) => /set-province-terrain|flip-province-sea|seas-cut-off/.test(q.url)) && L2.written(before, L2.tree(mod)).length === 0 && harbours(mod).includes(PORT) && /Nothing to save/.test(run.last),
        { requests: run.requests.map((q) => q.url), written: L2.written(before, L2.tree(mod)), last: run.last });
    }
    {
      const { mod } = mouth("Land Then Lake");
      const s = await pageSession(mod);
      await s.stage([[2, "land"]]);
      await s.stage([[2, "lake"]]);
      const q = s.sb.pendingWrites.map((w) => w.body);
      rec("⭐⭐⭐ sea → land → lake is one sea → lake, on a lake's terrain", q.length === 1 && q[0].type === "lake" && q[0].terrain === "lakes" && s.sb.$("miTerrainSel").value === "lakes", q);
      await s.save();
      rec("⭐⭐ …and the row on disk says so", defCols(mod, 2).slice(4, 7).join(";") === "lake;true;lakes", defCols(mod, 2).join(";"));
    }
    {
      const { mod } = mouth("Lake Then Land");
      const s = await pageSession(mod);
      await s.stage([[2, "lake"]]);
      await s.stage([[2, "land"]]);
      const q = s.sb.pendingWrites.map((w) => w.body);
      rec("⭐⭐⭐ sea → lake → land is one sea → land, on a land terrain", q.length === 1 && q[0].type === "land" && q[0].terrain === "plains", q);
      await s.save();
      rec("⭐⭐ …and the row on disk says so", defCols(mod, 2).slice(4, 7).join(";") === "land;true;plains", defCols(mod, 2).join(";"));
    }
    {
      // what was staged behind the raise goes with it, and what was staged before it stays
      const { mod } = mouth("Turned Back Staged");
      const s = await pageSession(mod);
      await s.stage([[2, "sea", "lakes"]]);                                  // a terrain on the sea, staged before the raise: the modder's own, and it stays
      await s.stage([[2, "land"], [2, "land", "forest"]]);
      s.sb.queueWrite("/api/map/move-province", { provinceId: 2, stateId: 1 });   // …and the new land painted into a state
      s.sb.model.states.find((st) => st.id === 1).provinces.push(2);
      s.sb.model.provinceToState = Object.assign(s.sb.model.provinceToState || {}, { 2: 1 });
      await s.stage([[2, "sea"]]);
      const q = s.sb.pendingWrites;
      rec("⭐⭐⭐ turned back: the type, the terrain behind it and the state it was painted into go; the terrain staged before them stays",
        q.length === 1 && q[0].url === "/api/map/set-province-terrain" && q[0].body.terrain === "lakes" && q[0].body.type === "sea", q.map((w) => [w.url, w.body]));
      rec("⭐⭐ …and it is in no state on the page, on the terrain it had", !s.sb.model.states.find((st) => st.id === 1).provinces.includes(2) && !(2 in s.sb.model.provinceToState) && s.sb.provinceDef.get(2).terrain === "lakes" && s.sb.$("miTerrainSel").value === "lakes", s.sb.provinceDef.get(2));
    }
    {
      // ⛔ …and the mirror: land erased, then the dropdown back to land. It queued the flip and a raise, and came back as land in no state with none of its buildings.
      const { mod } = mouth("Erased Then Land");
      const s = await pageSession(mod);
      s.sb.beginEraseStroke(); s.sb.eraseProvinceLocal(7); s.sb.commitEraseStroke();
      await s.stage([[7, "land"]]);
      const last = s.statuses[s.statuses.length - 1] || "";
      rec("⭐⭐⭐ the dropdown refuses at the click, and says Undo brings it back", s.sb.pendingWrites.length === 1 && s.sb.pendingWrites[0].url === "/api/map/flip-province-sea" && s.sb.$("miTypeSel").value === "sea" && /⚠ Province 7 was land until you erased it/.test(last) && /Undo/.test(last), { queued: s.sb.pendingWrites.map((w) => w.url), last });
    }
    {
      // ⛔ …and the Erase brush over a sea the dropdown raised, nothing saved: the flip behind the raise took the harbour facing it out of buildings.txt for a raise taken back
      const PORT = "1;naval_base_spawn;95.00;9.50;175.00;0.00;2";
      const { mod } = mouth("Raised Then Erased", { extraPorts: [PORT] });
      const before = L2.tree(mod);
      const s = await pageSession(mod);
      await s.stage([[2, "sea", "lakes"]]);                                  // a terrain on the sea, staged before the raise: the modder's own, and it stays
      await s.stage([[2, "land"], [2, "land", "forest"]]);
      s.sb.queueWrite("/api/map/move-province", { provinceId: 2, stateId: 1 });
      s.sb.model.states.find((st) => st.id === 1).provinces.push(2);
      s.sb.beginEraseStroke();
      const took = s.sb.eraseProvinceLocal(2);
      s.sb.commitEraseStroke();
      const q = s.sb.pendingWrites;
      rec("⭐⭐⭐ the brush takes the raise back: no flip, the raise, the terrain behind it and the state it was painted into go, and the terrain before them stays", took === true && q.length === 1 && q[0].body.terrain === "lakes" && q[0].body.type === "sea", q.map((w) => [w.url, w.body]));
      const row = s.sb.provinceDef.get(2);
      rec("⭐⭐ …it is sea on the page, on the terrain it had, its coastal box as it was, and in no state", row.type === "sea" && row.terrain === "lakes" && row.coastal === true && s.sb.provinceType.get(2) === "sea" && !s.sb.model.states.find((st) => st.id === 1).provinces.includes(2), row);
      await s.save();
      rec("⭐⭐⭐ …and the Save leaves the row sea and coastal, on the terrain staged, and the harbour facing it where it was", defCols(mod, 2).slice(4, 7).join(";") === "sea;true;lakes" && harbours(mod).includes(PORT) && !L2.written(before, L2.tree(mod)).some((f) => /buildings\.txt|heightmap\.bmp/.test(f)), { row: defCols(mod, 2).join(";"), written: L2.written(before, L2.tree(mod)) });
    }
    // ⛔ #a-raise-taken-back-takes-its-region-move-back — A RAISED SEA PAINTED INTO A STATE AS THE MOVE TOOL PAINTS ONE. The paint of a sea made land always
    // crosses a strategic region (a sea region into a land state's), the region question's default ("Move it into region … too") stages the region move
    // behind the paint (#a-state-move-splits-the-region-in-silence), and both take-backs, the dropdown's and the brush's, dropped the raise and the paint
    // and left the region move queued: the Save moved the sea into the land state's region, fractioned_naval_region, which HOI4 refuses to load ("Failed
    // to load the map"), after "Save writes nothing for it" (review of the merge, S-takeback: the base game's 2881 painted into 637; on the base-game
    // overlay two Auto-fix clicks could not repair it). The cases above queue the paint by hand, without the region move the real click stages.
    const paintRaised = async (name) => {
      const { mod } = mouth(name);
      const before = L2.tree(mod);
      const s = await pageSession(mod);
      for (const st of s.sb.model.states) s.sb.stateById.set(st.id, st);
      s.sb.moveSource = null; s.sb.moveTarget = null;
      await s.stage([[2, "land"]]);
      s.sb.handleMoveClick(2, undefined);   // the Move tool: the raised province picked…
      s.sb.handleMoveClick(4, 1);           // …then a province of state 1, and the region question answered as window.confirm answers it here: yes
      return { mod, before, s };
    };
    const regionHolds = (s, rid, pid) => ((s.sb.model.strategicRegions || []).find((r) => Number(r.id) === rid) || { provinces: [] }).provinces.includes(pid);
    for (const how of ["Type", "Erase"]) {
      const { mod, before, s } = await paintRaised(`Raised Painted ${how}`);
      const staged = s.sb.pendingWrites.map((w) => w.url.split("/").pop());
      rec(`THE CONTROL (${how}): the paint of raised 2 into state 1 queues the raise, the paint and the region move behind it, and the page shows 2 in land region 2`,
        staged.join() === "set-province-terrain,move-province,move-province-region" && s.sb.model.provinceToRegion[2] === 2 && regionHolds(s, 2, 2) && !regionHolds(s, 1, 2),
        { staged, region: s.sb.model.provinceToRegion[2] });
      if (how === "Type") await s.stage([[2, "sea"]]);
      else { s.sb.beginEraseStroke(); s.sb.eraseProvinceLocal(2); s.sb.commitEraseStroke(); }
      rec(`⭐⭐⭐ ${how} takes the raise back: nothing is queued, the paint's region move included`, s.sb.pendingWrites.length === 0, s.sb.pendingWrites.map((w) => [w.url, w.body]));
      rec(`⭐⭐ …and the page shows province 2 where the files hold it: sea region 1, no other region, no state`,
        s.sb.model.provinceToRegion[2] === 1 && regionHolds(s, 1, 2) && !regionHolds(s, 2, 2) && !s.sb.model.states.some((st) => (st.provinces || []).includes(2)) && s.sb.provinceType.get(2) === "sea",
        { region: s.sb.model.provinceToRegion[2], regions: (s.sb.model.strategicRegions || []).map((r) => [r.id, r.provinces]) });
      const run = await s.save();
      rec(`⭐⭐⭐ …and the Save writes nothing: no write posted, and the mod's files byte for byte as they were, its strategic regions among them`,
        !run.requests.some((q) => /move-province|set-province-terrain|flip-province-sea/.test(q.url)) && L2.written(before, L2.tree(mod)).length === 0 && /Nothing to save/.test(run.last),
        { requests: run.requests.map((q) => q.url), written: L2.written(before, L2.tree(mod)), last: run.last, regions: regionsOf(mod) });
    }
    {
      // ⛔ …and the dropdown's take-back refuses what rests on the paint it would drop, as the Erase brush refuses it (#a-dropped-paint-refuses-what-rests-on-it):
      // the state panel's victory point on the raised province and its 🏘 town, staged after the paint, stayed queued behind the take-back, and the Save
      // copied the state's file into the mod with a victory point on a sea province outside it, vp_not_in_state, after "Save writes nothing for it"
      // (review of the merge, S-type-takeback: 2881 = 5 in 637's panel). The panel's 💾 as stageStateWrite queues it: the state's points, then the town.
      const { mod, before, s } = await paintRaised("Raised Painted Panel");
      const st1 = s.sb.stateById.get(1);
      st1.victoryPoints = (st1.victoryPoints || []).concat([{ province: 2, value: 5 }]);
      s.sb.queueWrite("/api/map/set-state", { stateId: 1, nameKey: st1.name, fields: { victoryPoints: st1.victoryPoints.slice() } });
      s.sb.queueWrite("/api/map/victory-point-towns", { stateId: 1, provinces: [2] });
      const queued = s.sb.pendingWrites.slice();
      const sameQueue = () => s.sb.pendingWrites.length === queued.length && queued.every((w, i) => s.sb.pendingWrites[i] === w);
      await s.stage([[2, "sea"]]);
      const last = s.statuses[s.statuses.length - 1] || "";
      rec("⭐⭐⭐ the dropdown refuses: the queue as it was, the province still land in state 1, the dropdown back on land",
        sameQueue() && s.sb.provinceType.get(2) === "land" && st1.provinces.includes(2) && s.sb.$("miTypeSel").value === "land" && st1.victoryPoints.some((v) => v.province === 2),
        { queued: s.sb.pendingWrites.map((w) => w.url), type: s.sb.provinceType.get(2), select: s.sb.$("miTypeSel").value });
      const named = st1.displayName || st1.name;
      rec("⭐⭐ …and says why and what to do, in the brush's words", /^🚫 Setting province 2's Type to sea /.test(last) && last.includes(`would undo the unsaved paint of province 2 into ${named}, but the change to ${named} came after that paint and depends on it`) && /Nothing was changed\. Save first, or use Undo\./.test(last), last);
      s.sb.beginEraseStroke(); s.sb.eraseProvinceLocal(2); s.sb.commitEraseStroke();
      const brush = s.statuses[s.statuses.length - 1] || "";
      rec("THE CONTROL: the Erase brush refuses the same take-back", sameQueue() && /^🚫 Erasing province 2 would undo the unsaved paint of province 2/.test(brush), brush);
      rec("THE CONTROL: …and nothing has been written yet", L2.written(before, L2.tree(mod)).length === 0, L2.written(before, L2.tree(mod)));
    }
    {
      // THE CONTROLS: land erased queues its flip, as it always did; a lake raised and erased goes on being written
      const { mod } = mouth("Erased Land");
      const s = await pageSession(mod);
      s.sb.beginEraseStroke(); s.sb.eraseProvinceLocal(7); s.sb.commitEraseStroke();
      rec("THE CONTROL: land erased queues its flip", s.sb.pendingWrites.length === 1 && s.sb.pendingWrites[0].url === "/api/map/flip-province-sea" && s.sb.pendingWrites[0].body.provinceId === 7, s.sb.pendingWrites);
      const { mod: mod2 } = mouth("Lake Raised Erased");
      fs.writeFileSync(path.join(mod2, "map", "definition.csv"), fs.readFileSync(path.join(mod2, "map", "definition.csv"), "utf8").replace(/^(2;[^;]*;[^;]*;[^;]*;)sea;true;ocean/m, "$1lake;true;lakes"));
      const l = await pageSession(mod2);
      await l.stage([[2, "land"]]);
      l.sb.beginEraseStroke(); l.sb.eraseProvinceLocal(2); l.sb.commitEraseStroke();
      rec("THE CONTROL: a lake raised and erased is written, raise then flip: the brush makes it sea", l.sb.pendingWrites.map((w) => w.url.split("/").pop()).join() === "set-province-terrain,flip-province-sea", l.sb.pendingWrites.map((w) => [w.url, w.body]));
    }
    {
      // ⛔ …and the Terrain brush over a province the dropdown raised keeps the raise: it filtered every write of the province, and the raise went with them
      const { mod } = mouth("Raised Then Brushed");
      const s = await pageSession(mod);
      await s.stage([[2, "land"]]);
      s.sb.pidGrid.fill(2);
      s.sb.paintTerrainAt(120, 80);
      s.sb.terrainStroke = new Set();
      const q = s.sb.pendingWrites.map((w) => w.body);
      rec("⭐⭐⭐ the brush queues its terrain behind the raise, and does not take the raise away", q.length === 2 && q[0].type === "land" && q[1].terrain === "forest" && !("type" in q[1]), q);
      s.sb.terrainPaintType = "hills";
      s.sb.paintTerrainAt(120, 80);
      rec("THE CONTROL: a second stroke keeps only the brush's latest", s.sb.pendingWrites.length === 2 && s.sb.pendingWrites[1].body.terrain === "hills", s.sb.pendingWrites.map((w) => w.body));
      await s.save();
      rec("⭐⭐⭐ …and the Save leaves it land, on the brush's terrain", defCols(mod, 2).slice(4, 7).join(";") === "land;true;hills", defCols(mod, 2).join(";"));
    }

    // ⛔ AS-7, its older half. A raise writes the row, then the heights. MEASURED by the review with heightmap.bmp read-only, as a program holding it leaves it: the row said
    // land, the answer's heightmap said "Couldn't write heightmap.bmp", and the Save line said nothing of it, so the game drew water where the map said land. (The paint
    // path's twin is another fixer's; a raise's is here.) #a-raise-whose-heights-could-not-be-written-says-so
    console.log("\n13. ⛔ A raise whose heightmap.bmp could not be written says so (AS-7)");
    {
      const { mod } = mouth("Raise Held Heights");
      const hm = path.join(mod, "map", "heightmap.bmp"), hm0 = fs.readFileSync(hm);
      let run = null;
      fs.chmodSync(hm, 0o444);
      try { run = await pageSave(mod, [[2, "land"]]); } finally { fs.chmodSync(hm, 0o666); }
      const w = run.requests.find((q) => q.url === "/api/map/set-province-terrain") || { body: {} };
      rec("THE CONTROL: the row is land, the answer says the heights were not written, and they were not", defCols(mod, 2)[4] === "land" && !!(w.body.heightmap || {}).error && fs.readFileSync(hm).equals(hm0), { row: defCols(mod, 2).join(";"), heightmap: w.body.heightmap });
      rec("⭐⭐⭐ the Save line says so, with the warned sign, which file, why it matters and what to do",
        !/\.\. The game draws/.test(run.last) && /⚠ Province 2 is land in map\/definition\.csv, but Nova could not raise it in map\/heightmap\.bmp: /.test(run.last) && /The game draws water where the map says land/.test(run.last) && /set its Type back to sea, 💾 Save, and set it to land again/.test(run.last), run.last);
      rec("⭐⭐⭐ …once: a paint's and an erase's words for the same answer (#a-height-left-unwritten-is-said), whose way out is not a raise's, are not on the line beside them",
        !/The ground did not move with this change/.test(run.last) && (run.last.match(/could not (?:raise it in|write) map\/heightmap\.bmp/g) || []).length === 1, run.last);
      rec("THE CONTROL: the sea it cut off is still named beside it", /⚠ Turning province 2 into land cut sea 3/.test(run.last), run.last);
      // …and the way out it names works: the file writable again, the Type back to sea (the dropdown's erase path posts this flip), a Save, and land again
      const back = await srv.post("/api/map/flip-province-sea", { provinceId: 2 }, mod);
      const again = await srv.post("/api/map/set-province-terrain", TYPE_TO_LAND(2), mod);
      const h = heightsOf(mod);
      let low = 0;
      for (let y = 70; y < 90; y++) for (let x = 104; x < 152; x++) if (h(x, y) < M.HEIGHTMAP_SEA_LEVEL) low++;
      rec("⭐⭐ …and the way out it names works: Type back to sea, Save, land again, and the province stands up", back.status === 200 && again.status === 200 && defCols(mod, 2)[4] === "land" && low === 0 && !(again.body.heightmap || {}).error, { low, row: defCols(mod, 2).join(";"), flip: back.body.error, raise: again.body.error });
    }
    {
      // a lake keeps its bed: its heightmap is never written, so a held file is nothing to say
      const { mod } = mouth("Lake Held Heights");
      const hm = path.join(mod, "map", "heightmap.bmp");
      let run = null;
      fs.chmodSync(hm, 0o444);
      try { run = await pageSave(mod, [[2, "lake"]]); } finally { fs.chmodSync(hm, 0o666); }
      rec("THE CONTROL: a lake says nothing of the heights", defCols(mod, 2)[4] === "lake" && !/could not raise it/.test(run.last), run.last);
    }

    // ⛔ THE LONE SEA. A sea of one province that no way joins to another. MEASURED over borders and rows on the eight installed maps: one, Old World Blues' 5894, with four
    // harbours; the rule fires on none of them (run over the corpus before it was written). No shipping map has one with no harbour, so nobody has launched one.
    console.log("\n14. ⛔ A lone sea with no harbour and no fleet is a warning, and Auto-fix makes it land when clicked and says so");
    const LONE = "lone_sea_nobody_uses";
    const loneMap = (name, o) => handMade(name, { rects: BAY_RECTS, rows: [[1, "sea"], [3, "sea"], [4, "land"], [2, "land"], [7, "land"], [10, "land"]],
      regions: { 1: "1", 2: "2 4 7 10", 3: "3" }, states: { 1: { provinces: "2 4 7" }, 2: { provinces: "10" } }, buildings: BAY_AIR, ...o });
    {
      const mod = loneMap("Lone");
      const v = await srv.validate(mod);
      const p = (v.problems || []).find((x) => x.rule === LONE) || {};
      rec("⭐⭐⭐ it fires, as a warning Auto-fix offers, on the one province", JSON.stringify(p.provinces) === "[3]" && p.severity === "warning" && p.autoFix === true && p.total === 1, p);
      rec("⭐⭐ its message says what nobody knows, and what to do", /Sea province 3 has no other sea beside it, no harbour facing it and no fleet in it/.test(p.message) && /nobody has launched a map with one that has none, and what the game does with it is unknown/.test(p.message) && /Click "Auto-fix all" to make it land/.test(p.message), p.message);
      const labels = require("./public/map-rule-labels.js");
      rec("⭐ it has a label and a hint, and it is no reason for Save to stop", labels.LABELS[LONE] && labels.FIX_HINTS[LONE] && !labels.isFatalRule(LONE));
    }
    {
      // what keeps it quiet, one piece of evidence at a time, each on the same map
      const rule = async (mod) => L2.idsOf(await srv.validate(mod), LONE);
      const harbour = loneMap("Lone Harbour", { buildings: [...BAY_AIR, "2;naval_base_spawn;160.00;9.50;165.00;0.00;3"] });
      rec("⭐⭐⭐ a harbour facing it: silent, and a click leaves it", (await rule(harbour)).length === 0, await rule(harbour));
      await srv.autoFix(harbour);
      rec("…and a click leaves it sea", defCols(harbour, 3)[4] === "sea", defCols(harbour, 3).join(";"));
      const fleetOob = ["units = {", "\tfleet = {", '\t\tname = "F"', "\t\tnaval_base = 4", "\t\ttask_force = {", '\t\t\tname = "F TF"', "\t\t\tlocation = 3", '\t\t\tship = { name = "A" definition = destroyer equipment = { ship_hull_light_1 = { amount = 1 owner = BBB } } }', "\t\t}", "\t}", "}", ""].join("\n");
      const ownedBy = (id, provinces, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provinces} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
      const fleet = loneMap("Lone Fleet", { states: {}, extra: { "history/states/1-S.txt": ownedBy(1, "2 4 7", "BBB"), "history/states/2-S.txt": ownedBy(2, "10", "AAA"), "history/countries/AAA - A.txt": "capital = 2\n", "history/countries/BBB - B.txt": 'capital = 1\noob = "BBB_1936"\n',
        "history/units/BBB_1936.txt": fleetOob, "common/country_tags/00_countries.txt": 'AAA = "countries/A.txt"\nBBB = "countries/B.txt"\n' } });
      rec("⭐⭐⭐ a fleet lying in it: silent", (await rule(fleet)).length === 0, await rule(fleet));
      const navy = loneMap("Lone Dockyard", { states: { 1: { provinces: "2 4 7" }, 2: { provinces: "10", opts: { history: "\t\tbuildings = {\n\t\t\tdockyard = 1\n\t\t}\n" } } } });
      // (province 10's only sea is 3)
      rec("⭐⭐⭐ the last coast of a state's dockyard: silent", (await rule(navy)).length === 0, await rule(navy));
      const canal = loneMap("Lone Canal", { extra: { "map/adjacencies.csv": ["From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment", "3;1;sea;4;-1;-1;-1;-1;;Canal", "-1;-1;;-1;-1;-1;-1;-1;-1 "].join("\n") + "\n" } });
      rec("⭐⭐⭐ a canal row to another sea: silent, it is not lone", (await rule(canal)).length === 0, await rule(canal));
      // the map the layers below ship: an add-on over a mod that ships it
      const below = loneMap("Lone Below");
      fs.writeFileSync(path.join(below, "descriptor.mod"), 'name="Lone Below"\nsupported_version="1.*"\nreplace_path="history/states"\nreplace_path="map/strategicregions"\n');
      const addOn = world.mod("Lone Add-on", { "common/terrain/00_terrain.txt": TERRAIN }, ["Lone Below"]);
      rec("THE CONTROL: the mod that ships it is told", JSON.stringify(await rule(below)) === "[3]", await rule(below));
      rec("⭐⭐⭐ an add-on over a map that ships it: silent, it is not the add-on's", (await rule(addOn)).length === 0, await rule(addOn));
    }
    {
      // the ocean, however small a map makes it, is not lone: one province beside a bigger land, and a sea smaller than it
      // (20, not 1: the layer below ships a sea 1 of its own, and what it ships is quiet for that reason alone)
      const mod = handMade("Lone Ocean", { rects: [[20, 0, 0, 256, 64], [4, 0, 64, 256, 256]], rows: [[20, "sea"], [4, "land"]], regions: { 1: "20", 2: "4" }, states: { 1: { provinces: "4" } }, buildings: ["1;air_base;48.00;9.50;100.00;0.00;0", "1;rocket_site_spawn;48.00;9.50;100.00;0.00;0"] });
      rec("⭐⭐⭐ a map whose ocean is one province: silent", L2.idsOf(await srv.validate(mod), LONE).length === 0, L2.rulesIn(await srv.validate(mod)));
      const noPixels = loneMap("Lone No Pixels", { rows: [[1, "sea"], [3, "sea"], [4, "land"], [2, "land"], [7, "land"], [10, "land"], [20, "sea"]], rects: BAY_RECTS.filter((r) => r[0] !== 3).concat([[2, 96, 64, 160, 256]]) });
      rec("⭐⭐ a sea row with no pixels: silent, it is on no map", L2.idsOf(await srv.validate(noPixels), LONE).length === 0, L2.idsOf(await srv.validate(noPixels), LONE));
    }
    {
      // the click: on the ground of the land it borders most, never a city's; the state gets it; the coast follows; and a second click writes nothing
      const mod = loneMap("Lone Clicked");
      const csv = path.join(mod, "map", "definition.csv");
      // 4 and 10 each border 3 for 160 px, and the lower id goes first: 4 is urban, a city, so 3 takes the next, 10's forest
      fs.writeFileSync(csv, fs.readFileSync(csv, "utf8").replace(/^(4;.*;land;true;)plains(;1)/m, "$1urban$2").replace(/^(10;.*;land;true;)plains(;1)/m, "$1forest$2"));
      // (a city is what the map says one is, whatever it is called: below, `port`)
      const fx = await srv.autoFix(mod);
      rec("⭐⭐⭐ one click makes it land, on the ground of the land it borders most that is not a city", defCols(mod, 3).slice(4, 6).join(";") === "land;false" && defCols(mod, 3)[6] === "forest", { row: defCols(mod, 3).join(";"), lone: (fx.body.fixes || {}).loneSeas });
      const h = heightsOf(mod);
      let low = 0;
      for (let y = 100; y < 250; y++) for (let x = 100; x < 156; x++) if (h(x, y) < M.HEIGHTMAP_SEA_LEVEL) low++;
      rec("⭐⭐ …raised", low === 0, { low });
      const v = await srv.validate(mod);
      rec("⭐⭐ …in a state, with the warning gone and 10 no longer coastal", !L2.rulesIn(v).includes(LONE) && !L2.rulesIn(v).includes("land_not_in_state") && defCols(mod, 10)[5] === "false", { rules: L2.rulesIn(v), row10: defCols(mod, 10).join(";") });
      const t1 = L2.tree(mod);
      await srv.autoFix(mod);
      rec("⭐⭐⭐ …and a second click writes nothing", L2.written(t1, L2.tree(mod)).length === 0, L2.written(t1, L2.tree(mod)));
    }
    {
      // AS-9's shape: a terrain the map declares a city, by another name
      const CITY_PORT = TERRAIN.replace("\tplains =", "\tport = { color = { 140 110 100 } }\n\tplains =") + ["terrain = {", "\tport_13 = { type = port color = { 13 } texture = 10 spawn_city = yes }", "\tocean = { type = ocean color = { 15 } }", "}", ""].join("\n");
      const mod = loneMap("Lone Port City", { extra: { "common/terrain/00_terrain.txt": CITY_PORT } });
      const csv = path.join(mod, "map", "definition.csv");
      fs.writeFileSync(csv, fs.readFileSync(csv, "utf8").replace(/^(4;.*;land;true;)plains(;1)/m, "$1port$2").replace(/^(10;.*;land;true;)plains(;1)/m, "$1forest$2"));
      await srv.autoFix(mod);
      rec("⭐⭐⭐ a terrain the map declares a city is not taken either, whatever it is called", defCols(mod, 3)[4] === "land" && defCols(mod, 3)[6] === "forest", defCols(mod, 3).join(";"));
    }
    {
      // a harbour the click itself gives the coast on it is no evidence: 10 is coastal with no port, and fixCoastalNoPort, above the pass, would face one onto 3
      const mod = loneMap("Lone Own Port");
      const fx = await srv.autoFix(mod);
      rec("⭐⭐⭐ the port this click gave the coast does not vote: 3 is land all the same, and no row faces it", defCols(mod, 3)[4] === "land" && !harbours(mod).some((l) => l.split(";")[6] === "3"), { row: defCols(mod, 3).join(";"), harbours: harbours(mod), fixes: (fx.body.fixes || {}).coastalNoPort });
    }
    {
      // a strait that crosses it, land to land: the row stands as a canal once it is land (a land `through` is one), and the click settles it as it settles an inland sea's
      const STRAIT = "4;10;sea;3;-1;-1;-1;-1;;Strait";
      const mod = loneMap("Lone Strait", { extra: { "map/adjacencies.csv": ["From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment", STRAIT, "-1;-1;;-1;-1;-1;-1;-1;-1 "].join("\n") + "\n" } });
      const before = L2.rulesIn(await srv.validate(mod));
      await srv.autoFix(mod);
      const v = await srv.validate(mod);
      const row = fs.readFileSync(path.join(mod, "map", "adjacencies.csv"), "utf8").split(/\r?\n/).find((l) => l.startsWith("4;10;"));
      rec("THE CONTROL: the row names 3 as what it crosses, and the rule fires all the same: a strait is no harbour and no fleet", before.includes("lone_sea_nobody_uses"), before);
      const labels = require("./public/map-rule-labels.js");
      rec("⭐⭐ a strait through it: after one click 3 is land, the row is still there, and nothing fatal is left", defCols(mod, 3)[4] === "land" && !!row && !L2.rulesIn(v).some((r) => labels.isFatalRule(r)), { row, rules: L2.rulesIn(v) });
      const t1 = L2.tree(mod);
      await srv.autoFix(mod);
      rec("⭐⭐ …and a second click writes nothing", L2.written(t1, L2.tree(mod)).length === 0, L2.written(t1, L2.tree(mod)));
    }
    {
      // a coastal fort that faced it: a harbour's row is evidence that keeps the sea, and a fort's is not, so the pass turns it in one write, as the inland pass does
      const mod = loneMap("Lone Fort", { buildings: [...BAY_AIR, BUNKER] });
      const fx = await srv.autoFix(mod);
      const forts = fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter((l) => l.split(";")[1] === "coastal_bunker");
      const kept = ((fx.body.fixes || {}).loneSeas || {}).coastRows || {};
      rec("⭐⭐ a coastal fort that faced it does not stand facing land: the pass turned it", defCols(mod, 3)[4] === "land" && !forts.includes(BUNKER) && kept.changed === true, { row: defCols(mod, 3).join(";"), forts, kept });
    }
    {
      // heights it could not write go under "not finished", with the province
      const said = P.autoFixSummary({ ok: true, fixes: { loneSeas: { fixed: 2, details: [{ province: 7, pixels: 1000, terrain: "plains" }, { province: 9, pixels: 234, terrain: "forest" }], heightErrors: [{ province: 9, error: "Couldn't write heightmap.bmp." }] } } });
      rec("⭐⭐ the summary counts two seas, and says the one whose heights it could not write as not finished", /made land seas 7, 9 \(1,234 px\), which had no other sea beside them/.test(said) && /Not finished[^]*made province 9 land in map\/definition\.csv, but could not raise it in map\/heightmap\.bmp, so the game draws water there: Couldn't write heightmap\.bmp/.test(said), said);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 5).join(" | ") : e), false);
  } finally {
    srv.close();
    world.cleanup();
    console.log(`\n=== a raise says the sea it cuts off: ${checks} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = fails.length ? 1 : 0;
  }
})();
