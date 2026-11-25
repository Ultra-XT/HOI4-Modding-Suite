// ⛔ #a-fort-stands-off-its-depot — A PROVINCE'S FORT AND SPECIAL-PROJECT SITE STAND OFF ITS DEPOT, NOT ON IT.
//
// Every land province carries three rows of its own (#a-slot-is-per-land-province-not-per-state): supply_node, bunker and
// special_project_facility_spawn. Nova wrote all three on the province's town point (#one-town-point-per-province), which is also
// its station: the audit of TEST 33a found the depot, the fort and the special-project site on ONE point in all 4,680 of its land
// provinces (the base game: 0.8%), so the railway leaving each station ran through its fort's model (99.8%; the base game 44%).
// The base game stands them a median 5.1 px from the depot.
//
// So the supply_node stays on the town point — it is the station, the unit row and the city's seed — and the fort and the site
// each take a point of their own in the province (provinceSiteSpots): a 3x3 of the state's land and 2 px clear of every row the
// state has or the call writes, its model on the state's land and on its province where it can be, 3 px clear where there is room,
// about 5 px from the depot, ties broken by a hash so the forts of a world do not all stand at one offset from their depots.
//
// Every expected spot is the rule searched by brute force over the fixture's own rectangles (up to the hash, which only breaks
// ties), at the reaches the module reads; each case asserts first that the fixture exercises it, and each guard has a case where
// the search without it gives another answer.
//   S1  twelve identical islands       the spread itself: depot on the town point, the sites off it, apart from every row and the
//                                      runway, their models on the island, and spread over at least three directions
//   S2  a crowded inland province      the only spots 3 px clear of every row are by the sea, where the model hangs over it; a spot
//                                      2 px clear inland wins
//   S5  a 3x4 and a 1x2 province       a tiny province: a pixel of its own off the town point where it has one, else the town point
//   S6  a modder's bunker              rows that exist are never moved, and a second call adds nothing
//   S7  islands with the coast's rows  Generate land's coast rows, written in the same call, are kept clear of
//   S8  a town province with its        a modder's rows leave room 3 px clear only where the model reaches over the province next
//       neighbour east of it            door, of the same state: a spot 2 px clear with the model on its own province wins
//   S9  two rings of a modder's rows    every spot about 5 px from the depot is a pixel from one of them: a spot 2 px clear,
//                                       nearer the depot, wins over one beside a row
//   S10 a strip and its neighbour     a modder's row in the province next door, a pixel over the border, is kept clear of: the
//                                      points within reach of the province's box count, not only those inside it
//   P   a top-up of one province      a state of three given back the fort of one: it stands on that province's own spot, not on
//                                      its depot — the sites are asked for the provinces the top-up writes
//   H   the heightmap                 each site's row carries the height of its own pixel, not its depot's
//   M   a dependency's own fort        a mod over a dependency that draws its own, wider bunker: its fort is placed at that model's
//                                      reach (buildingRowReach, as common/buildings and gfx/ of the layers say), not the base game's
//   G   the installed game             SITE_FROM_TOWN and SITE_FAR, and the reaches, re-derived from the base game
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fort-site-"));
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
/** a .mesh as the game's carry their aabb: the float triples "min" and "max" ('!', name length, name, 'f', int32 count, values) */
function meshFile(min, max) {
  const prop = (name, v) => { const b = Buffer.alloc(2 + name.length + 1 + 4 + 4 * v.length); b[0] = 0x21; b[1] = name.length; b.write(name + "f", 2, "latin1"); b.writeInt32LE(v.length, 3 + name.length); v.forEach((f, k) => b.writeFloatLE(f, 7 + name.length + 4 * k)); return b; };
  return Buffer.concat([Buffer.from("@@b@", "latin1"), Buffer.from("[aabb", "latin1"), prop("min", min), prop("max", max)]);
}

