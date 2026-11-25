// ⛔ #a-sea-made-land-takes-the-coast-its-dockyards-stood-on / #a-coast-taken-away-keeps-its-naval-buildings — A SEA THE TYPE DROPDOWN
// MAKES LAND KEEPS THE DOCKYARDS AND NAVAL BASES OF THE COAST IT TOOK. (Review of the coast rows, CR-R3.)
//
// The province inspector's Type dropdown turns a sea into land (POST /api/map/set-province-terrain, setProvinceDefinitionWithItsRows), and
// a sea made land can take the last coast of the states round it. On a copy of Millennium Dawn, sea 2408 made land left Fyn (5) with no
// province beside the sea: Auto-fix homed 2408 into Jylland (6), the first neighbour its bitmap walk met, and its naval pass then DELETED
// Fyn's `dockyard = 3`, the naval base on 14542 and Schleswig-Holstein's `naval_base = 8`, whose province touched only that sea — the
// modder's buildings, which stood on a coast until the click. HOI4 refuses a dockyard in a state with no coast and a naval base with no
// sea beside it ("Trying to set invalid state/province building", then the next entry: a refused building is not in the game, so
// deleting it cost the game nothing and the modder their buildings); Generate land moves a naval base whose province lost its coast within
// its state (#a-state-that-kept-its-coast-kept-its-harbour) and deals a coast-only building only to a coastal state of the same country
// (dealCarriedBuildings). The tools now do the same, and delete nothing: what no coast of its country can take stays where it is.
//
// One small world that owns its map, shaped like the Little Belt: sea 20 between Fyn (1 and 2, whose only sea it is), Jylland (3, 4, 5),
// Kiel (7, 8, 9) and the rest of Germany (10), the ocean 21 along the top.
//   0. the fixture: who touches which sea.
//   1. "strait" — 20 touches the ocean too. The dropdown's body, then Map Errors: the fatal rule fires for Fyn (the reproduction); then
//      one Auto-fix click: 20 goes to Fyn (its lost coast, not Jylland), Fyn keeps `dockyard = 3` and its 1939 `dockyard = 4`, its naval
//      base moves onto 20 at level 3, Kiel's moves onto 8 at level 8, Jylland is untouched, the answer says each move and removes
//      nothing, Map Errors is clean of every naval rule, the moved base has a port to stand on, and a second click writes nothing.
//   2. "bay" — 20 touches no other sea, so no state can keep that coast: Fyn's dockyards (both moments, the comment above them with
//      them) and its naval base go to Jylland, Denmark's coastal state next door (its base onto 5, the coast it has free), Kiel's base
//      moves onto 8, nothing is removed, Map Errors is clean, a second click writes nothing.
//   3. "alone" — the same, with Fyn's owner holding no other coast: nothing is removed either — the dockyards, both moments, and the
//      naval base stay where they are, the answer says each and why, Map Errors still reports them (Save stops for the dockyard, for
//      the modder to decide), and a second click writes nothing.
//   4. nearestCoastalStateOfItsOwner: the state next door by province steps, not by centre — the rest of Germany is a ring round the
//      Belt whose centre stands near Fyn, and Kiel is still the one a state of Kiel's country goes to when it borders it.
//   5. The page: coastsASeaMadeLandTakes and seaMadeLandNavalWords, run as public/map.js has them on the fixture as the page holds it,
//      name Fyn's 3 dockyards and the naval bases of 1 and 7 for 20, say to paint 20 into Fyn where 20 touches the sea and that no
//      state keeps the coast where it does not; the dropdown's own change handler (saveProvinceTerrain), run in a sandbox, says them in
//      its confirm and, answered No, queues nothing; the Auto-fix summary says what moved; the two rules' messages and the label say
//      Auto-fix keeps them; the endpoint writes through the function sections 1–3 drive.
//   6. "full" — every coastal province Jylland and Kiel keep holds a naval base already: Kiel's base stays on 7 (strait), and Fyn's
//      dockyards go to Jylland while its naval base stays on 1 (bay) — neither deleted nor stacked onto another's, the answer saying
//      each and why, Map Errors still warning of them (not a rule that stops Save), and a second click writing nothing.
//   7. "later" — Fyn's only dockyard is a 1939 one (the base game's 517-Victoria has that shape; section 5 runs what the confirm says of it,
//      review of the coast rows, CR-R4): with no naval base, Auto-fix does not move it and Map Errors lists it while Fyn has no coast; with a
//      naval base to go, it goes with the base.
//   8. ⛔ #a-carry-that-cannot-finish-gives-nothing — a carry whose giver cannot be cut gives nothing: the failure says to try again, and each
//      try summed the same dockyards into the taker again (1 -> 4 -> 7 -> 10, from 1939 5 -> 9 -> 13). Read-only and held by another
//      program alike, through a state paint, a click of Auto-fix and createState; and a taker that cannot be put back says so.
//   9. ⛔ #a-moved-naval-base-keeps-its-comments-and-its-dates — a naval base that moves goes as written: comments inside its block and above it
//      (read as a caption map, comment -> the key on the next code line), every moment it is written for, and the coast-only buildings
//      on its province unless the province it goes to holds its own. A province with a later level is not free. A dockyard's comment
//      captions no naval base. A taker with only a dated buildings block gets an undated one ahead of the date.
//  10. ⛔ #the-biggest-naval-base-gets-the-free-coast — the free coast is the level 10's before the level 8's; what its own coast cannot hold goes to the
//      nearest of its country's coasts with a province free; a state's own coast is its own before another state's overflow; a state with
//      nothing to give is no carry (⛔ #a-click-says-only-what-it-did); and land made from a sea goes to the state left with no coast even with a neighbour
//      in the sea's own strategic region, a later pass of the click putting it in its state's region.
// Binds no port. Run: node test-a-sea-made-land-keeps-the-naval-buildings-of-the-coast-it-took.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sea-made-land-naval-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const vm = require("vm");
const { lift } = require("./testlib-map-page.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 900) : "")); }
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

// ── the world, in cells of 10 x 10 pixels (the map wraps east to west) ─────────────────────────────────────────────────────────
//   row 0:  O  O  O  O  O  O  O  O  O        O = 21, the ocean
//   row 1:  5  4  S  S  S  S  S  8  L        S = 20, the Belt (in "bay" row 1's S cells are N = 11, land of state 4)
//   row 2:  5  3  S  1  2  S  7  8  L        L = 10, the rest of Germany, a ring round it all
//   row 3:  5  3  S  S  S  S  7  9  L
//   row 4:  L  L  L  L  L  L  L  L  L
const CELL = 10, W = 9 * CELL, H = 5 * CELL, BELT = 20, OCEAN = 21, NORTH = 11;
const GRID = [
  [OCEAN, OCEAN, OCEAN, OCEAN, OCEAN, OCEAN, OCEAN, OCEAN, OCEAN],
  [5, 4, BELT, BELT, BELT, BELT, BELT, 8, 10],
  [5, 3, BELT, 1, 2, BELT, 7, 8, 10],
  [5, 3, BELT, BELT, BELT, BELT, 7, 9, 10],
  [10, 10, 10, 10, 10, 10, 10, 10, 10],
];
const cellOf = (variant) => (cx, cy) => (variant !== "strait" && cy === 1 && cx >= 2 && cx <= 6 ? NORTH : GRID[cy][cx]);
const shapeOf = (variant) => (x, y) => cellOf(variant)(Math.floor(x / CELL), Math.floor(y / CELL));
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const LANDS = (variant) => [1, 2, 3, 4, 5, 7, 8, 9, 10].concat(variant === "strait" ? [] : [NORTH]);
const WEATHER = "\tweather={\n\t\tperiod={\n\t\t\tbetween={ 0.0 364.0 }\n\t\t\ttemperature={ -5.0 25.0 }\n\t\t\tno_phenomenon=0.700\n\t\t}\n\t}\n";

const building = (name, { coast = false, spawn = "", shared = false } = {}) =>
  `\t${name} = {\n\t\tbase_cost = 1000\n\t\tshow_on_map = 1\n${coast ? "\t\tonly_costal = yes\n" : ""}${spawn ? `\t\tspawn_point = ${spawn}\n` : ""}\t\tlevel_cap = {\n${shared ? "\t\t\tshares_slots = yes\n\t\t\tstate_max = 20\n" : "\t\t\tprovince_max = 10\n"}\t\t}\n\t}\n`;
const BUILDINGS = `buildings = {\n${[building("naval_base", { coast: true, spawn: "naval_base_spawn" }), building("dockyard", { coast: true, shared: true }),
  building("coastal_bunker", { coast: true }), building("naval_supply_hub", { coast: true }), building("naval_headquarters", { coast: true }),
  building("arms_factory", { shared: true }), building("bunker"), building("supply_node")].join("")}}\n`;

// The four states. Fyn's file is LF with a comment captioning its dockyard; Kiel's is CRLF — each file keeps its own line ends.
const FYN = 1, JYL = 2, KIEL = 3, REST = 4;
// `full`: every coastal province Jylland and Kiel keep, and the rest of Germany's 10, holds a naval base already (5, 8 and 10, at level 1)
const stateFiles = (variant, full = false) => {
  const fynOwner = variant === "alone" ? "FYN" : "DEN";
  return {
    [`history/states/${FYN}-Fyn.txt`]: `state = {\n\tid = ${FYN}\n\tname = "STATE_${FYN}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 2 }\n\thistory = {\n\t\towner = ${fynOwner}\n\t\tbuildings = {\n\t\t\tinfrastructure = 3\n\t\t\t# the Odense yard\n\t\t\tdockyard = 3\n\t\t\t1 = { naval_base = 3 }\n\t\t}\n\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\tdockyard = 4\n\t\t\t}\n\t\t}\n\t}\n}\n`,
    [`history/states/${JYL}-Jylland.txt`]: `state = {\n\tid = ${JYL}\n\tname = "STATE_${JYL}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 3 4 5 }\n\thistory = {\n\t\towner = DEN\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n\t\t\tdockyard = 1\n\t\t\t4 = { naval_base = 2 }\n${full ? "\t\t\t5 = { naval_base = 1 }\n" : ""}\t\t}\n\t}\n}\n`,
    [`history/states/${KIEL}-Kiel.txt`]: `state = {\n\tid = ${KIEL}\n\tname = "STATE_${KIEL}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 7 8 9 }\n\thistory = {\n\t\towner = GER\n\t\tbuildings = {\n\t\t\tinfrastructure = 4\n\t\t\tdockyard = 6\n\t\t\t7 = { naval_base = 8 }\n${full ? "\t\t\t8 = { naval_base = 1 }\n" : ""}\t\t}\n\t}\n}\n`.replace(/\n/g, "\r\n"),
    [`history/states/${REST}-Rest.txt`]: `state = {\n\tid = ${REST}\n\tname = "STATE_${REST}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 10${variant === "strait" ? "" : " " + NORTH} }\n\thistory = {\n\t\towner = GER\n\t\tbuildings = {\n\t\t\tinfrastructure = 1\n${full ? "\t\t\t10 = { naval_base = 1 }\n" : ""}\t\t}\n\t}\n}\n`,
  };
};
const STATE_PROVS = (variant) => ({ [FYN]: [1, 2], [JYL]: [3, 4, 5], [KIEL]: [7, 8, 9], [REST]: [10].concat(variant === "strait" ? [] : [NORTH]) });
const PORTS = (full) => ({ [FYN]: [{ province: 1, level: 3 }], [JYL]: [{ province: 4, level: 2 }].concat(full ? [{ province: 5, level: 1 }] : []),
  [KIEL]: [{ province: 7, level: 8 }].concat(full ? [{ province: 8, level: 1 }] : []), [REST]: full ? [{ province: 10, level: 1 }] : [] });

function makeMod(name, variant, full = false) {
  const dir = path.join(ROOT, name);
  const shapeAt = shapeOf(variant);
  write(dir, "descriptor.mod", `name="${name}"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="common/buildings"\n`);
  write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(shapeAt(x, y))));
  write(dir, "map/heightmap.bmp", bmp8(W, H, (x, y) => { const id = shapeAt(x, y); return id === BELT || id === OCEAN ? 80 : 100 + ((x * 3 + y * 5) % 40); }));
  const defs = ["0;0;0;0;land;false;unknown;0"];
  const wet = new Set();                                                 // the coastal column as the bitmap has it
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = shapeAt(x, y);
    for (const b of [shapeAt((x + 1) % W, y), y + 1 < H ? shapeAt(x, y + 1) : a]) {
      if (b === BELT || b === OCEAN) wet.add(a);
      if (a === BELT || a === OCEAN) wet.add(b);
    }
  }
  for (const id of LANDS(variant).slice().sort((a, b) => a - b)) defs.push(`${id};${colour(id).join(";")};land;${wet.has(id) ? "true" : "false"};plains;1`);
  defs.push(`${BELT};${colour(BELT).join(";")};sea;false;ocean;0`, `${OCEAN};${colour(OCEAN).join(";")};sea;false;ocean;0`);
  write(dir, "map/definition.csv", defs.join("\n") + "\n");
  write(dir, "common/buildings/00_buildings.txt", BUILDINGS);
  write(dir, "map/strategicregions/1-Land.txt", `strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ ${LANDS(variant).join(" ")} }\n${WEATHER}}\n`);
  write(dir, "map/strategicregions/2-Sea.txt", `strategic_region={\n\tid=2\n\tname="REGION_2"\n\tprovinces={ ${BELT} ${OCEAN} }\n\tnaval_terrain = water_deep_ocean\n${WEATHER}}\n`);
  for (const [rel, body] of Object.entries(stateFiles(variant, full))) write(dir, rel, body);
  write(dir, "map/buildings.txt", "");
  const roots = { modRoot: dir, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
  // every state laid out as Generate land lays one out (generateLand's own call), its ports on its naval bases
  const model = md.buildMapModel({ ...roots, cacheStableLayers: true });
  const coastNow = md.landProvincesTouchingSea({ ...roots, model }) || new Set();
  const types = md.coastRowTypesDrawn(md.stateBuildingRules(model));
  for (const [sid, provs] of Object.entries(STATE_PROVS(variant))) {
    md.ensureBuildingSlotsForState({ ...roots, stateId: +sid, provinces: provs, townPoints: md.stateBuildingAnchor({ ...roots, provinces: provs, each: true }),
      coast: { provinces: new Set(provs.filter((p) => coastNow.has(p))), ports: PORTS(full)[sid], types } });
  }
  return roots;
}
const model = (roots) => md.buildMapModel({ ...roots, cacheStableLayers: true });
const coastOf = (roots) => md.landProvincesTouchingSea({ ...roots, model: model(roots) }) || new Set();
const stateOf = (m, sid) => (m.states || []).find((s) => s.id === sid) || {};
const levelAt = (m, sid, p) => Number((((stateOf(m, sid).provinceBuildings || {})[String(p)]) || {}).naval_base) || 0;
const yards = (m, sid) => Number((stateOf(m, sid).buildings || {}).dockyard) || 0;
const fileOf = (roots, sid) => { const d = path.join(roots.modRoot, "history", "states"); const f = fs.readdirSync(d).find((n) => n.startsWith(sid + "-")); return f ? fs.readFileSync(path.join(d, f), "utf8") : ""; };
const datedYard = (txt) => { const m = /1939\.1\.1\s*=\s*\{[\s\S]*?dockyard\s*=\s*(\d+)/.exec(txt); return m ? +m[1] : 0; };
const NAVAL_RULES = ["state_naval_building_without_coast", "naval_base_non_coastal", "dated_naval_building_without_coast"];
// Map Errors as /api/map/validate gathers it: the model's rules and the bitmap's
const allProblems = (roots) => md.validateMapModel(model(roots)).concat(md.validateMapBitmap(roots));
const problems = (roots, rules) => allProblems(roots).filter((p) => rules.includes(p.rule));
// what the page sends from the province inspector's Type dropdown for sea 20 made land: the water terrain replaced by plains, the
// coastal box as a sea province's (unchecked) — and what /api/map/set-province-terrain does with it
const typeDropdown = (roots) => md.setProvinceDefinitionWithItsRows({ ...roots, provinceId: BELT, terrain: "plains", type: "land", coastal: false });
// a row's province is its pixel, on the map as the mod has it
const rowsOn = (roots, type, pid) => {
  const buf = fs.readFileSync(path.join(roots.modRoot, "map", "provinces.bmp"));
  const off = buf.readUInt32LE(10), w = buf.readInt32LE(18), h = buf.readInt32LE(22), rs = Math.floor((24 * w + 31) / 32) * 4;
  const byColour = new Map();
  for (const l of fs.readFileSync(path.join(roots.modRoot, "map", "definition.csv"), "utf8").split(/\r?\n/)) { const c = l.split(";"); if (c.length >= 5 && +c[0] > 0) byColour.set(((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0, +c[0]); }
  const at = (x, y) => { const o = off + (h - 1 - y) * rs + x * 3; return byColour.get(((buf[o + 2] << 16) | (buf[o + 1] << 8) | buf[o]) >>> 0) || 0; };
  return fs.readFileSync(path.join(roots.modRoot, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.split(";"))
    .filter((c) => c.length >= 7 && c[1] === type && at(Math.floor(+c[2]), h - 1 - Math.floor(+c[4])) === pid).length;
};
const hashTree = (dir) => {
  const out = new Map();
  const walk = (p) => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const q = path.join(p, e.name); if (e.isDirectory()) walk(q); else out.set(path.relative(dir, q), crypto.createHash("sha1").update(fs.readFileSync(q)).digest("hex")); } };
  walk(dir);
  return out;
};
const changedFiles = (a, b) => [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k)).sort();
const mixedEol = (dir) => { const out = []; for (const [k] of hashTree(dir)) { if (!/\.(txt|csv)$/.test(k)) continue; const t = fs.readFileSync(path.join(dir, k), "utf8"); const crlf = (t.match(/\r\n/g) || []).length, lf = (t.match(/\n/g) || []).length - crlf; if (crlf && lf) out.push(k); } return out; };

try {
  console.log("\n=== 0. the fixture ===");
  {
    const s = makeMod("fixture-strait", "strait"), b = makeMod("fixture-bay", "bay");
    const cs = coastOf(s), cb = coastOf(b);
    ok([1, 2, 3, 4, 5, 7, 8, 10].every((p) => cs.has(p)) && !cs.has(9), `(strait: the sea touches every land province but 9: ${[...cs].sort((x, y) => x - y).join(" ")})`);
    ok([1, 2, 3, 4, 5, 7, 8, 10, NORTH].every((p) => cb.has(p)) && !cb.has(9), `(bay: the same, and 11 on the ocean: ${[...cb].sort((x, y) => x - y).join(" ")})`);
    const m = model(s);
    ok(yards(m, FYN) === 3 && levelAt(m, FYN, 1) === 3 && yards(m, JYL) === 1 && levelAt(m, JYL, 4) === 2 && yards(m, KIEL) === 6 && levelAt(m, KIEL, 7) === 8,
      "(Fyn holds 3 dockyards and a level-3 naval base on 1; Jylland 1 and a base on 4; Kiel 6 and a level-8 base on 7)");
    ok(problems(s, NAVAL_RULES).length === 0, "(and Map Errors says nothing of them while the Belt is a sea)", problems(s, NAVAL_RULES).map((p) => p.rule));
  }

  console.log("\n=== 1. strait: the Belt touches the ocean too ===");
  {
    const roots = makeMod("strait", "strait");
    const r = typeDropdown(roots);
    ok(r && r.changed, "the Type dropdown's sea → land is written", r);
    const before = allProblems(roots);
    const fatal = before.filter((p) => p.rule === "state_naval_building_without_coast");
    ok(fatal.length === 1 && (fatal[0].states || []).includes(FYN), "⭐ (the reproduction) Map Errors reports Fyn's dockyards with no coast, the fatal rule", fatal.map((p) => p.states));
    ok(before.some((p) => p.rule === "naval_base_non_coastal" && (p.items || []).some((i) => i.province === 7)), "(…and Kiel's naval base on 7, which touched only the Belt)", before.filter((p) => p.rule === "naval_base_non_coastal").map((p) => p.items));
    const fx = md.autoFixMap(roots);
    const m = model(roots);
    const home = (m.provinceToState || {})[BELT];
    ok(home === FYN, "⭐⭐ Auto-fix gives the new land to Fyn, whose lost coast it is — not to Jylland, the first neighbour its walk met", { home, details: (fx.fixes.statelessLand || {}).details });
    ok(coastOf(roots).has(BELT), "(…and the new land touches the ocean, so Fyn has a coast again)");
    ok(yards(m, FYN) === 3 && datedYard(fileOf(roots, FYN)) === 4, "⭐⭐⭐ Fyn keeps its `dockyard = 3` and its 1939 `dockyard = 4`", { yards: yards(m, FYN), dated: datedYard(fileOf(roots, FYN)) });
    ok(levelAt(m, FYN, BELT) === 3 && levelAt(m, FYN, 1) === 0, "⭐⭐⭐ Fyn's naval base moves off 1, which has no sea now, onto 20 at its level 3", (stateOf(m, FYN).provinceBuildings));
    ok(levelAt(m, KIEL, 8) === 8 && levelAt(m, KIEL, 7) === 0 && yards(m, KIEL) === 6, "⭐⭐⭐ Kiel's `naval_base = 8` moves off 7 onto 8, the coast Kiel still has; its 6 dockyards stay", (stateOf(m, KIEL).provinceBuildings));
    ok(yards(m, JYL) === 1 && levelAt(m, JYL, 4) === 2, "(Jylland is as it was: 1 dockyard, its base on 4)", { yards: yards(m, JYL), pb: stateOf(m, JYL).provinceBuildings });
    const nn = fx.fixes.navalNoCoast || {};
    const moved = (nn.moved || []).map((x) => `${x.stateId}:${x.from}->${x.to}@${x.level}`).sort();
    ok(JSON.stringify(moved) === JSON.stringify([`${FYN}:1->${BELT}@3`, `${KIEL}:7->8@8`]) && !nn.removed && !(nn.carried || []).length, "⭐ the answer says each move, and that nothing was removed", nn);
    const after = problems(roots, NAVAL_RULES.concat(["land_not_in_state"]));
    ok(after.length === 0, "⭐⭐ Map Errors is clean of every naval rule and of the stateless land", after.map((p) => `${p.rule}: ${String(p.message).slice(0, 90)}`));
    ok(rowsOn(roots, "naval_base_spawn", BELT) >= 1, "⭐ the naval base moved onto 20 has a port to stand on (the click's port pass gave one)", rowsOn(roots, "naval_base_spawn", BELT));
    ok(/\r\n/.test(fileOf(roots, KIEL)) && !/(^|[^\r])\n/.test(fileOf(roots, KIEL)) && !/\r/.test(fileOf(roots, FYN)), "(Kiel's file is still CRLF throughout, Fyn's still LF)");
    ok(mixedEol(roots.modRoot).length === 0, "(no file of the mod mixes line ends)", mixedEol(roots.modRoot));
    const h1 = hashTree(roots.modRoot);
    md.autoFixMap(roots);
    const again = changedFiles(h1, hashTree(roots.modRoot));
    ok(again.length === 0, "⭐ a second Auto-fix click writes nothing", again);
  }

  console.log("\n=== 2. bay: the Belt touches no other sea ===");
  {
    const roots = makeMod("bay", "bay");
    typeDropdown(roots);
    ok(problems(roots, ["state_naval_building_without_coast"]).length === 1, "(the fatal rule fires for Fyn)");
    const fx = md.autoFixMap(roots);
    const m = model(roots);
    ok(!coastOf(roots).has(BELT), "(the new land touches no sea, so no state can keep that coast)");
    ok(yards(m, FYN) === 0 && datedYard(fileOf(roots, FYN)) === 0 && levelAt(m, FYN, 1) === 0, "Fyn, with no coast, holds no dockyard or naval base any more", { yards: yards(m, FYN), file: fileOf(roots, FYN) });
    ok(yards(m, JYL) === 4 && datedYard(fileOf(roots, JYL)) === 5, "⭐⭐⭐ its dockyards are Jylland's, Denmark's coastal state next door, summed with its own: 1 + 3 = 4, and from 1939 1 + 4 = 5", { yards: yards(m, JYL), dated: datedYard(fileOf(roots, JYL)), file: fileOf(roots, JYL) });
    ok(levelAt(m, JYL, 5) === 3 && levelAt(m, JYL, 4) === 2, "⭐⭐⭐ …and its naval base goes onto 5, the coastal province Jylland has free, at level 3 (4 keeps its own)", stateOf(m, JYL).provinceBuildings);
    ok(/# the Odense yard/.test(fileOf(roots, JYL)) && !/# the Odense yard/.test(fileOf(roots, FYN)), "⭐ the comment on Fyn's dockyard goes with it", { jyl: fileOf(roots, JYL) });
    ok(levelAt(m, KIEL, 8) === 8 && levelAt(m, KIEL, 7) === 0, "⭐ Kiel's naval base moves onto 8", stateOf(m, KIEL).provinceBuildings);
    const nn = fx.fixes.navalNoCoast || {};
    const c = (nn.carried || [])[0] || {};
    ok((nn.carried || []).length === 1 && c.from === FYN && c.to === JYL && JSON.stringify((c.levels || []).map((l) => `${l.date || "-"}:${l.level}`)) === JSON.stringify(["-:3", "1939.1.1:4"])
      && (c.navalBases || []).length === 1 && c.navalBases[0].from === 1 && c.navalBases[0].to === 5 && c.navalBases[0].level === 3 && !nn.removed,
      "⭐ the answer says what went where, every moment, and that nothing was removed", nn);
    const after = problems(roots, NAVAL_RULES.concat(["land_not_in_state"]));
    ok(after.length === 0, "⭐⭐ Map Errors is clean of every naval rule", after.map((p) => `${p.rule}: ${String(p.message).slice(0, 90)}`));
    ok(rowsOn(roots, "naval_base_spawn", 5) >= 1, "(the naval base carried onto 5 has a port to stand on)", rowsOn(roots, "naval_base_spawn", 5));
    ok(mixedEol(roots.modRoot).length === 0, "(no file of the mod mixes line ends)", mixedEol(roots.modRoot));
    const h1 = hashTree(roots.modRoot);
    md.autoFixMap(roots);
    const again = changedFiles(h1, hashTree(roots.modRoot));
    ok(again.length === 0, "⭐ a second Auto-fix click writes nothing", again);
  }

  console.log("\n=== 3. alone: Fyn's country has no other coast ===");
  {
    const roots = makeMod("alone", "alone");
    typeDropdown(roots);
    const fx = md.autoFixMap(roots);
    const m = model(roots);
    const nn = fx.fixes.navalNoCoast || {};
    const leftOf = (nn.left || []).map((l) => `${l.stateId}:${l.key}${l.province != null ? "@" + l.province : ""}`).sort();
    ok(yards(m, FYN) === 3 && levelAt(m, FYN, 1) === 3 && datedYard(fileOf(roots, FYN)) === 4 && nn.removed === 0 && !(nn.states || []).length && !(nn.carried || []).length,
      "⭐⭐⭐ where no coast of its country can take them, nothing is removed either: Fyn keeps `dockyard = 3`, its 1939 `dockyard = 4` and its naval base on 1", { nn, file: fileOf(roots, FYN) });
    ok(JSON.stringify(leftOf) === JSON.stringify([`${FYN}:dockyard`, `${FYN}:naval_base@1`]) && (nn.left || []).every((l) => /no other state of FYN has a coast/.test(l.why || "")),
      "⭐ …and the answer says each one it left, and why", nn.left);
    const still = problems(roots, ["state_naval_building_without_coast"]);
    ok(still.length === 1 && (still[0].states || []).includes(FYN) && /deletes none/.test(String(still[0].message)), "⭐ …and Map Errors still reports the dockyard, saying Auto-fix deletes none (Save stops for it: the modder decides)", still.map((p) => String(p.message).slice(-260)));
    ok(yards(m, JYL) === 1 && levelAt(m, JYL, 5) === 0, "(Denmark's Jylland is not Fyn's country's: it gets nothing)", { yards: yards(m, JYL), pb: stateOf(m, JYL).provinceBuildings });
    ok(levelAt(m, KIEL, 8) === 8, "(Kiel's naval base still moves onto 8)");
    const h1 = hashTree(roots.modRoot);
    md.autoFixMap(roots);
    const again = changedFiles(h1, hashTree(roots.modRoot));
    ok(again.length === 0, "⭐ a second Auto-fix click writes nothing", again);
  }

  console.log("\n=== 4. nearestCoastalStateOfItsOwner ===");
  if (typeof md.nearestCoastalStateOfItsOwner !== "function") ok(false, "map-data.js exports nearestCoastalStateOfItsOwner");
  else {
    const roots = makeMod("nearest", "bay");
    typeDropdown(roots);
    const m = model(roots);
    const coastal = md.landProvincesTouchingSea({ ...roots, model: m });
    // as if Fyn were German: Kiel borders the Belt that borders Fyn, and the rest of Germany (10 and 11) borders Fyn's own provinces
    const asGer = { ...m, states: m.states.map((s) => (s.id === FYN ? { ...s, owner: "GER" } : s)) };
    const t = md.nearestCoastalStateOfItsOwner({ ...roots, model: asGer, coastal, states: [FYN] });
    ok(t.get(FYN) === REST, "⭐ a state goes to its country's coastal state the fewest province steps away (11, the rest of Germany, borders Fyn)", [...t]);
    const t2 = md.nearestCoastalStateOfItsOwner({ ...roots, model: m, coastal, states: [FYN] });
    ok(t2.get(FYN) === JYL, "(Denmark's Fyn: Jylland, its only other coastal state)", [...t2]);
    const none = md.nearestCoastalStateOfItsOwner({ ...roots, model: { ...m, states: m.states.map((s) => (s.id === FYN ? { ...s, owner: "" } : s)) }, coastal, states: [FYN] });
    ok(!none.has(FYN), "(a state with no owner goes nowhere)", [...none]);
  }

  console.log("\n=== 5. the page, the messages and the endpoint ===");
  {
    const box = {};
    let helpers = "";
    try {
      helpers = [lift("const NAVAL_ONLY_STATE_KEYS =", ";"), lift("function stateNavalLevels("), lift("function navalLevelsWords("), lift("function coastsASeaMadeLandTakes("), lift("function seaMadeLandNavalWords(")].join("\n");
      vm.runInNewContext(helpers + "\nthis.took = coastsASeaMadeLandTakes; this.words = seaMadeLandNavalWords;", box);
    } catch (e) { ok(false, "the page has coastsASeaMadeLandTakes and seaMadeLandNavalWords", e.message); box.took = () => ({ states: [], bases: [] }); box.words = () => ""; }
    // the Type dropdown's change handler itself, run as the page has it: the dropdowns hold what the inspector filled them with for the
    // sea, then Type becomes land; the confirm it shows is captured, answered Yes and then No
    const runDropdown = (variant, states, adj, m, answer, type = "land") => {
      const asked = [], queued = [];
      let undos = 0;
      const els = { miTypeSel: { value: type }, miTerrainSel: { value: "ocean" }, miCoastalChk: { checked: false } };
      const ctx = {
        selected: { provinceId: BELT }, provinceDef: new Map([[BELT, { id: BELT, type: "sea", terrain: "ocean", coastal: false }]]),
        // the fixture ships no common/terrain; the page's model of any real map carries the base game's categories, ocean among them
        $: (id) => els[id], model: { states, terrainCategories: [{ name: "ocean", water: true }, { name: "plains", water: false }] },
        window: { confirm: (t) => { asked.push(String(t)); return answer; } },
        pushUndo() { undos++; }, beginEraseStroke() {}, eraseProvinceLocal() { return false; }, commitEraseStroke() {},
        computeSeaAdjacency() {}, seaAdjacent: null, provNeighborsCache: adj, buildProvNeighbors() {},
        queueWrite(url, body) { queued.push({ url, body }); return { ok: true, deferred: true }; },
        // (the page's queue, with nothing staged before this change: saveProvinceTerrain reads it first, for a Type change taken back, ⛔ #a-type-turned-back-writes-nothing)
        pendingWrites: [],
        provinceType: new Map((m.provinces || []).map((q) => [q.id, q.type])), setStatus() {}, statusEl: null,
      };
      try {
        vm.createContext(ctx);
        vm.runInContext(lift("async function saveProvinceTerrain(") + "\n" + helpers + "\nsaveProvinceTerrain();", ctx);   // nothing in it awaits: it runs to its end here
      } catch (e) { asked.push("HARNESS: " + e.message); }
      return { asked, queued, type: els.miTypeSel.value, undos };
    };
    for (const variant of ["strait", "bay"]) {
      const roots = makeMod("page-" + variant, variant);
      const m = model(roots), shapeAt = shapeOf(variant);
      // the page's border graph of these cells (the wrap included), and the types as the page has them before the change
      const adj = new Map(), add = (a, b) => { if (a === b) return; for (const [x, y] of [[a, b], [b, a]]) { if (!adj.has(x)) adj.set(x, new Set()); adj.get(x).add(y); } };
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { add(shapeAt(x, y), shapeAt((x + 1) % W, y)); if (y + 1 < H) add(shapeAt(x, y), shapeAt(x, y + 1)); }
      const typeOf = (p) => ((m.provinces || []).find((q) => q.id === p) || {}).type;
      const states = m.states.map((s) => ({ id: s.id, name: s.name, displayName: `S${s.id}`, provinces: s.provinces.slice(), buildings: { ...(s.buildings || {}) }, provinceBuildings: s.provinceBuildings || {}, ...(s.navalDated ? { navalDated: s.navalDated } : {}) }));
      const got = box.took(BELT, states, (p) => adj.get(p) || [], typeOf);
      ok(got.states.length === 1 && got.states[0].state.id === FYN && got.states[0].keys.dockyard === 3, `⭐ ${variant}: the click finds the Belt is Fyn's last coast, with its 3 dockyards`, got.states.map((x) => [x.state.id, x.keys]));
      ok(JSON.stringify(got.bases.map((b) => `${b.province}@${b.level}`).sort()) === JSON.stringify(["1@3", "7@8"]), `⭐ ${variant}: …and the naval bases of 1 and 7 lose their sea (4's does not)`, got.bases.map((b) => [b.province, b.level]));
      ok(got.landTouchesSea === (variant === "strait"), `(${variant}: the new land ${variant === "strait" ? "touches" : "touches no"} other sea)`, got.landTouchesSea);
      const words = box.words(BELT, got, (s) => s.displayName, false);
      ok(/S1 \(state 1\) is left with no province beside the sea, and holds 3 dockyards/.test(words) && /province 1 \(level 3, S1\) and 7 \(level 8, S3\)/.test(words), `⭐ ${variant}: the confirm names the state, its dockyards and each naval base`, words);
      // ⛔ #a-deleted-state-says-every-dockyard-it-takes — every moment of them, as Delete state now says them (review of the coast rows, CR-R4,
      // the same undated-only count): Fyn holds 3, and from 1939 4, and Auto-fix carries both (section 2)
      ok(/and holds 3 dockyards \(4 from 1939\.1\.1\)/.test(words), `⭐⭐ ${variant}: …every moment of them: 3, and 4 from 1939`, words);
      {
        // Fyn's only dockyard a 1939 one (the base game's 517-Victoria has that shape): this said nothing of it, the state being left out
        const asLater = (keepBase) => states.map((s) => (s.id === FYN ? { ...s, buildings: { infrastructure: 3 }, provinceBuildings: keepBase ? s.provinceBuildings : {}, navalDated: [{ date: "1939.1.1", key: "dockyard", level: 4 }] } : s));
        const tl = box.took(BELT, asLater(false), (p) => adj.get(p) || [], typeOf);
        ok(tl.states.length === 1 && tl.states[0].state.id === FYN, `⭐⭐ ${variant}: a state whose only dockyard a later date adds loses its coast too`, tl.states.map((x) => x.state.id));
        const wl = box.words(BELT, tl, (s) => s.displayName, false);
        ok(/S1 \(state 1\) is left with no province beside the sea, and holds 4 dockyards from 1939\.1\.1/.test(wl), `⭐⭐ ${variant}: …said with its date`, wl);
        ok(/S1: a dockyard only a later date adds stays where it is\. Auto-fix does not move it, and Map Errors lists it while its state has no coast\./.test(wl) && !/Auto-fix do it/.test(wl),
          `⭐ ${variant}: …and that Auto-fix leaves it, which section 7 holds it to, offering it for nothing it will not do`, wl);
        const wb = box.words(BELT, box.took(BELT, asLater(true), (p) => adj.get(p) || [], typeOf), (s) => s.displayName, false);
        ok(!/a later date adds stays where it is/.test(wb), `⭐ ${variant}: …but with a naval base to go, the dated dockyard goes with it (section 7), so that is not said`, wb);
        const asked = runDropdown(variant, asLater(false), adj, m, true).asked;
        ok(asked.length === 1 && /holds 4 dockyards from 1939\.1\.1/.test(asked[0]) && /a dockyard only a later date adds stays where it is/.test(asked[0]), `⭐ ${variant}: …in the Type dropdown's own confirm`, asked);
      }
      if (variant === "strait") ok(/paint province 20 into S1/.test(words) && /Auto-fix do it/.test(words), "⭐ strait: …and says to paint 20 into Fyn, or let Auto-fix do it", words);
      else ok(/Province 20 touches no other sea, so no state keeps that coast/.test(words) && /nearest coastal state of the same country/.test(words), "⭐ bay: …and that no state keeps that coast, and where Auto-fix sends them", words);
      ok(/It deletes none: what no other state of that country can take stays where it is/.test(words) && !/removing only/.test(words), `⭐ ${variant}: …and that Auto-fix deletes none of them`, words);
      ok(box.words(BELT, { states: [], bases: [], landTouchesSea: true }, (s) => s.displayName, false) === "", `(${variant}: nothing found, nothing said)`);
      const yes = runDropdown(variant, states, adj, m, true);
      ok(yes.asked.length === 1 && /Province 20 is becoming LAND but belongs to no state/.test(yes.asked[0]) && /S1 \(state 1\) is left with no province beside the sea, and holds 3 dockyards/.test(yes.asked[0])
        && /province 1 \(level 3, S1\) and 7 \(level 8, S3\)/.test(yes.asked[0]) && /deletes none/.test(yes.asked[0]) && /Turn it into land anyway\?$/.test(yes.asked[0]),
        `⭐⭐ ${variant}: the Type dropdown's own confirm, before sea 20 becomes land, names Fyn's dockyards and the two naval bases, and that Auto-fix deletes none`, yes.asked);
      ok(yes.queued.length === 1 && yes.queued[0].url === "/api/map/set-province-terrain" && JSON.stringify(yes.queued[0].body) === JSON.stringify({ provinceId: BELT, terrain: "plains", type: "land", coastal: false }),
        `(${variant}: answered Yes, it queues the change the sections above write)`, yes.queued);
      const no = runDropdown(variant, states, adj, m, false);
      ok(no.asked.length === 1 && no.queued.length === 0 && no.type === "sea", `(${variant}: answered No, it queues nothing and Type reads sea again)`, no);
      // ⛔ …and a sea made a LAKE takes the coast the same way, a lake being no coast (review of the coast rows, F14): the bay made a lake left Fyn with
      // no coast holding its dockyards and a naval base, Map Errors lists them, and the dropdown said nothing
      const lake = runDropdown(variant, states, adj, m, true, "lake");
      ok(lake.asked.length === 1 && /^Province 20 is becoming a LAKE\./.test(lake.asked[0]) && /S1 \(state 1\) is left with no province beside the sea, and holds 3 dockyards \(4 from 1939\.1\.1\)/.test(lake.asked[0])
        && /province 1 \(level 3, S1\) and 7 \(level 8, S3\)/.test(lake.asked[0]) && /deletes none/.test(lake.asked[0]) && /Turn it into a lake anyway\?$/.test(lake.asked[0]),
        `⭐⭐ ${variant}: the dropdown asks the same before a sea becomes a lake, naming what it takes`, lake.asked);
      ok(!/paint province/i.test(lake.asked[0] || "") && !/touches no other sea/.test(lake.asked[0] || "") && /🛠 Auto-fix keeps them/.test(lake.asked[0] || ""), `⭐ ${variant}: …less the advice to paint it into the state, a lake not being land`, lake.asked);
      ok(lake.queued.length === 1 && lake.queued[0].body.type === "lake" && lake.undos === 1, `(${variant}: answered Yes, it queues the change, one Undo step)`, lake);
      const lakeNo = runDropdown(variant, states, adj, m, false, "lake");
      ok(lakeNo.asked.length === 1 && !lakeNo.queued.length && lakeNo.type === "sea" && lakeNo.undos === 0, `⭐ ${variant}: answered No, nothing is queued, Type reads sea again and no Undo step is left`, lakeNo);
      const lakeNothing = runDropdown(variant, [], adj, m, true, "lake");
      ok(!lakeNothing.asked.length && lakeNothing.queued.length === 1, `(${variant}: a lake that takes no coast asks nothing)`, lakeNothing);
    }
    const map = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8").replace(/\r\n/g, "\n"));
    const fn = map.slice(map.indexOf("async function saveProvinceTerrain("), map.indexOf('$("miTerrainSel").addEventListener("change", saveProvinceTerrain)'));
    ok(/coastsASeaMadeLandTakes\(pid,/.test(fn) && /seaMadeLandNavalWords\(pid,/.test(fn) && /belongs to no state[^`]*\$\{navalWords\}\\n\\nTurn it into land anyway\?/.test(fn),
      "⭐ the Type dropdown asks it before a sea becomes land and says it in its confirm", null);
    const sum = map.slice(map.indexOf("const nnc = (fr.fixes && fr.fixes.navalNoCoast)"), map.indexOf("if (dc.recolored"));
    ok(/nnc\.moved/.test(sum) && /nnc\.carried/.test(sum) && /nnc\.left/.test(sum) && /moved \$\{nncMoved\.length\} naval base/.test(sum) && /to the nearest coastal state of the same country/.test(sum)
      && /left \$\{nncLeft\.length\} dockyard\(s\) and naval base\(s\) with no coast where they are/.test(sum) && /Nova deletes none of them/.test(sum) && !/removed \$\{nnc\.removed\} dockyard/.test(sum),
      "⭐ Auto-fix's summary says what it moved and where, and what it left where it is — and claims no removal (test-every-auto-fix-step-is-in-the-summary.js runs those lines)", null);
    // a shipped definition.csv that made the Belt land, its coastal column left as it was: the bitmap's own naval_base_non_coastal speaks
    const roots = makeMod("messages", "strait");
    const csvPath = path.join(roots.modRoot, "map", "definition.csv");
    fs.writeFileSync(csvPath, fs.readFileSync(csvPath, "utf8").replace(`${BELT};${colour(BELT).join(";")};sea;false;ocean;0`, () => `${BELT};${colour(BELT).join(";")};land;true;plains;1`));
    const msg = md.validateMapBitmap(roots).filter((p) => p.rule === "state_naval_building_without_coast" || p.rule === "naval_base_non_coastal").map((p) => String(p.message)).join(" | ");
    ok(!/Auto-fix removes the buildings the game has already refused/.test(msg) && !/Auto-fix removes the naval bases the game refuses/.test(msg) && /Auto-fix keeps them and deletes none/.test(msg)
      && /Auto-fix moves each onto a coastal province of its state/.test(msg) && /stays where it is/.test(msg) && !/removes (one|only)/.test(msg),
      "⭐ the two rules say Auto-fix keeps them and deletes none: what no coast can take stays where it is", msg.slice(0, 900));
    const lab = require("./public/map-rule-labels.js").mapRuleFixHint("state_naval_building_without_coast");
    ok(!/to remove what the game has already refused/.test(lab) && !/removes them only/.test(lab) && /moves the dockyards to the nearest coastal state of the same country/.test(lab) && /It deletes none/.test(lab),
      "(the rule's description says the same)", lab);
    const server = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8").replace(/\r\n/g, "\n"));
    const ep = server.slice(server.indexOf('app.post("/api/map/set-province-terrain"'), server.indexOf('app.post("/api/map/set-province-terrain"') + 6000);
    ok(/mapData\.setProvinceDefinitionWithItsRows\(/.test(ep), "(the dropdown's endpoint writes through setProvinceDefinitionWithItsRows, the function sections 1–3 drive)", null);
  }

  console.log("\n=== 6. full: no coastal province free to take a naval base ===");
  const { isFatalRule } = require("./public/map-rule-labels.js");
  {
    // strait: Kiel's 7 loses its sea, and 8, the coast Kiel keeps, holds a naval base already
    const roots = makeMod("strait-full", "strait", true);
    typeDropdown(roots);
    const fx = md.autoFixMap(roots);
    const m = model(roots);
    const nn = fx.fixes.navalNoCoast || {};
    ok(levelAt(m, KIEL, 7) === 8 && levelAt(m, KIEL, 8) === 1 && yards(m, KIEL) === 6, "⭐⭐⭐ where every coastal province its country has holds one, Kiel's `naval_base = 8` stays on 7: not deleted, not stacked onto 8's", stateOf(m, KIEL).provinceBuildings);
    ok((nn.left || []).some((l) => l.stateId === KIEL && l.key === "naval_base" && l.province === 7 && l.why === "every coastal province of the 2 coastal states of GER holds one already") && !nn.removed,
      "⭐ …and the answer says it left it there, and why: nothing of Germany's is free", nn);
    ok(levelAt(m, FYN, BELT) === 3 && levelAt(m, FYN, 1) === 0 && yards(m, FYN) === 3, "(Fyn's naval base still moves onto 20, which holds none, and its dockyards stay)", stateOf(m, FYN).provinceBuildings);
    const warn = problems(roots, NAVAL_RULES);
    ok(warn.length >= 1 && warn.every((p) => p.rule === "naval_base_non_coastal" && !isFatalRule(p.rule)) && warn.some((p) => (p.items || []).some((i) => i.province === 7)),
      "⭐ …so Map Errors still warns of it, a rule that does not stop Save", warn.map((p) => [p.rule, p.severity, p.items]));
    const h1 = hashTree(roots.modRoot);
    md.autoFixMap(roots);
    const again = changedFiles(h1, hashTree(roots.modRoot));
    ok(again.length === 0, "(a second click writes nothing)", again);
  }
  {
    // bay: Fyn's dockyards go to Jylland, whose coastal 4 and 5 both hold a naval base already
    const roots = makeMod("bay-full", "bay", true);
    typeDropdown(roots);
    const fx = md.autoFixMap(roots);
    const m = model(roots);
    const nn = fx.fixes.navalNoCoast || {};
    ok(yards(m, JYL) === 4 && datedYard(fileOf(roots, JYL)) === 5 && yards(m, FYN) === 0, "(Fyn's dockyards still go to Jylland: 1 + 3 = 4, and from 1939 1 + 4 = 5)", { jyl: fileOf(roots, JYL) });
    ok(levelAt(m, FYN, 1) === 3 && levelAt(m, JYL, 4) === 2 && levelAt(m, JYL, 5) === 1, "⭐⭐⭐ …while Fyn's naval base, which no coastal province of Jylland is free to take, stays on 1", { fyn: stateOf(m, FYN).provinceBuildings, jyl: stateOf(m, JYL).provinceBuildings });
    // (the rest of Germany's 11 is free here, so Kiel's base goes there)
    const c = (nn.carried || []).find((x) => x.from === FYN) || {};
    ok(c.from === FYN && c.to === JYL && !(c.navalBases || []).length && !nn.removed
      && (nn.left || []).some((l) => l.stateId === FYN && l.key === "naval_base" && l.province === 1 && l.why === `every coastal province of state ${JYL} holds one already`),
      "⭐ …and the answer says the dockyards went and the naval base stayed, and why", nn);
    ok(problems(roots, ["state_naval_building_without_coast", "dated_naval_building_without_coast"]).length === 0, "(nothing fatal is left: Fyn holds no dockyard in any moment)");
    const h1 = hashTree(roots.modRoot);
    md.autoFixMap(roots);
    const again = changedFiles(h1, hashTree(roots.modRoot));
    ok(again.length === 0, "(a second click writes nothing)", again);
  }

  // ⛔ #a-deleted-state-says-every-dockyard-it-takes — WHAT THE CONFIRM SAYS OF A DOCKYARD ONLY A LATER DATE ADDS, HELD TO WHAT AUTO-FIX DOES WITH ONE.
  console.log("\n=== 7. later: Fyn's only dockyard is a 1939 one ===");
  {
    const laterOnly = (roots, keepBase) => {
      const f = path.join(roots.modRoot, "history", "states", `${FYN}-Fyn.txt`);
      let t = fs.readFileSync(f, "utf8").replace("\t\t\t# the Odense yard\n\t\t\tdockyard = 3\n", () => "");
      if (!keepBase) t = t.replace("\t\t\t1 = { naval_base = 3 }\n", () => "");
      fs.writeFileSync(f, t);
    };
    const yardsListed = (roots) => problems(roots, ["dated_naval_building_without_coast"]).filter((p) => String(p.message).includes(`${FYN}-Fyn.txt`) || (p.items || []).some((i) => i.stateId === FYN || i.state === FYN));
    for (const variant of ["bay", "strait"]) {
      const roots = makeMod("later-" + variant, variant);
      laterOnly(roots, false);
      typeDropdown(roots);
      ok(problems(roots, ["state_naval_building_without_coast"]).every((p) => !(p.states || []).includes(FYN)), `(${variant}: the fatal rule does not fire for it: it reads the undated level)`, problems(roots, ["state_naval_building_without_coast"]).map((p) => p.states));
      const before = fileOf(roots, FYN);
      const fx = md.autoFixMap(roots);
      const nn = fx.fixes.navalNoCoast || {};
      const m = model(roots);
      ok(fileOf(roots, FYN) === before && datedYard(fileOf(roots, FYN)) === 4 && !(nn.carried || []).some((c) => c.from === FYN), `⭐⭐ ${variant}: Auto-fix does not move it: Fyn's file is as it was, its 1939 \`dockyard = 4\` in it`, { carried: nn.carried, file: fileOf(roots, FYN) });
      const hasCoast = (stateOf(m, FYN).provinces || []).some((p) => coastOf(roots).has(p));
      ok(!hasCoast && yardsListed(roots).length === 1, `⭐⭐ ${variant}: …and Map Errors lists it while its state has no coast`, { hasCoast, listed: problems(roots, ["dated_naval_building_without_coast"]).map((p) => String(p.message).slice(0, 160)), home: (m.provinceToState || {})[BELT] });
      ok(mixedEol(roots.modRoot).length === 0, `(${variant}: no file of the mod mixes line ends)`, mixedEol(roots.modRoot));
    }
    {
      const roots = makeMod("later-with-base", "bay");
      laterOnly(roots, true);
      typeDropdown(roots);
      const fx = md.autoFixMap(roots);
      const m = model(roots), nn = fx.fixes.navalNoCoast || {};
      ok(datedYard(fileOf(roots, FYN)) === 0 && datedYard(fileOf(roots, JYL)) === 5 && levelAt(m, FYN, 1) === 0 && levelAt(m, JYL, 5) === 3 && (nn.carried || []).some((c) => c.from === FYN && c.to === JYL),
        "⭐⭐ with a naval base to go, Auto-fix carries the dated dockyard with it to Jylland (1 + 4 = 5 from 1939), which is why the confirm says the other only of a state with none", { nn, fyn: fileOf(roots, FYN), jyl: fileOf(roots, JYL) });
    }
    {
      // no undated block at all: the readers take the dated one for the state's buildings, so Auto-fix does move it, and the confirm must not say otherwise
      const roots = makeMod("later-only-block", "bay");
      const f = path.join(roots.modRoot, "history", "states", `${FYN}-Fyn.txt`), t = fs.readFileSync(f, "utf8"), cut = "\t\tbuildings = {\n\t\t\tinfrastructure = 3\n\t\t\t# the Odense yard\n\t\t\tdockyard = 3\n\t\t\t1 = { naval_base = 3 }\n\t\t}\n";
      if (!t.includes(cut)) throw new Error("fixture: Fyn's undated block");
      fs.writeFileSync(f, t.replace(cut, () => ""));
      const m0 = model(roots), shapeAt = shapeOf("bay"), adj = new Map(), add = (a, b) => { if (a === b) return; for (const [x, y] of [[a, b], [b, a]]) { if (!adj.has(x)) adj.set(x, new Set()); adj.get(x).add(y); } };
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { add(shapeAt(x, y), shapeAt((x + 1) % W, y)); if (y + 1 < H) add(shapeAt(x, y), shapeAt(x, y + 1)); }
      const page = {};
      vm.runInNewContext(`var NAVAL_ONLY_STATE_KEYS = ["dockyard"];\n${["function stateNavalLevels(", "function navalLevelsWords(", "function coastsASeaMadeLandTakes(", "function seaMadeLandNavalWords("].map((o) => lift(o)).join("\n")}\nvar took = coastsASeaMadeLandTakes, words = seaMadeLandNavalWords;`, page);
      const words = page.words(BELT, page.took(BELT, m0.states, (p) => adj.get(p) || [], (p) => ((m0.provinces || []).find((q) => q.id === p) || {}).type), (s) => `S${s.id}`, false);
      ok(stateOf(m0, FYN).buildingsDated === true && /holds 4 dockyards from 1939\.1\.1/.test(words), "(a state whose only buildings block is dated: the confirm says its dockyards with their date)", words);
      typeDropdown(roots);
      const nn = md.autoFixMap(roots).fixes.navalNoCoast || {};
      ok((nn.carried || []).some((c) => c.from === FYN && c.to === JYL) && datedYard(fileOf(roots, JYL)) === 5, "(…and Auto-fix moves them, the date kept)", { nn, jyl: fileOf(roots, JYL) });
      ok(!/a later date adds stays where it is/.test(words), "⭐⭐ …so the confirm does not say it leaves them", words);
    }
  }

  console.log("\n=== 8. a carry that cannot finish gives nothing ===");
  {
    const stateFile = (roots, sid) => { const d = path.join(roots.modRoot, "history", "states"); return path.join(d, fs.readdirSync(d).find((n) => n.startsWith(sid + "-"))); };
    const levelsOf = (roots, sid) => md.navalStateLevelsOf(fileOf(roots, sid)).map((l) => `${l.date || "-"}:${l.level}`).join(" ");
    // Fyn holds only 1 and Jylland 2 3 4 5, so a paint of 1 into Jylland takes Fyn's last coast
    const lastCoast = (name) => {
      const roots = makeMod(name, "bay");
      const edit = (sid, from, to) => { const f = stateFile(roots, sid); const t = fs.readFileSync(f, "utf8"); if (t.indexOf(from) < 0) throw new Error("fixture: " + from); fs.writeFileSync(f, t.replace(from, () => to)); };
      edit(FYN, "provinces = { 1 2 }", "provinces = { 1 }");
      edit(JYL, "provinces = { 3 4 5 }", "provinces = { 2 3 4 5 }");
      return roots;
    };
    // the ways another program stops a write: the read-only setting, which fs.accessSync sees, and a handle held open, which nothing sees before the write
    const blocks = {
      "read-only": (f) => { fs.chmodSync(f, 0o444); return () => fs.chmodSync(f, 0o666); },
      "held open": (f) => { const fd = fs.openSync(f, "r"); return () => fs.closeSync(fd); },
    };
    for (const [how, block] of Object.entries(blocks)) {
      console.log(`  -- a state paint, the giver ${how}`);
      const roots = lastCoast("retry-paint-" + how.replace(/\W/g, ""));
      const jyl0 = fileOf(roots, JYL), fyn0 = fileOf(roots, FYN);
      ok(levelsOf(roots, JYL) === "-:1" && levelsOf(roots, FYN) === "-:3 1939.1.1:4", "(Jylland holds 1 dockyard, Fyn 3 and from 1939 4)", [levelsOf(roots, JYL), levelsOf(roots, FYN)]);
      const paint = () => { try { return { r: md.moveProvince({ ...roots, provinceId: 1, toStateId: JYL }) }; } catch (e) { return { error: e.message }; } };
      let free = block(stateFile(roots, FYN));
      let tries = [];
      try {
        for (let i = 0; i < 2; i++) { const a = paint(); tries.push({ error: a.error, jyl: fileOf(roots, JYL), fyn: fileOf(roots, FYN) }); }
      } finally { free(); }
      ok(tries.every((t) => /Couldn't write 1-Fyn\.txt/.test(t.error || "")), "the Save fails and says which file", tries.map((t) => t.error));
      ok(levelsOf({ ...roots }, FYN) === "-:3 1939.1.1:4", "(Fyn still holds its dockyards)", levelsOf(roots, FYN));
      ok(tries[0].jyl === jyl0, "⭐⭐⭐ the failed paint gives Jylland nothing: its file is as it was, byte for byte", tries[0].jyl);
      ok(tries[1].jyl === jyl0 && tries[1].fyn === fyn0, "⭐⭐⭐ …and trying again, as the failure says to, adds nothing", tries[1].jyl);
      ok(!/provinces = \{[^}]*\b1\b/.test(tries[0].jyl), "⭐ …nor province 1: nothing was changed, which is what the error says", tries[0].jyl);
      const last = paint();
      ok(!last.error && levelsOf(roots, JYL) === "-:4 1939.1.1:5" && levelsOf(roots, FYN) === "", "⭐⭐⭐ with the file free the paint carries them once: 1 + 3 = 4, and from 1939 1 + 4 = 5", [last.error, levelsOf(roots, JYL), levelsOf(roots, FYN)]);
      ok((last.r.navalCarried || []).length === 1 && last.r.navalCarried[0].from === FYN && last.r.navalCarried[0].to === JYL, "(…and the answer says what went)", last.r.navalCarried);
      ok(/1 = \{ naval_base = 3 \}/.test(fileOf(roots, JYL)) && (fileOf(roots, JYL).match(/naval_base = 3/g) || []).length === 1, "(its naval base came once)", fileOf(roots, JYL));

      console.log(`  -- a click of Auto-fix, the giver ${how}`);
      const fx = makeMod("retry-fix-" + how.replace(/\W/g, ""), "bay");
      typeDropdown(fx);
      const jyl1 = fileOf(fx, JYL);
      free = block(stateFile(fx, FYN));
      const clicks = [];
      try { for (let i = 0; i < 2; i++) { const a = md.autoFixMap(fx); clicks.push({ nn: a.fixes.navalNoCoast || {}, jyl: fileOf(fx, JYL) }); } } finally { free(); }
      ok(clicks.every((c) => (c.nn.failed || []).some((f) => f.stateId === FYN && /Couldn't write 1-Fyn\.txt/.test(f.reason)) && !(c.nn.carried || []).length), "the click says it could not write Fyn, and that nothing was carried", clicks.map((c) => c.nn));
      ok(clicks.every((c) => md.navalStateLevelsOf(c.jyl).map((l) => `${l.date || "-"}:${l.level}`).join(" ") === "-:1"), "⭐⭐⭐ Jylland is given nothing, click after click", clicks.map((c) => md.navalStateLevelsOf(c.jyl)));
      ok(clicks.every((c) => !(c.nn.failed || []).some((f) => /in both/.test(f.reason))), "(…so nothing is in both states, and nothing says so)", clicks.map((c) => c.nn.failed));
      ok(levelAt(model(fx), JYL, 5) === 0 && levelAt(model(fx), FYN, 1) === 3, "(Fyn's naval base has not gone onto Jylland's 5 either)", [stateOf(model(fx), JYL).provinceBuildings, stateOf(model(fx), FYN).provinceBuildings]);
      const third = md.autoFixMap(fx);
      ok(levelsOf(fx, JYL) === "-:4 1939.1.1:5" && levelsOf(fx, FYN) === "" && levelAt(model(fx), JYL, 5) === 3 && (third.fixes.navalNoCoast.carried || []).length === 1, "⭐⭐⭐ with the file free the click carries them once", [levelsOf(fx, JYL), levelsOf(fx, FYN), third.fixes.navalNoCoast]);

      console.log(`  -- createState stealing a giver's last coast, the giver ${how}`);
      const cs = lastCoast("retry-create-" + how.replace(/\W/g, ""));
      free = block(stateFile(cs, FYN));
      let made;
      try { made = md.createState({ ...cs, name: "New", provinces: [1], owner: "DEN" }); } finally { free(); }
      ok(made && made.ok && levelsOf(cs, made.id) === "" && levelsOf(cs, FYN) === "-:3 1939.1.1:4", "⭐⭐ the new state does not keep a second copy of dockyards Fyn could not give", [made && made.id, levelsOf(cs, made && made.id), levelsOf(cs, FYN)]);
      ok((made.notTaken || []).some((n) => n.stateId === FYN && /Couldn't write/.test(n.reason)) && !made.navalCarried, "⭐ …and the answer says Fyn could not be cut", made);
    }
    {
      console.log("  -- createState with the giver free");
      const cs = lastCoast("retry-create-free");
      const made = md.createState({ ...cs, name: "New", provinces: [1], owner: "DEN" });
      ok(levelsOf(cs, made.id) === "-:3 1939.1.1:4" && levelsOf(cs, FYN) === "" && (made.navalCarried || []).length === 1, "(the new state takes them, once)", [levelsOf(cs, made.id), levelsOf(cs, FYN), made.navalCarried]);
    }
    {
      // the take-back itself refused: the handle is taken as the taker's second write begins (safeModWrite announces a write before it makes it)
      console.log("  -- the taker cannot be put back");
      const { onModWrite } = require("./safe-write.js");
      let armed = null, count = 0, held = null;
      onModWrite((abs) => { if (armed && path.resolve(abs) === path.resolve(armed)) { count++; if (count === 2 && held === null) held = fs.openSync(armed, "r"); } });
      const roots = lastCoast("retry-putback-paint");
      const fynFile = stateFile(roots, FYN), jylFile = stateFile(roots, JYL);
      fs.chmodSync(fynFile, 0o444);
      armed = jylFile;
      let err = "";
      try { md.moveProvince({ ...roots, provinceId: 1, toStateId: JYL }); } catch (e) { err = e.message; }
      if (held !== null) fs.closeSync(held);
      armed = null; held = null; count = 0;
      fs.chmodSync(fynFile, 0o666);
      ok(/Couldn't write 1-Fyn\.txt/.test(err) && /they are in both states until one is edited/.test(err) && /take them out of one before you try again/.test(err), "⭐ a paint says the dockyards are in both states, and to take them out of one before trying again", err);
      const fx = makeMod("retry-putback-fix", "bay");
      typeDropdown(fx);
      const fynF = stateFile(fx, FYN);
      fs.chmodSync(fynF, 0o444);
      armed = stateFile(fx, JYL);
      let nn = {};
      try { nn = md.fixNavalBuildingsWithoutCoast(fx); } finally { if (held !== null) fs.closeSync(held); armed = null; fs.chmodSync(fynF, 0o666); }
      ok((nn.failed || []).some((f) => f.stateId === JYL && /in both until one is edited/.test(f.reason) && /take them out of one before you click again/.test(f.reason)), "⭐ a click says so too, and to take them out of one before clicking again", nn.failed);
    }
  }

  console.log("\n=== 9. a naval base that moves goes as written ===");
  {
    const stateFile = (roots, sid) => { const d = path.join(roots.modRoot, "history", "states"); return path.join(d, fs.readdirSync(d).find((n) => n.startsWith(sid + "-"))); };
    // the fixture's Kiel is CRLF, Fyn's and Jylland's LF: an edit is written in LF and takes the file's own line ends
    const edit = (roots, sid, from, to) => {
      const f = stateFile(roots, sid), t = fs.readFileSync(f, "utf8"), eol = /\r\n/.test(t) ? "\r\n" : "\n";
      const a = from.replace(/\n/g, eol), b = to.replace(/\n/g, eol);
      if (t.split(a).length !== 2) throw new Error("fixture: " + from);
      fs.writeFileSync(f, t.replace(a, () => b));
    };
    // Comments are content, and a multiset cannot see one re-attached to the wrong statement: comment -> the key on the next code line, or on its own
    const captions = (txt) => {
      const out = {}, lines = txt.replace(/\r/g, "").split("\n");
      lines.forEach((l, i) => {
        const at = l.indexOf("#");
        if (at < 0) return;
        const comment = l.slice(at).trim(), own = l.slice(0, at).trim();
        if (own) { out[comment] = own.split(/[\s=]/)[0]; return; }
        for (let j = i + 1; j < lines.length; j++) {
          const c = lines[j].replace(/#.*/, "").trim();
          if (!c) continue;
          out[comment] = c === "}" ? "" : c.split(/[\s=]/)[0];
          return;
        }
        out[comment] = "";
      });
      return out;
    };
    const entriesOf = (txt, pid) => (txt.replace(/#[^\r\n]*/g, "").match(new RegExp(`(^|[^0-9])${pid}\\s*=\\s*\\{`, "g")) || []).length;
    const again = (roots) => { const h1 = hashTree(roots.modRoot); md.autoFixMap(roots); return changedFiles(h1, hashTree(roots.modRoot)); };

    {
      console.log("  -- a comment inside the block, and one trailing the level");
      const roots = makeMod("asis-inside", "strait");
      edit(roots, KIEL, "\t\t\t7 = { naval_base = 8 }\n", "\t\t\t7 = {\n\t\t\t\t# the Holtenau lock\n\t\t\t\tnaval_base = 8 # raised in 1936\n\t\t\t}\n");
      typeDropdown(roots);
      md.autoFixMap(roots);
      const t = fileOf(roots, KIEL), c = captions(t);
      ok(c["# the Holtenau lock"] === "naval_base" && c["# raised in 1936"] === "naval_base" && levelAt(model(roots), KIEL, 8) === 8 && entriesOf(t, 7) === 0, "⭐⭐⭐ both comments go with the naval base onto 8, each on what it was on", t);
      ok(/8 = \{\s+# the Holtenau lock/.test(t.replace(/\r/g, "")), "(…inside the block of the province it stands on now)", t);
      ok(/\r\n/.test(t) && !/(^|[^\r])\n/.test(t), "(Kiel's file is still CRLF throughout)");
      ok(again(roots).length === 0, "(a second click writes nothing)");
    }
    {
      console.log("  -- a comment above the block, with another province's block below it");
      const roots = makeMod("asis-above", "strait");
      edit(roots, KIEL, "\t\t\t7 = { naval_base = 8 }\n", "\t\t\t# the Holtenau basin\n\t\t\t7 = { naval_base = 8 }\n\t\t\t# the fort at Laboe\n\t\t\t9 = { bunker = 2 }\n");
      typeDropdown(roots);
      md.autoFixMap(roots);
      const t = fileOf(roots, KIEL), c = captions(t);
      ok(c["# the Holtenau basin"] === "8", "⭐⭐⭐ the caption of the block goes with it, onto province 8's: it is left above no other statement", { c, t });
      ok(c["# the fort at Laboe"] === "9" && /9 = \{ bunker = 2 \}/.test(t), "(the next block keeps its own)", c);
    }
    {
      console.log("  -- a carry: the giver's block, and a dockyard's comment in the taker");
      const roots = makeMod("asis-carry", "bay");
      edit(roots, FYN, "\t\t\t1 = { naval_base = 3 }\n", "\t\t\t1 = {\n\t\t\t\t# the Odense basin\n\t\t\t\tnaval_base = 3\n\t\t\t}\n");
      typeDropdown(roots);
      md.autoFixMap(roots);
      const j = fileOf(roots, JYL), f = fileOf(roots, FYN), c = captions(j);
      ok(c["# the Odense basin"] === "naval_base" && levelAt(model(roots), JYL, 5) === 3 && !/Odense basin/.test(f), "⭐⭐⭐ the naval base's comment goes to Jylland with it", { j, f });
      ok(/# the Odense yard/.test(j) && c["# the Odense yard"] !== "5" && (c["# the Odense yard"] === "" || c["# the Odense yard"] === "dockyard"), "⭐⭐⭐ the dockyard's comment captions no naval base", { c, j });
    }
    {
      console.log("  -- a giver whose only buildings block is dated");
      const roots = makeMod("asis-datedonly", "bay");
      edit(roots, FYN, "\t\tbuildings = {\n\t\t\tinfrastructure = 3\n\t\t\t# the Odense yard\n\t\t\tdockyard = 3\n\t\t\t1 = { naval_base = 3 }\n\t\t}\n\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\tdockyard = 4\n\t\t\t}\n\t\t}\n",
        "\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\tdockyard = 4\n\t\t\t\t1 = { naval_base = 3 }\n\t\t\t}\n\t\t}\n");
      typeDropdown(roots);
      const fx = md.autoFixMap(roots);
      const j = fileOf(roots, JYL), f = fileOf(roots, FYN);
      const undated = (t) => t.replace(/\d+\.\d+\.\d+\s*=\s*\{[\s\S]*?\n\t\t\}/g, "");
      ok(!/naval_base = 3/.test(undated(j)) && /1939\.1\.1 = \{[\s\S]*5 = \{ naval_base = 3 \}/.test(j), "⭐⭐⭐ a 1939-only naval base arrives in the taker's 1939 block: it does not exist from 1936", j);
      ok(!/1939\.1\.1/.test(f) && !/naval_base/.test(f), "⭐⭐ …and no empty dated block is left behind in the giver", f);
      ok(datedYard(j) === 5, "(its 1939 dockyards with it: 1 + 4 = 5)", j);
      ok((fx.fixes.navalNoCoast.carried || []).some((x) => x.from === FYN && x.to === JYL), "(the answer says the carry)", fx.fixes.navalNoCoast);
    }
    {
      console.log("  -- a province with a level in every moment");
      const roots = makeMod("asis-moments", "strait");
      edit(roots, KIEL, "\t\t\t7 = { naval_base = 8 }\n\t\t}\n", "\t\t\t7 = { naval_base = 8 }\n\t\t}\n\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\t# the second basin\n\t\t\t\t7 = { naval_base = 9 }\n\t\t\t}\n\t\t}\n");
      typeDropdown(roots);
      md.autoFixMap(roots);
      const t = fileOf(roots, KIEL), c = captions(t);
      ok(levelAt(model(roots), KIEL, 8) === 8 && /1939\.1\.1 = \{\s+buildings = \{\s+# the second basin\s+8 = \{ naval_base = 9 \}/.test(t) && entriesOf(t, 7) === 0 && c["# the second basin"] === "8",
        "⭐⭐⭐ its 1939 level goes with it: 8 from 1936 and 9 from 1939, both on 8, and 7 is named nowhere", t);
      ok(again(roots).length === 0, "(a second click writes nothing)");
    }
    {
      console.log("  -- the province it would go to has a later level of its own");
      const roots = makeMod("asis-notfree", "strait");
      edit(roots, REST, "\t\t\tinfrastructure = 1\n", "\t\t\tinfrastructure = 1\n\t\t\t10 = { naval_base = 1 }\n");
      edit(roots, KIEL, "\t\t\t7 = { naval_base = 8 }\n\t\t}\n", "\t\t\t7 = { naval_base = 8 }\n\t\t}\n\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\t8 = { naval_base = 1 }\n\t\t\t}\n\t\t}\n");
      typeDropdown(roots);
      const fx = md.autoFixMap(roots);
      const t = fileOf(roots, KIEL), nn = fx.fixes.navalNoCoast || {};
      ok(levelAt(model(roots), KIEL, 7) === 8 && levelAt(model(roots), KIEL, 8) === 0 && /1939\.1\.1 = \{\s+buildings = \{\s+8 = \{ naval_base = 1 \}/.test(t), "⭐⭐⭐ a province whose only naval base a later date adds is not free: the level 8 stays on 7 and does not end at 1 in 1939", t);
      ok((nn.left || []).some((l) => l.stateId === KIEL && l.province === 7), "(…and the answer says it stayed)", nn);
    }
    {
      console.log("  -- the coast-only buildings on its province");
      const roots = makeMod("asis-coastonly", "strait");
      edit(roots, KIEL, "\t\t\t7 = { naval_base = 8 }\n", "\t\t\t7 = {\n\t\t\t\tbunker = 3\n\t\t\t\t# the lock\n\t\t\t\tnaval_base = 8\n\t\t\t\tcoastal_bunker = 2 # the battery\n\t\t\t\tnaval_supply_hub = 1\n\t\t\t\tnaval_headquarters = {\n\t\t\t\t\tlevel = 1\n\t\t\t\t\tallowed = { always = yes }\n\t\t\t\t}\n\t\t\t}\n");
      typeDropdown(roots);
      const fx = md.autoFixMap(roots);
      const t = fileOf(roots, KIEL), pb = stateOf(model(roots), KIEL).provinceBuildings, c = captions(t), nn = fx.fixes.navalNoCoast || {};
      ok(+pb[8].naval_base === 8 && +pb[8].coastal_bunker === 2 && +pb[8].naval_supply_hub === 1 && /8 = \{[\s\S]*naval_headquarters = \{\s+level = 1\s+allowed = \{ always = yes \}/.test(t), "⭐⭐⭐ the coast-only buildings go with the base, the nested one as written", { pb, t });
      ok(+pb[7].bunker === 3 && !pb[7].naval_base && !pb[7].coastal_bunker && !pb[7].naval_supply_hub, "⭐ …and a building that needs no coast stays on the province", pb);
      ok(c["# the lock"] === "naval_base" && c["# the battery"] === "coastal_bunker", "(each comment on what it was on)", c);
      const m = (nn.moved || []).find((x) => x.from === 7) || {};
      ok(m.to === 8 && JSON.stringify((m.with || []).slice().sort()) === JSON.stringify(["coastal_bunker", "naval_headquarters", "naval_supply_hub"]) && !m.stayed, "⭐ the answer says what went with it", nn.moved);
      ok(/7 → 8 in state 3, with its coastal bunker, naval supply hub, naval headquarters/.test(require("./testlib-map-page.js").autoFixSummary(fx)), "⭐ …and the page says it", require("./testlib-map-page.js").autoFixSummary(fx));
      ok(again(roots).length === 0, "(a second click writes nothing)");
    }
    {
      console.log("  -- the province it goes to holds its own coastal building");
      const roots = makeMod("asis-ownfort", "strait");
      edit(roots, KIEL, "\t\t\t7 = { naval_base = 8 }\n", "\t\t\t7 = { naval_base = 8 coastal_bunker = 3 }\n\t\t\t8 = { coastal_bunker = 1 }\n");
      typeDropdown(roots);
      const fx = md.autoFixMap(roots);
      const pb = stateOf(model(roots), KIEL).provinceBuildings, nn = fx.fixes.navalNoCoast || {};
      ok(+pb[8].naval_base === 8 && +pb[8].coastal_bunker === 1 && +pb[7].coastal_bunker === 3 && !pb[7].naval_base, "⭐⭐⭐ the base moves in beside it, and neither coastal fort is overwritten: 7's stays on 7", pb);
      const m = (nn.moved || []).find((x) => x.from === 7) || {};
      ok(JSON.stringify(m.stayed) === JSON.stringify(["coastal_bunker"]), "⭐ …and the answer says which stayed", nn.moved);
      const line = require("./testlib-map-page.js").autoFixSummary(fx);
      ok(/left the coastal bunker on province 7 with no sea beside it: the province the naval base went to holds its own/.test(line), "⭐ …and the page says it", line);
      ok(/7 → 8 in state 3/.test(line) && !/7 → 8 in state 3, with its/.test(line), "(…and does not say it went with the base)", line);
    }
    {
      console.log("  -- a taker whose only buildings block is dated");
      const roots = makeMod("asis-dated-taker", "bay");
      edit(roots, JYL, "\t\tbuildings = {\n\t\t\tinfrastructure = 2\n\t\t\tdockyard = 1\n\t\t\t4 = { naval_base = 2 }\n\t\t}\n", "\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\tdockyard = 1\n\t\t\t\t4 = { naval_base = 2 }\n\t\t\t}\n\t\t}\n");
      typeDropdown(roots);
      md.autoFixMap(roots);
      const j = fileOf(roots, JYL), at = j.indexOf("1939.1.1"), own = j.search(/\n\t\tbuildings = \{/);
      ok(own > 0 && own < at, "⭐⭐ the undated levels get a buildings block of their own, ahead of the date, as the readers take the first", j);
      ok(/\t\tbuildings = \{[\s\S]*?5 = \{ naval_base = 3 \}[\s\S]*?dockyard = 3[\s\S]*?\}/.test(j.slice(own, at)) && datedYard(j) === 5, "⭐⭐⭐ the moved undated base and the 3 dockyards stand there, not in the 1939 block, which sums to 1 + 4 = 5", j);
      ok(levelAt(model(roots), JYL, 5) === 3, "(and the model reads it)", stateOf(model(roots), JYL).provinceBuildings);
    }
    {
      console.log("  -- a comment on what stays in the block");
      const roots = makeMod("asis-partial", "strait");
      edit(roots, KIEL, "\t\t\t7 = { naval_base = 8 }\n", "\t\t\t# the shore\n\t\t\t7 = {\n\t\t\t\t# the fort\n\t\t\t\tbunker = 3\n\t\t\t\t# the lock\n\t\t\t\tnaval_base = 8\n\t\t\t}\n");
      typeDropdown(roots);
      md.autoFixMap(roots);
      const t = fileOf(roots, KIEL), c = captions(t);
      ok(c["# the shore"] === "7" && c["# the fort"] === "bunker" && c["# the lock"] === "naval_base" && /7 = \{\s+# the fort\s+bunker = 3\s+\}/.test(t) && /8 = \{\s+# the lock\s+naval_base = 8\s+\}/.test(t),
        "⭐⭐⭐ what stays keeps its comments, what goes takes its own", { c, t });
    }
    {
      // Millennium Dawn's 695-Odesa writes `11670 = { #Odesa`, a bunker beside the naval base: that comment names the province, whose block stays
      console.log("  -- a comment on the block's opening line");
      const roots = makeMod("asis-firstline", "strait");
      edit(roots, KIEL, "\t\t\t7 = { naval_base = 8 }\n", "\t\t\t7 = { #Holtenau\n\t\t\t\tnaval_base = 8\n\t\t\t\tbunker = 1 #the shore battery\n\t\t\t}\n");
      typeDropdown(roots);
      md.autoFixMap(roots);
      const t = fileOf(roots, KIEL), c = captions(t);
      ok(c["#Holtenau"] === "7" && c["#the shore battery"] === "bunker" && /7 = \{ #Holtenau\s+bunker = 1 #the shore battery\s+\}/.test(t) && /8 = \{ naval_base = 8 \}/.test(t), "⭐⭐ it stays on the block's opening line, and the line after it is not eaten", t);
    }
    {
      // Millennium Dawn's 694-Zaporizhzhia ends its buildings block on a commented-out block; a paint's comment stands at the end of the block it merged into
      console.log("  -- a block that ends on comments");
      const roots = makeMod("asis-endcomment", "strait");
      edit(roots, KIEL, "\t\t\t7 = { naval_base = 8 }\n", "\t\t\t7 = { naval_base = 8 }\n\t\t\t#\n\t\t\t#11405 = { #Motor-Sich\n\t\t\t#\tair_facility = 1\n\t\t\t#}\n");
      typeDropdown(roots);
      md.autoFixMap(roots);
      const t = fileOf(roots, KIEL);
      ok(/8 = \{ naval_base = 8 \}\s+#\s+#11405 = \{ #Motor-Sich\s+#\s+air_facility = 1\s+#\}\s+\}/.test(t), "⭐⭐ the block goes in above them: nothing disabled comes to caption it", t);
      // two paints: the first's dockyard comment stands at the end of Jylland's block, and the second's province block must not land under it
      const two = makeMod("asis-twopaints", "bay");
      const edit2 = (sid, from, to) => edit(two, sid, from, to);
      edit2(FYN, "provinces = { 1 2 }", "provinces = { 1 }");
      edit2(JYL, "provinces = { 3 4 5 }", "provinces = { 2 3 4 5 }");
      md.moveProvince({ ...two, provinceId: 1, toStateId: JYL });
      md.moveProvince({ ...two, provinceId: 7, toStateId: JYL });
      const j = fileOf(two, JYL), cj = captions(j);
      ok(/# the Odense yard/.test(j) && (cj["# the Odense yard"] === "" || cj["# the Odense yard"] === "dockyard"), "⭐⭐ a dockyard's comment left at the end of a block by one paint captions no block the next paint brings", { cj, j });
    }
  }

  console.log("\n=== 10. the one left behind ===");
  {
    const stateFile = (roots, sid) => { const d = path.join(roots.modRoot, "history", "states"); return path.join(d, fs.readdirSync(d).find((n) => n.startsWith(sid + "-"))); };
    const edit = (roots, sid, from, to) => {
      const f = stateFile(roots, sid), t = fs.readFileSync(f, "utf8"), eol = /\r\n/.test(t) ? "\r\n" : "\n";
      const a = from.replace(/\n/g, eol), b = to.replace(/\n/g, eol);
      if (t.split(a).length !== 2) throw new Error("fixture: " + from);
      fs.writeFileSync(f, t.replace(a, () => b));
    };
    const again = (roots) => { const h1 = hashTree(roots.modRoot); const fx = md.autoFixMap(roots); return { changed: changedFiles(h1, hashTree(roots.modRoot)), fx }; };
    const { autoFixSummary } = require("./testlib-map-page.js");
    {
      console.log("  -- two naval bases, one province free");
      const roots = makeMod("left-biggest", "bay");
      edit(roots, FYN, "\t\t\t1 = { naval_base = 3 }\n", "\t\t\t1 = { naval_base = 8 }\n\t\t\t2 = { naval_base = 10 }\n");
      typeDropdown(roots);
      const fx = md.autoFixMap(roots), m = model(roots), nn = fx.fixes.navalNoCoast || {};
      ok(levelAt(m, JYL, 5) === 10 && levelAt(m, FYN, 2) === 0, "⭐⭐⭐ Denmark's one free coastal province takes the level 10, though the level 8 stands on the lower id", stateOf(m, JYL).provinceBuildings);
      ok(levelAt(m, FYN, 1) === 8 && (nn.left || []).some((l) => l.province === 1 && l.why === `every coastal province of state ${JYL} holds one already`), "(…and the level 8 stays, said: Denmark has no other coast)", nn.left);
      const second = again(roots);
      const n2 = second.fx.fixes.navalNoCoast || {};
      ok(second.changed.length === 0, "(a second click writes nothing)", second.changed);
      ok(!(n2.carried || []).length && !(n2.moved || []).length, "⭐⭐⭐ …and its answer carries nothing: an empty carry is no carry", n2);
      const line = autoFixSummary(second.fx);
      ok(!/: nothing\b/.test(line) && !/moved the dockyards/.test(line) && /left 1 dockyard\(s\) and naval base\(s\) with no coast where they are/.test(line), "⭐⭐⭐ …and the page claims no move: it says what stays and why", line);
    }
    {
      console.log("  -- the nearest coast full, another of the country's free");
      const roots = makeMod("left-overflow", "bay");
      edit(roots, FYN, "owner = DEN", "owner = GER");
      edit(roots, REST, "\t\t\tinfrastructure = 1\n", "\t\t\tinfrastructure = 1\n\t\t\t10 = { naval_base = 1 }\n\t\t\t11 = { naval_base = 1 }\n");
      edit(roots, KIEL, "\t\t\t7 = { naval_base = 8 }\n", "");
      typeDropdown(roots);
      const fx = md.autoFixMap(roots), m = model(roots), nn = fx.fixes.navalNoCoast || {};
      const c = (nn.carried || []).find((x) => x.from === FYN) || {};
      ok(c.to === REST && yards(m, REST) === 3 && datedYard(fileOf(roots, REST)) === 4, "(Fyn's dockyards go to its country's nearest coast, the rest of Germany)", { c, rest: fileOf(roots, REST) });
      ok(levelAt(m, KIEL, 8) === 3 && levelAt(m, FYN, 1) === 0 && !(nn.left || []).length, "⭐⭐⭐ …and its naval base, with every coastal province there taken, to Kiel's 8: Germany's next coast with a province free", { kiel: stateOf(m, KIEL).provinceBuildings, left: nn.left });
      ok((c.navalBases || []).length === 1 && c.navalBases[0].to === 8 && c.navalBases[0].state === KIEL, "⭐ the answer names the state it went to", c);
      const line = autoFixSummary(fx);
      ok(/the level-3 naval base of 1 onto 8 in state 3/.test(line), "⭐ …and the page says it", line);
      ok(again(roots).changed.length === 0, "(a second click writes nothing)");
    }
    {
      console.log("  -- a state with a coast, and one naval base more than free provinces");
      const roots = makeMod("left-owncoast", "strait");
      edit(roots, FYN, "\t\t\t1 = { naval_base = 3 }\n", "\t\t\t1 = { naval_base = 8 }\n\t\t\t2 = { naval_base = 10 }\n");
      typeDropdown(roots);
      const fx = md.autoFixMap(roots), m = model(roots), nn = fx.fixes.navalNoCoast || {};
      ok((m.provinceToState || {})[BELT] === FYN && levelAt(m, FYN, BELT) === 10 && yards(m, FYN) === 3, "⭐⭐⭐ Fyn keeps its coast, its dockyards, and the level 10 on the province it got", stateOf(m, FYN).provinceBuildings);
      ok(levelAt(m, JYL, 5) === 8 && levelAt(m, FYN, 1) === 0 && !(nn.left || []).length, "⭐⭐⭐ …and the level 8 goes to Denmark's next coast with a province free, Jylland's 5", { jyl: stateOf(m, JYL).provinceBuildings, left: nn.left });
      const c = (nn.carried || []).find((x) => x.from === FYN) || {};
      ok(c.to === JYL && !(c.levels || []).length && (c.navalBases || []).length === 1, "⭐ the answer says it, with no dockyard in it", nn);
      const line = autoFixSummary(fx);
      ok(/state 1 → 2: the level-8 naval base of 1 onto 5/.test(line) && !/: nothing\b/.test(line), "(…and the page)", line);
      ok(/moved the naval bases of 1 state\(s\) with no coastal province free for them/.test(line) && !/left with no coast to the nearest/.test(line), "⭐ …which does not call a state with a coast one left with none", line);
      ok(problems(roots, NAVAL_RULES).length === 0, "(Map Errors is clean of the naval rules)", problems(roots, NAVAL_RULES).map((p) => p.message));
      ok(again(roots).changed.length === 0, "(a second click writes nothing)");
    }
    {
      console.log("  -- a state's own coast is its own before another state's overflow");
      const roots = makeMod("left-ownfirst", "bay");
      edit(roots, FYN, "owner = DEN", "owner = GER");
      edit(roots, REST, "\t\t\tinfrastructure = 1\n", "\t\t\tinfrastructure = 1\n\t\t\t10 = { naval_base = 1 }\n\t\t\t11 = { naval_base = 1 }\n");
      typeDropdown(roots);
      const fx = md.autoFixMap(roots), m = model(roots), nn = fx.fixes.navalNoCoast || {};
      ok(levelAt(m, KIEL, 8) === 8 && levelAt(m, KIEL, 7) === 0, "⭐⭐ Kiel's own base gets Kiel's 8, though Fyn (state 1) is asked first", stateOf(m, KIEL).provinceBuildings);
      ok(levelAt(m, FYN, 1) === 3 && (nn.left || []).some((l) => l.province === 1 && l.why === "every coastal province of the 2 coastal states of GER holds one already"), "(…and Fyn's stays, said, with nothing of Germany's free)", nn.left);
    }
    {
      console.log("  -- land from a sea with a neighbour in the sea's own strategic region");
      const roots = makeMod("left-region", "strait");
      // Jylland's 4 stands in the sea's region, as half the base game's seas share theirs with land
      const land = path.join(roots.modRoot, "map", "strategicregions", "1-Land.txt"), sea = path.join(roots.modRoot, "map", "strategicregions", "2-Sea.txt");
      fs.writeFileSync(land, fs.readFileSync(land, "utf8").replace(/provinces=\{ ([^}]*)\}/, (_, l) => `provinces={ ${l.split(/\s+/).filter((x) => x && x !== "4").join(" ")} }`));
      fs.writeFileSync(sea, fs.readFileSync(sea, "utf8").replace(`provinces={ ${BELT} ${OCEAN} }`, () => `provinces={ ${BELT} ${OCEAN} 4 }`));
      typeDropdown(roots);
      const fx = md.autoFixMap(roots), m = model(roots);
      ok((m.provinceToState || {})[BELT] === FYN, "⭐⭐⭐ the new land goes to Fyn, left with no coast, and not to Jylland in its own region: what the Type dropdown's confirm promised", { home: (m.provinceToState || {})[BELT], details: (fx.fixes.statelessLand || {}).details });
      ok(yards(m, FYN) === 3 && datedYard(fileOf(roots, FYN)) === 4 && levelAt(m, FYN, BELT) === 3 && !(fx.fixes.navalNoCoast.carried || []).some((c) => c.from === FYN), "⭐⭐ …so Fyn keeps its dockyards and its base, on its own coast", fx.fixes.navalNoCoast);
      const split = allProblems(roots).filter((p) => /strategic|region/i.test(p.rule) && p.severity === "error");
      ok(split.length === 0, "⭐⭐ …and the click leaves no state split across two strategic regions, nor a region cut in two", split.map((p) => `${p.rule}: ${String(p.message).slice(0, 160)}`));
      ok(again(roots).changed.length === 0, "(a second click writes nothing)");
    }
    {
      console.log("  -- two states left with no coast, one with a dockyard and one with a bigger naval base");
      const roots = makeMod("left-yard-first", "strait");
      edit(roots, FYN, "\t\t\tdockyard = 3\n\t\t\t1 = { naval_base = 3 }\n", "\t\t\tdockyard = 1\n");
      edit(roots, FYN, "\t\t\t\tdockyard = 4\n", "\t\t\t\tdockyard = 1\n");
      edit(roots, KIEL, "provinces = { 7 8 9 }", "provinces = { 7 9 }");
      edit(roots, KIEL, "\t\t\tdockyard = 6\n\t\t\t7 = { naval_base = 8 }\n", "\t\t\t7 = { naval_base = 10 }\n");
      edit(roots, REST, "provinces = { 10 }", "provinces = { 8 10 }");
      typeDropdown(roots);
      const fx = md.autoFixMap(roots), m = model(roots), nn = fx.fixes.navalNoCoast || {};
      ok((m.provinceToState || {})[BELT] === FYN && yards(m, FYN) === 1 && !(nn.carried || []).some((c) => c.from === FYN), "⭐⭐⭐ the new land goes to the state with the dockyard, as the Type dropdown's confirm says of dockyards: only one can have it, and a naval base can stand on the next coast", { home: (m.provinceToState || {})[BELT], nn });
      ok(levelAt(m, REST, 8) === 10 && levelAt(m, KIEL, 7) === 0, "(…and the level 10 goes to Germany's next coast, not lost)", stateOf(m, REST).provinceBuildings);
    }
  }

  console.log("\n=== 11. the words say what the click does ===");
  {
    const labels = require("./public/map-rule-labels.js");
    const stateFile = (roots, sid) => { const d = path.join(roots.modRoot, "history", "states"); return path.join(d, fs.readdirSync(d).find((n) => n.startsWith(sid + "-"))); };
    const edit = (roots, sid, from, to) => {
      const f = stateFile(roots, sid), t = fs.readFileSync(f, "utf8"), eol = /\r\n/.test(t) ? "\r\n" : "\n";
      const a = from.replace(/\n/g, eol), b = to.replace(/\n/g, eol);
      if (t.split(a).length !== 2) throw new Error("fixture: " + from);
      fs.writeFileSync(f, t.replace(a, () => b));
    };
    {
      console.log("  -- the line after a Save");
      const box = {};
      vm.runInNewContext(`${lift("function coastRowsNote(")}\nvar out = coastRowsNote;`, box);
      const note = box.out({ stranded: [{ province: 7, why: "no sea" }], strandedTotal: 1 });
      ok(/Auto-fix moves those onto a coast/.test(note) && !/Auto-fix removes/.test(note), "⭐⭐ it says Auto-fix moves the naval bases the game refuses, and no more that it removes them", note);
    }
    {
      console.log("  -- a naval base on a province definition.csv marks inland, the only problem on the map");
      const roots = makeMod("words-inland", "strait");
      edit(roots, KIEL, "\t\t\t7 = { naval_base = 8 }\n", "\t\t\t7 = { naval_base = 8 }\n\t\t\t9 = { naval_base = 2 }\n");
      const told = md.validateMapModel(model(roots)).concat(md.validateMapBitmap(roots)).filter((p) => p.rule === "naval_base_non_coastal");
      ok(told.length === 1 && (told[0].items || []).some((i) => i.province === 9), "(Map Errors names it, once)", told);
      const words = String((told[0] || {}).message);
      ok(!/mark the province coastal/.test(words) && /Auto-fix moves each/.test(words) && /stays where it is/.test(words), "⭐⭐ it does not advise marking the province coastal: it says what Auto-fix does", words);
      ok(labels.autoFixOffered(told), "⭐⭐ …and so, with no other problem, the popup offers Auto-fix", told);
      const fx = md.autoFixMap(roots);
      const m = model(roots), left = md.validateMapModel(m).concat(md.validateMapBitmap(roots));
      ok(levelAt(m, KIEL, 9) === 0 && levelAt(m, KIEL, 8) === 2 && levelAt(m, KIEL, 7) === 8, "⭐⭐⭐ …and the click does what it says: the base moves onto the coast Kiel has free, at its level", { pb: stateOf(m, KIEL).provinceBuildings, nn: fx.fixes.navalNoCoast });
      ok(!left.some((p) => p.rule === "naval_base_non_coastal" || p.rule === "coastal_province_has_no_sea"), "⭐ …and neither that warning nor another is left", left.map((p) => p.rule));
    }
    {
      console.log("  -- a province definition.csv marks inland with sea beside it");
      const roots = makeMod("words-flag", "strait");
      const csv = path.join(roots.modRoot, "map", "definition.csv");
      const row = `8;${colour(8).join(";")};land;true;plains;1`, t = fs.readFileSync(csv, "utf8");
      if (!t.includes(row)) throw new Error("fixture: " + row);
      fs.writeFileSync(csv, t.replace(row, () => `8;${colour(8).join(";")};land;false;plains;1`));
      edit(roots, KIEL, "\t\t\t7 = { naval_base = 8 }\n", "\t\t\t7 = { naval_base = 8 }\n\t\t\t8 = { naval_base = 2 }\n");
      const told = md.validateMapModel(model(roots)).filter((p) => p.rule === "naval_base_non_coastal");
      ok(told.length === 1 && /Auto-fix corrects the coastal column/.test(String(told[0].message)), "(told by the coastal column, the message says what Auto-fix does there)", told);
      md.autoFixMap(roots);
      const m = model(roots), row8 = fs.readFileSync(csv, "utf8").split(/\r?\n/).find((l) => l.startsWith("8;"));
      ok(levelAt(m, KIEL, 8) === 2 && /;land;true;/.test(row8) && !md.validateMapModel(m).some((p) => p.rule === "naval_base_non_coastal"), "⭐⭐ …which is what it does: the base stays, the column is corrected, the warning goes", { row8, pb: stateOf(m, KIEL).provinceBuildings });
    }
    {
      console.log("  -- a dated level");
      const hint = labels.mapRuleFixHint("dated_naval_building_without_coast");
      ok(!/repairs the undated block/.test(hint) && /moves a dated level only with the building it moves/.test(hint) && /otherwise leaves dated blocks alone/.test(hint), "⭐ the rule's description says Auto-fix moves a dated level with what it moves", hint);
      const roots = makeMod("words-dated", "bay");
      edit(roots, FYN, "\t\t\t# the Odense yard\n\t\t\tdockyard = 3\n\t\t\t1 = { naval_base = 3 }\n", "");
      typeDropdown(roots);
      const p = md.validateMapBitmap(roots).find((x) => x.rule === "dated_naval_building_without_coast");
      ok(p && p.autoFix === false && !/repairs the undated block/.test(String(p.message)) && /moves a dated level only with the building it moves/.test(String(p.message)), "⭐ …and the row itself, which still offers no click of its own", p);
    }
  }

  // ⛔ #a-dated-dockyard-is-still-a-dockyard — the Type dropdown's confirm says "Map Errors lists it while its state has no coast", of a mod of any kind
  console.log("\n=== 12. an overlay: the states are the layer below's ===");
  {
    const stateFile = (roots, sid) => { const d = path.join(roots.modRoot, "history", "states"); return path.join(d, fs.readdirSync(d).find((n) => n.startsWith(sid + "-"))); };
    const edit = (roots, sid, from, to) => {
      const f = stateFile(roots, sid), t = fs.readFileSync(f, "utf8"), eol = /\r\n/.test(t) ? "\r\n" : "\n";
      const a = from.replace(/\n/g, eol), b = to.replace(/\n/g, eol);
      if (t.split(a).length !== 2) throw new Error("fixture: " + from);
      fs.writeFileSync(f, t.replace(a, () => b));
    };
    // Fyn's only dockyard a 1939 one; Kiel with a 1939 naval base on 7, which touches only the Belt; state 5 = { 9 }, inland below too, with a 1939 dockyard and a 1939 naval base on 9
    const base = makeMod("overlay-base", "bay");
    edit(base, FYN, "\t\t\t# the Odense yard\n\t\t\tdockyard = 3\n\t\t\t1 = { naval_base = 3 }\n", "");
    edit(base, KIEL, "provinces = { 7 8 9 }", "provinces = { 7 8 }");
    edit(base, KIEL, "\t\t\t7 = { naval_base = 8 }\n\t\t}\n", "\t\t}\n\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\t7 = { naval_base = 9 }\n\t\t\t}\n\t\t}\n");
    write(base.modRoot, "history/states/5-Inland.txt", "state = {\n\tid = 5\n\tname = \"STATE_5\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 9 }\n\thistory = {\n\t\towner = GER\n\t\tbuildings = {\n\t\t\tinfrastructure = 1\n\t\t}\n\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\tdockyard = 2\n\t\t\t\t9 = { naval_base = 1 }\n\t\t\t}\n\t\t}\n\t}\n}\n");
    const over = { modRoot: path.join(ROOT, "overlay-mod"), gameRoot: base.modRoot, dependencyRoots: [] };
    write(over.modRoot, "descriptor.mod", 'name="overlay"\n');
    const dated = (roots) => md.findDatedNavalBuildingsWithoutCoast({ ...roots, model: model(roots) }).map((d) => (d.scope === "state" ? `state ${d.stateId} ${d.building} ${d.level} ${d.date} ${d.file}` : `province ${d.provinceId} ${d.building} ${d.level} ${d.date} ${d.file}`)).sort();
    ok(!fs.existsSync(path.join(over.modRoot, "history", "states")), "(the mod owns no state file)");
    ok(dated(over).length === 0, "THE CONTROL: with the Belt a sea, nothing is said: what the layer below keeps with no coast (state 5's, and its 9) is the layer below's", dated(over));
    typeDropdown(over);
    ok((model(over).provinces.find((p) => p.id === BELT) || {}).type === "land" && !(coastOf(over).has(1) || coastOf(over).has(2)), "(the Belt is land in the mod, and Fyn has no coast)");
    const said = dated(over);
    ok(said.includes("state 1 dockyard 4 1939.1.1 1-Fyn.txt"), "⭐⭐⭐ Map Errors reads the state the mod inherits, whose coast its map took: Fyn's 1939 dockyards are listed, as the confirm says", said);
    ok(said.includes("province 7 naval_base 9 1939.1.1 3-Kiel.txt"), "⭐⭐ …and a dated naval base on a province whose sea its map took", said);
    ok(!said.some((s) => /state 5 |province 9 /.test(s)), "⭐⭐ …and not what the layer below already keeps with no coast: that is not the mod's doing", said);
    {
      // the mod's own map, whose ids 1 and 2 stand for other land (a total conversion keeps 1 of the base game's id and colour pairs)
      const other = { modRoot: path.join(ROOT, "overlay-other"), gameRoot: base.modRoot, dependencyRoots: [] };
      write(other.modRoot, "descriptor.mod", 'name="other"\n');
      const newColour = (id) => [(id * 37 + 90) % 256, (id * 71 + 90) % 256, 40 + id];
      const paint = (id) => (id === 1 || id === 2 ? newColour(id) : colour(id));
      const shapeAt = shapeOf("bay");
      write(other.modRoot, "map/provinces.bmp", bmp24(W, H, (x, y) => { const id = shapeAt(x, y); return paint(id === BELT ? 3 : id); }));
      const belowCsv = fs.readFileSync(path.join(base.modRoot, "map", "definition.csv"), "utf8").split(/\r?\n/);
      write(other.modRoot, "map/definition.csv", belowCsv.map((l) => { const c = l.split(";"); return c[0] === "1" || c[0] === "2" ? [c[0], ...newColour(+c[0]), ...c.slice(4)].join(";") : l; }).join("\n"));
      ok(!coastOf(other).has(1) && !coastOf(other).has(2), "(in that map ids 1 and 2 touch no sea)");
      ok(!dated(other).some((s) => /^state 1 /.test(s)), "⭐ …and what the state below says of them is no province whose sea this mod took: the row is another province's", dated(other));
    }
    {
      // one inherited state, two dated naval bases: on 7, whose sea the mod took, and on 9, which has none below either
      const below = makeMod("overlay-base2", "bay");
      edit(below, KIEL, "\t\t\t7 = { naval_base = 8 }\n\t\t}\n", "\t\t}\n\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\t7 = { naval_base = 9 }\n\t\t\t\t9 = { naval_base = 1 }\n\t\t\t}\n\t\t}\n");
      const up = { modRoot: path.join(ROOT, "overlay-two"), gameRoot: below.modRoot, dependencyRoots: [] };
      write(up.modRoot, "descriptor.mod", 'name="two"\n');
      typeDropdown(up);
      const inKiel = dated(up).filter((s) => /^province /.test(s));
      ok(inKiel.length === 1 && inKiel[0] === "province 7 naval_base 9 1939.1.1 3-Kiel.txt", "⭐⭐ in a state it inherits, only the province whose sea the mod took is the mod's to be told of", dated(up));
    }
    {
      const own = { modRoot: path.join(ROOT, "overlay-own"), gameRoot: base.modRoot, dependencyRoots: [] };
      write(own.modRoot, "descriptor.mod", 'name="own"\n');
      write(own.modRoot, "history/states/1-Fyn.txt", fileOf(base, FYN));
      typeDropdown(own);
      ok(dated(own).filter((s) => /^state 1 /.test(s)).length === 1, "(a state whose file the mod ships is listed once, not again as one it inherits)", dated(own));
    }
    const told = problems(over, ["dated_naval_building_without_coast"]);
    ok(told.length === 1 && told[0].autoFix === false && told[0].total === 2 && /1-Fyn\.txt sets dockyard = 4 on 1939\.1\.1 in state 1, which has no coastline/.test(String(told[0].message)), "(the row names the file and the date)", told);
    ok(!fs.existsSync(path.join(over.modRoot, "history", "states")), "(reading them copies nothing into the mod)");
    md.autoFixMap(over);
    const fyn = model(over).states.find((s) => s.id === FYN);
    ok(!(fyn.provinces || []).some((p) => coastOf(over).has(p)) && dated(over).includes("state 1 dockyard 4 1939.1.1 1-Fyn.txt"), "⭐⭐ the click does not move it, and Map Errors lists it still: it says so as long as the state has no coast", dated(over));
  }

  console.log("\n=== 13. a carry that fills its taker past its slots ===");
  {
    const stateFile = (roots, sid) => { const d = path.join(roots.modRoot, "history", "states"); return path.join(d, fs.readdirSync(d).find((n) => n.startsWith(sid + "-"))); };
    const slotted = (name, slots) => { const roots = makeMod(name, "bay"); write(roots.modRoot, "common/state_category/00_cat.txt", `state_categories = {\n\trural = {\n\t\tlocal_building_slots = ${slots}\n\t}\n}\n`); return roots; };
    // (Kiel's own 6 dockyards are over these slots from the start, and no carry's)
    const rule = (roots) => problems(roots, ["state_buildings_exceed_slots"]).flatMap((p) => p.items || []).filter((i) => i.stateId !== KIEL);
    {
      console.log("  -- a click of Auto-fix");
      const roots = slotted("slots-click", 3);
      typeDropdown(roots);
      const fx = md.autoFixMap(roots), m = model(roots), nn = fx.fixes.navalNoCoast || {};
      const c = (nn.carried || []).find((x) => x.from === FYN) || {};
      ok(yards(m, JYL) === 4 && datedYard(fileOf(roots, JYL)) === 5 && yards(m, FYN) === 0, "⭐⭐⭐ no level is dropped to fit: Jylland holds 1 + 3 = 4, and from 1939 1 + 4 = 5", fileOf(roots, JYL));
      ok(JSON.stringify(c.overSlots) === JSON.stringify({ shared: 4, slots: 3, category: "rural" }), "⭐⭐ the click's answer says the taker holds more than its slots", c);
      const seen = rule(roots);
      ok(seen.length === 1 && seen[0].stateId === JYL && seen[0].shared === 4 && seen[0].slots === 3, "(…the very thing Map Errors lists afterwards)", seen);
      const { autoFixSummary } = require("./testlib-map-page.js");
      const line = autoFixSummary(fx);
      ok(/left state 2 with 4 civilian factories, military factories and dockyards in the 3 slots of its "rural" category/.test(line) && /Nova drops none of them/.test(line) && /lower the counts to fit, or raise the state category/.test(line), "⭐⭐ …and the page says it, and what to do about it", line);
      const h1 = hashTree(roots.modRoot);
      const fx2 = md.autoFixMap(roots);
      ok(changedFiles(h1, hashTree(roots.modRoot)).length === 0 && !/civilian factories/.test(autoFixSummary(fx2)), "(a second click writes nothing and carries nothing, so it does not say so again)", autoFixSummary(fx2));
      const fits = slotted("slots-fit", 4);
      typeDropdown(fits);
      const cf = (md.autoFixMap(fits).fixes.navalNoCoast.carried || []).find((x) => x.from === FYN) || {};
      ok(cf.to === JYL && !cf.overSlots && rule(fits).length === 0, "THE CONTROL: at 4 slots they fit, and nothing is said", cf);
    }
    {
      console.log("  -- a state paint");
      const roots = slotted("slots-paint", 3);
      const edit = (sid, from, to) => { const f = stateFile(roots, sid); const t = fs.readFileSync(f, "utf8"); if (t.indexOf(from) < 0) throw new Error("fixture: " + from); fs.writeFileSync(f, t.replace(from, () => to)); };
      edit(FYN, "provinces = { 1 2 }", "provinces = { 1 }");
      edit(JYL, "provinces = { 3 4 5 }", "provinces = { 2 3 4 5 }");
      const r = md.moveProvince({ ...roots, provinceId: 1, toStateId: JYL });
      const c = (r.navalCarried || [])[0] || {};
      ok(c.from === FYN && c.to === JYL && yards(model(roots), JYL) === 4 && JSON.stringify(c.overSlots) === JSON.stringify({ shared: 4, slots: 3, category: "rural" }), "⭐⭐ the paint's answer says the same", c);
      const box = {};
      vm.runInNewContext(`${lift("function navalCarriedNote(")}\nvar out = navalCarriedNote;`, box);
      const note = box.out(r.navalCarried, (sid) => `S${sid}`);
      ok(/That leaves S2 with 4 civilian factories, military factories and dockyards in the 3 slots of its "rural" category/.test(note) && /none is dropped/.test(note), "⭐⭐ …and the line after the Save", note);
      ok(!/civilian factories/.test(box.out([{ from: 1, to: 2, province: 1, levels: c.levels }], (sid) => `S${sid}`)), "(…only when it does)");
    }
    {
      console.log("  -- a new state");
      const roots = slotted("slots-new", 2);
      const edit = (sid, from, to) => { const f = stateFile(roots, sid); const t = fs.readFileSync(f, "utf8"); if (t.indexOf(from) < 0) throw new Error("fixture: " + from); fs.writeFileSync(f, t.replace(from, () => to)); };
      edit(FYN, "provinces = { 1 2 }", "provinces = { 1 }");
      edit(JYL, "provinces = { 3 4 5 }", "provinces = { 2 3 4 5 }");
      const made = md.createState({ ...roots, name: "New", provinces: [1], owner: "DEN", category: "rural" });
      const c = (made.navalCarried || [])[0] || {};
      ok(c.to === made.id && JSON.stringify(c.overSlots) === JSON.stringify({ shared: 3, slots: 2, category: "rural" }), "⭐ + New state says the same", made);
    }
    {
      console.log("  -- a taker over its slots already, given only what a later date adds");
      const roots = slotted("slots-later", 0);
      const f = stateFile(roots, FYN);
      fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("\t\t\t# the Odense yard\n\t\t\tdockyard = 3\n", () => ""));
      typeDropdown(roots);
      const c = (md.autoFixMap(roots).fixes.navalNoCoast.carried || []).find((x) => x.from === FYN) || {};
      ok(c.to === JYL && (c.levels || []).length === 1 && c.levels[0].date && !c.overSlots && rule(roots).some((i) => i.stateId === JYL), "(the carry did not put it there, the rule reading the undated levels: its answer does not say so, and Map Errors still lists it)", c);
    }
  }
} catch (e) {
  fail++;
  console.log("  FAIL harness: " + (e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e));
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
