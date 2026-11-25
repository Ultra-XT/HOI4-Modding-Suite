// ⛔ #a-harbour-keeps-facing-its-sea — WHEN AN EDIT MOVES A COAST, THE HARBOURS ON IT KEEP FACING THE SEA.
//
// The owner asked how Nova keeps a harbour's direction when a modder adds land with the tools. Measured on scratch copies of the
// base game before keepCoastRowsFacingTheirSea existed (scratchpad wf-w4/edits/e-design-probe.js): one stroke of land 6 px out over
// the sea in front of a port left 10 of the 16 coast rows beside it with their water side on the new land and 5 with no sea in reach;
// the Type dropdown on a sea 19 ports faced left 77 coast rows facing a sea that was gone; Generate land raising 150 provinces beside
// the base game's coast left 98 coast rows and 22 ships in port facing the old sea and 25 floating harbours on the new land. Nothing
// was ever turned. Now every edit that changes which side of a coast pixel is water turns them, through the one writer of a coast
// row's rotation (returnCoastRowsToTheirSea), in the mod's own map/buildings.txt and map/unitstacks.txt.
//
//   1. returnCoastRowsToTheirSea, pure, with an edit's options: Nova's own turn re-turned (rule 1); a row whose water side the edit
//      took off the sea turned, whoever set it (rule 2); one the edit took every sea in reach from moved to its province's coast
//      (rule 3) or reported; the ship in port (20) carried with its 19; a row whose water side was off the sea BEFORE, a modder's
//      row the edit did not break, a far row, a row on a province left to another writer and a row on land that went under are
//      byte-identical; a lake is no sea; CRLF and LF; nothing to do returns the very text.
//   2. The Type dropdown (setProvinceDefinition) on the sea south of an islet: its south shore's fort moved to its west shore and
//      turned, its port to the shore its own sea is on, its ship-in-port pair with it, the floating harbour now on land reported and
//      kept, the modder's rows byte-identical; the port facing the drowned sea is still removed (the fatal half) and not reported.
//   3. A paint (applyProvinceDiff) of land 4 px out over that sea: rule 2 on a row beside the old shore, rule 3 on one now 4 px inland,
//      the ship in port carried with its turned 19 onto the sea again; a land-to-land stroke reads and writes nothing.
//   4. An erase (flipProvinceToSea): Nova's turn on the land beside it re-turned to the sea it gained; the rows on the erased province
//      are the erase's own pass's to drop, and not counted as turned.
//   5. An add-on that inherits buildings.txt: nothing copied in, the rows said (leftInherited).
//   6. The page's line (coastRowsNote), run on those answers.
//   7. Auto-fix filling a sea the mod cut off: one keep for the click.   8. Generate land: the coast that was already there kept, the
//      raised provinces' own rows left to their writers.   9. A port's ship-in-port row goes with it.   10. The pair moves as one
//      body (and is laid off its 19, or said, where that grounds it); a 19 follows its port from past the box; moved rows spread.
//   11. A piece the province split cuts out of the raised sea is raised land too (raisedByThisClick).
//   12. Auto-fix's X-crossing repaint gives a sea corner pixel to the land: Nova's turned HQ beside it faces the sea that is left.
//   13. Auto-fix's summary says what the keeps of 7 and 12 did in coastRowsNote's own words — a MOVED row as moved.
//   14. A row moved onto a shore keeps off the coast rows that stay there; a landlocked province's ship is said with its 19, not as a
//       fleet on land; a ship is laid off an unchanged 19 — or said, where that grounds it; a floating harbour already ashore is not
//       news; an unwritten port leads no 19.
//   15. A paint of the SEA over land: Nova's turn beside it re-turned; a row the stroke drowned left as it is.
//   16. A stroke that leaves sea on both flanks of a row: it is turned ONTO the sea (coastArmFacing), not toward coastFacing's centroid
//       on the land between them; one left too little sea to face goes to a shore where its water side can stand on the sea; a Nova
//       turn still on the sea is left.
//   17. A moved row stands at the height of its new ground; an add-on's paint keeps through the base game's definition.csv.
// Fixture-only: binds no port. Run: node test-an-edit-keeps-the-harbours-facing-their-sea.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { makeRegionWorld } = require("./testlib-region-rebuild-world.js");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!cond) fails.push(label);
};

const W0 = makeRegionWorld("keep-harbours-pure");
process.env.APPDATA = path.join(W0.ROOT, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
const md = require("./map-data.js");
const STEP = md.COAST_SHIP_IN_PORT_STEP;   // the base game's 19 -> 20 step, as the module carries it
const sandboxes = [W0.ROOT];

console.log("=== 1. returnCoastRowsToTheirSea with an edit's options, pure ===");
{
  // 24 x 14 px: land 1 at x 6..11, y 2..11, sea 3 round it; a lake 2 at x 0..2, y 0..1. The edit (a paint): land 1 grows east over
  // x 12..13, and the lake is painted land too — pidBefore says what those pixels were. A lake is no sea, so nothing turns for it.
  const W = 24, H = 14;
  const after = (x, y) => (y >= 2 && y <= 11 && x >= 6 && x <= 13 ? 1 : x <= 2 && y <= 1 ? 1 : 3);
  const beforeAt = (x, y) => (y >= 2 && y <= 11 && x >= 6 && x <= 11 ? 1 : x <= 2 && y <= 1 ? 2 : 3);
  const typeOf = (id) => ({ 1: "land", 2: "lake", 3: "sea" })[id];
  const ex = { W, H, pidAt: after, pidBefore: beforeAt };
  const exB = { W, H, pidAt: beforeAt }, exA = { W, H, pidAt: after };
  const z = (y) => H - 1 - y;
  const f = (e, x, y) => md.coastFacing(e, typeOf, x, z(y));
  const row = (type, x, y, rot, col7 = 0) => `1;${type};${x.toFixed(2)};9.50;${z(y).toFixed(2)};${rot.toFixed(2)};${col7}`;
  const EAST = Math.PI / 2, NORTH = Math.PI;   // the water side is rotation − π/2 (x east, z north): π/2 points it east, π north
  const nova = row("coastal_bunker", 11, 2, f(exB, 11, 2));             // Nova's turn on the old east shore: its answer moves (rule 1)
  const own = row("naval_headquarters", 11, 2, EAST);                    // the base game's own, water side east onto the new land (rule 2)
  const offBefore = row("dockyard", 9, 7, 0);                            // water side south onto land, before and after: never on the sea
  const modder = row("naval_supply_hub", 6, 2, NORTH);                   // water side north, on the sea before and after: not broken
  const far = row("coastal_bunker", 7, 10, f(exB, 7, 10));               // 5 px and more from anything the edit changed
  const deep = row("naval_base_spawn", 11, 6, EAST, 3);                  // every sea in reach was east of it: none left (rule 3)
  const lines = [nova, own, offBefore, modder, far, deep];
  rec("THE FIXTURE: Nova's turn and the answer after differ; the HQ's water side was on the sea and is not; the dockyard's never was; the hub's stays; the port loses every sea in reach",
    f(exB, 11, 2) !== f(exA, 11, 2) && f(exA, 11, 2) != null && f(exB, 11, 2) != null
      && md.coastRowArmOnSea(exB, typeOf, 11, z(2), EAST) && !md.coastRowArmOnSea(exA, typeOf, 11, z(2), EAST)
      && !md.coastRowArmOnSea(exB, typeOf, 9, z(7), 0) && !md.coastRowArmOnSea(exA, typeOf, 9, z(7), 0)
      && md.coastRowArmOnSea(exB, typeOf, 6, z(2), NORTH) && md.coastRowArmOnSea(exA, typeOf, 6, z(2), NORTH)
      && md.coastSeaInReach(exB, typeOf, 11, z(6)) && !md.coastSeaInReach(exA, typeOf, 11, z(6)) && f(exB, 7, 10) === f(exA, 7, 10),
    { nova: [f(exB, 11, 2), f(exA, 11, 2)], far: [f(exB, 7, 10), f(exA, 7, 10)] });
  const moves = [];
  const opts = { armLeftTheSea: true, ownerOf: (c, x, zz) => after(Math.floor(x), H - 1 - Math.floor(zz)), typeNow: typeOf,
    coastPixel: (c, x, zz, owner) => { moves.push({ x, zz, owner }); return { x: 13, row: 4, y: 11.0 }; } };
  for (const eol of ["\r\n", "\n"]) {
    moves.length = 0;
    const text = lines.join(eol);
    const r = md.returnCoastRowsToTheirSea(text, ex, typeOf, typeOf, opts);
    const out = r.text.split(eol);
    const tag = JSON.stringify(eol);
    rec(`⭐⭐ (${tag}) rule 1: Nova's own turn faces the answer the edit left (${f(exA, 11, 2).toFixed(2)})`, out[0] === nova.replace(/;[^;]*;0$/, `;${f(exA, 11, 2).toFixed(2)};0`), out[0]);
    rec(`⭐⭐⭐ (${tag}) rule 2: the base game's HQ, its water side now on the new land, faces the sea that is left (${f(exA, 11, 2).toFixed(2)})`, out[1].split(";")[5] === f(exA, 11, 2).toFixed(2) && md.coastRowArmOnSea(exA, typeOf, 11, z(2), f(exA, 11, 2)), out[1]);
    rec(`⭐⭐⭐ (${tag}) a row whose water side was off the sea before, the modder's unbroken row and the far row are byte-identical`, out[2] === offBefore && out[3] === modder && out[4] === far, out.slice(2, 5));
    rec(`⭐⭐ (${tag}) rule 3: the port with no sea left in reach is moved where coastPixel says and turned there; column 7 kept`, out[5] === `1;naval_base_spawn;13.00;11.00;${z(4).toFixed(2)};${(f(exA, 13, 4) || 0).toFixed(2)};3` && moves.length === 1 && moves[0].owner === 1, { row: out[5], moves });
    rec(`(${tag}) every line keeps its ending, and the text still ends without one`, out.length === lines.length && (eol === "\n" ? !r.text.includes("\r") : (r.text.match(/\r\n/g) || []).length === lines.length - 1) && !/\n$/.test(r.text));
    rec(`(${tag}) it says what it did`, r.turned.length === 2 && r.turned.map((t) => t.why).join() === "nova,arm" && r.moved.length === 1 && r.stranded.length === 0, { turned: r.turned, moved: r.moved });
  }
  // no coast to go to → reported, not deleted
  {
    const r = md.returnCoastRowsToTheirSea(deep, ex, typeOf, typeOf, { ...opts, coastPixel: () => ({ why: "no coast" }) });
    rec("⭐⭐ a row with no coast to go to is reported, and its bytes kept", r.text === deep && r.stranded.length === 1 && r.stranded[0].why === "no coast" && r.stranded[0].province === 1, r.stranded);
  }
  // a province left to another writer, and land that went under, are not touched
  {
    const r1 = md.returnCoastRowsToTheirSea(own, ex, typeOf, typeOf, { ...opts, leave: new Set([1]) });
    const r2 = md.returnCoastRowsToTheirSea(own, ex, typeOf, typeOf, { ...opts, typeNow: () => "sea" });
    rec("⭐ a row on a province in `leave`, and one on land that went under, are byte-identical", r1.text === own && r2.text === own && !r1.turned.length && !r2.turned.length);
  }
  // the lake painted over: nothing
  {
    const lakeRow = row("coastal_bunker", 3, 1, 0);
    const r = md.returnCoastRowsToTheirSea(lakeRow, ex, typeOf, typeOf, opts);
    rec("⭐ land painted over a lake turns nothing: a lake is no sea to a harbour", r.text === lakeRow && !r.turned.length && !r.moved.length && !r.stranded.length, r);
  }
  // the ship in port follows its port row
  {
    const u19 = `1;19;11.00;9.80;${z(2).toFixed(2)};${EAST.toFixed(2)};0.20`, u20 = `1;20;12.75;9.80;${z(2).toFixed(2)};${EAST.toFixed(2)};0.20`;
    const r = md.returnCoastRowsToTheirSea([u19, u20].join("\n"), ex, typeOf, typeOf, { ...opts, types: new Set(["19", "20"]), ownerOf: (c) => parseInt(c[0], 10), ship: { lead: "19", ship: "20", step: STEP } });
    const [a, b] = r.text.split("\n").map((l) => l.split(";"));
    const d = parseFloat(a[5]) - Math.PI / 2;
    const wantX = (11 + STEP * Math.cos(d)).toFixed(2), wantZ = (z(2) + STEP * Math.sin(d)).toFixed(2);
    rec("⭐⭐ the 19 turned by rule 2, and its ship laid 1.75 px out along its new water side with its rotation and height", a[5] === f(exA, 11, 2).toFixed(2) && b[2] === wantX && b[4] === wantZ && b[5] === a[5] && b[3] === a[3] && b[6] === "0.20" && r.ships.length === 1, { a, b, wantX, wantZ });
  }
  // the ship rows of a province that is SEA now (Delete map leaves the base game's 19/20 of every drowned province; fixUnitStacks drops
  // them) are no harbour of this coast, even where the edit put the ship's pixel on land: measured on the owner's flow before this
  // check, Generate land reported 47 of them as "ship on land"
  {
    const u19 = `3;19;14.00;9.80;${z(5).toFixed(2)};${EAST.toFixed(2)};0.20`, u20 = `3;20;12.50;9.80;${z(5).toFixed(2)};${EAST.toFixed(2)};0.20`;
    const text = [u19, u20].join("\n");
    const r = md.returnCoastRowsToTheirSea(text, ex, typeOf, typeOf, { ...opts, types: new Set(["19", "20"]), ownerOf: (c) => parseInt(c[0], 10), ship: { lead: "19", ship: "20", step: STEP } });
    rec("⭐⭐ the ship in port of a province that is sea now, its pixel made land by the edit, is left and not reported", r.text === text && !r.ships.length && !r.stranded.length && after(12, 5) === 1 && beforeAt(12, 5) === 3, r);
  }
  rec("⭐ nothing to do: the very text back", md.returnCoastRowsToTheirSea([offBefore, modder, far].join("\r\n"), ex, typeOf, typeOf, opts).text === [offBefore, modder, far].join("\r\n"));
}

// ── the region world: a 512 x 256 map of 32 px cells; the islet i (cell 8,1) has sea north (8,0), west (7,1) and south (8,2) ──
const CELL = 32;
const z = (y) => 256 - 1 - y;
const stateOf = (Wd, pid) => Wd.states.findIndex((ps) => ps.includes(pid)) + 1;
const bRow = (st, type, x, y, rot, col7 = 0) => `${st};${type};${x.toFixed(2)};9.50;${z(y).toFixed(2)};${rot.toFixed(2)};${col7}`;
const uRow = (pid, type, x, y, rot) => `${pid};${type};${x.toFixed(2)};9.80;${z(y).toFixed(2)};${rot.toFixed(2)};0.20`;
const isletPx = (Wd) => ({ x0: 8 * CELL, x1: 9 * CELL - 1, y0: CELL, y1: 2 * CELL - 1 });
// what the map says, from the fixture's manifest: the cells, and what an edit made of them
const cellMap = (Wd, overrides = {}) => {
  const typeOf = (id) => overrides[id] || Wd.modType(id);
  const pidAt = (x, y) => Wd.idAt(Math.floor((((x % 512) + 512) % 512) / CELL), Math.floor(y / CELL));
  return { ex: { W: 512, H: 256, pidAt }, typeOf };
};
const notePage = (() => {
  const { lift } = require("./testlib-map-page.js");
  return require("vm").runInNewContext("(" + lift("function coastRowsNote(") + ")");
})();

console.log("\n=== 2. The Type dropdown makes the sea south of the islet land ===");
let typeAnswer = null;
{
  const Wd = makeRegionWorld("keep-harbours-type");
  sandboxes.push(Wd.ROOT);
  const ISLET = Wd.PROV.islet, SOUTH = Wd.idAt(8, 2), NORTH_SEA = Wd.idAt(8, 0), st = stateOf(Wd, ISLET);
  const { x0, x1, y0, y1 } = isletPx(Wd), mid = (x0 + x1 + 1) / 2;
  const before = cellMap(Wd), afterM = cellMap(Wd, { [SOUTH]: "land" });
  const F = (m, x, y) => md.coastFacing(m.ex, m.typeOf, x, z(y));
  const b = [
    bRow(st, "coastal_bunker", mid, y1, F(before, mid, y1)),            // 0: Nova's fort on the south shore, facing the sea that goes
    bRow(st, "naval_supply_hub", mid, y0, Math.PI),                     // 1: the modder's hub on the north shore, water side north
    bRow(st, "dockyard", x0, (y0 + y1) >> 1, -Math.PI / 2),             // 2: the base game's own dockyard on the west shore, water side west
    bRow(st, "naval_base_spawn", mid - 4, y1, F(before, mid - 4, y1), NORTH_SEA),   // 3: a port on the south shore whose ships lie in the NORTH sea
    bRow(st, "naval_base_spawn", mid + 4, y1, F(before, mid + 4, y1), SOUTH),       // 4: a port whose ships lie in the sea that becomes land
    bRow(st, "floating_harbor", mid, y1 + 6, 0, ISLET),                 // 5: the islet's floating harbour, in the south sea
  ];
  const u = [uRow(ISLET, "19", mid - 4, y1, F(before, mid - 4, y1)), uRow(ISLET, "20", mid - 4, y1 + STEP, F(before, mid - 4, y1))];
  // the 20 as the base game lays it: 1.75 px out along the 19's water side
  { const r = F(before, mid - 4, y1), d = r - Math.PI / 2; u[1] = `${ISLET};20;${(mid - 4 + STEP * Math.cos(d)).toFixed(2)};9.80;${(z(y1) + STEP * Math.sin(d)).toFixed(2)};${r.toFixed(2)};0.20`; }
  const bFile = path.join(Wd.MOD, "map", "buildings.txt"), uFile = path.join(Wd.MOD, "map", "unitstacks.txt");
  fs.writeFileSync(bFile, b.join("\r\n"));
  fs.writeFileSync(uFile, Wd.ALL.map((p) => `${p};0;${(p % 16) * CELL + 16}.00;9.50;100.00;0.00;0.00`).concat(u).join("\n") + "\n");
  rec("THE FIXTURE: the fort on the south shore has no sea in reach once the south sea is land, and the hub and dockyard keep theirs",
    md.coastSeaInReach(before.ex, before.typeOf, mid, z(y1)) && !md.coastSeaInReach(afterM.ex, afterM.typeOf, mid, z(y1))
      && md.coastRowArmOnSea(afterM.ex, afterM.typeOf, mid, z(y0), Math.PI) && md.coastRowArmOnSea(afterM.ex, afterM.typeOf, x0, z((y0 + y1) >> 1), -Math.PI / 2));
  const res = md.setProvinceDefinition({ modRoot: Wd.MOD, gameRoot: Wd.GAME, dependencyRoots: [], provinceId: SOUTH, terrain: "ocean", type: "land", coastal: false });
  typeAnswer = res.coastRows;
  const cr = res.coastRows || {};
  rec("the retype wrote, and kept the harbours", res.changed && cr && !cr.error, cr.error || res.error);
  const b1 = fs.readFileSync(bFile, "utf8").split("\r\n");
  rec("⭐ the port whose ships lay in the sea made land is removed, as before (the fatal half) — and not reported as left behind", b1.length === 5 && !b1.some((l) => l.endsWith(";" + SOUTH) && l.includes("naval_base_spawn")) && res.orphanedPorts.removed === 1, b1);
  const fort = b1[0].split(";"), port = b1[3].split(";");
  const onCoast = (x, y, m) => { const id = m.ex.pidAt(x, y); return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => m.typeOf(m.ex.pidAt(x + dx, y + dy)) === "sea") && id === ISLET; };
  const fx = parseFloat(fort[2]), fy = 255 - parseFloat(fort[4]);
  rec("⭐⭐⭐ the fort on the shore that went inland is moved to the islet's coast nearest it, and faces the sea there", onCoast(fx, fy, afterM) && fort[5] === (F(afterM, fx, fy) || 0).toFixed(2)
    && md.coastRowArmOnSea(afterM.ex, afterM.typeOf, fx, z(fy), parseFloat(fort[5])), fort);
  const px_ = parseFloat(port[2]), py_ = 255 - parseFloat(port[4]);
  rec("⭐⭐ the port whose ships lie in the north sea goes to the shore of THAT sea, column 7 kept", onCoast(px_, py_, afterM) && afterM.typeOf(afterM.ex.pidAt(px_, py_ - 1)) === "sea" && afterM.ex.pidAt(px_, py_ - 1) === NORTH_SEA && port[6] === String(NORTH_SEA), port);
  rec("⭐⭐⭐ the modder's hub and the dockyard with the base game's rotation are byte-identical", b1[1] === b[1] && b1[2] === b[2], [b1[1], b1[2]]);
  rec("⭐⭐ the floating harbour on the new land is kept, and reported", b1[4] === b[5] && (cr.harboursOnLand || []).length === 1 && cr.harboursOnLand[0].anchor === ISLET, cr.harboursOnLand);
  const u1 = fs.readFileSync(uFile, "utf8").split("\n").filter((l) => l.startsWith(ISLET + ";19;") || l.startsWith(ISLET + ";20;")).map((l) => l.split(";"));
  rec("⭐⭐ the islet's ship-in-port row (19) goes where its port went, and the ship (20) 1.75 px out along its water side", u1.length === 2 && u1[0][2] === port[2] && u1[0][4] === port[4]
    && Math.abs(Math.hypot(parseFloat(u1[1][2]) - parseFloat(u1[0][2]), parseFloat(u1[1][4]) - parseFloat(u1[0][4])) - STEP) < 0.02 && u1[1][5] === u1[0][5], u1);
  rec("it says what it did, file by file", cr.moved && cr.moved.buildings === 2 && cr.moved.unitstacks === 1 && cr.ships === 1 && (cr.files || []).join() === "map/buildings.txt,map/unitstacks.txt" && !cr.strandedTotal, cr);
}