// ── the fixture: rectangles [x0, y0, x1, y1) on a 160 x 80 sea (province 1), rows top-down ─────────────────────────────────────
const W = 160, H = 80, SEA = 1;
const RECT = {}, STATES = {}, STANDSTILL = {};
let nextPid = 2, nextSid = 1;
const add = (rects, stand) => { const sid = nextSid++, pids = rects.map((r) => { const p = nextPid++; RECT[p] = r; return p; }); STATES[sid] = pids; if (stand) STANDSTILL[pids[0]] = stand; return { sid, pid: pids[0], pids }; };
const S1 = [];                                                         // twelve islands 15 x 15, the town point in the middle
for (let i = 0; i < 12; i++) { const x0 = 2 + (i % 4) * 18, y0 = 2 + Math.floor(i / 4) * 18; S1.push(add([[x0, y0, x0 + 15, y0 + 15]], [x0 + 7, y0 + 7])); }
const S2 = add([[80, 2, 95, 10]], [87, 3]);                            // 15 x 8, the town point by its north coast
const S2_ROWS = [[82, 5], [87, 5], [92, 5]];                           // a modder's rows across its middle, 5 px apart
const S5 = add([[134, 2, 149, 17], [149, 6, 152, 10], [152, 7, 153, 9]], [141, 9]);   // a roomy town province, a 3 x 4 province east of it, a 1 x 2 one east of that
const S6 = add([[112, 2, 122, 12], [122, 2, 132, 12]]);                // two provinces, a modder's bunker in the first
const S6_BUNKER = [114, 4];
const S8 = add([[2, 58, 13, 69], [13, 58, 24, 69]], [7, 63]);          // an 11 x 11 town province, the town point in its middle, and one east of it
const S8_ROWS = [[5, 60], [5, 65], [9, 60], [9, 65]];                  // a modder's rows 2 px either side of the town point's column
const S9 = add([[30, 56, 51, 77]], [40, 66]);                           // a 21 x 21 island, the town point in its middle
// …a modder's rows on every other pixel of two square rings round it, 4 and 7 px out: every pixel 3 to 8 px out is a pixel from one
const S9_ROWS = [];
for (const R of [4, 7]) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === R && (dx + dy) % 2 === 0) S9_ROWS.push([40 + dx, 66 + dy]);
const S7 = [];                                                         // islands whose town point is 5 px south of their north coast
for (let i = 0; i < 8; i++) { const x0 = 80 + (i % 4) * 18, y0 = 20 + Math.floor(i / 4) * 18; S7.push(add([[x0, y0, x0 + 15, y0 + 15]], [x0 + 7, y0 + 5])); }
const S10 = add([[60, 58, 63, 76], [63, 58, 70, 76]], [61, 61]);       // a 3 px strip on the west coast, its town point 3 px down, and a province east of it
const S10_ROW = [63, 66];                                              // a modder's row in the province next door, a pixel over the strip's border
const SP = add([[80, 60, 90, 72], [90, 60, 100, 72], [100, 60, 110, 72]]);   // three provinces 10 x 12 side by side
const provAt = (x, y) => { for (const [id, [x0, y0, x1, y1]] of Object.entries(RECT)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return SEA; };
const stateOf = (p) => +(Object.keys(STATES).find((s) => STATES[s].includes(p)) || 0);
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const heightOf = (x, y) => (provAt(x, y) === SEA ? 80 : 96 + ((x * 3 + y * 5) % 120));   // no two neighbours alike, so a row's height says which pixel it was read under
const mod = path.join(ROOT, "mod");
const roots = { modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
write(mod, "descriptor.mod", 'name="sites"\nreplace_path="history/states"\nreplace_path="map"\n');
write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
write(mod, "map/heightmap.bmp", bmp8(W, H, heightOf));
write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`]
  .concat(Object.keys(RECT).map((id) => `${id};${colour(+id).join(";")};land;false;plains;1`)).join("\n") + "\n");
write(mod, "map/unitstacks.txt", Object.entries(STANDSTILL).map(([p, [x, row]]) => `${p};0;${x}.00;10.00;${H - 1 - row}.00;0.00;0.00`).join("\n") + "\n");
for (const [s, provs] of Object.entries(STATES)) {
  write(mod, `history/states/${s}-S.txt`, `state = {\n\tid = ${s}\n\tname = "STATE_${s}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`);
}
const BUILDINGS = path.join(mod, "map", "buildings.txt");
const rowAt = (sid, type, [px, row]) => `${sid};${type};${px}.00;${md.modelYForHeight(heightOf(px, row)).toFixed(2)};${H - 1 - row}.00;0.00;0`;
const MODDER = S2_ROWS.map((p) => rowAt(S2.sid, "radar_station", p)).concat(S8_ROWS.map((p) => rowAt(S8.sid, "radar_station", p)), S9_ROWS.map((p) => rowAt(S9.sid, "radar_station", p)),
  rowAt(S10.sid, "radar_station", S10_ROW), rowAt(S6.sid, "bunker", S6_BUNKER));
write(mod, "map/buildings.txt", ["99;radar_station;1.00;9.50;1.00;0.00;0"].concat(MODDER).join("\n") + "\n");

// read so that a build without them fails its checks rather than throwing: the per-province rows but the depot, and the airfield's
// reach where no other is given
const SITES = md.SITE_TYPES || md.PER_LAND_PROVINCE_BUILDING_SLOTS.filter((t) => t !== "supply_node"), [FORT, SPEC] = SITES;
const REACH = { [FORT]: (md.SITE_REACH || {})[FORT] || md.AIRFIELD_REACH, [SPEC]: (md.SITE_REACH || {})[SPEC] || md.AIRFIELD_REACH };   // the fixture's layers draw no model of their own
const AIR = md.airfieldReach(roots);
const COAST_TYPES = new Set([...md.COASTAL_STATE_BUILDING_SLOTS.map(([t]) => t), ...md.PER_COASTAL_PROVINCE_BUILDING_SLOTS]);
const readRows = () => fs.readFileSync(BUILDINGS, "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(";")).filter((c) => c.length >= 7)
  .map((c) => { const x = +c[2], z = +c[4], px = Math.floor(x), row = H - 1 - Math.floor(z); return { sid: +c[0], type: c[1], x, y: c[3], z, px, row, province: provAt(px, row), line: c.join(";") }; });
const pix = (t) => ({ px: Math.floor(t.x), row: H - 1 - Math.floor(t.z) });
const cheb = (a, b) => Math.max(Math.abs(a.px - b.px), Math.abs(a.row - b.row));
const townsOf = (sid) => md.stateBuildingAnchor({ ...roots, provinces: STATES[sid], each: true });
/** every pixel a model's box touches from a whole-pixel row, at reach R (airfieldBlock's arithmetic: the row's point is (px, row + 1)) */
const blockOf = (p, R) => { const Y = p.row + 1; return { c0: Math.floor(p.px - R.west), c1: Math.ceil(p.px + R.east) - 1, r0: Math.floor(Y - R.north), r1: Math.ceil(Y + R.south) - 1 }; };
const pixelsOf = (p, R) => { const b = blockOf(p, R), out = []; for (let r = b.r0; r <= b.r1; r++) for (let c = b.c0; c <= b.c1; c++) out.push({ px: c, row: r }); return out; };
const idAt = (q) => (q.px >= 0 && q.row >= 0 && q.px < W && q.row < H ? provAt(q.px, q.row) : -1);
const offLand = (p, R, sid) => pixelsOf(p, R).filter((q) => stateOf(idAt(q)) !== sid || idAt(q) === SEA).length;
const offPid = (p, R, pid) => pixelsOf(p, R).filter((q) => idAt(q) !== pid).length;
const nearBlock = (p, b) => p.px >= b.c0 - 1 && p.px <= b.c1 + 1 && p.row >= b.r0 - 1 && p.row <= b.r1 + 1;
const full3 = (p, sid) => [-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => { const id = idAt({ px: p.px + dx, row: p.row + dy }); return id !== SEA && stateOf(id) === sid; }));
/** the rule by brute force: of the pixels of `pid` off every runway block by a pixel and a pixel or more from every point (`kept`
 *  and the town point), those with the best key 1–6 (the 7th, a hash, only breaks their tie). `o`: the CONTROLS, each the search
 *  with one guard left out — noRunway, noPid (the model's pixels off its own province), no2 (2 px clear of every point) */
function best(sid, pid, town, kept, runways, R, o = {}) {
  const [x0, y0, x1, y1] = RECT[pid], pts = [town].concat(kept);
  let top = null, out = [];
  for (let row = y0; row < y1; row++) for (let px = x0; px < x1; px++) {
    const p = { px, row };
    if (!o.noRunway && runways.some((b) => nearBlock(p, b))) continue;
    const m = Math.min(...pts.map((q) => cheb(p, q)));
    if (m < 1) continue;
    const f = full3(p, sid), d = Math.hypot(px - town.px, row - town.row);
    const k = [o.no2 || (f && m >= 2) ? 0 : 1, offLand(p, R, sid), o.noPid ? 0 : offPid(p, R, pid), f && m >= 3 ? 0 : 1, d <= md.SITE_FAR ? 0 : 1, Math.floor(Math.abs(d - md.SITE_FROM_TOWN) / 2)];
    const cmp = top ? k.findIndex((v, i) => v !== top[i]) : -1;
    if (!top || (cmp >= 0 && k[cmp] < top[cmp])) { top = k; out = [p]; } else if (cmp === -1) out.push(p);
  }
  return out;
}
const has = (list, p) => !!p && list.some((q) => q.px === p.px && q.row === p.row);
const dirOf = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "E" : "W") : dy < 0 ? "N" : "S");   // rows run top-down

