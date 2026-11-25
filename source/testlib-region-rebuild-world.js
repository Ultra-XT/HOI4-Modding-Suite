// A small rebuilt world over a base game whose regions were drawn for OTHER geography — the shape of every world Delete
// map + Generate land makes — for the Redraw strategic regions tests. #a-rebuilt-world-needs-its-own-regions
//
// ⚠️ NOT NAMED test-*.js ON PURPOSE — run-tests.js enumerates `test-*.js` and would execute a helper as a test file.
//
// A 512x256 map of 32x32 cells, 16 columns by 8 rows; province id = row*16 + col + 1. The map wraps east-west.
//
//   col  0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15
//   row0 . . . A A A . . . .  .  B  B  .  .  .     A = continent A (cols 3-5), B = continent B (cols 11-12)
//   row1 . . . m A A . . i L  .  B  B  .  .  .     i = a one-province islet, its own state; L = a lake beside it, sea on its other sides — becomes a sea that touches land
//   row2 . . . A A A . . . .  .  B  B  .  K  .     K = a lake the sea rings (the Caspian's shape) — becomes sea
//   row3 . . . A k A . . . .  .  B  B  .  .  .     k = a lake the land rings, in no state — stays a lake
//   row4 . . . A A A . . . .  .  B  B  .  .  .     m = a lake on the shore whose land neighbour (4,1) touches no
//   row5 b . . A A A . . a .  .  B  B  .  .  .         other sea — turning it would make (4,1) coastal, so it stays
//   row6 . . . A q A . . . .  .  B  B  .  .  .     q = a lake inside a state — stays a lake
//   row7 . . . A A A . . . .  .  B  B  .  .  .     a, b = ONE state on two islets facing DIFFERENT seas (R56's shape)
//
// The two continents cut the sea into two bodies that never meet: the west sea (cols 6-10) and the east sea (13-15, 0-2).
//
// The BASE game drew its regions for a different world: continent A was there, B was sea, and an old continent C stood in
// the west sea (cols 7-9, rows 2-5) — so its regions are 1 West Sea, 2 Old Continent (C), 3 A North, 4 A South, 5 East
// Sea, 6 Mid Sea (cols 11-12, with SNOW in its weather — never a sea donor), 7 empty. The mod owns definition.csv and
// provinces.bmp, replaces history/states, and ships no region files — exactly what T26/T27 look like.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const W = 512, H = 256, CELL = 32, COLS = 16, ROWS = 8;
const idAt = (c, r) => r * COLS + c + 1;
const col = (id) => (id - 1) % COLS;
const row = (id) => Math.floor((id - 1) / COLS);
const colour = (id) => [(id * 37) % 256, (id * 91) % 256, 40 + (id % 200)];   // unique for 1..128

const inA = (c) => c >= 3 && c <= 5, inB = (c) => c === 11 || c === 12;
const SPECIAL = { [idAt(8, 1)]: "islet", [idAt(14, 2)]: "lakeSea", [idAt(4, 3)]: "lakeLand", [idAt(3, 1)]: "lakeShore", [idAt(4, 6)]: "lakeState", [idAt(8, 5)]: "isletA", [idAt(0, 5)]: "isletB", [idAt(9, 1)]: "lakeIslet" };
const PROV = { islet: idAt(8, 1), lakeSea: idAt(14, 2), lakeLand: idAt(4, 3), lakeShore: idAt(3, 1), lakeState: idAt(4, 6), isletA: idAt(8, 5), isletB: idAt(0, 5), shoreInland: idAt(4, 1), lakeIslet: idAt(9, 1) };

function modType(id) {
  const c = col(id), s = SPECIAL[id];
  if (s && s.startsWith("lake")) return "lake";
  if (s) return "land";
  return inA(c) || inB(c) ? "land" : "sea";
}
function baseType(id) {
  const c = col(id), r = row(id), s = SPECIAL[id];
  if (s && s.startsWith("lake")) return "lake";
  if (inA(c)) return "land";
  if (c >= 7 && c <= 9 && r >= 2 && r <= 5) return "land";   // the old continent C, drowned in the mod
  return "sea";
}
function baseRegion(id) {
  const c = col(id), r = row(id);
  if (inA(c)) return r <= 3 ? 3 : 4;
  if (c >= 7 && c <= 9 && r >= 2 && r <= 5) return 2;
  if (c >= 6 && c <= 10) return 1;
  if (inB(c)) return 6;
  return 5;
}
const ALL = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) ALL.push(idAt(c, r));