console.log("\n=== 3. A paint of land 4 px out over the sea south of the islet ===");
let paintAnswer = null;
{
  const Wd = makeRegionWorld("keep-harbours-paint");
  sandboxes.push(Wd.ROOT);
  const ISLET = Wd.PROV.islet, st = stateOf(Wd, ISLET);
  const { x0, x1, y1 } = isletPx(Wd), mid = (x0 + x1 + 1) / 2;
  const colourOf = (id) => [(id * 37) % 256, (id * 91) % 256, 40 + (id % 200)];
  const [r, g, bl] = colourOf(ISLET);
  const diff = [];
  for (let y = y1 + 1; y <= y1 + 4; y++) for (let x = x0; x <= x1; x++) diff.push({ x, y, r, g, b: bl });
  const before = cellMap(Wd);
  const afterM = { ex: { W: 512, H: 256, pidAt: (x, y) => (x >= x0 && x <= x1 && y > y1 && y <= y1 + 4 ? ISLET : before.ex.pidAt(x, y)) }, typeOf: before.typeOf };
  const F = (m, x, y) => md.coastFacing(m.ex, m.typeOf, x, z(y));
  // The HQ and the pair stand 1 px off the west sea, where a turn puts the water side on it. 2 px off it — where they stood until review
  // E-R10 — no rotation reaches half the water side's points: the keep turned them toward that sea all the same, and this section
  // asserted it; that row now goes to the shore (section 16)
  const b = [
    bRow(st, "coastal_bunker", mid, y1, F(before, mid, y1)),       // 0: now 4 px inland: moved to the new shore
    bRow(st, "naval_headquarters", x0 + 1, y1, 0),                 // 1: water side south onto the new land, the west sea still in reach: turned
  ];
  const u = [uRow(ISLET, "19", x0 + 1, y1, 0), uRow(ISLET, "20", x0 + 1, y1 + STEP, 0)];
  const bFile = path.join(Wd.MOD, "map", "buildings.txt"), uFile = path.join(Wd.MOD, "map", "unitstacks.txt");
  fs.writeFileSync(bFile, b.join("\n") + "\n");
  fs.writeFileSync(uFile, u.join("\n") + "\n");
  rec("THE FIXTURE: the HQ's water side was on the sea and is on land after; coastFacing's answer there puts it on the west sea",
    md.coastRowArmOnSea(before.ex, before.typeOf, x0 + 1, z(y1), 0) && !md.coastRowArmOnSea(afterM.ex, afterM.typeOf, x0 + 1, z(y1), 0) && F(afterM, x0 + 1, y1) != null
      && md.coastRowArmOnSea(afterM.ex, afterM.typeOf, x0 + 1, z(y1), F(afterM, x0 + 1, y1)), F(afterM, x0 + 1, y1));
  const res = md.applyProvinceDiff({ modRoot: Wd.MOD, gameRoot: Wd.GAME, dependencyRoots: [], diff });
  paintAnswer = res.coastRows;
  const cr = res.coastRows || {};
  rec("the paint wrote, and kept the harbours", res.ok && cr && !cr.error, cr.error || res.error);
  const b1 = fs.readFileSync(bFile, "utf8").split("\n");
  const fort = b1[0].split(";"), hq = b1[1].split(";");
  rec("⭐⭐⭐ the fort 4 px inland now stands on the islet's new south shore, facing the sea", parseFloat(fort[2]) === mid && 255 - parseFloat(fort[4]) === y1 + 4 && fort[5] === F(afterM, mid, y1 + 4).toFixed(2), fort);
  rec("⭐⭐⭐ the HQ whose water side the stroke covered faces the sea still in reach, where it stands — its water side on that sea",
    hq[2] === b[1].split(";")[2] && hq[4] === b[1].split(";")[4] && hq[5] === F(afterM, x0 + 1, y1).toFixed(2) && md.coastRowArmOnSea(afterM.ex, afterM.typeOf, x0 + 1, z(y1), parseFloat(hq[5])), hq);
  const u1 = fs.readFileSync(uFile, "utf8").split("\n").filter(Boolean).map((l) => l.split(";"));
  rec("⭐⭐ the 19 beside it turned the same way, and its ship carried with it, 1.75 px out along that side", u1[0][5] === hq[5] && Math.abs(Math.hypot(parseFloat(u1[1][2]) - parseFloat(u1[0][2]), parseFloat(u1[1][4]) - parseFloat(u1[0][4])) - STEP) < 0.02 && u1[1][5] === u1[0][5], u1);
  // the ship lay on the strip the stroke paints; carried with its 19 it floats again, on the west sea (a ship the stroke grounds:
  // section 14 f)
  rec("THE FIXTURE: the ship floated before, on a pixel the stroke paints, and floats again where it was carried", before.typeOf(before.ex.pidAt(x0 + 1, y1 + 2)) === "sea" && afterM.typeOf(afterM.ex.pidAt(x0 + 1, y1 + 2)) === "land"
    && afterM.typeOf(afterM.ex.pidAt(Math.floor(parseFloat(u1[1][2])), 255 - Math.floor(parseFloat(u1[1][4])))) === "sea", u1[1]);
  rec("it says what it did: two turned, one moved, the ship carried, nothing left", cr.turned && cr.turned.buildings === 1 && cr.moved.buildings === 1 && cr.turned.unitstacks === 1 && cr.ships === 1
    && !cr.strandedTotal && !cr.shipsOnLand, cr);
  // a land-to-land stroke: nothing read, nothing written
  const was = fs.readFileSync(bFile);
  const [ar, ag, ab] = colourOf(Wd.idAt(3, 2));   // a pixel of continent A's cell (4,2) given to its land neighbour (3,2)
  const res2 = md.applyProvinceDiff({ modRoot: Wd.MOD, gameRoot: Wd.GAME, dependencyRoots: [], diff: [{ x: 4 * CELL + 1, y: 2 * CELL + 1, r: ar, g: ag, b: ab }] });
  rec("⭐⭐ a land-to-land stroke keeps nothing: no coastRows, buildings.txt byte-identical", res2.ok && res2.coastRows == null && Buffer.compare(fs.readFileSync(bFile), was) === 0, res2.coastRows);
}

console.log("\n=== 4. An erase gives the land beside it more sea ===");
{
  const Wd = makeRegionWorld("keep-harbours-erase");
  sandboxes.push(Wd.ROOT);
  const ERASED = Wd.idAt(5, 0), BESIDE = Wd.idAt(5, 1), st = stateOf(Wd, BESIDE), stE = stateOf(Wd, ERASED);
  const before = cellMap(Wd), afterM = cellMap(Wd, { [ERASED]: "sea" });
  const F = (m, x, y) => md.coastFacing(m.ex, m.typeOf, x, z(y));
  const P = [6 * CELL - 1, CELL];   // the top-right pixel of (5,1): the sea east of it before, and north of it after
  rec("THE FIXTURE: beside the erase the answer moves", F(before, ...P) != null && F(before, ...P) !== F(afterM, ...P), [F(before, ...P), F(afterM, ...P)]);
  const b = [bRow(st, "coastal_bunker", P[0], P[1], F(before, ...P)), bRow(st, "naval_supply_hub", P[0], P[1], 1.40), bRow(stE, "dockyard", 5 * CELL + 16, 16, 0)];
  const bFile = path.join(Wd.MOD, "map", "buildings.txt");
  fs.writeFileSync(bFile, b.join("\n") + "\n");
  const res = md.flipProvinceToSea({ modRoot: Wd.MOD, gameRoot: Wd.GAME, dependencyRoots: [], provinceId: ERASED });
  const cr = res.coastRows || {};
  const b1 = fs.readFileSync(bFile, "utf8").split("\n").filter(Boolean);
  rec("the erase wrote", res.changed && !cr.error, res.error || cr.error);
  rec(`⭐⭐ Nova's fort beside it faces the sea it gained (${F(afterM, ...P).toFixed(2)}); the hub with its own rotation is byte-identical`, b1[0] === b[0].replace(/;[^;]*;0$/, `;${F(afterM, ...P).toFixed(2)};0`) && b1[1] === b[1], b1);
  rec("⭐ the dockyard on the erased land is the erase's own pass's to drop, and keep does not count it", b1.length === 2 && cr.turned && cr.turned.buildings === 1 && !cr.moved.buildings, { b1, cr });
}

console.log("\n=== 5. An add-on that inherits buildings.txt ===");
let inheritedAnswer = null;
{
  const Wd = makeRegionWorld("keep-harbours-addon", { addOn: true });
  sandboxes.push(Wd.ROOT);
  // An add-on loads the BASE game's map, where the islet is sea: the fort stands on continent A's east shore instead, in the
  // top-right pixel of cell (5,2), its water side east onto the sea cell (6,2); the sea cell (6,1) lies north-east of it.
  const EAST_SEA = Wd.idAt(6, 2), FX = 6 * CELL - 1, FY = 2 * CELL;
  const baseM = { ex: cellMap(Wd).ex, typeOf: Wd.baseType };   // the base game's own types: an add-on loads its map
  fs.writeFileSync(path.join(Wd.GAME, "map", "buildings.txt"), bRow(1, "coastal_bunker", FX, FY, Math.PI / 2) + "\n");
  rec("THE FIXTURE: in the base game the fort's water side stands on the sea cell (6,2), and the sea (6,1) is in its reach without it",
    md.coastRowArmOnSea(baseM.ex, baseM.typeOf, FX, z(FY), Math.PI / 2) && baseM.typeOf(EAST_SEA) === "sea" && baseM.typeOf(Wd.idAt(6, 1)) === "sea" && baseM.typeOf(Wd.idAt(5, 2)) === "land");
  // the add-on makes that sea land with the Type dropdown
  const res = md.setProvinceDefinition({ modRoot: Wd.MOD, gameRoot: Wd.GAME, dependencyRoots: [], provinceId: EAST_SEA, terrain: "ocean", type: "land", coastal: false });
  inheritedAnswer = res.coastRows;
  const cr = res.coastRows || {};
  rec("⭐⭐ nothing is copied into the add-on to turn the base game's rows", !fs.existsSync(path.join(Wd.MOD, "map", "buildings.txt")) && !cr.changed, cr);
  rec("⭐⭐ …and what was left is said: the base game's buildings.txt, 1 row", (cr.leftInherited || []).length === 1 && cr.leftInherited[0].file === "map/buildings.txt" && cr.leftInherited[0].rows === 1 && cr.leftInherited[0].from === "base game", cr.leftInherited);
}