// ── the calls: each state as its case asks — S2 its sites only (onlyTypes), S7 with Generate land's coast ───────────────────────
const before = fs.readFileSync(BUILDINGS, "utf8");
const callAll = () => {
  const calls = {};
  for (const s of S1.concat(S5, S6, SP)) calls[s.sid] = md.ensureBuildingSlotsForState({ ...roots, stateId: s.sid, provinces: STATES[s.sid] });
  for (const s of [S2, S8, S9, S10]) calls[s.sid] = md.ensureBuildingSlotsForState({ ...roots, stateId: s.sid, provinces: STATES[s.sid], onlyTypes: SITES });
  for (const s of S7) calls[s.sid] = md.ensureBuildingSlotsForState({ ...roots, stateId: s.sid, provinces: STATES[s.sid], coast: { provinces: new Set([s.pid]), ports: [], types: COAST_TYPES } });
  return calls;
};
const calls = callAll();
const all = readRows();
ok(Object.values(calls).every((c) => c && c.changed) && Object.keys(calls).length === Object.keys(STATES).length, `each of the ${Object.keys(STATES).length} states is given its rows`, Object.entries(calls).filter(([, c]) => !(c && c.changed)));
ok(Array.isArray(md.SITE_TYPES) && !!md.SITE_REACH && SITES.length === 2 && SITES.join() === md.PER_LAND_PROVINCE_BUILDING_SLOTS.filter((t) => t !== "supply_node").join() && !!md.SITE_REACH[FORT] && !!md.SITE_REACH[SPEC],
  "(the per-province rows that stand off the town point: every one but the supply_node — the fort and the special-project site)", SITES);
/** a state's rows, split: its sites by province, and every other row */
const split = (sid) => { const rows = all.filter((r) => r.sid === sid); return { rows, sites: rows.filter((r) => SITES.includes(r.type)), other: rows.filter((r) => !SITES.includes(r.type)) }; };
/** the points a province's site is kept clear of: every other row of the state, the sites of the provinces before it, and (for the
 *  second site) the first — as the call writes them, in province order */
const keptFor = (sid, pid, type, o = {}) => {
  const { other, sites } = split(sid), towns = townsOf(sid);
  const earlier = sites.filter((r) => r.province < pid || (r.province === pid && SITES.indexOf(r.type) < SITES.indexOf(type)));
  return [...towns.values()].map(pix).concat(other.filter((r) => !(o.noCoast && COAST_TYPES.has(r.type))).map(pix), earlier.map(pix));
};
const runwaysOf = (sid) => all.filter((r) => r.sid === sid && r.type === "air_base").map((r) => blockOf(r, AIR));

console.log("\n-- ⭐ S1. twelve identical islands: the depot on the town point, the fort and the site off it --");
{
  const bad = { node: [], own: [], clear: [], model: [], dist: [], runway: [], rule: [] }, offsets = [];
  let ruleCtl = 0, runwayCtl = 0, rowsCtl = 0;
  for (const s of S1) {
    const { rows, sites, other } = split(s.sid), T = pix(townsOf(s.sid).get(s.pid)), air = runwaysOf(s.sid);
    const node = rows.filter((r) => r.type === "supply_node");
    if (!(node.length === 1 && node[0].px === T.px && node[0].row === T.row)) bad.node.push(s.sid);
    for (const t of SITES) {
      const r = sites.find((q) => q.type === t);
      if (!r || r.province !== s.pid || (r.px === T.px && r.row === T.row)) { bad.own.push([s.sid, t]); continue; }
      if (!(rows.filter((q) => q !== r).every((q) => cheb(q, r) >= 2) && full3(r, s.sid))) bad.clear.push([s.sid, t, r.px, r.row]);
      if (offPid(r, REACH[t], s.pid)) bad.model.push([s.sid, t]);
      const d = Math.hypot(r.px - T.px, r.row - T.row);
      if (!(d >= 3 && d <= 7)) bad.dist.push([s.sid, t, d]);
      if (air.some((b) => nearBlock(r, b))) bad.runway.push([s.sid, t]);
      const kept = keptFor(s.sid, s.pid, t), want = best(s.sid, s.pid, T, kept, air, REACH[t]);
      if (!has(want, r)) bad.rule.push([s.sid, t, [r.px, r.row], want.slice(0, 3)]);
      if (new Set(want.map((p) => dirOf(p.px - T.px, p.row - T.row))).size >= 3) ruleCtl++;
      if (best(s.sid, s.pid, T, kept, air, REACH[t], { noRunway: true }).some((p) => air.some((b) => nearBlock(p, b)))) runwayCtl++;
      if (best(s.sid, s.pid, T, [], air, REACH[t]).some((p) => other.some((q) => cheb(p, q) < 2))) rowsCtl++;
      if (t === FORT) offsets.push([r.px - T.px, r.row - T.row]);
    }
  }
  ok(bad.node.length === 0, "⭐⭐ each island's supply_node stands on its town point — the station, as before", bad.node);
  ok(bad.own.length === 0, "⭐⭐⭐ its fort and its special-project site each stand on a pixel of their own province, not on the town point", bad.own);
  ok(bad.clear.length === 0, "⭐⭐ …2 px or more from every other row of the state, with a 3x3 of its land round them", bad.clear);
  ok(bad.model.length === 0, "⭐⭐ …their whole model on their province", bad.model);
  ok(bad.dist.length === 0, `⭐ …3 to 7 px from the depot (SITE_FROM_TOWN ${md.SITE_FROM_TOWN})`, bad.dist);
  ok(bad.runway.length === 0, "⭐⭐ …and a pixel or more off the runway's block", bad.runway);
  ok(bad.rule.length === 0, "⭐⭐ every site is one of the rule's best spots, searched over the island by brute force", bad.rule);
  ok(rowsCtl > 0, "(CONTROL: with the state's other rows left out the search would stand a site within 2 px of one of them)", rowsCtl);
  ok(runwayCtl > 0, "(CONTROL: with the runway left out the search would stand a site within a pixel of its block)", runwayCtl);
  ok(ruleCtl === 2 * S1.length, "(the fixture: on every island the rule's best spots tie in three directions or more — only the tie-break decides among them)", ruleCtl);
  const dirs = new Set(offsets.map(([dx, dy]) => dirOf(dx, dy))), byOffset = new Map();
  for (const [dx, dy] of offsets) byOffset.set(`${dx},${dy}`, (byOffset.get(`${dx},${dy}`) || 0) + 1);
  const most = Math.max(...byOffset.values());
  ok(offsets.length === S1.length && dirs.size >= 3 && most * 3 <= offsets.length,
    `⭐⭐ the forts of twelve identical islands do not all stand at one offset from their depot: ${dirs.size} directions, the commonest offset ${most} of ${offsets.length}`, { dirs: [...dirs], byOffset: [...byOffset] });
}

