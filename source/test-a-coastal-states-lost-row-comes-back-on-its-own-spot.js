// ⛔ #a-small-states-models-are-spread-over-its-land, #a-state-building-keeps-off-the-factory-spots — A COASTAL STATE GENERATE LAND
// WROTE, TOPPED UP BY ANY OTHER CALLER, GIVES A LOST ROW BACK THE VERY SPOT IT HAD — NOT THE COASTAL FORT'S.
//
// ensureBuildingSlotsForState works out the spots of the rows that take a spot of their own (siteSpotRows: a pile's rows and a layout's
// `shared` ones) for the whole template, kept off the template's own spots, its town points and the coast's fort and dockyard, "so a
// top-up gives a lost row back the very spot it had". The fort and the dockyard were asked for only where the caller hands `coast` —
// Generate land alone. Auto-fix (fixStatesWithoutBuildingSlots), the map editor (createState) and a province move call it without, so
// on a top-up the spots were worked out round other points and a lost row came back elsewhere: on a 7x7 island 11 of its 22 rows, each
// on the coastal_bunker's own pixel; on the owner's flow (seed 1), dropping one row of 217 sampled states in turn, 11 came back on
// another row's spot (a coastal_bunker's, a dockyard's, a rocket site's). The coast rows the state HOLDS are those very rows.
//
// Fixture: a 40 x 24 sea with one island state of one province, of each of a run of sizes from too thin to lay out to laid out. Each
// is written as Generate land writes a state (its town points and its coast); then each of its STATE_BUILDING_SLOTS rows is dropped in
// turn and the state topped up as Auto-fix does ({ stateId, provinces }). Compared: the spot, every column but the rotation.
// The per-province rows (supply_node, bunker, the special-project site) are left out: a top-up gives those to the last n provinces in
// id order by design, and a one-province state has only the one.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coast-topup-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
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
const COAST_TYPES = new Set([...md.COASTAL_STATE_BUILDING_SLOTS.map(([t]) => t), ...md.PER_COASTAL_PROVINCE_BUILDING_SLOTS]);
const TEMPLATE = new Set(md.STATE_BUILDING_SLOTS.map(([t]) => t));
const W = 40, H = 24, SEA = 1;
const spotOf = (l) => { const c = l.split(";"); if (c.length >= 7) c[5] = "*"; return c.join(";"); };
const sameFile = (a, b) => JSON.stringify(a.map(spotOf).sort()) === JSON.stringify(b.map(spotOf).sort());

let piles = 0, laid = 0, dropped = 0;
try {
  // from too thin to lay out to laid out, square and long
  for (const [w, h] of [[5, 5], [6, 5], [6, 6], [7, 5], [7, 7], [9, 7], [3, 12], [14, 4], [10, 8], [12, 8]]) {
    const R = [10, 6, 10 + w, 6 + h];
    const provAt = (x, y) => (x >= R[0] && x < R[2] && y >= R[1] && y < R[3] ? 2 : SEA);
    const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
    const heightOf = (x, y) => (provAt(x, y) === SEA ? 80 : 96 + ((x * 3 + y * 5) % 120));
    const mod = path.join(ROOT, `island-${w}x${h}`);
    write(mod, "descriptor.mod", 'name="coast-topup"\nreplace_path="history/states"\nreplace_path="map"\n');
    write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
    write(mod, "map/heightmap.bmp", bmp8(W, H, heightOf));
    write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`, `2;${colour(2).join(";")};land;false;plains;1`].join("\n") + "\n");
    write(mod, "map/unitstacks.txt", `2;0;${10 + Math.floor(w / 2)}.00;10.00;${H - 1 - (6 + Math.floor(h / 2))}.00;0.00;0.00\n`);
    write(mod, "history/states/1-S.txt", "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n");
    const BT = write(mod, "map/buildings.txt", "99;radar_station;1.00;9.50;1.00;0.00;0\n");
    const roots = { modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
    const lines = () => fs.readFileSync(BT, "utf8").split(/\r?\n/).filter(Boolean);
    const touching = md.landProvincesTouchingSea(roots) || new Set();
    const g = md.ensureBuildingSlotsForState({ ...roots, stateId: 1, provinces: [2], townPoints: md.stateBuildingAnchor({ ...roots, provinces: [2], each: true }) || new Map(),
      coast: { provinces: new Set([2].filter((p) => touching.has(p))), ports: [], types: COAST_TYPES } });
    const full = lines();
    const own = full.filter((l) => { const c = l.split(";"); return +c[0] === 1 && TEMPLATE.has(c[1]); });
    const coast = full.filter((l) => COAST_TYPES.has(l.split(";")[1]));
    const isPile = md.stateSlotLayout(md.stateBuildingAnchor({ ...roots, provinces: [2], positions: true, stateId: 1 }) || {}) === null;
    if (isPile) piles++; else laid++;
    ok(!!g && g.changed && own.length === md.STATE_BUILDING_SLOTS.reduce((n, [, k]) => n + k, 0) && coast.some((l) => l.split(";")[1] === "coastal_bunker"),
      `(the fixture: a ${w}x${h} island, ${isPile ? "a pile" : "laid out"}, written as Generate land writes it — ${own.length} rows of its own, ${coast.length} of its coast)`, g);
    const wrong = [];
    for (const l of own) {
      dropped++;
      fs.writeFileSync(BT, full.filter((x) => x !== l).join("\n") + "\n");
      const r = md.ensureBuildingSlotsForState({ ...roots, stateId: 1, provinces: [2] });
      const now = lines();
      if (!(r && r.added === 1 && sameFile(now, full))) {
        const back = now.filter((x) => !full.includes(x)), b = back[0] ? back[0].split(";") : null;
        wrong.push({ dropped: l, back, on: b ? full.filter((x) => { const c = x.split(";"); return x !== l && c[2] === b[2] && c[4] === b[4]; }) : [] });
      }
      fs.writeFileSync(BT, full.join("\n") + "\n");
    }
    ok(wrong.length === 0, `⭐⭐ ${w}x${h}: each of its ${own.length} rows dropped in turn and topped up as Auto-fix does comes back on the very spot it had`, wrong.slice(0, 3));
    ok(wrong.every((x) => !x.on.length), `⭐⭐ ${w}x${h}: …never on a spot another of its rows stands on`, wrong.filter((x) => x.on.length).map((x) => [x.back, x.on]).slice(0, 3));
  }
  // the comparison sees a row moved a pixel, and a row turned it does not count
  const a = ["1;arms_factory;10.00;9.50;10.00;1.00;0", "1;fuel_silo;12.00;9.50;10.00;2.00;0"];
  ok(!sameFile(a, [a[0], "1;fuel_silo;11.00;9.50;10.00;2.00;0"]) && sameFile(a, [a[0], "1;fuel_silo;12.00;9.50;10.00;4.00;0"]),
    "CONTROL: the comparison tells a row moved a pixel from one turned another way");
  ok(piles >= 6 && laid >= 1 && dropped >= 200, "(the fixture holds piles and laid-out islands both)", { piles, laid, dropped });
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