console.log("\n=== 6. What the page says ===");
{
  const t = notePage(typeAnswer);
  rec("⭐⭐ after the Type dropdown: what moved and the ship, the files, and the floating harbour left on land with what to do", /moved 3 to their own province's new shore/.test(t) && /laid 1 ship in port/.test(t) && /map\/buildings\.txt and map\/unitstacks\.txt/.test(t) && /1 floating harbour now stands on the land/.test(t) && /paint the sea back/.test(t), t);
  const p = notePage(paintAnswer);
  rec("⭐ after the paint: turned, moved and the ship laid off its harbour again, and nothing left to say", /turned 2 to face the sea that is there now/.test(p) && /moved 1 to their own province's new shore/.test(p)
    && /laid 1 ship in port off its harbour again/.test(p) && !/⚠/.test(p), p);
  const i = notePage(inheritedAnswer);
  rec("⭐⭐ after the add-on's edit: the inherited file is named, and why it was not copied", /does not have its own map\/buildings\.txt/.test(i) && /base game/.test(i) && /stop the base game's changes/.test(i), i);
  const s = notePage({ turned: { buildings: 0, unitstacks: 0 }, moved: { buildings: 0, unitstacks: 0 }, ships: 0, stranded: [{ type: "dockyard", province: 7, why: "no coast" }], strandedTotal: 3, harboursOnLand: [], leftInherited: [] });
  rec("⭐⭐ stranded rows: counted, their provinces named, kept, and what to do", /3 port, coastal building or ship-in-port positions now stand with no sea/.test(s) && /province 7/.test(s) && /Nova kept them/.test(s), s);
  // a grounded ship is not a row with no sea beside it (its harbour may still face the sea): the two are said apart, each with its provinces
  const mixed = { turned: { buildings: 0, unitstacks: 0 }, moved: { buildings: 0, unitstacks: 0 }, ships: 0, strandedTotal: 5, shipsOnLand: 2, harboursOnLand: [], leftInherited: [],
    stranded: [{ type: "dockyard", province: 7, why: "no coast" }, { type: "20", province: 9, why: "ship on land" }] };
  const mx = notePage(mixed), rows = mixed.strandedTotal - mixed.shipsOnLand;
  rec("⭐ rows with no sea and ships on land in one answer: each counted and named apart", new RegExp(`${rows} port, coastal building or ship-in-port positions now stand with no sea[^.]*\\(province 7\\)`).test(mx)
    && new RegExp(`${mixed.shipsOnLand} ships in port now stand on the land the edit made \\(province 9\\)`).test(mx), mx);
  rec("nothing to say for nothing done", notePage(null) === "" && notePage({ turned: { buildings: 0, unitstacks: 0 }, moved: { buildings: 0, unitstacks: 0 }, ships: 0, stranded: [], harboursOnLand: [], leftInherited: [] }) === "");
}

console.log("\n=== 7. Auto-fix fills a sea the mod cut off inside continent A ===");
let inlandAnswer = null;   // fixInlandSeas' whole answer, for the summary of section 13
{
  // the mod made cell (4,4) of continent A sea: a sea with land all round, which Auto-fix fills as land. The fort and the port's
  // ship rows of the cell east of it, (5,4), stand on its west edge facing it; (5,4)'s east edge is on the open sea 31 px away.
  const Wd = makeRegionWorld("keep-harbours-inland");
  sandboxes.push(Wd.ROOT);
  const INLAND = Wd.idAt(4, 4), SHORE = Wd.idAt(5, 4), st = stateOf(Wd, SHORE);
  const defFile = path.join(Wd.MOD, "map", "definition.csv");
  fs.writeFileSync(defFile, fs.readFileSync(defFile, "utf8").split("\n").map((l) => (l.startsWith(INLAND + ";") ? l.split(";").slice(0, 4).concat(["sea", "false", "ocean", "0"]).join(";") : l)).join("\n"));
  const before = cellMap(Wd, { [INLAND]: "sea" }), after = cellMap(Wd);
  const F = (m, x, y) => md.coastFacing(m.ex, m.typeOf, x, z(y));
  const X = 5 * CELL, Y = 4 * CELL + 16;
  fs.writeFileSync(path.join(Wd.MOD, "map", "buildings.txt"), bRow(st, "coastal_bunker", X, Y, F(before, X, Y)) + "\n");
  fs.writeFileSync(path.join(Wd.MOD, "map", "unitstacks.txt"), [uRow(SHORE, "19", X, Y, F(before, X, Y)), uRow(SHORE, "20", X - STEP, Y, F(before, X, Y))].join("\n") + "\n");
  rec("THE FIXTURE: the fort faces the sea the mod cut off, and once it is land no sea is in its reach",
    F(before, X, Y) != null && md.coastSeaInReach(before.ex, before.typeOf, X, z(Y)) && !md.coastSeaInReach(after.ex, after.typeOf, X, z(Y)));
  const res = md.fixInlandSeas({ modRoot: Wd.MOD, gameRoot: Wd.GAME, dependencyRoots: [] });
  inlandAnswer = res;
  const cr = res.coastRows || {};
  rec("Auto-fix filled the cut-off sea", res.fixed === 1 && (res.details || [])[0].province === INLAND, res);
  const fort = fs.readFileSync(path.join(Wd.MOD, "map", "buildings.txt"), "utf8").trim().split(";");
  const fx = parseFloat(fort[2]), fy = 255 - parseFloat(fort[4]);
  rec("⭐⭐⭐ the fort goes to its own province's coast on the open sea, and faces it", after.ex.pidAt(fx, fy) === SHORE && after.typeOf(after.ex.pidAt(fx + 1, fy)) === "sea"
    && fort[5] === (F(after, fx, fy) || 0).toFixed(2) && md.coastRowArmOnSea(after.ex, after.typeOf, fx, z(fy), parseFloat(fort[5])), fort);
  const u = fs.readFileSync(path.join(Wd.MOD, "map", "unitstacks.txt"), "utf8").trim().split("\n").map((l) => l.split(";"));
  rec("⭐⭐ the port's row 19 goes to the same coast, and its ship (20) lies 1.75 px out on the sea", after.ex.pidAt(parseFloat(u[0][2]), 255 - parseFloat(u[0][4])) === SHORE
    && after.typeOf(after.ex.pidAt(parseFloat(u[1][2]), 255 - parseFloat(u[1][4]))) === "sea" && Math.abs(Math.hypot(u[1][2] - u[0][2], u[1][4] - u[0][4]) - STEP) < 0.02, u);
  rec("⭐ one keep for the click, and it says what it did", cr.moved && cr.moved.buildings === 1 && cr.moved.unitstacks === 1 && cr.ships === 1 && !cr.strandedTotal, cr);
  const two = md.sumCoastRows(cr, { changed: true, turned: { buildings: 2, unitstacks: 0 }, moved: { buildings: 0, unitstacks: 0 }, ships: 0, stranded: [], strandedTotal: 0, harboursOnLand: [], leftInherited: [], provinces: [9], files: ["map/buildings.txt"] });
  rec("Auto-fix's two inland-sea passes are said as one (sumCoastRows)", two.turned.buildings === 2 && two.moved.buildings === 1 && two.ships === 1 && two.files.join() === "map/buildings.txt,map/unitstacks.txt", two);
}

console.log("\n=== 8. Generate land raises the sea in front of a coast that was already there ===");
{
  // 256 x 256 px of sixteen 64-px blocks (province = col + row*4 + 1). The base game had 1-13 as land; the mod blanked all but its own
  // 13 (bottom-left), whose fort and port stand on its north edge facing the sea 9. Generate land raises 1-12 and fills the seas
  // that cuts off (14-16): 13 has no sea left anywhere, so the fort is REPORTED and kept, and the port whose sea is gone is removed
  // as before (the fatal half, removePortsAnchoredTo).
  const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-keep-harbours-gen-"));
  sandboxes.push(ROOT);
  const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
  const GW = 256, GH = 256, B = 64;
  const COL = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
  const provAt = (x, y) => Math.floor(x / B) + Math.floor(y / B) * 4 + 1;
  const bmp = (() => {
    const rs = (GW * 3 + 3) & ~3, b = Buffer.alloc(54 + rs * GH);
    b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
    b.writeInt32LE(GW, 18); b.writeInt32LE(GH, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * GH, 34);
    for (let y = 0; y < GH; y++) { let o = 54 + (GH - 1 - y) * rs; for (let x = 0; x < GW; x++) { const [r, g, bl] = COL(provAt(x, y)); b[o++] = bl; b[o++] = g; b[o++] = r; } }
    return b;
  })();
  const csv = (land) => ["0;0;0;0;land;false;unknown;0"].concat(Array.from({ length: 16 }, (_, i) => { const p = i + 1, [r, g, b] = COL(p), l = land.includes(p); return `${p};${r};${g};${b};${l ? "land" : "sea"};false;${l ? "plains" : "ocean"};${l ? 1 : 0}`; })).join("\n") + "\n";
  const stateTxt = (sid, provs) => `state = {\n\tid = ${sid}\n\tname = "STATE_${sid}"\n\tmanpower = 300000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t\tbuildings = {\n\t\t\tinfrastructure = 3\n\t\t}\n\t}\n}\n`;
  const G = path.join(ROOT, "game"), M = path.join(ROOT, "mods", "keep");
  mk(G, "map/provinces.bmp", bmp);
  mk(G, "map/definition.csv", csv([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]));
  mk(G, "map/strategicregions/r1.txt", 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ 1 2 3 4 5 6 7 8 9 10 11 12 }\n\tweather={}\n}\n');
  mk(G, "map/strategicregions/r2.txt", 'strategic_region={\n\tid=2\n\tname="REGION_2"\n\tprovinces={ 13 14 15 16 }\n\tweather={}\n}\n');
  for (const [sid, provs] of Object.entries({ 1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8, 9], 4: [10, 11, 12], 5: [13] })) mk(G, `history/states/${sid}.txt`, stateTxt(sid, provs));
  mk(G, "history/countries/AAA - Aland.txt", "capital = 1\n");
  mk(M, "descriptor.mod", 'version="1"\nname="Keep"\nreplace_path="history/states"\npath="mod/keep"\n');
  mk(M, "map/provinces.bmp", bmp);
  mk(M, "map/definition.csv", csv([13]));
  mk(M, "history/states/5.txt", stateTxt(5, [13]));
  const fortRow = "5;coastal_bunker;32.00;9.50;63.00;3.14;0", portRow = "5;naval_base_spawn;20.00;9.50;63.00;3.14;9";
  mk(M, "map/buildings.txt", fortRow + "\n" + portRow + "\n");
  // the base game's ship-in-port pair of province 7, which the mod blanked and the click raises again — on the owner's flow 1,696 such
  // rows are in the inherited unitstacks.txt when Generate land keeps, and judged they said 1,465 rows "stranded" (e-critic-noleave.js)
  const u19 = "7;19;160.00;9.50;159.00;0.00;0.20", u20 = "7;20;161.75;9.50;159.00;0.00;0.20";
  mk(G, "map/unitstacks.txt", u19 + "\n" + u20 + "\n");
  const r = md.generateLand({ modRoot: M, gameRoot: G, dependencyRoots: [], count: 12, provincesPerState: 4, seed: 7, ownerMode: "inherit" });
  const cr = r.coastRows || {};
  const left = fs.readFileSync(path.join(M, "map", "buildings.txt"), "utf8").split("\n").filter(Boolean);
  rec("the world was generated, and the sea in front of 13 and round it is land", r.changed === true && md.readDefinitionFromRoot(M).filter((d) => [9, 14].includes(d.id)).every((d) => d.type === "land"), r.error || r.changed);
  rec("⭐⭐ the fort with no sea of its own province left is REPORTED by Generate land, and kept byte for byte", (cr.stranded || []).length === 1 && cr.stranded[0].province === 13 && cr.stranded[0].why === "no coast" && left.includes(fortRow), cr);
  rec("…and the port whose sea is gone is removed as before (the fatal half), not reported twice", !left.includes(portRow) && (r.orphanedPorts || {}).removed === 1 && cr.strandedTotal === 1, r.orphanedPorts);
  rec("THE FIXTURE: the pair stands on province 7, which the click raised, 32 px from the sea it leaves beside it (6)",
    provAt(160, 255 - 159) === 7 && md.readDefinitionFromRoot(M).some((d) => d.id === 7 && d.type === "land"),
    { at: provAt(160, 255 - 159), land: md.readDefinitionFromRoot(M).filter((d) => d.type === "land").map((d) => d.id) });
  rec("⭐⭐ the ship-in-port pair of a province the click raised is that province's own writer's: not judged, not reported", !(cr.stranded || []).some((x) => x.province === 7) && !(cr.leftInherited || []).length, cr);
}

console.log("\n=== 9. A port the paint turns takes its ship-in-port row with it (one rule, not two) ===");
{
  // the paint of section 3. The islet's port stands in the south-west of its south shore, water side south onto the sea the stroke makes
  // land (rule 2 turns it); its ship-in-port row (19) stands AT the port, as the base game's do, with a rotation no rule of its own
  // would touch (its water side west was never on the sea). The provinces chain lays new land's 19 on its port; an edit must keep
  // them together the same way. The port stands 1 px off the west sea, where a turn puts its water side on it (section 3).
  const Wd = makeRegionWorld("keep-harbours-portlead");
  sandboxes.push(Wd.ROOT);
  const ISLET = Wd.PROV.islet, st = stateOf(Wd, ISLET), SOUTH = Wd.idAt(8, 2);
  const { x0, x1, y1 } = isletPx(Wd);
  const colourOf = (id) => [(id * 37) % 256, (id * 91) % 256, 40 + (id % 200)];
  const [r, g, bl] = colourOf(ISLET);
  const diff = [];
  for (let y = y1 + 1; y <= y1 + 4; y++) for (let x = x0; x <= x1; x++) diff.push({ x, y, r, g, b: bl });
  const before = cellMap(Wd);
  const afterM = { ex: { W: 512, H: 256, pidAt: (x, y) => (x >= x0 && x <= x1 && y > y1 && y <= y1 + 4 ? ISLET : before.ex.pidAt(x, y)) }, typeOf: before.typeOf };
  const F = (m, x, y) => md.coastFacing(m.ex, m.typeOf, x, z(y));
  const WEST = 3 * Math.PI / 2;
  const bFile = path.join(Wd.MOD, "map", "buildings.txt"), uFile = path.join(Wd.MOD, "map", "unitstacks.txt");
  fs.writeFileSync(bFile, bRow(st, "naval_base_spawn", x0 + 1, y1, 0, SOUTH) + "\n");
  const u19 = uRow(ISLET, "19", x0 + 2.5, y1, WEST), u20 = uRow(ISLET, "20", x0 + 0.75, y1, WEST);
  fs.writeFileSync(uFile, [u19, u20].join("\n") + "\n");
  rec("THE FIXTURE: the 19's own water side (west) is on no sea before or after, so no rule of its own turns it; the port's is turned",
    !md.coastRowArmOnSea(before.ex, before.typeOf, x0 + 2.5, z(y1), WEST) && !md.coastRowArmOnSea(afterM.ex, afterM.typeOf, x0 + 2.5, z(y1), WEST)
    && md.coastRowArmOnSea(before.ex, before.typeOf, x0 + 1, z(y1), 0) && !md.coastRowArmOnSea(afterM.ex, afterM.typeOf, x0 + 1, z(y1), 0) && F(afterM, x0 + 1, y1) != null
    && md.coastRowArmOnSea(afterM.ex, afterM.typeOf, x0 + 1, z(y1), F(afterM, x0 + 1, y1)));
  const res = md.applyProvinceDiff({ modRoot: Wd.MOD, gameRoot: Wd.GAME, dependencyRoots: [], diff });
  const port = fs.readFileSync(bFile, "utf8").trim().split(";");
  const u = fs.readFileSync(uFile, "utf8").trim().split("\n").map((l) => l.split(";"));
  rec("the port is turned to the sea still in its reach, column 7 kept", port[5] === F(afterM, x0 + 1, y1).toFixed(2) && port[6] === String(SOUTH), port);
  rec("⭐⭐⭐ its 19 takes the port's new rotation where it stands, and the ship is laid 1.75 px out along it", u[0][5] === port[5] && u[0][2] === (x0 + 2.5).toFixed(2)
    && u[1][5] === port[5] && Math.abs(Math.hypot(parseFloat(u[1][2]) - parseFloat(u[0][2]), parseFloat(u[1][4]) - parseFloat(u[0][4])) - STEP) < 0.02, u);
  const cr = res.coastRows || {};
  rec("it says what it did", cr.turned && cr.turned.buildings === 1 && cr.turned.unitstacks === 1 && cr.ships === 1, cr);
}