console.log("\n-- ⭐ S2. the only spots 3 px clear of every row are by the sea: a spot 2 px clear inland wins --");
{
  const { sites } = split(S2.sid), T = pix(townsOf(S2.sid).get(S2.pid)), kept = keptFor(S2.sid, S2.pid, FORT);
  const [x0, y0, x1, y1] = RECT[S2.pid], three = [], twoDry = [];
  for (let row = y0; row < y1; row++) for (let px = x0; px < x1; px++) {
    const p = { px, row }, m = Math.min(...[T].concat(kept).map((q) => cheb(p, q)));
    if (m >= 3 && full3(p, S2.sid)) three.push(p);
    if (m === 2 && full3(p, S2.sid) && offLand(p, REACH[FORT], S2.sid) === 0) twoDry.push(p);
  }
  ok(three.length > 0 && three.every((p) => offLand(p, REACH[FORT], S2.sid) > 0) && twoDry.length > 0,
    "(the fixture: every spot 3 px clear of the rows has the fort's model over the sea, and spots 2 px clear inland have it all on the land)", { three: three.length, twoDry: twoDry.length });
  ok(sites.length === SITES.length && sites.every((r) => r.province === S2.pid && offLand(r, REACH[r.type], S2.sid) === 0),
    "⭐⭐⭐ the fort and the site stand where no pixel of their model is over the sea", sites.map((r) => [r.type, r.px, r.row, offLand(r, REACH[r.type], S2.sid)]));
  ok(sites.every((r) => has(best(S2.sid, S2.pid, T, keptFor(S2.sid, S2.pid, r.type), [], REACH[r.type]), r)), "⭐ …the rule's best spots");
  ok(MODDER.slice(0, S2_ROWS.length).every((l) => all.some((r) => r.line === l)) && split(S2.sid).rows.length === S2_ROWS.length + SITES.length,
    "the modder's rows stand as they were, and only the two sites were written (onlyTypes)", split(S2.sid).rows.map((r) => r.type));
}

console.log("\n-- ⭐ S5. a tiny province: a pixel of its own off the town point where it has one, else the town point --");
{
  const { sites } = split(S5.sid), towns = townsOf(S5.sid), air = runwaysOf(S5.sid);
  const room = [], placed = [];
  for (const pid of S5.pids.slice(1)) {
    const T = pix(towns.get(pid)), here = sites.filter((r) => r.province === pid), [x0, y0, x1, y1] = RECT[pid];
    ok(here.length === SITES.length, `⭐⭐ ${x1 - x0} x ${y1 - y0}: both its sites on a pixel of the province — never off it, never on the sea`, sites.filter((r) => SITES.includes(r.type)).map((r) => [r.type, r.px, r.row, r.province]));
    // how many of the two the province has room for off the town point: the search, the fort first and the site clear of it
    const fort = here.find((r) => r.type === FORT), wantF = best(S5.sid, pid, T, keptFor(S5.sid, pid, FORT), air, REACH[FORT]);
    const wantS = best(S5.sid, pid, T, keptFor(S5.sid, pid, SPEC), air, REACH[SPEC]);
    room.push(`${x1 - x0}x${y1 - y0}:${(wantF.length ? 1 : 0) + (wantS.length ? 1 : 0)}`);
    const off = here.filter((r) => !(r.px === T.px && r.row === T.row));
    placed.push(`${x1 - x0}x${y1 - y0}:${off.length}`);
    ok((!wantF.length || has(wantF, fort)) && (!wantS.length || has(wantS, here.find((r) => r.type === SPEC))), "⭐ …each the rule's best spot where it has one", here.map((r) => [r.type, r.px, r.row]));
  }
  ok(room.join() === "3x4:2,1x2:1", "(the fixture: the 3 x 4 province has room off its town point for both sites, the 1 x 2 for one)", room);
  ok(placed.join() === room.join(), "⭐⭐ …so both of the 3 x 4's stand off its town point, and the 1 x 2's fort on its other pixel, its site on the town point", placed);
}

console.log("\n-- ⭐ S6. a modder's bunker is never moved, and a second call adds nothing --");
{
  const { rows } = split(S6.sid), [a, b] = S6.pids;
  const forts = rows.filter((r) => r.type === FORT);
  ok(all.some((r) => r.line === MODDER[MODDER.length - 1]) && forts.length === 2 && forts.filter((r) => r.province === a).length === 1 && forts.filter((r) => r.province === b).length === 1,
    "⭐⭐ the modder's bunker stands byte for byte where it was, and the call wrote one in the other province only", forts.map((r) => r.line));
  const now = fs.readFileSync(BUILDINGS, "utf8");
  const again = Object.values(callAll());
  ok(again.every((c) => c && c.changed === false) && fs.readFileSync(BUILDINGS, "utf8") === now, "⭐⭐ the same calls again add nothing: the file is as it was", again.filter((c) => !(c && c.changed === false)));
  ok(before.split("\n").filter(Boolean).every((l) => now.split(/\r?\n/).includes(l)), "…and every row the file held before the calls is still in it");
}