function bmp24(fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, size = 54 + rs * H, b = Buffer.alloc(size);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
const provinceAtPixel = (x, y) => idAt(Math.floor(x / CELL), Math.floor(y / CELL));
const terrainFor = (t) => (t === "sea" ? "ocean" : t === "lake" ? "lakes" : "plains");
function definition(typeOf) {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (const id of ALL) { const t = typeOf(id); const [r, g, b] = colour(id); rows.push(`${id};${r};${g};${b};${t};false;${terrainFor(t)};${t === "land" ? 1 : 0}`); }
  return rows.join("\n") + "\n";
}
const weather = (snow) => `\n\t\tperiod={\n\t\t\tbetween={ 0.0 30.11 }\n\t\t\ttemperature={ -5.0 20.0 }\n\t\t\tno_phenomenon=0.600\n\t\t\train_light=0.300\n\t\t\train_heavy=0.100\n\t\t\tsnow=${snow ? "0.300" : "0.000"}\n\t\t\tblizzard=0.000\n\t\t\tarctic_water=0.000\n\t\t\tmud=0.200\n\t\t\tsandstorm=0.000\n\t\t\tmin_snow_level=0.000\n\t\t}\n\t`;
const regionFile = (id, name, provs, snow, naval) => `strategic_region={\n\tid=${id}\n\tname="STRATEGICREGION_${id}"\n\tprovinces={\n\t\t${provs.join(" ")} \n\t}\n${naval ? `\tnaval_terrain=${naval}\n` : ""}\tweather={${weather(snow)}}\n}\n`;
const BASE_REGIONS = [
  [1, "West Sea", false, "water_shallow_sea"], [2, "Old Continent", true, ""], [3, "A North", false, ""], [4, "A South", true, ""],
  [5, "East Sea", false, "water_deep_ocean"], [6, "Mid Sea", true, "water_fjords"], [7, "Empty", false, ""],
];
const SEA_FLOOR = [0, 1, 2, 9, 10, 11, 12, 21, 22, 23, 30, 31, 38];
function unitStacks(typeOf) {
  const out = [];
  for (const id of ALL) {
    const x = col(id) * CELL + 16, z = H - 1 - (row(id) * CELL + 16);
    const types = typeOf(id) === "sea" ? SEA_FLOOR : [1, 2];
    for (const t of types) out.push(`${id};${t};${x}.00;9.50;${z}.00;0.00;0.00`);
  }
  return out.join("\n") + "\n";
}
function states() {
  const S = [];
  const add = (cells) => S.push(cells.map(([c, r]) => idAt(c, r)));
  for (const r of [0, 2, 5, 7]) add([[3, r], [4, r], [5, r]]);
  add([[4, 1], [5, 1]]);
  add([[3, 3], [3, 4]]);
  add([[5, 3], [5, 4], [4, 4]]);
  add([[3, 6], [4, 6], [5, 6]]);                   // holds the lake q
  for (const r of [0, 2, 4, 6]) add([[11, r], [12, r], [11, r + 1], [12, r + 1]]);
  add([[8, 1]]);                                    // the islet
  add([[8, 5], [0, 5]]);                            // two islets, one state, two seas
  return S;
}
const stateFile = (id, provs) => `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t}\n}\n`;

function write(dir, files) {
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(dir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return dir;
}

/** Make the base game and the rebuilt mod in a fresh temp folder. o.statelessLand: leave one land cell out of every state.
 *  o.addOn: a mod that does NOT own definition.csv / provinces.bmp. o.crlf: the base region files are CRLF. o.modifiers:
 *  base static_modifiers and an in-block comment. o.baseLoc: base region names in English and German.
 *  o.baseIsland: an island in the base East Sea. o.baseStates: where the base game's states stood ("same", "elsewhere",
 *  "permuted" — see below). Returns { ROOT, GAME, MOD, PROV, ALL, states, idAt,
 *  baseRegion, modType }. */
function makeRegionWorld(tag, o = {}) {
  const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-regions-" + tag + "-"));
  const GAME = path.join(ROOT, "game"), MOD = path.join(ROOT, "mods", "rebuilt");
  process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
  fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
  const bmp = bmp24((x, y) => colour(provinceAtPixel(x, y)));
  const baseFiles = {
    "hoi4.exe": "not really an exe",
    "map/provinces.bmp": bmp,
    // o.baseIsland: the base game's East Sea (region 5) holds one island province, (15,0) — as 37 of vanilla's sea regions hold
    // one (101 Bay of Bengal: 2 land, 37 sea). The mod has it as sea.
    "map/definition.csv": definition((id) => (o.baseIsland && id === idAt(15, 0) ? "land" : baseType(id))),
    "map/unitstacks.txt": unitStacks(baseType),
    "map/weatherpositions.txt": BASE_REGIONS.filter(([id]) => id !== 7).map(([id]) => { const p = ALL.find((q) => baseRegion(q) === id); const x = col(p) * CELL + 16, z = H - 1 - (row(p) * CELL + 16); return `${id};${x}.00;9.90;${z}.00;small\n${id};${x}.00;9.90;${z}.00;small`; }).join("\n") + "\n",
    "history/states/1-Base.txt": stateFile(1, ALL.filter((p) => baseType(p) === "land")),
  };
  for (const [id, name, snow, naval] of BASE_REGIONS) baseFiles[`map/strategicregions/${id}-${name}.txt`] = regionFile(id, name, ALL.filter((p) => id !== 7 && baseRegion(p) === id), snow, naval);
  // o.modifiers: what vanilla carries that the redraw does not model — static_modifiers on the two sea regions (vanilla's ten
  // shark-infested seas) and a comment inside a land region's block
  if (o.modifiers) {
    for (const [id, name] of [[1, "West Sea"], [5, "East Sea"]]) {
      const k = `map/strategicregions/${id}-${name}.txt`;
      baseFiles[k] = baseFiles[k].replace("\tweather={", () => "\tstatic_modifiers={\n\t\twater_modifier_shark_infested=always\n\t}\n\tweather={");
    }
    baseFiles["map/strategicregions/3-A North.txt"] = baseFiles["map/strategicregions/3-A North.txt"].replace("\tprovinces={", () => "\t# the north of continent A, drawn by hand\n\tprovinces={");
    // …and a comment INSIDE every weather period, the shape Millennium Dawn ships in all 212 of its region files
    for (const k of Object.keys(baseFiles)) if (k.startsWith("map/strategicregions/")) baseFiles[k] = baseFiles[k].replace(/\t\t\tno_phenomenon=/g, () => "\t\t\t#temperature_day_night={ 5.0 -5.0 }\n\t\t\tno_phenomenon=");
  }
  // o.baseLoc: the base game names its regions in two languages, as vanilla does in ten
  if (o.baseLoc) {
    baseFiles["localisation/english/regions_l_english.yml"] = "﻿l_english:\n" + BASE_REGIONS.map(([id, name]) => ` STRATEGICREGION_${id}:0 "${name}"`).join("\n") + "\n";
    baseFiles["localisation/german/regions_l_german.yml"] = "﻿l_german:\n" + BASE_REGIONS.map(([id, name]) => ` STRATEGICREGION_${id}:0 "${name} (de)"`).join("\n") + "\n";
  }
  // o.crlf: the base map ships its region files and weatherpositions.txt CRLF, as Road to 56, OWB, NV and RoN do
  if (o.crlf) for (const k of Object.keys(baseFiles)) if (/^map\/(strategicregions\/|weatherpositions)/.test(k)) baseFiles[k] = baseFiles[k].replace(/\n/g, "\r\n");
  const S = states();
  // o.baseStates — where the base game's STATES stood (#a-renamed-state-keeps-its-regions-name). Unset: one base state 1 over all
  // the old land. "same": the mod's own states on continent A, same ids and provinces (a vanilla-based mod that owns its map).
  // "elsewhere": base states 1..12 each hold one province of the drowned continent C (a generated world over vanilla reuses
  // the base ids for land that is somewhere else). "permuted": continent A's states under other ids (a map that renumbers its
  // states over the same land, Millennium Dawn's shape). The old land a variant leaves over is base state 99: continent C, or A
  // for "elsewhere".
  if (o.baseStates) {
    delete baseFiles["history/states/1-Base.txt"];
    const onA = S.slice(0, 8), C = ALL.filter((p) => baseType(p) === "land" && !inA(col(p)));
    if (o.baseStates === "elsewhere") {
      C.forEach((p, i) => { baseFiles[`history/states/${i + 1}-C.txt`] = stateFile(i + 1, [p]); });
      baseFiles["history/states/99-A.txt"] = stateFile(99, ALL.filter((p) => baseType(p) === "land" && inA(col(p))));
    } else {
      onA.forEach((provs, i) => { const id = o.baseStates === "permuted" ? ((i + 1) % onA.length) + 1 : i + 1; baseFiles[`history/states/${id}-A.txt`] = stateFile(id, provs); });
      baseFiles["history/states/99-C.txt"] = stateFile(99, C);
    }
  }
  write(GAME, baseFiles);
  if (o.statelessLand) S[0] = S[0].slice(1);
  const modFiles = { "descriptor.mod": `name="Rebuilt"\nsupported_version="1.*"\nreplace_path="history/states"\n` };
  if (!o.addOn) {
    modFiles["map/provinces.bmp"] = bmp;
    modFiles["map/definition.csv"] = definition(modType);
  }
  S.forEach((provs, i) => { modFiles[`history/states/${i + 1}-S.txt`] = stateFile(i + 1, provs); });
  write(MOD, modFiles);
  return { ROOT, GAME, MOD, PROV, ALL, states: S, idAt, baseRegion, modType, baseType };
}

/** Every file under `dir` → sha1, keyed by its path relative to `dir` with forward slashes. */
function treeHash(dir) {
  const crypto = require("crypto");
  const out = {};
  const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = rel ? rel + "/" + e.name : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else out[r] = crypto.createHash("sha1").update(fs.readFileSync(path.join(d, e.name))).digest("hex"); } };
  walk(dir, "");
  return out;
}

module.exports = { makeRegionWorld, treeHash, PROV, idAt };