console.log("\n=== 10. The pair moves as one body; a 19 follows its port from past the window; moved rows spread over a short coast ===");
{
  // 40 x 20 px, rows top-down; province 1 land, 2 sea, 3 other land. All in memory (`img`), the files in a scratch mod.
  const W = 40, H = 20, zz = (row) => H - 1 - row;
  const COLS = { 1: [200, 10, 10], 2: [10, 10, 200], 3: [10, 200, 10] };
  const imgOf = (idAt) => { const rgb = Buffer.alloc(W * H * 3); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = COLS[idAt(x, y)]; rgb.set(c, (y * W + x) * 3); } return { width: W, height: H, rgb }; };
  const typeOf = (p) => ({ 1: "land", 2: "sea", 3: "land" })[p];
  const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-keep-harbours-10-"));
  sandboxes.push(ROOT);
  const modWith = (name, b, u) => {
    const d = path.join(ROOT, name);
    fs.mkdirSync(path.join(d, "map"), { recursive: true });
    fs.writeFileSync(path.join(d, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat(Object.entries(COLS).map(([id, c]) => `${id};${c.join(";")};${typeOf(+id)};true;${typeOf(+id) === "sea" ? "ocean" : "plains"};${typeOf(+id) === "sea" ? 0 : 1}`)).join("\n") + "\n");
    fs.writeFileSync(path.join(d, "map", "buildings.txt"), b.join("\n") + "\n");
    fs.writeFileSync(path.join(d, "map", "unitstacks.txt"), u.join("\n") + "\n");
    return d;
  };
  const read = (d, f) => fs.readFileSync(path.join(d, "map", f), "utf8").split("\n").filter(Boolean).map((l) => l.split(";"));
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  // (a) the base game's pair shape: its 20 at a rotation of its own, 1.75 px along ITS water side; the 19 is Nova's turn, which the
  //     stroke's sea moves (rule 1). The stroke is SOUTH of the 19 and the ship lies north-east of it, so the carried ship floats
  {
    const before = (x) => (x < 20 ? 1 : 2), after = (x, y) => (x < 20 || (x < 21 && y >= 9) ? 1 : 2);
    const ex = { W, H, pidAt: (x, y) => after(x, y), pidBefore: (x) => before(x) };
    const z = zz(8) + 0.5, r19 = md.coastFacing({ W, H, pidAt: (x) => before(x) }, typeOf, 19.2, z), r20 = r19 + 0.46, d20 = r20 - Math.PI / 2;
    const x20 = 19.2 + STEP * Math.cos(d20), z20 = z + STEP * Math.sin(d20);
    const text = [`1;19;19.20;9.50;${z.toFixed(2)};${r19.toFixed(2)};0.20`, `1;20;${x20.toFixed(2)};9.50;${z20.toFixed(2)};${r20.toFixed(2)};0.20`].join("\n");
    const r = md.returnCoastRowsToTheirSea(text, ex, typeOf, typeOf, { types: new Set(["19", "20"]), ownerOf: (c) => parseInt(c[0], 10), typeNow: typeOf,
      armLeftTheSea: true, coastPixel: () => ({ why: "no coast" }), ship: { lead: "19", ship: "20", step: STEP } });
    const [a, b] = r.text.split("\n").map((l) => l.split(";"));
    const t = parseFloat(a[5]) - parseFloat(r19.toFixed(2)), step = Math.atan2(parseFloat(b[4]) - parseFloat(a[4]), parseFloat(b[2]) - parseFloat(a[2]));
    rec("THE FIXTURE: the 19 is turned, its 20's rotation is NOT the 19's (so laying it again off the 19 would change the pair), and the carried ship floats",
      Math.abs(t) > 0.05 && Math.abs(wrap(r20 - r19)) > 0.15 && after(Math.floor(parseFloat(b[2])), H - 1 - Math.floor(parseFloat(b[4]))) === 2, { t });
    rec("⭐⭐ the 20 is turned by the 19's angle and carried with it: its rotation against the 19's, its distance and its step along its own water side are the pair's",
      Math.abs(wrap(parseFloat(b[5]) - parseFloat(a[5])) - wrap(r20 - r19)) <= 0.02 && Math.abs(Math.hypot(parseFloat(b[2]) - parseFloat(a[2]), parseFloat(b[4]) - parseFloat(a[4])) - STEP) <= 0.02
        && Math.abs(wrap(step - (parseFloat(b[5]) - Math.PI / 2))) <= 0.02 && r.ships.length === 1, [a.join(";"), b.join(";")]);
  }
  // (a2) …but a ship that floated is not carried ashore: where the carried spot is land and the 19's new water side floats it, it is laid there
  {
    const before = (x) => (x < 20 ? 1 : 2), after = (x, y) => (x < 20 || (x < 21 && y <= 9) ? 1 : 2);
    const ex = { W, H, pidAt: (x, y) => after(x, y), pidBefore: (x) => before(x) };
    const z = zz(10) + 0.5, r19 = md.coastFacing({ W, H, pidAt: (x) => before(x) }, typeOf, 19, z), a = -0.96, d20 = r19 + a - Math.PI / 2;
    const x20 = 19 + STEP * Math.cos(d20), z20 = z + STEP * Math.sin(d20);
    const text = [`1;19;19.00;9.50;${z.toFixed(2)};${r19.toFixed(2)};0.20`, `1;20;${x20.toFixed(2)};9.50;${z20.toFixed(2)};${(r19 + a).toFixed(2)};0.20`].join("\n");
    const r = md.returnCoastRowsToTheirSea(text, ex, typeOf, typeOf, { types: new Set(["19", "20"]), ownerOf: (c) => parseInt(c[0], 10), typeNow: typeOf,
      armLeftTheSea: true, coastPixel: () => ({ why: "no coast" }), ship: { lead: "19", ship: "20", step: STEP } });
    const [p, q] = r.text.split("\n").map((l) => l.split(";"));
    const t = parseFloat(p[5]) - parseFloat(r19.toFixed(2)), dR = d20 + t, sea = (x, zq) => after(Math.floor(x), H - 1 - Math.floor(zq)) === 2;
    const dL = parseFloat(p[5]) - Math.PI / 2;
    rec("THE FIXTURE: the 20 floated; carried with its turned 19 it would stand on land, laid off the 19's new water side it floats",
      before(Math.floor(x20)) === 2 && Math.abs(t) > 0.05 && !sea(19 + STEP * Math.cos(dR), z + STEP * Math.sin(dR)) && sea(19 + STEP * Math.cos(dL), z + STEP * Math.sin(dL)), { t });
    rec("⭐⭐ so it is laid there, at its 19's rotation, still on the sea", sea(parseFloat(q[2]), parseFloat(q[4])) && q[5] === p[5]
      && Math.abs(Math.hypot(parseFloat(q[2]) - 19, parseFloat(q[4]) - z) - STEP) <= 0.02, [p.join(";"), q.join(";")]);
  }
  // (a3) …and one that NEITHER floats is said: the stroke covers the sea in front of the 19 and leaves only a strip to its north-east,
  //      so the 19 turns there, and the ship carried with it or laid off its new water side stands on land either way. Both the design
  //      and its first correction wrote it there and said nothing (e-critic-p8.js; the Type dropdown on the sea of 19 ports did the same
  //      to province 9680's ship, e-critic-shipdetail.js)
  {
    const before = (x) => (x < 20 ? 1 : 2), after = (x, y) => (y <= 8 ? (x < 20 ? 1 : 2) : x < 25 ? 1 : 2);
    const ex = { W, H, pidAt: (x, y) => after(x, y), pidBefore: (x) => before(x) };
    const z = zz(10) + 0.5, r19 = md.coastFacing({ W, H, pidAt: (x) => before(x) }, typeOf, 19, z), d20 = r19 - Math.PI / 2;
    const x20 = 19 + STEP * Math.cos(d20), z20 = z + STEP * Math.sin(d20);
    const text = [`1;19;19.00;9.50;${z.toFixed(2)};${r19.toFixed(2)};0.20`, `1;20;${x20.toFixed(2)};9.50;${z20.toFixed(2)};${r19.toFixed(2)};0.20`].join("\n");
    const r = md.returnCoastRowsToTheirSea(text, ex, typeOf, typeOf, { types: new Set(["19", "20"]), ownerOf: (c) => parseInt(c[0], 10), typeNow: typeOf,
      armLeftTheSea: true, coastPixel: () => ({ why: "no coast" }), ship: { lead: "19", ship: "20", step: STEP } });
    const [p, q] = r.text.split("\n").map((l) => l.split(";"));
    const sea = (x, zq) => after(Math.floor(x), H - 1 - Math.floor(zq)) === 2, t = parseFloat(p[5]) - parseFloat(r19.toFixed(2));
    const dL = parseFloat(p[5]) - Math.PI / 2, dR = d20 + t;
    rec("THE FIXTURE: the 20 floated; its 19 is turned; carried or laid off the 19's new water side it stands on land",
      before(Math.floor(x20)) === 2 && Math.abs(t) > 0.05 && r.turned.length === 1 && !sea(19 + STEP * Math.cos(dR), z + STEP * Math.sin(dR)) && !sea(19 + STEP * Math.cos(dL), z + STEP * Math.sin(dL)), { t });
    rec("⭐⭐ a ship the edit grounds is SAID — \"ship on land\", its province named — and not counted as laid off its harbour",
      r.stranded.length === 1 && r.stranded[0].type === "20" && r.stranded[0].why === "ship on land" && r.stranded[0].province === 1 && r.ships.length === 0, { stranded: r.stranded, ships: r.ships });
    rec("…and it stays with its 19, carried as the pair (it is the harbour's; leaving it behind would split them)",
      Math.abs(Math.hypot(parseFloat(q[2]) - parseFloat(p[2]), parseFloat(q[4]) - parseFloat(p[4])) - STEP) <= 0.02 && Math.abs(Math.atan2(Math.sin(parseFloat(q[5]) - parseFloat(p[5])), Math.cos(parseFloat(q[5]) - parseFloat(p[5])))) <= 0.02, [p.join(";"), q.join(";")]);
  }
  // (b) the stroke moves a port whose 19 stands 1.9 px off it, on the side away from the stroke — past the box's window
  {
    const before = (x) => (x < 20 ? 1 : 2), after = (x) => (x < 22 ? 1 : 2);
    const pixels = new Map(); for (let y = 0; y < H; y++) for (let x = 20; x < 22; x++) pixels.set(y * W + x, 2);
    const z = zz(10) + 0.5, rot = md.coastFacing({ W, H, pidAt: (x) => before(x) }, typeOf, 17.6, z);
    const d = modWith("follow", [`1;naval_base_spawn;17.60;9.50;${z.toFixed(2)};${rot.toFixed(2)};2`], [`1;19;15.70;9.50;${z.toFixed(2)};${rot.toFixed(2)};0.20`]);
    rec("THE FIXTURE: the 19 is within 2 px of its port and further than coastFacing's window (4 px) from every pixel the stroke changed", Math.abs(17.6 - 15.7) <= 2 && Math.floor(15.7) < 20 - 4);
    const r = md.keepCoastRowsFacingTheirSea({ modRoot: d, gameRoot: "", dependencyRoots: [], before: { pixels }, img: imgOf((x) => after(x)) });
    const [p] = read(d, "buildings.txt"), [u] = read(d, "unitstacks.txt");
    rec("⭐⭐ the port is moved to the new shore, and its 19 goes with it", r.moved.buildings === 1 && p[2] !== "17.60" && u[2] === p[2] && u[4] === p[4] && u[5] === p[5], [p.join(";"), u.join(";")]);
  }
  // (c) three rows of one province lose every sea in reach; the new shore is three pixels long
  {
    const inStrip = (y) => y >= 8 && y <= 10;
    const before = (x, y) => (inStrip(y) ? (x >= 10 && x < 20 ? 1 : x >= 20 ? 2 : 3) : 3);
    const after = (x, y) => (inStrip(y) ? (x >= 10 && x < 22 ? 1 : x >= 22 ? 2 : 3) : 3);
    const pixels = new Map(); for (let y = 8; y <= 10; y++) for (let x = 20; x < 22; x++) pixels.set(y * W + x, 2);
    const z = zz(9) + 0.5, E = Math.PI / 2;
    const b = [`1;naval_base_spawn;19.00;9.50;${z.toFixed(2)};${E.toFixed(2)};2`, `1;coastal_bunker;18.90;9.50;${z.toFixed(2)};${E.toFixed(2)};0`, `1;naval_headquarters;18.80;9.50;${z.toFixed(2)};${E.toFixed(2)};0`];
    const shore = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (after(x, y) === 1 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => typeOf(after(x + dx, y + dy)) === "sea")) shore.push([x, y]);
    rec("THE FIXTURE: the new shore is three pixels, one nearest to all three rows", shore.length === 3 && shore.every(([x]) => x === 21));
    const d = modWith("spread", b, ["1;0;15.00;9.50;9.50;0.00;0.00"]);
    const r = md.keepCoastRowsFacingTheirSea({ modRoot: d, gameRoot: "", dependencyRoots: [], before: { pixels }, img: imgOf(after) });
    const at = read(d, "buildings.txt").map((c) => c[2] + "," + c[4]);
    rec("⭐⭐ the three are moved to the new shore, each to a pixel of its own", r.moved.buildings === 3 && new Set(at).size === 3 && at.every((k) => k.startsWith("21.00,")), at);
  }
}