console.log("\n-- ⭐ S7. Generate land's coast rows, written in the same call, are kept clear of --");
{
  const bad = [], rule = [];
  let ctl = 0;
  for (const s of S7) {
    const { sites, other } = split(s.sid), T = pix(townsOf(s.sid).get(s.pid)), coast = other.filter((r) => COAST_TYPES.has(r.type)), air = runwaysOf(s.sid);
    if (!coast.length) bad.push([s.sid, "no coast rows"]);
    for (const r of sites) {
      if (other.some((q) => cheb(q, r) < 2)) bad.push([s.sid, r.type, r.px, r.row]);
      if (!has(best(s.sid, s.pid, T, keptFor(s.sid, s.pid, r.type), air, REACH[r.type]), r)) rule.push([s.sid, r.type, r.px, r.row]);
      if (best(s.sid, s.pid, T, keptFor(s.sid, s.pid, r.type, { noCoast: true }), air, REACH[r.type]).some((p) => coast.some((q) => cheb(p, q) < 2))) ctl++;
    }
  }
  ok(ctl > 0, "(CONTROL: with the coast's rows left out the search would stand a site beside one of them)", ctl);
  ok(bad.length === 0, "⭐⭐ no site stands on or beside a row the call wrote — the coast's rows and the state's own", bad);
  ok(rule.length === 0, "⭐ …and each is one of the rule's best spots with them kept clear of", rule);
}

console.log("\n-- ⭐ S8. room 3 px clear only where the model reaches over the next province: a spot 2 px clear on its own province wins --");
{
  const [P, Q] = S8.pids, { sites, other } = split(S8.sid), T = pix(townsOf(S8.sid).get(P)), here = sites.filter((r) => r.province === P);
  const want = (t, o = {}) => best(S8.sid, P, T, keptFor(S8.sid, P, t), [], REACH[t], o);
  const noPid = want(FORT, { noPid: true });
  ok(stateOf(Q) === S8.sid && noPid.length > 0 && noPid.every((p) => offPid(p, REACH[FORT], P) > 0 && offLand(p, REACH[FORT], S8.sid) === 0),
    "(the fixture: counting no pixel off its own province, the search would stand the fort with its model over the province next door — the state's own land)", noPid.slice(0, 3));
  ok(here.length === SITES.length && here.every((r) => offPid(r, REACH[r.type], P) === 0), "⭐⭐ the fort and the site stand with their whole model on their own province", here.map((r) => [r.type, r.px, r.row, offPid(r, REACH[r.type], P)]));
  ok(here.every((r) => other.concat([T]).every((q) => cheb(r, q) >= 2)), "⭐⭐ …2 px or more from every row and the town point", here.map((r) => [r.type, r.px, r.row]));
  ok(here.every((r) => has(want(r.type), r)), "⭐ …the rule's best spots", here.map((r) => [r.type, r.px, r.row]));
  ok(S8_ROWS.every((p) => all.some((r) => r.line === rowAt(S8.sid, "radar_station", p))), "(the modder's rows stand as they were)");
}

console.log("\n-- ⭐ S9. every spot about 5 px from the depot is a pixel from a row: a spot 2 px clear wins --");
{
  const { sites, other } = split(S9.sid), T = pix(townsOf(S9.sid).get(S9.pid));
  const no2 = best(S9.sid, S9.pid, T, keptFor(S9.sid, S9.pid, FORT), [], REACH[FORT], { no2: true });
  ok(no2.length > 0 && no2.every((p) => other.some((q) => cheb(p, q) === 1)), "(the fixture: not asking 2 px clear of every point, the search would stand the fort a pixel from one of the modder's rows)", no2.slice(0, 3));
  ok(sites.length === SITES.length && sites.every((r) => other.concat([T]).every((q) => cheb(r, q) >= 2) && full3(r, S9.sid)), "⭐⭐ the fort and the site stand 2 px or more from every row and the town point",
    sites.map((r) => [r.type, r.px, r.row, Math.min(...other.concat([T]).map((q) => cheb(r, q)))]));
  ok(sites.every((r) => has(best(S9.sid, S9.pid, T, keptFor(S9.sid, S9.pid, r.type), [], REACH[r.type]), r)), "⭐ …the rule's best spots", sites.map((r) => [r.type, r.px, r.row]));
}

console.log("\n-- ⭐ S10. a row of the province next door, a pixel over the border, is kept clear of too --");
{
  // provinceSiteSpots looks at the points within BUILDING_RING_NEAR of the province's box, not only those inside it: every spot that
  // keeps the fort's model off the sea stands in the strip's east column, beside the province next door and its row
  const [P, Q] = S10.pids, { sites, other } = split(S10.sid), T = pix(townsOf(S10.sid).get(P)), here = sites.filter((r) => r.province === P);
  const Qrow = { px: S10_ROW[0], row: S10_ROW[1] }, [x0, y0, x1, y1] = RECT[P];
  const blind = best(S10.sid, P, T, keptFor(S10.sid, P, FORT).filter((q) => q.px >= x0 && q.px < x1 && q.row >= y0 && q.row < y1), [], REACH[FORT]);
  ok(provAt(Qrow.px, Qrow.row) === Q && stateOf(Q) === S10.sid && !(Qrow.px >= x0 && Qrow.px < x1) && blind.length > 0 && blind.every((p) => cheb(p, Qrow) <= 2),
    "(the fixture: with only the points inside the strip's box kept clear of, every best spot for its fort is 2 px or less from the row next door)", blind.slice(0, 4));
  ok(here.length === SITES.length && here.every((r) => cheb(r, Qrow) >= 2), "⭐⭐ the strip's fort and site stand 2 px or more from the row next door", here.map((r) => [r.type, r.px, r.row, cheb(r, Qrow)]));
  ok(here.length === SITES.length && here.every((r) => has(best(S10.sid, P, T, keptFor(S10.sid, P, r.type), [], REACH[r.type]), r)), "⭐⭐ …the rule's best spots, with that row kept clear of", here.map((r) => [r.type, r.px, r.row]));
  ok(sites.filter((r) => r.province === Q).every((r) => has(best(S10.sid, Q, pix(townsOf(S10.sid).get(Q)), keptFor(S10.sid, Q, r.type), [], REACH[r.type]), r)) && other.some((r) => r.line === rowAt(S10.sid, "radar_station", S10_ROW)),
    "…and the province next door's are its own best spots, the modder's row standing as it was", sites.filter((r) => r.province === Q).map((r) => [r.type, r.px, r.row]));
}

console.log("\n-- ⭐ P. a top-up that gives one province back its fort stands it on that province's own spot, not on its depot --");
{
  // ⚠️ `have` is a count, not a set of provinces: a per-province type is topped up on the LAST n land provinces in id order, and the
  // sites must be asked for those same n. Every case above writes a whole state's sites at once, where the first n and the last n are
  // one list; Auto-fix or a province move gives back the fort of one province — n = 1 of 3
  const last = Math.max(...SP.pids), lost = all.find((r) => r.sid === SP.sid && r.type === FORT && r.province === last);
  const full = fs.readFileSync(BUILDINGS, "utf8").split(/\r?\n/).filter(Boolean);
  ok(SP.pids.length === 3 && Math.min(...SP.pids) !== last && !!lost && all.filter((r) => r.sid === SP.sid && r.type === FORT).length === SP.pids.length,
    "(the fixture: a state of three provinces given every row, a fort in each; the last province's is lost)", lost && lost.line);
  fs.writeFileSync(BUILDINGS, full.filter((l) => !lost || l !== lost.line).join("\n") + "\n");
  const r = md.ensureBuildingSlotsForState({ ...roots, stateId: SP.sid, provinces: STATES[SP.sid] });
  const now = readRows().filter((w) => w.sid === SP.sid), back = now.filter((w) => w.type === FORT && w.province === last);
  const others = now.filter((w) => !back.includes(w)), T = pix(townsOf(SP.sid).get(last));
  const want = best(SP.sid, last, T, [...townsOf(SP.sid).values()].map(pix).concat(others.map(pix)), runwaysOf(SP.sid), REACH[FORT]);
  ok(!!r && r.changed && r.added === 1 && back.length === 1, "the top-up writes the one fort, in the province that lost it", { r, back: back.map((w) => w.line) });
  ok(back.length === 1 && !(back[0].px === T.px && back[0].row === T.row), "⭐⭐⭐ …off that province's town point, its depot", back.map((w) => [w.px, w.row]));
  ok(back.length === 1 && want.length > 0 && has(want, back[0]), "⭐⭐ …on one of the rule's best spots, every row the state kept kept clear of", { got: back.map((w) => [w.px, w.row]), want: want.slice(0, 4) });
}

console.log("\n-- ⭐ H. a site's row carries the height of the pixel it stands on, not its depot's --");
{
  // #a-fort-stands-off-its-depot — off the town point, the row is written at the height under its own pixel (the positions answer's yAt);
  // the fixture's heightmap gives no two neighbours one height, so a row's height says which pixel it was read under
  const yOf = (p) => md.modelYForHeight(heightOf(p.px, p.row)).toFixed(2);
  const wrote = all.filter((r) => SITES.includes(r.type) && !MODDER.includes(r.line) && STATES[r.sid]);
  const offTown = wrote.filter((r) => { const T = pix(townsOf(r.sid).get(r.province)); return !(r.px === T.px && r.row === T.row); });
  const tell = offTown.filter((r) => yOf(pix(townsOf(r.sid).get(r.province))) !== yOf(r));
  ok(tell.length > 0, `(the fixture: ${tell.length} of the ${offTown.length} sites off their town point stand on ground of another height than their depot's)`, offTown.length);
  const wrong = wrote.filter((r) => r.y !== yOf(r));
  ok(wrote.length > 0 && wrong.length === 0, `⭐⭐ each of the ${wrote.length} sites the calls wrote stands at the height of its own pixel`, wrong.slice(0, 4).map((r) => [r.line, yOf(r)]));
}