console.log("\n=== 11. A piece the province split cuts out of the raised sea is raised land too ===");
{
  // 40 x 20 px, rows top-down: land 1 west of x 20; sea 2 east of it above row 12; below it the sea 5 the click raised, which the
  // split cut in two — 5 east of x 25, and a NEW id 6 between, which definition.csv did not have when the click began. Generate land
  // keeps with `typeOf` alone (every pixel of a raised province was sea), so a piece not counted raised is read as land that was
  // always there. A fort of 1 faces east onto 6, with sea 2 still in its reach; a HQ and a ship-in-port pair stand on 6 itself.
  const W = 40, H = 20, zz = (row) => H - 1 - row;
  const COLS = { 1: [200, 10, 10], 2: [10, 10, 200], 5: [10, 200, 10], 6: [200, 200, 10] };
  const typeNow = (p) => ({ 1: "land", 2: "sea", 5: "land", 6: "land" })[p];
  const after = (x, y) => (x < 20 ? 1 : y < 12 ? 2 : x < 25 ? 6 : 5);
  const img = (() => { const rgb = Buffer.alloc(W * H * 3); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgb.set(COLS[after(x, y)], (y * W + x) * 3); return { width: W, height: H, rgb }; })();
  const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-keep-harbours-11-"));
  sandboxes.push(ROOT);
  const E = Math.PI / 2, fz = zz(13) + 0.5;
  const b = [`1;coastal_bunker;19.50;9.50;${fz.toFixed(2)};${E.toFixed(2)};0`, `6;naval_headquarters;22.50;9.50;${(zz(12) + 0.5).toFixed(2)};0.00;0`];
  const u = [`6;19;22.50;9.50;${(zz(17) + 0.5).toFixed(2)};0.00;0.20`, `6;20;22.50;9.50;${(zz(18) + 0.5).toFixed(2)};0.00;0.20`];
  const run = (name, picked, idsBefore) => {
    const d = path.join(ROOT, name);
    fs.mkdirSync(path.join(d, "map"), { recursive: true });
    fs.writeFileSync(path.join(d, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat(Object.entries(COLS).map(([id, c]) => `${id};${c.join(";")};${typeNow(+id)};true;${typeNow(+id) === "sea" ? "ocean" : "plains"};${typeNow(+id) === "sea" ? 0 : 1}`)).join("\n") + "\n");
    fs.writeFileSync(path.join(d, "map", "buildings.txt"), b.join("\n") + "\n");
    fs.writeFileSync(path.join(d, "map", "unitstacks.txt"), u.join("\n") + "\n");
    const raised = md.raisedByThisClick(picked, idsBefore);
    const r = md.keepCoastRowsFacingTheirSea({ modRoot: d, gameRoot: "", dependencyRoots: [], before: { typeOf: (p) => (raised.has(p) ? "sea" : undefined), leave: raised }, img });
    return { r, raised, bl: fs.readFileSync(path.join(d, "map", "buildings.txt"), "utf8").split("\n").filter(Boolean), ul: fs.readFileSync(path.join(d, "map", "unitstacks.txt"), "utf8").split("\n").filter(Boolean) };
  };
  const now = md.coastFacing({ W, H, pidAt: after }, typeNow, 19.5, fz);
  const snapshot = new Set([0, 1, 2, 5]);   // the ids definition.csv had when the click began: 6 is the split's
  const blind = run("blind", ["5"], new Set([...snapshot, 6]));   // the control: the piece read as land that was always there
  rec("THE FIXTURE: a piece not counted raised neither turns the fort facing it nor is left to its own writers — its pair is moved",
    now != null && blind.bl[0] === b[0] && blind.ul[0] !== u[0] && md.coastRowArmOnSea({ W, H, pidAt: after }, typeNow, 19.5, fz, now), { blind: blind.bl.concat(blind.ul), now });
  const seen = run("seen", ["5"], snapshot);
  rec("⭐⭐ an id the click made is raised, whether or not it was picked; a province the map had and the click did not pick is not",
    seen.raised.has(6) && seen.raised.has(5) && !seen.raised.has(1) && !seen.raised.has(2) && !seen.raised.has(0));
  rec(`⭐⭐⭐ the fort of the land that was there, its water side on the split piece, faces the sea still in its reach (${now.toFixed(2)})`,
    seen.bl[0] === b[0].replace(/;[^;]*;0$/, `;${now.toFixed(2)};0`) && seen.r.turned.buildings === 1, seen.bl);
  rec("⭐⭐ the HQ and the ship-in-port pair on the split piece are its own writers' — byte-identical, and not reported",
    seen.bl[1] === b[1] && seen.ul.join() === u.join() && !seen.r.strandedTotal && !seen.r.moved.unitstacks && !seen.r.ships, { b: seen.bl, u: seen.ul, r: seen.r });
}

console.log("\n=== 12. Auto-fix repairs an X-crossing by giving its sea corner pixel to the land beside Nova's turned HQ ===");
let xcAnswer = null;   // fixMapXCrossings' whole answer, for the summary of section 13
{
  // 32 x 16 px, rows top-down: L2 top-left, L3 top-right, L1 bottom-left and the sea S bottom-right meet at ONE X-crossing (columns
  // 15|16, rows 7|8); a land province E on both edge columns keeps the wrap seam from making a second one. The repair recolours the
  // corner's bottom-right pixel, sea, to a land colour, and an HQ of L1 two pixels west of it carries Nova's own turn (rule 1).
  // Review E-R1: fed the corner's NEW colour as its old one, the keep saw no pixel change side and every committed test stayed green.
  const W = 32, H = 16;
  const COL = { E: [40, 40, 40], L1: [200, 10, 10], L2: [10, 200, 10], L3: [10, 10, 200], S: [5, 60, 120] };
  const ID = { E: 1, L1: 2, L2: 3, L3: 4, S: 5 };
  const typeOf = (id) => (id === ID.S ? "sea" : id > 0 ? "land" : undefined);
  const cell = (x, y) => (x === 0 || x === W - 1 ? "E" : y < 8 ? (x < 16 ? "L2" : "L3") : x < 16 ? "L1" : "S");
  const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-keep-harbours-12-"));
  sandboxes.push(ROOT);
  const MOD = path.join(ROOT, "mod"), GAME = path.join(ROOT, "game");
  fs.mkdirSync(path.join(MOD, "map"), { recursive: true });
  fs.mkdirSync(GAME, { recursive: true });
  const rs = (W * 3 + 3) & ~3, bmp = Buffer.alloc(54 + rs * H);
  bmp.write("BM", 0, "ascii"); bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = COL[cell(x, y)], o = 54 + (H - 1 - y) * rs + x * 3; bmp[o] = bl; bmp[o + 1] = g; bmp[o + 2] = r; }
  const bmpFile = path.join(MOD, "map", "provinces.bmp");
  fs.writeFileSync(bmpFile, bmp);
  fs.writeFileSync(path.join(MOD, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat(Object.keys(ID).map((k) => `${ID[k]};${COL[k].join(";")};${typeOf(ID[k])};true;${typeOf(ID[k]) === "sea" ? "ocean" : "plains"};${typeOf(ID[k]) === "sea" ? 0 : 1}`)).join("\n") + "\n");
  // the map as the file on disk says it, read before the repair and after it
  const readMap = () => {
    const b = fs.readFileSync(bmpFile), byColour = new Map(Object.keys(ID).map((k) => [COL[k].join(","), ID[k]]));
    return { W, H, pidAt: (x, y) => { const o = 54 + (H - 1 - y) * rs + (((x % W) + W) % W) * 3; return byColour.get([b[o + 2], b[o + 1], b[o]].join(",")) || 0; } };
  };
  const exB = readMap();
  const HX = 14.5, HZ = H - 1 - 9 + 0.5;   // the HQ, at pixel (14, 9)
  const was = md.coastFacing(exB, typeOf, HX, HZ);
  const hq = `7;naval_headquarters;${HX.toFixed(2)};9.50;${HZ.toFixed(2)};${(was == null ? 0 : was).toFixed(2)};0`;
  const factory = `7;industrial_complex;5.50;9.50;${(H - 1 - 12 + 0.5).toFixed(2)};0.00;0`;   // far inland: never looked at
  const bFile = path.join(MOD, "map", "buildings.txt");
  fs.writeFileSync(bFile, [hq, factory].join("\r\n") + "\r\n");
  rec("THE FIXTURE: one X-crossing, and the HQ stands where Nova's turn is coastFacing's answer",
    md.findMapXCrossings({ modRoot: MOD, gameRoot: GAME }).length === 1 && was != null, { was });
  const r = md.fixMapXCrossings({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [] });
  xcAnswer = r;
  const exA = readMap(), now = md.coastFacing(exA, typeOf, HX, HZ), at = (r.coords || [])[0] || {};
  rec("THE FIXTURE: the repair gave the corner's sea pixel to the land, and that moved coastFacing's answer for the HQ",
    r.fixed === 1 && typeOf(exB.pidAt(at.x, at.y)) === "sea" && typeOf(exA.pidAt(at.x, at.y)) === "land" && now != null && now !== was, { fixed: r.fixed, at, was, now });
  const lines = fs.readFileSync(bFile, "utf8").split("\r\n");
  rec(`⭐⭐⭐ the HQ with Nova's own turn faces the sea the repaired map leaves (${now == null ? "?" : now.toFixed(2)}); every other byte is kept`,
    now != null && lines.length === 3 && lines[0] === hq.replace(/;[^;]*;0$/, `;${now.toFixed(2)};0`) && lines[1] === factory && lines[2] === "", lines);
  const cr = r.coastRows || {};
  rec("⭐⭐ …and the repair says it: one coast row turned, none moved, in map/buildings.txt", cr.turned && cr.turned.buildings === 1 && cr.turned.unitstacks === 0
    && cr.moved.buildings === 0 && !cr.ships && (cr.files || []).join() === "map/buildings.txt" && !cr.strandedTotal && !cr.error, cr);
}

console.log("\n=== 13. Auto-fix's summary says what its keeps did in the words the paint, Save and Generate land use ===");
{
  // The two keeps of one Auto-fix click, sections 7 and 12, through the page's own summary code (autoFixSummary). Review E-R2: the
  // summary counted turned and moved rows as one "turned … port(s) and coastal building(s)", so a port or a ship-in-port row it
  // MOVED to its province's new shore read as turned where it stood, while the other three places said "moved".
  const { autoFixSummary } = require("./testlib-map-page.js");
  const ic = (inlandAnswer || {}).coastRows || {}, xc = (xcAnswer || {}).coastRows || {};
  const did = (cr) => notePage(cr).replace(/\.$/, "");   // nothing left over in either (checked below): the note is its first sentence
  rec("THE FIXTURE: the inland seas' keep only MOVED rows (and laid a ship), the X-crossing's only turned one; neither left anything to say",
    ic.moved && ic.moved.buildings + ic.moved.unitstacks > 0 && ic.turned.buildings + ic.turned.unitstacks === 0 && xc.turned && xc.turned.buildings === 1
      && /^⚓[^⚠]*\.$/.test(notePage(ic)) && /^⚓[^⚠]*\.$/.test(notePage(xc)), { ic, xc });
  const line = autoFixSummary({ ok: true, fixes: { inlandSeas: inlandAnswer, xCrossings: xcAnswer } });
  const moved = (ic.moved || {}).buildings + (ic.moved || {}).unitstacks, times = (s, part) => s.split(part).length - 1;
  rec(`⭐⭐⭐ the ${moved} rows it MOVED are said as moved, once, in the paint's own sentence — not as turned`,
    times(line, did(ic)) === 1 && new RegExp(`moved ${moved} to their own province's new shore`).test(line) && !/turned \d+ port\(s\)/.test(line), line);
  rec("⭐⭐ …and the X-crossing's turn in the same words, once", times(line, did(xc)) === 1, line);
  // what it would not turn stays under "Not finished", after what it did — each said once, in its own list
  const STRANDED = "1 port, coastal building or ship-in-port position now stands with no sea";
  const stranded = { ...ic, strandedTotal: 1, stranded: [{ type: "dockyard", x: 1, z: 1, province: 7, why: "no coast", file: "map/buildings.txt" }] };
  const line2 = autoFixSummary({ ok: true, fixes: { inlandSeas: { ...inlandAnswer, coastRows: stranded } } });
  const nf = line2.indexOf("⚠ Not finished:");
  rec("⭐ what it would not turn is still said under \"Not finished\", and what it did among the fixes — each once", nf > 0 && times(line2, did(ic)) === 1 && line2.indexOf(did(ic)) < nf
    && times(line2, STRANDED) === 1 && line2.indexOf(STRANDED) > nf, line2);
  // …as ONE item of that list, which carries its own ⚠ and full stop: as it stood, "⚠ Not finished: ⚠ 1 port … building editor.."
  const item = notePage(stranded, "left").replace(/^⚠ /, "").replace(/\.$/, "");
  rec("⭐ …as one item of that list: no ⚠ of its own after \"Not finished:\", and one full stop at its end",
    item.startsWith(STRANDED) && line2.includes(`⚠ Not finished: ${item}.`) && !line2.includes(".."), line2);
}

console.log("\n=== 14. Where a moved row stands, what a landlocked province's ship is, and what the keep leaves ===");
{
  // 40 x 20 px, rows top-down, all in memory (`img`); each case a scratch mod of its own
  const W = 40, H = 20, zc = (row) => H - 1 - row + 0.5;   // a pixel row's centre, as a row's z
  const PAL = { 1: [200, 10, 10], 2: [10, 10, 200], 3: [10, 200, 10], 4: [200, 200, 10] };
  const imgOf = (idAt) => { const rgb = Buffer.alloc(W * H * 3); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgb.set(PAL[idAt(x, y)], (y * W + x) * 3); return { width: W, height: H, rgb }; };
  const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-keep-harbours-14-"));
  sandboxes.push(ROOT);
  const mod = (name, types, files) => {
    const d = path.join(ROOT, name);
    fs.mkdirSync(path.join(d, "map"), { recursive: true });
    fs.writeFileSync(path.join(d, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat(Object.entries(types).map(([id, t]) => `${id};${PAL[id].join(";")};${t};true;${t === "sea" ? "ocean" : "plains"};${t === "sea" ? 0 : 1}`)).join("\n") + "\n");
    for (const [f, lines] of Object.entries(files)) fs.writeFileSync(path.join(d, "map", f), lines.join("\n") + "\n");
    return d;
  };
  const read = (d, f) => fs.readFileSync(path.join(d, "map", f), "utf8").split("\n").filter(Boolean);
  const pixelsOf = (before, after) => { const m = new Map(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (before(x, y) !== after(x, y)) m.set(y * W + x, before(x, y)); return m; };
  const at = (c) => [Math.floor(parseFloat(c[2])), H - 1 - Math.floor(parseFloat(c[4]))];   // a row's pixel
  // a province's coast pixels on a map: one with a 4-neighbour of the sea, x wrapping — coastPixelOf's own test
  const coastOf = (idAt, typeOf, p) => { const out = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (idAt(x, y) === p && [[(x + 1) % W, y], [(x - 1 + W) % W, y], [x, y - 1], [x, y + 1]].some(([a, b]) => b >= 0 && b < H && typeOf(idAt(a, b)) === "sea")) out.push([x, y]); return out; };

  // (a) the stroke fills an inlet; the HQ beside it loses every sea in reach, and the coast pixel nearest it is the pixel of a fort that
  //     keeps its sea. It goes BUILDING_RING_NEAR px off the fort, as the generator spaces its own coast rows (review E-R6: moved rows
  //     were kept apart only from each other, and 4 of 26 on the review's sweeps stood on another coast row's pixel)
  {
    const types = { 1: "land", 2: "sea", 4: "sea" }, tOf = (p) => types[p];
    const before = (x, y) => (x >= 20 && y < 10 ? 2 : x >= 14 && x <= 18 && y >= 12 && y <= 13 ? 4 : 1), after = (x, y) => (x >= 20 && y < 10 ? 2 : 1);
    const exB = { W, H, pidAt: before }, exA = { W, H, pidAt: after };
    const FORT = [20, 10], fort = `1;coastal_bunker;20.50;9.50;${zc(10).toFixed(2)};3.14;0`, hq = `1;naval_headquarters;16.50;9.50;${zc(14).toFixed(2)};3.14;0`;
    const coast = coastOf(after, tOf, 1), d2 = ([x, y]) => (x - 16) ** 2 + (y - 14) ** 2, cheb = ([x, y], [a, b]) => Math.max(Math.abs(x - a), Math.abs(y - b));
    const nearest = coast.reduce((b, c) => (d2(c) < d2(b) ? c : b)), offFort = coast.filter((c) => cheb(c, FORT) >= md.BUILDING_RING_NEAR).reduce((b, c) => (d2(c) < d2(b) ? c : b));
    rec("THE FIXTURE: the HQ loses every sea in reach; the fort keeps its sea and no rule turns it; the coast pixel nearest the HQ is the fort's",
      md.coastSeaInReach(exB, tOf, 16.5, zc(14)) && !md.coastSeaInReach(exA, tOf, 16.5, zc(14)) && md.coastSeaInReach(exA, tOf, 20.5, zc(10)) && nearest.join() === FORT.join()
        && md.coastFacing(exB, tOf, 20.5, zc(10)).toFixed(2) !== "3.14" && md.coastRowArmOnSea(exA, tOf, 20.5, zc(10), 3.14), { nearest, offFort });
    const d = mod("off-the-fort", types, { "buildings.txt": [fort, hq] });
    const r = md.keepCoastRowsFacingTheirSea({ modRoot: d, gameRoot: "", dependencyRoots: [], before: { pixels: pixelsOf(before, after) }, img: imgOf(after) });
    const [f1, h1] = read(d, "buildings.txt").map((l) => l.split(";"));
    rec(`⭐⭐ the HQ goes to the coast pixel nearest it ${md.BUILDING_RING_NEAR} px off the fort (${offFort}), not onto the fort's (${FORT}), and faces the sea there; the fort is byte-identical`,
      r.moved.buildings === 1 && at(h1).join() === offFort.join() && h1[5] === (md.coastFacing(exA, tOf, parseFloat(h1[2]), parseFloat(h1[4])) || 0).toFixed(2) && f1.join(";") === fort, { hq: h1.join(";"), fort: f1.join(";") });
  }
  // (a2) …but a row that MOVES leaves the place it stood: the stroke fills the sea beside an HQ whose nearest coast pixel is 2 px from it
  //      diagonally — the HQ goes there, not kept off its own old place as if a row still stood on it
  {
    const types = { 1: "land", 2: "sea" }, tOf = (p) => types[p];
    const sea = (x, y) => (x >= 13 && y >= 12) || (x >= 12 && y >= 13);
    const before = (x, y) => (sea(x, y) || (x >= 11 && x <= 12 && y >= 10 && y <= 11) ? 2 : 1), after = (x, y) => (sea(x, y) ? 2 : 1);
    const hq = `1;naval_headquarters;10.50;9.50;${zc(10).toFixed(2)};0.00;0`, d2 = ([x, y]) => (x - 10) ** 2 + (y - 10) ** 2;
    const nearest = coastOf(after, tOf, 1).reduce((b, c) => (d2(c) < d2(b) ? c : b));
    rec("THE FIXTURE: the HQ loses every sea in reach, and the coast pixel nearest it lies within BUILDING_RING_NEAR px of where it stood",
      md.coastSeaInReach({ W, H, pidAt: before }, tOf, 10.5, zc(10)) && !md.coastSeaInReach({ W, H, pidAt: after }, tOf, 10.5, zc(10)) && Math.max(Math.abs(nearest[0] - 10), Math.abs(nearest[1] - 10)) < md.BUILDING_RING_NEAR, { nearest });
    const d = mod("leaves-its-place", types, { "buildings.txt": [hq] });
    const r = md.keepCoastRowsFacingTheirSea({ modRoot: d, gameRoot: "", dependencyRoots: [], before: { pixels: pixelsOf(before, after) }, img: imgOf(after) });
    const h1 = read(d, "buildings.txt")[0].split(";");
    rec(`⭐ the HQ goes to the coast pixel nearest it (${nearest}): the rows a moved row keeps off are those that stay, not the place it left`, r.moved.buildings === 1 && at(h1).join() === nearest.join(), h1.join(";"));
  }
  // (b) the Type dropdown makes the sea 2 land, and province 3 — land on three sides, the sea on its east — has no sea left anywhere.
  //     Its fort and its ship-in-port row (19) have no coast to go to, and its ship (20), which floated on 2, stands on land. A fleet lies
  //     in port only at a naval base, which a province with no sea has none of (its port faced 2 and went with it): the ship is said WITH
  //     its 19, a position with no sea of its province beside it — review E-R7: on sea 8282 the page said 13 ships "on land", 12 of them
  //     of provinces it left landlocked, in a sentence of fleets drawn on land
  {
    const typesNow = { 1: "land", 2: "land", 3: "land" }, tNow = (p) => typesNow[p], tWas = (p) => (p === 2 ? "sea" : tNow(p));
    const map = (x, y) => (x >= 20 ? 2 : x >= 16 && y >= 8 && y <= 11 ? 3 : 1);
    const u = [`3;19;19.50;9.80;${zc(9).toFixed(2)};1.57;0.20`, `3;20;${(19.5 + STEP).toFixed(2)};9.80;${zc(9).toFixed(2)};1.57;0.20`];
    const fortRow = `5;coastal_bunker;19.50;9.50;${zc(10).toFixed(2)};1.57;0`;
    const ex = { W, H, pidAt: map };
    rec("THE FIXTURE: province 3's rows had the sea in reach and it has no coast after; its ship floated and stands on land",
      md.coastSeaInReach(ex, tWas, 19.5, zc(9)) && coastOf(map, tNow, 3).length === 0 && tWas(map(Math.floor(19.5 + STEP), 9)) === "sea" && tNow(map(Math.floor(19.5 + STEP), 9)) === "land");
    const d = mod("landlocked", typesNow, { "buildings.txt": [fortRow], "unitstacks.txt": u });
    const r = md.keepCoastRowsFacingTheirSea({ modRoot: d, gameRoot: "", dependencyRoots: [], before: { typeOf: (p) => (p === 2 ? "sea" : undefined) }, img: imgOf(map) });
    const ship = (r.stranded || []).find((s) => s.type === "20");
    rec("⭐⭐ the ship of the province the edit landlocked is said with its 19 — no coast of its own province — and not as a ship on land",
      r.strandedTotal === 3 && r.shipsOnLand === 0 && !!ship && ship.why === "no coast" && r.stranded.every((s) => s.why === "no coast" && s.province === 3), r.stranded);
    const t = notePage(r);
    rec("⭐ …so the page says the three in its one line of rows with no sea, naming the province, and of no fleet on land",
      /⚠ 3 port, coastal building or ship-in-port positions now stand with no sea of their own province beside them \(province 3\)/.test(t) && !/ships? in port now stands? on the land/.test(t), t);
    rec("…and every byte is kept", read(d, "unitstacks.txt").join("\n") === u.join("\n") && read(d, "buildings.txt").join("\n") === fortRow);
  }
  // (c) a stroke paints land over the one pixel the ship (20) floats on. Its 19 keeps its water side on the sea and a sea in reach, at a
  //     rotation no rule gave it: no rule moves the 19, and the ship is laid off it, STEP px out along the 19's water side (review E-R8:
  //     the branch that lays it there turned no test red when it was taken out)
  {
    const types = { 1: "land", 2: "sea" }, tOf = (p) => types[p];
    const before = (x) => (x < 20 ? 1 : 2), after = (x, y) => (x < 20 || (x === 21 && y === 9) ? 1 : 2);
    const z19 = zc(10), r19 = 1.40, r20 = 2.00, d20 = r20 - Math.PI / 2, x20 = 19.5 + STEP * Math.cos(d20), z20 = z19 + STEP * Math.sin(d20);
    const dL = r19 - Math.PI / 2, lx = 19.5 + STEP * Math.cos(dL), lz = z19 + STEP * Math.sin(dL);
    const u19 = `1;19;19.50;9.80;${z19.toFixed(2)};${r19.toFixed(2)};0.20`, u20 = `1;20;${x20.toFixed(2)};9.80;${z20.toFixed(2)};${r20.toFixed(2)};0.20`;
    const exB = { W, H, pidAt: (x) => before(x) }, exA = { W, H, pidAt: after };
    rec("THE FIXTURE: the ship floated and stands on the painted pixel; the 19 keeps its water side on the sea and a sea in reach, at no rule's rotation; off its water side a ship floats",
      before(Math.floor(x20)) === 2 && after(Math.floor(x20), H - 1 - Math.floor(z20)) === 1 && md.coastRowArmOnSea(exB, tOf, 19.5, z19, r19) && md.coastRowArmOnSea(exA, tOf, 19.5, z19, r19)
        && md.coastSeaInReach(exA, tOf, 19.5, z19) && md.coastFacing(exB, tOf, 19.5, z19).toFixed(2) !== r19.toFixed(2) && after(Math.floor(lx), H - 1 - Math.floor(lz)) === 2, { x20, z20, lx, lz });
    const d = mod("laid-off", types, { "unitstacks.txt": [u19, u20] });
    const r = md.keepCoastRowsFacingTheirSea({ modRoot: d, gameRoot: "", dependencyRoots: [], before: { pixels: pixelsOf((x) => before(x), after) }, img: imgOf(after) });
    const [a, b] = read(d, "unitstacks.txt");
    rec("⭐⭐ the ship is laid off its unchanged 19, STEP px out along the 19's water side at the 19's rotation, on the sea; the 19 is byte-identical",
      a === u19 && b === `1;20;${lx.toFixed(2)};9.80;${lz.toFixed(2)};${r19.toFixed(2)};0.20` && r.ships === 1 && !r.turned.unitstacks && !r.moved.unitstacks && !r.strandedTotal, { a, b, r });
  }
  // (d) a floating harbour the stroke put on land is said; one that stood on land BEFORE it — the base game floats 98.9% of them, not
  //     all — is no news of this edit, and is not said (review E-R8: saying every floating harbour on land turned no test red)
  {
    const types = { 1: "land", 2: "sea" };
    const before = (x, y) => (x < 20 || (x === 22 && y === 9) ? 1 : 2), after = (x, y) => (x < 20 || (y === 9 && x >= 21 && x <= 23) ? 1 : 2);
    const fh = (x) => `1;floating_harbor;${x.toFixed(2)};9.50;${zc(9).toFixed(2)};0.00;1`;
    rec("THE FIXTURE: the stroke's box holds both — one on a pixel it painted land, one on a pixel that was land before it",
      before(21, 9) === 2 && after(21, 9) === 1 && before(22, 9) === 1 && after(22, 9) === 1 && pixelsOf(before, after).size === 2);
    const d = mod("ashore", types, { "buildings.txt": [fh(21.5), fh(22.5)] });
    const r = md.keepCoastRowsFacingTheirSea({ modRoot: d, gameRoot: "", dependencyRoots: [], before: { pixels: pixelsOf(before, after) }, img: imgOf(after) });
    rec("⭐⭐ the floating harbour the stroke put on land is said, the one already ashore is not; both are kept",
      r.harboursOnLand.length === 1 && r.harboursOnLand[0].x === 21 && read(d, "buildings.txt").join("\n") === [fh(21.5), fh(22.5)].join("\n"), r.harboursOnLand);
  }
  // (e) the mod owns map/unitstacks.txt and inherits map/buildings.txt (session-2 review, R3). The stroke takes every sea in reach from a
  //     port and from the ship-in-port row (19) standing at it. Owned, the port moves to the new shore and its 19 goes with it; inherited,
  //     the port is said and not written, so it leads nothing: its 19 is moved as a row of its own, not to where the port would have gone
  //     and does not stand
  {
    const types = { 1: "land", 2: "sea" }, tOf = (p) => types[p];
    const before = (x) => (x < 20 ? 1 : 2), after = (x, y) => (x < 20 || (x <= 23 && y >= 6 && y <= 14) ? 1 : 2);
    const port = `1;naval_base_spawn;19.50;9.50;${zc(10).toFixed(2)};1.57;2`, u19 = `1;19;19.50;9.80;${zc(10).toFixed(2)};1.57;0.20`;
    const run = (name, inherited) => {
      const d = mod(name, types, inherited ? { "unitstacks.txt": [u19] } : { "buildings.txt": [port], "unitstacks.txt": [u19] });
      const g = path.join(ROOT, name + "-game");
      fs.mkdirSync(path.join(g, "map"), { recursive: true });
      if (inherited) fs.writeFileSync(path.join(g, "map", "buildings.txt"), port + "\n");
      return { d, g, r: md.keepCoastRowsFacingTheirSea({ modRoot: d, gameRoot: g, dependencyRoots: [], before: { pixels: pixelsOf((x) => before(x), after) }, img: imgOf(after) }) };
    };
    const owned = run("port-owned", false), inh = run("port-inherited", true);
    const p = read(owned.d, "buildings.txt")[0].split(";"), o19 = read(owned.d, "unitstacks.txt")[0].split(";"), i19 = read(inh.d, "unitstacks.txt")[0].split(";");
    rec("THE FIXTURE: owned, the port is moved and its 19 goes with it — to the place the inherited port would go to", p[2] !== "19.50" && o19[2] === p[2] && o19[4] === p[4] && owned.r.moved.buildings === 1, { p, o19 });
    rec("⭐⭐ inherited, the port is said and not written, and its 19 is moved as a row of its own — on its province's coast, facing the sea, NOT where the unwritten port would have gone",
      fs.readFileSync(path.join(inh.g, "map", "buildings.txt"), "utf8") === port + "\n" && !fs.existsSync(path.join(inh.d, "map", "buildings.txt")) && inh.r.leftInherited.length === 1 && inh.r.leftInherited[0].rows === 1
        && inh.r.moved.unitstacks === 1 && !(i19[2] === p[2] && i19[4] === p[4]) && coastOf(after, tOf, 1).some((c) => c.join() === at(i19).join())
        && i19[5] === (md.coastFacing({ W, H, pidAt: after }, tOf, parseFloat(i19[2]), parseFloat(i19[4])) || 0).toFixed(2), { p: p.join(";"), i19: i19.join(";"), left: inh.r.leftInherited });
  }
  // (f) as (c), but the ship lies along its 19's OWN water side, so laid off the unchanged 19 it would stand on the very pixel the stroke
  //     painted: it is SAID — a ship in port on the land the edit made, its province named, not a row with no sea — and kept. (Section 3
  //     grounded one until review E-R10: its 19 was turned toward a sea its water side could not reach)
  {
    const types = { 1: "land", 2: "sea" }, tOf = (p) => types[p];
    const before = (x) => (x < 20 ? 1 : 2), after = (x, y) => (x < 20 || (x === 21 && y === 9) ? 1 : 2);
    const z19 = zc(9), r19 = 1.40, d19 = r19 - Math.PI / 2, x20 = 19.5 + STEP * Math.cos(d19), z20 = z19 + STEP * Math.sin(d19);
    const u19 = `1;19;19.50;9.80;${z19.toFixed(2)};${r19.toFixed(2)};0.20`, u20 = `1;20;${x20.toFixed(2)};9.80;${z20.toFixed(2)};${r19.toFixed(2)};0.20`;
    const exB = { W, H, pidAt: (x) => before(x) }, exA = { W, H, pidAt: after };
    rec("THE FIXTURE: the ship floated and stands on the painted pixel, which is where its 19's water side lays it; the 19 keeps its water side on the sea, at no rule's rotation",
      before(Math.floor(x20)) === 2 && after(Math.floor(x20), H - 1 - Math.floor(z20)) === 1 && md.coastRowArmOnSea(exB, tOf, 19.5, z19, r19) && md.coastRowArmOnSea(exA, tOf, 19.5, z19, r19)
        && md.coastSeaInReach(exA, tOf, 19.5, z19) && md.coastFacing(exB, tOf, 19.5, z19).toFixed(2) !== r19.toFixed(2), { x20, z20 });
    const d = mod("grounded", types, { "unitstacks.txt": [u19, u20] });
    const r = md.keepCoastRowsFacingTheirSea({ modRoot: d, gameRoot: "", dependencyRoots: [], before: { pixels: pixelsOf((x) => before(x), after) }, img: imgOf(after) });
    rec("⭐⭐ the ship is said as a ship on land, counted apart from the rows with no sea, and both rows are kept byte for byte",
      r.strandedTotal === 1 && r.shipsOnLand === 1 && r.stranded[0].why === "ship on land" && r.stranded[0].province === 1 && !r.ships && read(d, "unitstacks.txt").join("\n") === [u19, u20].join("\n"), r);
    const t = notePage(r);
    rec("⭐ …and the page says it as a ship in port on the new land, naming the province — not as a position with no sea, not as laid",
      /⚠ 1 ship in port now stands on the land the edit made \(province 1\)/.test(t) && !/port, coastal building or ship-in-port position/.test(t) && !/laid \d+ ship/.test(t), t);
  }
}

console.log("\n=== 15. A paint of the SEA over land: Nova's turn beside it faces the new sea, a row it drowned is left ===");
{
  // the islet of section 3. The stroke paints the south sea over a 3 x 4 px block of the islet east of Nova's fort on its south shore:
  // the fort's answer moves (rule 1 — a pixel that went from land to sea tells the keep as much as one that went the other way; review
  // E-R8: told only of sea made land, the keep turned no test red). A dockyard standing IN the block is on the sea after: a row on a
  // province that is not land is the paint's own warning's (#a-paint-says-which-buildings-it-put-in-the-water), never turned (session-2 R4)
  const Wd = makeRegionWorld("keep-harbours-sea-paint");
  sandboxes.push(Wd.ROOT);
  const ISLET = Wd.PROV.islet, SOUTH = Wd.idAt(8, 2), st = stateOf(Wd, ISLET);
  const { x0, x1, y1 } = isletPx(Wd), mid = (x0 + x1 + 1) / 2;
  const colourOf = (id) => [(id * 37) % 256, (id * 91) % 256, 40 + (id % 200)];
  const [r, g, bl] = colourOf(SOUTH);
  const inBlock = (x, y) => x >= mid + 1 && x <= mid + 3 && y >= y1 - 3 && y <= y1;
  const diff = [];
  for (let y = y1 - 3; y <= y1; y++) for (let x = mid + 1; x <= mid + 3; x++) diff.push({ x, y, r, g, b: bl });
  const before = cellMap(Wd);
  const afterM = { ex: { W: 512, H: 256, pidAt: (x, y) => (inBlock(x, y) ? SOUTH : before.ex.pidAt(x, y)) }, typeOf: before.typeOf };
  const F = (m, x, y) => md.coastFacing(m.ex, m.typeOf, x, z(y));
  const fort = bRow(st, "coastal_bunker", mid, y1, F(before, mid, y1)), yard = bRow(st, "dockyard", mid + 2, y1 - 1, F(before, mid + 2, y1 - 1));
  const bFile = path.join(Wd.MOD, "map", "buildings.txt");
  fs.writeFileSync(bFile, [fort, yard].join("\n") + "\n");
  const fNow = F(afterM, mid, y1), yNow = F(afterM, mid + 2, y1 - 1);
  rec("THE FIXTURE: the fort's answer moves with the block; the dockyard stands in it, on the sea after, where its own answer moves too (so a keep that judged it would turn it)",
    fNow != null && fNow.toFixed(2) !== F(before, mid, y1).toFixed(2) && before.typeOf(before.ex.pidAt(mid + 2, y1 - 1)) === "land" && afterM.ex.pidAt(mid + 2, y1 - 1) === SOUTH
      && yNow != null && yNow.toFixed(2) !== F(before, mid + 2, y1 - 1).toFixed(2), { fort: [F(before, mid, y1), fNow], yard: [F(before, mid + 2, y1 - 1), yNow] });
  const res = md.applyProvinceDiff({ modRoot: Wd.MOD, gameRoot: Wd.GAME, dependencyRoots: [], diff });
  const cr = res.coastRows || {};
  const b1 = fs.readFileSync(bFile, "utf8").split("\n");
  rec("the paint wrote, and kept the harbours", res.ok && !cr.error, cr.error || res.error);
  rec(`⭐⭐ Nova's fort faces the sea the stroke made beside it (${fNow == null ? "?" : fNow.toFixed(2)})`, fNow != null && b1[0] === fort.replace(/;[^;]*;0$/, `;${fNow.toFixed(2)};0`) && cr.turned && cr.turned.buildings === 1, b1[0]);
  rec("⭐⭐ the dockyard the stroke drowned is left byte for byte — a row on the sea is the paint's warning's (which names it), not the keep's",
    b1[1] === yard && !(cr.moved && cr.moved.buildings) && (res.warnings || []).some((w) => /standing on water \(e\.g\. a dockyard/.test(w)), { b1, warnings: res.warnings });
}

console.log("\n=== 16. An edit turns a row ONTO the sea, not toward it: a stroke that leaves sea on both its flanks ===");
{
  // 40 x 20 px, rows top-down: land 1 west of x 20, the sea 2 east of it; each stroke paints land 1 over the sea. coastFacing turns a
  // row to the centroid of the sea in its reach, and a stroke that leaves sea on BOTH flanks of a row puts that centroid on the land
  // between them. Review E-R10, 48 strokes in front of base-game ports: 41 of the 55 rows the keep turned kept their water side on the
  // land, 6 of them on less sea than had they been left alone. Every count here is coastRowArmSeaPoints' (the six points
  // coastRowArmOnSea reads); `most` is the most any rotation gets, read 1,440 times round, and `best` the most any of the 72 rotations
  // 5° apart gets, written to 2 decimals as Nova writes a rotation — the ones the keep chooses among
  const W = 40, H = 20, zc = (row) => H - 1 - row + 0.5;
  const PAL = { 1: [200, 10, 10], 2: [10, 10, 200] }, types = { 1: "land", 2: "sea" }, tOf = (p) => types[p];
  const pts = (ex, x, zz, rot) => md.coastRowArmSeaPoints({ W, H, pidAt: ex }, tOf, x, zz, rot);
  const most = (ex, x, zz) => { let m = 0; for (let i = 1; i <= 1440; i++) m = Math.max(m, pts(ex, x, zz, -Math.PI + (i * Math.PI) / 720)); return m; };
  const best = (ex, x, zz) => { let m = 0; for (let i = 1; i <= 72; i++) m = Math.max(m, pts(ex, x, zz, Math.round((-Math.PI + (i * Math.PI) / 36) * 100) / 100)); return m; };
  const F = (ex, x, zz) => md.coastFacing({ W, H, pidAt: ex }, tOf, x, zz);
  const FIVE = Math.PI / 36;
  const open = (x) => (x < 20 ? 1 : 2);
  // a pure pass with an edit's options (as section 1's); coastPixel records what it is asked and answers `to`
  const asked = [];
  const pass = (lines, before, after, to = { why: "no coast" }) => {
    asked.length = 0;
    return md.returnCoastRowsToTheirSea(lines.join("\n"), { W, H, pidAt: after, pidBefore: before }, tOf, tOf, { armLeftTheSea: true, typeNow: tOf,
      ownerOf: (c, x, zz) => after(Math.floor(x), H - 1 - Math.floor(zz)), coastPixel: (c, x, zz, owner) => { asked.push(owner); return to; } });
  };
  const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-keep-harbours-16-"));
  sandboxes.push(ROOT);
  const imgOf = (idAt) => { const rgb = Buffer.alloc(W * H * 3); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgb.set(PAL[idAt(x, y)], (y * W + x) * 3); return { width: W, height: H, rgb }; };
  const pixelsOf = (before, after) => { const m = new Map(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (before(x, y) !== after(x, y)) m.set(y * W + x, before(x, y)); return m; };
  const mod = (name, files) => {
    const d = path.join(ROOT, name);
    fs.mkdirSync(path.join(d, "map"), { recursive: true });
    fs.writeFileSync(path.join(d, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat(Object.entries(types).map(([id, t]) => `${id};${PAL[id].join(";")};${t};true;${t === "sea" ? "ocean" : "plains"};${t === "sea" ? 0 : 1}`)).join("\n") + "\n");
    for (const [f, lines] of Object.entries(files)) fs.writeFileSync(path.join(d, "map", f), lines.join("\n") + "\n");
    return d;
  };
  const read = (d, f) => fs.readFileSync(path.join(d, "map", f), "utf8").split("\n").filter(Boolean);

  // (a) THE REVIEW'S CASE, through the keep: a 2-row tongue of land 4 px out in front of a base-game port, its own rotation 2.00; the
  //     sea is left north (row 8) and south (row 11) of the tongue. Its ship-in-port row (19) stands at it, the ship (20) off it
  {
    const after = (x, y) => (x < 20 || (x <= 23 && y >= 9 && y <= 10) ? 1 : 2);
    const X = 19.5, Z = zc(10), R = 2.0, d20 = R - Math.PI / 2;
    const port = `1;naval_base_spawn;${X.toFixed(2)};9.50;${Z.toFixed(2)};${R.toFixed(2)};2`;
    const u19 = `1;19;${X.toFixed(2)};9.80;${Z.toFixed(2)};${R.toFixed(2)};0.20`, u20 = `1;20;${(X + STEP * Math.cos(d20)).toFixed(2)};9.80;${(Z + STEP * Math.sin(d20)).toFixed(2)};${R.toFixed(2)};0.20`;
    const north = (x, y) => (y <= 8 && x >= 20 ? 2 : 1), south = (x, y) => (y >= 11 && x >= 20 ? 2 : 1);
    rec("THE FIXTURE: the port's water side was on the sea and is on the tongue after; sea is left in its reach on both flanks, and coastFacing's answer puts the water side on the land between them while some rotation puts it on the sea",
      pts(open, X, Z, R) >= 3 && pts(after, X, Z, R) < 3 && md.coastSeaInReach({ W, H, pidAt: north }, tOf, X, Z) && md.coastSeaInReach({ W, H, pidAt: south }, tOf, X, Z)
        && F(after, X, Z) != null && pts(after, X, Z, F(after, X, Z)) < 3 && most(after, X, Z) >= 3, { now: F(after, X, Z), own: pts(after, X, Z, R), now_: pts(after, X, Z, F(after, X, Z)), most: most(after, X, Z) });
    const d = mod("two-flanks", { "buildings.txt": [port], "unitstacks.txt": [u19, u20] });
    const r = md.keepCoastRowsFacingTheirSea({ modRoot: d, gameRoot: "", dependencyRoots: [], before: { pixels: pixelsOf(open, after) }, img: imgOf(after) });
    const p = read(d, "buildings.txt")[0].split(";"), [a, b] = read(d, "unitstacks.txt").map((l) => l.split(";")), rot = parseFloat(p[5]);
    rec(`⭐⭐⭐ the port is turned where it stands with its water side ON the sea: ${pts(after, X, Z, rot)} of the six points, the most any rotation Nova writes puts there — column 7 kept`,
      p[2] === X.toFixed(2) && p[4] === Z.toFixed(2) && p[6] === "2" && pts(after, X, Z, rot) >= 3 && pts(after, X, Z, rot) === best(after, X, Z), p.join(";"));
    rec("⭐ …at the middle of the rotations that do so, not at their edge: 5° either side puts as many points on the sea",
      pts(after, X, Z, rot - FIVE) === pts(after, X, Z, rot) && pts(after, X, Z, rot + FIVE) === pts(after, X, Z, rot), [pts(after, X, Z, rot - FIVE), pts(after, X, Z, rot), pts(after, X, Z, rot + FIVE)]);
    rec("⭐⭐ its 19 takes the port's rotation where it stands, and its ship floats again", a[5] === p[5] && a[2] === X.toFixed(2) && after(Math.floor(parseFloat(b[2])), H - 1 - Math.floor(parseFloat(b[4]))) === 2, [a.join(";"), b.join(";")]);
    rec("it says what it did: two turned, the ship laid, nothing left", r.turned.buildings === 1 && r.turned.unitstacks === 1 && r.ships === 1 && !r.moved.buildings && !r.strandedTotal, r);
  }
  // (b) a 3-row tongue with the row in its middle: the sea is left as much north as south, so coastFacing's answer is the row's own
  //     rotation before the stroke and after it — and it faces the tongue. Asked only when the answer DIFFERS from the rotation, the
  //     keep left it so
  {
    const after = (x, y) => (x < 20 || (x <= 23 && y >= 9 && y <= 11) ? 1 : 2);
    const X = 19.5, Z = zc(10), R = Math.PI / 2, dock = `1;dockyard;${X.toFixed(2)};9.50;${Z.toFixed(2)};${R.toFixed(2)};0`;
    rec("THE FIXTURE: coastFacing's answer is the dockyard's rotation before and after, its water side on the sea before and on the tongue after, and some rotation puts it on the sea",
      F(open, X, Z).toFixed(2) === R.toFixed(2) && F(after, X, Z).toFixed(2) === R.toFixed(2) && pts(open, X, Z, R) >= 3 && pts(after, X, Z, R) < 3 && most(after, X, Z) >= 3);
    const r = pass([dock], open, after), rot = parseFloat(r.text.split(";")[5]);
    rec("⭐⭐ it is turned onto the sea that is left — the most points any rotation Nova writes puts there", r.turned.length === 1 && pts(after, X, Z, rot) === best(after, X, Z) && pts(after, X, Z, rot) >= 3 && !asked.length, r.text);
  }
  // (c) rule 1: Nova's own turn on the 2-row tongue of (a). coastFacing's new answer differs from its old one — and puts the water side
  //     on the tongue
  {
    const after = (x, y) => (x < 20 || (x <= 23 && y >= 9 && y <= 10) ? 1 : 2);
    const X = 19.5, Z = zc(10), was = F(open, X, Z), now = F(after, X, Z), fort = `1;coastal_bunker;${X.toFixed(2)};9.50;${Z.toFixed(2)};${was.toFixed(2)};0`;
    rec("THE FIXTURE: Nova's turn is coastFacing's answer before; the answer after differs and puts the water side on the land", now != null && now !== was && pts(open, X, Z, was) >= 3 && pts(after, X, Z, now) < 3 && most(after, X, Z) >= 3, { was, now });
    const r = pass([fort], open, after), rot = parseFloat(r.text.split(";")[5]);
    rec("⭐⭐ Nova's turn goes onto the sea, not to the new answer", r.turned.length === 1 && r.turned[0].why === "nova" && rot.toFixed(2) !== now.toFixed(2) && pts(after, X, Z, rot) >= 3 && pts(after, X, Z, rot) === best(after, X, Z), r.text);
  }
  // (d) a row the stroke leaves too little sea to face: an HQ 2 px off the west sea, its water side south onto the sea the stroke
  //     makes land. No rotation reaches half its points on the sea that is left in its reach, so it goes to its province's new shore
  //     as a row the stroke left no sea would (section 3 turned this one toward that sea until review E-R10)
  {
    const before = (x, y) => (x >= 10 && x <= 29 && y <= 10 ? 1 : 2), after = (x, y) => (x >= 10 && x <= 29 && y <= 14 ? 1 : 2);
    const X = 12, Z = H - 1 - 10, hq = `1;naval_headquarters;${X.toFixed(2)};9.50;${Z.toFixed(2)};0.00;0`;
    const shore = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (after(x, y) === 1 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => y + dy >= 0 && y + dy < H && after(x + dx, y + dy) === 2)) shore.push([x, y]);
    const near = shore.reduce((q, s) => (Math.hypot(s[0] - X, s[1] - 10) < Math.hypot(q[0] - X, q[1] - 10) ? s : q));
    rec("THE FIXTURE: the HQ's water side was on the sea; after the stroke the sea is in its reach, but no rotation puts half its points on it",
      pts(before, X, Z, 0) >= 3 && md.coastSeaInReach({ W, H, pidAt: after }, tOf, X, Z) && most(after, X, Z) < 3, { most: most(after, X, Z), near });
    const d = mod("too-little-sea", { "buildings.txt": [hq] });
    const r = md.keepCoastRowsFacingTheirSea({ modRoot: d, gameRoot: "", dependencyRoots: [], before: { pixels: pixelsOf(before, after) }, img: imgOf(after) });
    const h = read(d, "buildings.txt")[0].split(";");
    rec(`⭐⭐ it goes to its province's coast pixel nearest it (${near}) and faces the sea there — not turned toward a sea it cannot reach`,
      r.moved.buildings === 1 && !r.turned.buildings && Math.floor(parseFloat(h[2])) === near[0] && H - 1 - Math.floor(parseFloat(h[4])) === near[1] && md.coastRowArmOnSea({ W, H, pidAt: after }, tOf, parseFloat(h[2]), parseFloat(h[4]), parseFloat(h[5])), h.join(";"));
  }
  // (e) …and wherever a row is moved to, it is turned onto the sea there: the coast pixel coastPixel names stands on the 2-row tongue,
  //     where coastFacing's answer runs its water side along the tongue (2 of 33 moved rows on the review's sweep)
  {
    const before = (x) => (x < 17 ? 1 : 2), after = (x, y) => (x < 20 || (x <= 23 && y >= 9 && y <= 10) ? 1 : 2);
    const fort = `1;coastal_bunker;16.50;9.50;${zc(15).toFixed(2)};${Math.PI.toFixed(2)};0`, TX = 21, TROW = 9, TZ = H - 1 - TROW;
    rec("THE FIXTURE: the fort loses every sea in reach; at the pixel it goes to, coastFacing's answer puts the water side on land and some rotation on the sea",
      md.coastSeaInReach({ W, H, pidAt: (x) => before(x) }, tOf, 16.5, zc(15)) && !md.coastSeaInReach({ W, H, pidAt: after }, tOf, 16.5, zc(15)) && pts(after, TX, TZ, F(after, TX, TZ)) < 3 && most(after, TX, TZ) >= 3);
    const r = pass([fort], (x) => before(x), after, { x: TX, row: TROW }), c = r.text.split(";");
    rec("⭐⭐ moved where coastPixel says, and turned onto the sea there", r.moved.length === 1 && c[2] === TX.toFixed(2) && c[4] === TZ.toFixed(2) && pts(after, TX, TZ, parseFloat(c[5])) >= 3 && pts(after, TX, TZ, parseFloat(c[5])) === best(after, TX, TZ), r.text);
  }
  // (f) which rotation, of those that put the most points on the sea: the middle of the WIDEST run of them — the sea south-east of the
  //     row is open, a one-row channel runs east-north-east — even with the hint pointing at the narrow one
  {
    const m = (x, y) => (x >= 20 && (y >= 12 || y === 8) ? 2 : 1), X = 19.5, Z = zc(10), HINT = 2.5;
    const rots = Array.from({ length: 72 }, (_, i) => Math.round((-Math.PI + ((i + 1) * Math.PI) / 36) * 100) / 100), k = rots.map((a) => pts(m, X, Z, a)), top = Math.max(...k);
    const runs = []; { const s0 = k.findIndex((v) => v !== top); let cur = null; for (let j = 1; j <= 72; j++) { const i = (s0 + j) % 72; if (k[i] === top) { if (cur) cur.push(i); else cur = [i]; } else if (cur) { runs.push(cur); cur = null; } } }
    const gap = (a) => Math.abs(Math.atan2(Math.sin(a - HINT), Math.cos(a - HINT))), mid = (run) => rots[run[(run.length - 1) >> 1]];
    const wide = runs.reduce((q, s) => (s.length > q.length ? s : q)), narrow = runs.find((s) => s !== wide);
    rec("THE FIXTURE: two runs of rotations put the most points on the sea, of different widths, the narrower nearer the hint",
      top >= 3 && runs.length === 2 && narrow && narrow.length < wide.length && gap(mid(narrow)) < gap(mid(wide)), runs.map((s) => [s.length, mid(s)]));
    rec(`⭐ coastArmFacing takes the middle of the wider (${mid(wide)})`, md.coastArmFacing({ W, H, pidAt: m }, tOf, X, Z, HINT) === mid(wide), md.coastArmFacing({ W, H, pidAt: m }, tOf, X, Z, HINT));
  }
  // (g) a Nova turn the stroke would move onto land, whose own rotation still puts its water side on the sea — the stroke covers land
  //     north-east and south-east of it and leaves the channel it faces — is left as it is, and not said as turned
  {
    const after = (x, y) => (x < 20 || (x <= 21 && y >= 5 && y <= 9) || (x <= 22 && y === 11) ? 1 : 2);
    const X = 19.5, Z = zc(10), was = F(open, X, Z), now = F(after, X, Z), fort = `1;coastal_bunker;${X.toFixed(2)};9.50;${Z.toFixed(2)};${was.toFixed(2)};0`;
    rec("THE FIXTURE: coastFacing's answer moves, onto the land; Nova's turn still puts as many points on the sea as any rotation Nova writes", now !== was && pts(after, X, Z, now) < 3 && pts(after, X, Z, was) === best(after, X, Z), { was, now });
    const r = pass([fort], open, after);
    rec("⭐ it is byte-identical, and not counted as turned", r.text === fort && !r.turned.length && !r.moved.length, r);
  }
  // (h) …but a Nova turn whose water side never was on the sea — it faces a one-pixel channel 2 px off — keeps tracking coastFacing's
  //     answer when no rotation reaches the sea: the edit did not take a sea it faced, so it is not moved
  {
    const before = (x) => (x === 22 ? 2 : 1), after = (x, y) => (x === 22 && y !== 9 ? 2 : 1);
    const X = 20, Z = 9.5, was = F((x) => before(x), X, Z), now = F(after, X, Z), fort = `1;coastal_bunker;${X.toFixed(2)};9.50;${Z.toFixed(2)};${was.toFixed(2)};0`;
    rec("THE FIXTURE: the answer moves; no rotation puts half the points on the sea, before the stroke or after", now != null && now !== was && most((x) => before(x), X, Z) < 3 && most(after, X, Z) < 3, { was, now });
    const r = pass([fort], (x) => before(x), after, { x: 0, row: 0 });
    rec("⭐ it is turned to coastFacing's new answer where it stands, not moved", r.text === fort.replace(/;[^;]*;0$/, `;${now.toFixed(2)};0`) && r.turned.length === 1 && !r.moved.length && !asked.length, r.text);
  }
  // (i) the stroke leaves one pixel of sea, a pocket, in front of a fort on the pixel beside it: no rotation puts half its water side
  //     there, and the coast pixel nearest it is its own. It goes to a coast where its water side can stand on the sea — not "moved"
  //     onto its own place, still facing the land, as 3 of 51 rows moved on E-R10's sweep were
  {
    const pocket = (x, y) => x === 20 && y === 10;
    const after = (x, y) => (x < 20 || (x <= 25 && y >= 5 && y <= 15 && !pocket(x, y)) ? 1 : 2);
    const X = 19, Z = H - 1 - 10, fort = `1;coastal_bunker;${X.toFixed(2)};9.50;${Z.toFixed(2)};${(Math.PI / 2).toFixed(2)};0`;
    const shore = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (after(x, y) === 1 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => y + dy >= 0 && y + dy < H && after(x + dx, y + dy) === 2)) shore.push([x, y]);
    const near = shore.reduce((q, s) => (Math.hypot(s[0] - X, s[1] - 10) < Math.hypot(q[0] - X, q[1] - 10) ? s : q));
    rec("THE FIXTURE: the fort's water side was on the sea; after the stroke no rotation puts half of it on the pocket, and the coast pixel nearest it is its own",
      pts(open, X, Z, Math.PI / 2) >= 3 && most(after, X, Z) < 3 && near.join() === `${X},10`, { most: most(after, X, Z), near });
    const d = mod("pocket", { "buildings.txt": [fort] });
    const r = md.keepCoastRowsFacingTheirSea({ modRoot: d, gameRoot: "", dependencyRoots: [], before: { pixels: pixelsOf(open, after) }, img: imgOf(after) });
    const c = read(d, "buildings.txt")[0].split(";"), cx = parseFloat(c[2]), cz = parseFloat(c[4]);
    rec("⭐⭐ it goes to a coast pixel of its province where its water side stands on the sea, not its own", r.moved.buildings === 1 && !(Math.floor(cx) === X && H - 1 - Math.floor(cz) === 10)
      && shore.some((s) => s[0] === Math.floor(cx) && s[1] === H - 1 - Math.floor(cz)) && md.coastRowArmOnSea({ W, H, pidAt: after }, tOf, cx, cz, parseFloat(c[5])), c.join(";"));
  }
}

console.log("\n=== 17. A moved row stands at the height of the ground it moved to; an add-on's paint keeps through the base game's definition ===");
{
  // (a) 40 x 20 px: land 1 west of x 20, the sea east. A stroke 3 px wide takes every sea in reach from a fort on the shore, which goes
  //     to the new shore; the heightmap that loads climbs eastward, so the fort's old height is not the new ground's. Review E-R11:
  //     with the height lookup taken out (the row keeping its old y, a model floating over a beach or sunk in a hill) no test went red
  const W = 40, H = 20, zc = (row) => H - 1 - row + 0.5;
  const PAL = { 1: [200, 10, 10], 2: [10, 10, 200] }, types = { 1: "land", 2: "sea" }, tOf = (p) => types[p];
  const before = (x) => (x < 20 ? 1 : 2), after = (x) => (x < 23 ? 1 : 2);
  const hAt = (x) => 40 + 6 * x;   // the heightmap's value at a pixel (one per column)
  const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-keep-harbours-17-"));
  sandboxes.push(ROOT);
  const d = path.join(ROOT, "heights");
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat(Object.entries(types).map(([id, t]) => `${id};${PAL[id].join(";")};${t};true;${t === "sea" ? "ocean" : "plains"};${t === "sea" ? 0 : 1}`)).join("\n") + "\n");
  const hm = (() => {   // an 8-bit indexed heightmap.bmp, rows bottom-up, a grey palette
    const stride = (W + 3) & ~3, off = 54 + 1024, b = Buffer.alloc(off + stride * H);
    b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14); b.writeInt32LE(W, 18); b.writeInt32LE(H, 22);
    b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(stride * H, 34); b.writeUInt32LE(256, 46);
    for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[55 + i * 4] = i; b[56 + i * 4] = i; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * stride + x] = hAt(x);
    return b;
  })();
  fs.writeFileSync(path.join(d, "map", "heightmap.bmp"), hm);
  const fort = `1;coastal_bunker;19.50;${md.modelYForHeight(hAt(19)).toFixed(2)};${zc(10).toFixed(2)};${(Math.PI / 2).toFixed(2)};0`;
  fs.writeFileSync(path.join(d, "map", "buildings.txt"), fort + "\n");
  const img = (() => { const rgb = Buffer.alloc(W * H * 3); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgb.set(PAL[after(x)], (y * W + x) * 3); return { width: W, height: H, rgb }; })();
  const pixels = new Map(); for (let y = 0; y < H; y++) for (let x = 20; x < 23; x++) pixels.set(y * W + x, 2);
  rec("THE FIXTURE: the fort loses every sea in reach; the ground at the new shore (x 22) is not as high as where it stood",
    md.coastSeaInReach({ W, H, pidAt: (x) => before(x) }, tOf, 19.5, zc(10)) && !md.coastSeaInReach({ W, H, pidAt: (x) => after(x) }, tOf, 19.5, zc(10))
      && md.modelYForHeight(hAt(22)).toFixed(2) !== md.modelYForHeight(hAt(19)).toFixed(2));
  const r = md.keepCoastRowsFacingTheirSea({ modRoot: d, gameRoot: "", dependencyRoots: [], before: { pixels }, img });
  const c = fs.readFileSync(path.join(d, "map", "buildings.txt"), "utf8").trim().split(";");
  rec(`⭐⭐ the fort is moved to the new shore and stands at that ground's height (${md.modelYForHeight(hAt(22)).toFixed(2)}), not its old one`,
    r.moved.buildings === 1 && Math.floor(parseFloat(c[2])) === 22 && c[3] === md.modelYForHeight(hAt(Math.floor(parseFloat(c[2])))).toFixed(2), c.join(";"));
}
{
  // (b) an ADD-ON over the region world's base game: it owns map/buildings.txt and neither map/definition.csv nor map/provinces.bmp.
  //     The paint writes the add-on's provinces.bmp from the base game's, and no definition.csv: the keep reads the base game's to know
  //     which pixels are sea. Review E-R11: read from the mod alone, every such paint kept nothing ("Nova could not turn the harbours")
  //     and no test went red. The fort on continent A's east shore (section 5's) faces east onto the sea the stroke paints over
  const Wd = makeRegionWorld("keep-harbours-addon-paint", { addOn: true });
  sandboxes.push(Wd.ROOT);
  const SHORE = Wd.idAt(5, 2), FX = 6 * CELL - 1, FY = 2 * CELL;
  const colourOf = (id) => [(id * 37) % 256, (id * 91) % 256, 40 + (id % 200)];
  const [r, g, bl] = colourOf(SHORE);
  const inStroke = (x, y) => x >= FX + 1 && x <= FX + 4 && y >= FY - 2 && y <= FY + 2;
  const diff = [];
  for (let y = FY - 2; y <= FY + 2; y++) for (let x = FX + 1; x <= FX + 4; x++) diff.push({ x, y, r, g, b: bl });
  const baseM = { ex: cellMap(Wd).ex, typeOf: Wd.baseType };
  const afterM = { ex: { W: 512, H: 256, pidAt: (x, y) => (inStroke(x, y) ? SHORE : baseM.ex.pidAt(x, y)) }, typeOf: Wd.baseType };
  const fort = bRow(1, "coastal_bunker", FX, FY, Math.PI / 2);
  const bFile = path.join(Wd.MOD, "map", "buildings.txt");
  fs.mkdirSync(path.dirname(bFile), { recursive: true });
  fs.writeFileSync(bFile, fort + "\n");
  rec("THE FIXTURE: the add-on owns no definition.csv and no provinces.bmp; the fort's water side is on the base game's sea before the stroke and on its new land after",
    !fs.existsSync(path.join(Wd.MOD, "map", "definition.csv")) && !fs.existsSync(path.join(Wd.MOD, "map", "provinces.bmp")) && fs.existsSync(path.join(Wd.GAME, "map", "definition.csv"))
      && md.coastRowArmOnSea(baseM.ex, baseM.typeOf, FX, z(FY), Math.PI / 2) && !md.coastRowArmOnSea(afterM.ex, afterM.typeOf, FX, z(FY), Math.PI / 2));
  const res = md.applyProvinceDiff({ modRoot: Wd.MOD, gameRoot: Wd.GAME, dependencyRoots: [], diff });
  const cr = res.coastRows || {};
  const f1 = fs.readFileSync(bFile, "utf8").trim().split(";");
  rec("⭐⭐ the paint keeps through the base game's definition.csv: the fort's water side is on the sea again, and no definition.csv is copied in",
    res.ok && !cr.error && (cr.turned.buildings + cr.moved.buildings) === 1 && md.coastRowArmOnSea(afterM.ex, afterM.typeOf, parseFloat(f1[2]), parseFloat(f1[4]), parseFloat(f1[5]))
      && !fs.existsSync(path.join(Wd.MOD, "map", "definition.csv")), { cr, f1: f1.join(";"), error: res.error });
}

for (const d of sandboxes) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }   // scratch fixtures only — never a mod directory (⛔ CLAUDE.md #1)
console.log("\n" + (fails.length ? "FAILED " + fails.length + " of " + checks : "PASSED " + checks + " checks"));
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