// ── M: a mod over a dependency that draws its own fort, as Old World Blues draws its own airfield — the dependency's common/buildings
//    stands the bunker on its own row, its gfx/entities names a pdxmesh, a .gfx under gfx/models gives that mesh's file ───────────────
console.log("\n-- ⭐ M. a mod over a dependency that draws its own fort: the fort is placed at that model's reach --");
{
  const MW = 24, MH = 24, ISLE = [4, 4, 19, 19], MESH = { min: [-6, 0, -6], max: [6, 1, 6] };
  const dep = path.join(ROOT, "dep"), mod2 = path.join(ROOT, "mod2");
  write(dep, "descriptor.mod", 'name="dep"\n');
  write(dep, "common/buildings/00_buildings.txt", "buildings = {\n\tbunker = {\n\t\tbase_cost = 500\n\t\tlevel_cap = { province_max = 10 }\n\t}\n}\n");
  write(dep, "gfx/entities/dep_buildings.asset", 'entity = {\n\tname = "building_bunker"\n\tpdxmesh = "dep_bunker"\n\tscale = 1.0\n}\n');
  write(dep, "gfx/models/dep_bunker/dep_bunker.gfx", 'objectTypes = {\n\tpdxmesh = {\n\t\tname = "dep_bunker"\n\t\tfile = "gfx/models/dep_bunker/bunker.mesh"\n\t}\n}\n');
  write(dep, "gfx/models/dep_bunker/bunker.mesh", meshFile(MESH.min, MESH.max));
  const prov2 = (x, y) => (x >= ISLE[0] && x < ISLE[2] && y >= ISLE[1] && y < ISLE[3] ? 2 : SEA);
  write(mod2, "descriptor.mod", 'name="sites2"\nreplace_path="history/states"\nreplace_path="map"\ndependencies = { "dep" }\n');
  write(mod2, "map/provinces.bmp", bmp24(MW, MH, (x, y) => colour(prov2(x, y))));
  write(mod2, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`, `2;${colour(2).join(";")};land;false;plains;1`].join("\n") + "\n");
  write(mod2, "history/states/1-S.txt", "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n");
  write(mod2, "map/buildings.txt", "99;radar_station;1.00;9.50;1.00;0.00;0\n");
  const roots2 = { modRoot: mod2, gameRoot: roots.gameRoot, dependencyRoots: [dep] };
  // the dependency's model, read from the mesh: its aabb at scale 1, rounded up to the hundredth as every reach is
  const up = (v) => Math.ceil(100 * Math.max(0, Math.fround(v))) / 100, R2 = { west: up(-MESH.min[0]), east: up(MESH.max[0]), south: up(-MESH.min[2]), north: up(MESH.max[2]) };
  const read = typeof md.buildingRowReach !== "function" ? null : md.buildingRowReach({ ...roots2, rules: md.stateBuildingRules(md.buildMapModel({ ...roots2, cacheStableLayers: true })), rowType: FORT, fallback: null });
  ok(JSON.stringify(read) === JSON.stringify(R2) && JSON.stringify(R2) !== JSON.stringify(REACH[FORT]), "(the fixture: buildingRowReach reads the dependency's bunker, wider than the base game's)", { read, R2 });
  const r = md.ensureBuildingSlotsForState({ ...roots2, stateId: 1, provinces: [2], onlyTypes: SITES });
  const rows = fs.readFileSync(path.join(mod2, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.split(";")).filter((c) => c.length >= 7 && c[0] === "1")
    .map((c) => ({ type: c[1], px: Math.floor(+c[2]), row: MH - 1 - Math.floor(+c[4]) }));
  const t2 = md.stateBuildingAnchor({ ...roots2, provinces: [2], each: true }).get(2), T = t2 ? { px: Math.floor(t2.x), row: MH - 1 - Math.floor(t2.z) } : { px: -9, row: -9 };
  const id2 = (q) => (q.px >= 0 && q.row >= 0 && q.px < MW && q.row < MH ? prov2(q.px, q.row) : -1);
  const off2 = (p, R) => pixelsOf(p, R).filter((q) => id2(q) !== 2).length;
  /** the rule over the island by brute force, keys 1–6, at reach R, every point in `kept` and the town point kept clear of */
  const best2 = (kept, R) => {
    let top = null, out = [];
    for (let row = ISLE[1]; row < ISLE[3]; row++) for (let px = ISLE[0]; px < ISLE[2]; px++) {
      const p = { px, row }, m = Math.min(...[T].concat(kept).map((q) => cheb(p, q)));
      if (m < 1) continue;
      const f = [-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => id2({ px: px + dx, row: row + dy }) === 2)), d = Math.hypot(px - T.px, row - T.row);
      const k = [f && m >= 2 ? 0 : 1, off2(p, R), off2(p, R), f && m >= 3 ? 0 : 1, d <= md.SITE_FAR ? 0 : 1, Math.floor(Math.abs(d - md.SITE_FROM_TOWN) / 2)];
      const cmp = top ? k.findIndex((v, i) => v !== top[i]) : -1;
      if (!top || (cmp >= 0 && k[cmp] < top[cmp])) { top = k; out = [p]; } else if (cmp === -1) out.push(p);
    }
    return out;
  };
  const typed = best2([], REACH[FORT]);
  ok(typed.length > 0 && typed.every((p) => off2(p, R2) > 0), "(the fixture: every best spot at the base game's reach would hang the dependency's fort over the sea)", typed.slice(0, 3));
  const fort = rows.find((q) => q.type === FORT), site = rows.find((q) => q.type === SPEC);
  ok(!!r && r.changed && !!fort && !!site && rows.length === SITES.length, "the call writes the island its fort and its special-project site", { r, rows });
  ok(!!fort && off2(fort, R2) === 0 && has(best2([], R2), fort), "⭐⭐ the fort stands where the dependency's whole model is on the island: the rule's best spot at that reach", { fort, off: fort && off2(fort, R2) });
  ok(!!site && has(best2(fort ? [fort] : [], REACH[SPEC]), site), "⭐ …and the special-project site, which the dependency does not draw, at the base game's reach, clear of the fort", site);
}

console.log("\n-- G. the installed game: SITE_FROM_TOWN, SITE_FAR and the reaches, re-derived --");
{
  const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  if (!fs.existsSync(path.join(GAME, "map", "buildings.txt")) || !fs.existsSync(path.join(GAME, "gfx", "entities"))) console.log("  ..   SKIP: the base game is not installed at the expected path, so nothing is re-derived");
  else {
    // a row's province is its pixel: provinces.bmp and definition.csv, read here
    const bmp = fs.readFileSync(path.join(GAME, "map", "provinces.bmp")), off = bmp.readUInt32LE(10), BW = bmp.readInt32LE(18), BH = Math.abs(bmp.readInt32LE(22)), rs = Math.floor((24 * BW + 31) / 32) * 4;
    const idOf = new Map(), land = new Set();
    for (const l of fs.readFileSync(path.join(GAME, "map", "definition.csv"), "latin1").split(/\r?\n/)) { const c = l.split(";"); if (c.length < 5 || !(+c[0] > 0)) continue; idOf.set((+c[1] << 16) | (+c[2] << 8) | +c[3], +c[0]); if (c[4].trim() === "land") land.add(+c[0]); }
    const provOfRow = (x, z) => { const px = Math.floor(x), row = BH - 1 - Math.floor(z); if (px < 0 || row < 0 || px >= BW || row >= BH) return -1; const o = off + (BH - 1 - row) * rs + px * 3; return idOf.get((bmp[o + 2] << 16) | (bmp[o + 1] << 8) | bmp[o]) || -1; };
    const node = new Map(), fort = new Map();
    for (const l of fs.readFileSync(path.join(GAME, "map", "buildings.txt"), "latin1").split(/\r?\n/)) {
      const c = l.split(";"); if (c.length < 7) continue;
      const t = c[1].trim(), x = +c[2], z = +c[4], p = provOfRow(x, z);
      if (!land.has(p)) continue;
      if (t === "supply_node" && !node.has(p)) node.set(p, { x, z });
      if (t === FORT && !fort.has(p)) fort.set(p, { x, z });
    }
    const d = [...node].filter(([p]) => fort.has(p)).map(([p, a]) => Math.hypot(a.x - fort.get(p).x, a.z - fort.get(p).z)).sort((a, b) => a - b);
    const q = (f) => d[Math.min(d.length - 1, Math.floor(f * d.length))], onePoint = d.filter((v) => v < 0.5).length / d.length;
    ok(d.length > 5000 && Math.abs(q(0.5) - md.SITE_FROM_TOWN) <= 1 && Math.abs(q(0.9) - md.SITE_FAR) <= 1,
      `⭐⭐ SITE_FROM_TOWN ${md.SITE_FROM_TOWN} and SITE_FAR ${md.SITE_FAR} are the base game's median and 90th percentile depot → fort distance (${q(0.5).toFixed(2)}, ${q(0.9).toFixed(2)} over ${d.length} provinces), to a pixel`);
    ok(onePoint < 0.02, `(…and the base game stands the fort on its depot's point in ${(100 * onePoint).toFixed(1)}% of them)`, onePoint);
    // the models: which buildings stand on each row (common/buildings: spawn_point, else the building's own name), their entities and
    // their bombed twins (gfx/entities/*.asset: pdxmesh, scale), the pdxmeshes (any .gfx under gfx/: file, scale), the .mesh aabb
    const strip = (t) => t.replace(/#[^\n]*/g, "");
    const topBlocks = (t) => {
      const out = [];
      let depth = 0, start = -1, key = null;
      for (let i = 0; i < t.length; i++) {
        if (t[i] === "{") { if (depth === 0) { const m = /([A-Za-z0-9_.]+)\s*=\s*$/.exec(t.slice(Math.max(0, i - 200), i)); key = m ? m[1] : null; start = i + 1; } depth++; }
        else if (t[i] === "}" && depth > 0 && --depth === 0) out.push({ key, body: t.slice(start, i) });
      }
      return out;
    };
    const topText = (body) => { let d = 0, s = ""; for (const ch of body) { if (ch === "{") d++; if (d === 0) s += ch; if (ch === "}") d--; } return s; };
    const scalar = (body, k) => { const m = new RegExp(`(?<![A-Za-z0-9_])${k}\\s*=\\s*"?([^"\\s}]+)"?`, "i").exec(topText(body)); return m ? m[1] : null; };
    const files = (dir, ext) => { const out = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.toLowerCase().endsWith(ext)) out.push(p); } }; walk(dir); return out; };
    const rowType = new Map();
    for (const f of files(path.join(GAME, "common", "buildings"), ".txt")) {
      for (const top of topBlocks(strip(fs.readFileSync(f, "latin1")))) if (top.key === "buildings") for (const b of topBlocks(top.body)) rowType.set(b.key, scalar(b.body, "spawn_point") || b.key);
    }
    const entityScale = new Map();                                     // entity name → [pdxmesh, its scale]
    for (const f of files(path.join(GAME, "gfx", "entities"), ".asset")) for (const e of topBlocks(strip(fs.readFileSync(f, "latin1")))) {
      if (e.key !== "entity") continue;
      const name = scalar(e.body, "name"), mesh = scalar(e.body, "pdxmesh");
      if (name && mesh) entityScale.set(name, [mesh, +(scalar(e.body, "scale") || 1)]);
    }
    const meshOf = new Map();                                          // pdxmesh name → [file, its scale]
    for (const f of files(path.join(GAME, "gfx"), ".gfx")) for (const o of topBlocks(strip(fs.readFileSync(f, "latin1")))) {
      if (String(o.key).toLowerCase() !== "objecttypes") continue;
      for (const b of topBlocks(o.body)) if (String(b.key).toLowerCase() === "pdxmesh" && scalar(b.body, "name")) meshOf.set(scalar(b.body, "name"), [scalar(b.body, "file"), +(scalar(b.body, "scale") || 1)]);
    }
    const aabb = (buf) => {
      const tri = (name) => { const out = [], needle = Buffer.concat([Buffer.from([0x21, name.length]), Buffer.from(name + "f", "latin1")]); for (let i = buf.indexOf(needle); i !== -1; i = buf.indexOf(needle, i + needle.length)) out.push([0, 1, 2].map((k) => buf.readFloatLE(i + needle.length + 4 + 4 * k))); return out; };
      const mins = tri("min"), maxs = tri("max");
      return mins.length ? { min: [0, 1, 2].map((k) => Math.min(...mins.map((v) => v[k]))), max: [0, 1, 2].map((k) => Math.max(...maxs.map((v) => v[k]))) } : null;
    };
    const rules = new Map([...rowType].map(([b, t]) => [b, { rowType: t }]));
    for (const t of SITES) {
      const buildings = [...rowType].filter(([, rt]) => rt === t).map(([b]) => b);
      const entities = buildings.flatMap((b) => [`building_${b}`, `building_${b}_destroyed`]).filter((e) => entityScale.has(e));
      let derived = null;
      for (const e of entities) {
        const [mesh, es] = entityScale.get(e), [file, ms] = meshOf.get(mesh) || [];
        const box = file && fs.existsSync(path.join(GAME, file)) ? aabb(fs.readFileSync(path.join(GAME, file))) : null;
        if (!box) continue;
        const up = (v) => Math.ceil(100 * Math.max(0, v) * es * ms) / 100, r = { west: up(-box.min[0]), east: up(box.max[0]), south: up(-box.min[2]), north: up(box.max[2]) };
        derived = derived ? Object.fromEntries(Object.keys(r).map((k) => [k, Math.max(derived[k], r[k])])) : r;
      }
      ok(buildings.length > 0 && entities.length > buildings.length && !!derived, `(${t}: drawn with ${buildings.join(", ")} — common/buildings — and ${entities.length} entities, the bombed twins among them)`, { buildings, entities });
      ok(JSON.stringify(derived) === JSON.stringify((md.SITE_REACH || {})[t]), `⭐⭐ SITE_REACH.${t} is the widest of those models, read off the installed game`, { derived, SITE_REACH: (md.SITE_REACH || {})[t] });
      const read = typeof md.buildingRowReach !== "function" ? null : md.buildingRowReach({ modRoot: path.join(ROOT, "none"), gameRoot: GAME, dependencyRoots: [], rules, rowType: t, fallback: null });
      ok(JSON.stringify(read) === JSON.stringify(derived), "⭐⭐ …and buildingRowReach reads the same, entity to mesh", { read, derived });
    }
  }
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
