// ⛔ #a-factorys-copy-stands-on-a-spot-of-its-own — A STATE'S SIX CIVILIAN AND SIX MILITARY FACTORIES ARE NOT A PLUS SIGN.
//
// stateSlotLayout gives a laid-out state's civilian factories its even positions and its military ones the odd, and where a kind has
// fewer positions than rows, each further row stood one pixel aside of the one before (SLOT_STEP): a state with one or two positions per
// kind drew its factories in a plus. On the owner's flow (the TEST 35 review's block3 metric) 14 states drew 3 or more of their models in
// one 3x3 — CZE 9 five civilian factories in a plus — where the base game draws that in 2 states of 1,081, and 14.9% of the drawn factories
// stood within 1 px of another of their state's (the base game 3.8%). Such a copy is now marked (the layout's `shared`) and takes a spot
// of its own over the state's land where the land has one no worse placed than its step (provinceSiteSpots' strict): its 5x5 off the
// shore where the step's is, a 3x3 of the state's land where the step has one, not on a shore pixel where the step is not, 2 px from every
// factory and 3 from every other row. Where none is left it keeps its step. A pile's factories (a state too thin to lay out) do the same
// from their point of the pile's 3x3: spread to the coast as the pile's other rows were, a 59-px capital drew 5 factories 10–13% over
// the sea (the review's F4).
//
//   1. A roomy one-province state, laid out on 4 positions: CONTROL — the layout marks 4 or more copies of each kind, and its steps put
//      3 or more factories in one 3x3. After the click no 3x3 holds 3 or more of the state's rows, no two factories stand within 1 px,
//      each copy that moved stands on a 3x3 of the state's land off the shore, 2 px or more from every factory and 3 px or more from every
//      other row, and the first factory on each position stands exactly on its layout spot.
//   2. A small coastal state laid out on positions all on the shore, with no room left: every copy keeps its step.
//   3. A small coastal pile: CONTROL — no layout. Every factory's model (its reach, this test's own sampler) is wholly over the state's
//      land at rotation 0 and no more than LAND_ROW_RIGHT_ANGLE_MARGIN off it as turned, none on a shore pixel; and (#a-pile-spreads-over-
//      its-dry-land) no two on one point — the strict rule alone kept all twelve in the pile's 3x3, three of its points two each, since
//      in a small state every pixel round it is within BUILDING_RING_NEAR px of its town point.
//   3b. A 6x6 pile, every pixel of it off the shore within a pixel of its runway's block: CONTROL — so. Its factories stand on the
//      state's land off the shore, never two on one point (the pile's 3x3 has nine points for twelve), their models as in 3.
//   3c. A 5x5 pile whose only pixels off the shore are its 3x3: CONTROL — nine. Its twelve factories on the land off the shore, three
//      on a point another stands on and no more: one that moves stands off the point of every one that keeps its own.
//   4. Deterministic and idempotent; and each of state 1's factory rows dropped in turn comes back on its own spot.
//   5. A modder's own factory rows are left byte for byte, and the rows written beside them stand on the state's land, on no pixel
//      of theirs.
// Binds no port. Run: node test-a-factorys-copy-stands-on-a-spot-of-its-own.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-factory-copy-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

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
const FACTORY = new Set(["industrial_complex", "arms_factory"]);
const TEMPLATE = new Set(md.STATE_BUILDING_SLOTS.map(([t]) => t));
const NEAR = md.BUILDING_RING_NEAR;

// ── the fixture: one-province states, rectangles [x0, y0, x1, y1) on a 96 x 48 sea (province 1), rows top-down ─────────────────
const W = 96, H = 48, SEA = 1;
const RECT = {
  2: [4, 4, 24, 24],      // state 1: 20 x 20, laid out on 4 positions, room round them
  3: [64, 4, 73, 13],     // state 2: 9 x 9, laid out on 4 positions, every one on the shore
  4: [52, 4, 60, 12],     // state 3: 8 x 8, a pile
  5: [28, 26, 48, 46],    // state 4: 20 x 20, the modder's own factory rows
  6: [60, 30, 66, 36],    // state 5: 6 x 6, a pile whose dry land its runway takes
  7: [76, 30, 81, 35],    // state 6: 5 x 5, a pile whose only pixels off the shore are its 3x3
};
const STATES = { 1: [2], 2: [3], 3: [4], 4: [5], 5: [6], 6: [7] };
const provAt = (x, y) => { for (const [p, [x0, y0, x1, y1]] of Object.entries(RECT)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +p; return SEA; };
const stateOf = (p) => { for (const [s, L] of Object.entries(STATES)) if (L.includes(p)) return +s; return null; };
const isLand = (x, y) => y < 0 || y >= H || provAt(((x % W) + W) % W, y) !== SEA;
const shore = (x, y) => provAt(x, y) !== SEA && !(isLand(x + 1, y) && isLand(x - 1, y) && isLand(x, y - 1) && isLand(x, y + 1));
const dry5 = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!(Math.abs(dx) === 2 && Math.abs(dy) === 2) && !isLand(x + dx, y + dy)) return false; return true; };
const own3x3 = (sid, x, y) => [-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => stateOf(provAt(x + dx, y + dy)) === sid));
const colour = (p) => [(p * 37) % 256, (p * 71) % 256, 40 + p];
const heightOf = (x, y) => (provAt(x, y) === SEA ? 80 : 110 + ((x * 3 + y * 5) % 80));
// the modder's own rows of state 4: three civilian factories, hand-placed (one turned), in the mod's own number format
const HAND = ["4;industrial_complex;35.30;20.00;12.70;0.40;0", "4;industrial_complex;41.00;20.00;14.00;0.00;0", "4;arms_factory;33.50;20.00;8.25;1.57;0"];
function makeMod(dir) {
  write(dir, "descriptor.mod", 'name="factory-copy"\nreplace_path="history/states"\nreplace_path="map"\n');
  write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  write(dir, "map/heightmap.bmp", bmp8(W, H, heightOf));
  write(dir, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`]
    .concat(Object.keys(RECT).map((p) => `${p};${colour(+p).join(";")};land;false;plains;1`)).join("\n") + "\n");
  for (const [s, provs] of Object.entries(STATES)) write(dir, `history/states/${s}-S.txt`, `state = {\n\tid = ${s}\n\tname = "STATE_${s}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`);
  write(dir, "map/buildings.txt", ["99;radar_station;1.00;9.50;1.00;0.00;0"].concat(HAND).join("\n") + "\n");
}
const modA = path.join(ROOT, "a"), modB = path.join(ROOT, "b");
makeMod(modA); makeMod(modB);
const rootsA = { modRoot: modA, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
const BT = path.join(modA, "map", "buildings.txt");
const readRows = (dir) => fs.readFileSync(path.join(dir, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(";")).filter((c) => c.length >= 7)
  .map((c) => { const x = +c[2], z = +c[4]; return { line: c.join(";"), sid: +c[0], type: c[1], x, z, rot: +c[5], px: Math.floor(x), row: H - 1 - Math.floor(z), spot: `${c[1]};${c[2]};${c[4]}` }; });
const pix = (t) => ({ px: Math.floor(t.x), row: H - 1 - Math.floor(t.z) });
const cheb = (a, b) => Math.max(Math.abs(a.px - b.px), Math.abs(a.row - b.row));
const most3x3 = (L) => { let best = 0; for (const a of L) for (let ox = -2; ox <= 0; ox++) for (let oy = -2; oy <= 0; oy++) { const n = L.filter((q) => q.px >= a.px + ox && q.px <= a.px + ox + 2 && q.row >= a.row + oy && q.row <= a.row + oy + 2).length; if (n > best) best = n; } return best; };
const spreadOf = (sid) => md.stateBuildingAnchor({ ...rootsA, provinces: STATES[sid], positions: true, stateId: sid }) || {};
/** this test's own sampler: the share of the model of `reach` at (x, z) turned `a` counter-clockwise (x east, z north) off state `sid`'s land */
const offShare = (sid, x, z, a, reach) => {
  const cs = Math.cos(a), sn = Math.sin(a), st = 0.1;
  let n = 0, k = 0;
  for (let u = -reach.west + st / 2; u < reach.east; u += st) for (let v = -reach.south + st / 2; v < reach.north; v += st) {
    n++;
    if (stateOf(provAt(Math.floor(x + u * cs - v * sn), H - 1 - Math.floor(z + u * sn + v * cs))) !== sid) k++;
  }
  return k / n;
};

// the layouts before any row is written
const L = Object.fromEntries(Object.keys(STATES).map((s) => [s, md.stateSlotLayout(spreadOf(+s))]));
console.log("\n=== the click: Auto-fix's slot pass furnishes every state ===");
const fixed = md.fixStatesWithoutBuildingSlots(rootsA);
ok(fixed && fixed.fixed === Object.keys(STATES).length && !(fixed.failed || []).length, `fixStatesWithoutBuildingSlots gave each of the ${Object.keys(STATES).length} states its rows`, fixed);
const rows = readRows(modA);
const own = (sid) => rows.filter((r) => r.sid === sid && TEMPLATE.has(r.type));

console.log("\n=== 1. a roomy state laid out on 4 positions: its copies on spots of their own ===");
{
  const L1 = L[1], mine = own(1), fac = mine.filter((r) => FACTORY.has(r.type));
  const steps = L1 ? ["industrial_complex", "arms_factory"].flatMap((t) => L1.get(t).map(pix)) : [];
  const marked = L1 ? ["industrial_complex", "arms_factory"].map((t) => L1.shared.get(t).filter(Boolean).length) : [0, 0];
  ok(!!L1 && spreadOf(1).positions.length === 4 && marked.every((n) => n >= 4) && most3x3(steps) >= 3,
    `CONTROL: laid out on 4 positions, the layout marks ${marked.join(" and ")} copies of each kind, and its steps put ${most3x3(steps)} factories in one 3x3`, { marked, most: most3x3(steps) });
  ok(fac.length === 12 && mine.length === md.STATE_BUILDING_SLOTS.reduce((n, [, k]) => n + k, 0), "(its 12 factory rows and the rest of its template written)", { fac: fac.length, rows: mine.length });
  ok(most3x3(mine) <= 2, `⭐⭐ no 3x3 holds 3 or more of the state's rows (${most3x3(mine)} at most) — the base game draws that in 2 states of 1,081`, mine.map((r) => [r.type, r.px, r.row]));
  const close = fac.filter((r) => fac.some((f) => f !== r && cheb(f, r) <= 1));
  ok(!close.length, "⭐⭐ no two of its factories within 1 px", close.map((r) => [r.type, r.px, r.row]));
  const first = L1 ? ["industrial_complex", "arms_factory"].flatMap((t) => L1.get(t).filter((_, k) => !L1.shared.get(t)[k]).map((s) => ({ type: t, ...pix(s) }))) : [];
  ok(first.length >= 2 && first.every((s) => fac.some((r) => r.type === s.type && r.px === s.px && r.row === s.row)), `⭐ the first factory on each of its positions stands exactly on its layout spot (${first.length})`, first);
  const moved = fac.filter((r) => !first.some((s) => s.type === r.type && s.px === r.px && s.row === r.row));
  const placedWell = (r) => own3x3(1, r.px, r.row) && dry5(r.px, r.row) && fac.every((f) => f === r || cheb(f, r) >= 2) && mine.filter((o) => !FACTORY.has(o.type)).every((o) => cheb(o, r) >= NEAR);
  ok(moved.length >= 8 && moved.every(placedWell), `⭐⭐ each of its ${moved.length} copies stands on a 3x3 of the state's land off the shore, 2 px or more from every factory and ${NEAR} from every other row`, moved.filter((r) => !placedWell(r)).map((r) => [r.type, r.px, r.row]));
}

console.log("\n=== 2. a small coastal state, its positions all on the shore: no room, so every copy keeps its step ===");
{
  // (the click's layout yields to the runway it writes, so the spots are checked against the positions: a step is a pixel aside of one)
  const L2 = L[2], P = (spreadOf(2).positions || []).map((p) => ({ ...pix(p), shore: p.shore }));
  const fac = own(2).filter((r) => FACTORY.has(r.type));
  ok(!!L2 && P.length >= 3 && P.every((p) => p.shore), `(the fixture: laid out on ${P.length} positions, every one marked \`shore\`)`, P);
  const off = fac.filter((r) => !P.some((p) => cheb(p, r) <= 1));
  ok(fac.length === 12 && !off.length, "⭐ every factory row stands on a position or a pixel aside of one — each copy on its step: a spot any worse is no better than that", off.map((r) => [r.type, r.px, r.row]));
  ok(fac.every((r) => stateOf(provAt(r.px, r.row)) === 2), "…every one on the state's own land", fac.filter((r) => stateOf(provAt(r.px, r.row)) !== 2).map((r) => [r.type, r.px, r.row]));
}

console.log("\n=== 3. a small coastal pile: its factories on its land, none spread to the sea ===");
{
  const fac = own(3).filter((r) => FACTORY.has(r.type));
  ok(L[3] === null && fac.length === 12, "CONTROL: stateSlotLayout gives the state no layout (a pile), and its 12 factory rows are written", { pile: L[3] === null, fac: fac.length });
  // (wholly at rotation 0; turned, no more than LAND_ROW_RIGHT_ANGLE_MARGIN of it further off, the most a turn may cost — a factory
  // spread to the edge of the dry land is turned as every land row is, #a-land-model-is-turned-as-the-base-game-turns-its-own)
  const MARGIN = md.LAND_ROW_RIGHT_ANGLE_MARGIN;
  const wet = fac.filter((r) => offShare(3, r.x, r.z, 0, md.LAND_ROW_REACH[r.type]) > 0 || offShare(3, r.x, r.z, r.rot, md.LAND_ROW_REACH[r.type]) > MARGIN);
  ok(MARGIN > 0 && MARGIN <= 0.05 && !wet.length, `⭐⭐ every factory's model stands wholly on the state's land at rotation 0, and turned as written no more than ${MARGIN} of it off — none over the sea (the review's measure: more than 5%)`, wet.map((r) => [r.type, r.px, r.row, offShare(3, r.x, r.z, 0, md.LAND_ROW_REACH[r.type]).toFixed(3), offShare(3, r.x, r.z, r.rot, md.LAND_ROW_REACH[r.type]).toFixed(3)]));
  ok(fac.every((r) => !shore(r.px, r.row)), "⭐ …none on a shore pixel", fac.filter((r) => shore(r.px, r.row)).map((r) => [r.type, r.px, r.row]));
  // ⛔ #a-pile-spreads-over-its-dry-land — and not all twelve left in the pile's 3x3, three of its points holding two each: the dry land
  // off the runway holds them a pixel or more apart (twelve points, so three or more off the 3x3)
  const stacked = fac.filter((r, i) => fac.some((f, j) => j < i && f.px === r.px && f.row === r.row));
  ok(!stacked.length, `⭐⭐ no two of its factories on one point (${most3x3(fac)} at most in one 3x3; all 12 before, three points holding two each)`, stacked.map((r) => [r.type, r.px, r.row]));
}

console.log("\n=== 3b. a smaller pile, whose only dry land its runway takes: its factories there, never two on one point ===");
{
  const fac = own(5).filter((r) => FACTORY.has(r.type)), air = own(5).find((r) => r.type === "air_base");
  ok(L[5] === null && fac.length === 12 && !!air, "CONTROL: a pile too, its 12 factory rows and its air base written", { pile: L[5] === null, fac: fac.length, air: !!air });
  const blk = air ? { c0: Math.floor(air.x - md.AIRFIELD_REACH.west), c1: Math.ceil(air.x + md.AIRFIELD_REACH.east) - 1, r0: Math.floor(H - air.z - md.AIRFIELD_REACH.north), r1: Math.ceil(H - air.z + md.AIRFIELD_REACH.south) - 1 } : null;
  const dry = [];
  for (let y = 30; y < 36; y++) for (let x = 60; x < 66; x++) if (!shore(x, y)) dry.push({ px: x, row: y });
  ok(!!blk && dry.length && dry.every((p) => p.px >= blk.c0 - 1 && p.px <= blk.c1 + 1 && p.row >= blk.r0 - 1 && p.row <= blk.r1 + 1), `CONTROL: every one of its ${dry.length} pixels off the shore is within a pixel of the runway's block — a factory off the shore stands on the runway's land`, { blk, dry });
  ok(fac.every((r) => stateOf(provAt(r.px, r.row)) === 5 && !shore(r.px, r.row)), "⭐ every factory on the state's land, none on a shore pixel", fac.filter((r) => stateOf(provAt(r.px, r.row)) !== 5 || shore(r.px, r.row)).map((r) => [r.type, r.px, r.row]));
  const stacked = fac.filter((r, i) => fac.some((f, j) => j < i && f.px === r.px && f.row === r.row));
  ok(!stacked.length, "⭐⭐ no two of its factories on one point — the pile's 3x3 has nine points for twelve, and its other dry pixels are free", stacked.map((r) => [r.type, r.px, r.row]));
  // (as in 3: wholly at rotation 0, and turned no more than the margin a turn may cost)
  const MARGIN = md.LAND_ROW_RIGHT_ANGLE_MARGIN;
  const wet = fac.filter((r) => offShare(5, r.x, r.z, 0, md.LAND_ROW_REACH[r.type]) > 0 || offShare(5, r.x, r.z, r.rot, md.LAND_ROW_REACH[r.type]) > MARGIN);
  ok(!wet.length, `⭐⭐ every factory's model stands wholly on the state's land at rotation 0, and turned as written no more than ${MARGIN} of it off — spread round the runway, not over the sea`, wet.map((r) => [r.type, r.px, r.row, offShare(5, r.x, r.z, 0, md.LAND_ROW_REACH[r.type]).toFixed(3), offShare(5, r.x, r.z, r.rot, md.LAND_ROW_REACH[r.type]).toFixed(3)]));
}

console.log("\n=== 3c. a pile with no pixel off the shore but its 3x3: twelve factories on nine points, no more doubled up than that forces ===");
{
  const fac = own(6).filter((r) => FACTORY.has(r.type));
  const dry = [];
  for (let y = 30; y < 35; y++) for (let x = 76; x < 81; x++) if (!shore(x, y)) dry.push({ px: x, row: y });
  ok(L[6] === null && fac.length === 12 && dry.length === 9, `CONTROL: a pile, its 12 factory rows written, ${dry.length} pixels off the shore`, { pile: L[6] === null, fac: fac.length, dry: dry.length });
  ok(fac.every((r) => stateOf(provAt(r.px, r.row)) === 6 && !shore(r.px, r.row)), "⭐ every factory on the state's land, none on a shore pixel", fac.filter((r) => stateOf(provAt(r.px, r.row)) !== 6 || shore(r.px, r.row)).map((r) => [r.type, r.px, r.row]));
  const stacked = fac.filter((r, i) => fac.some((f, j) => j < i && f.px === r.px && f.row === r.row));
  ok(stacked.length === fac.length - dry.length, `⭐⭐ ${stacked.length} of them on a point another stands on — the ${fac.length - dry.length} that nine points leave over, no more: a factory that moves does not stand on the point of one that keeps its own`, stacked.map((r) => [r.type, r.px, r.row]));
}

console.log("\n=== 4. deterministic, idempotent, and a lost factory row comes back on its own spot ===");
{
  const r2 = md.fixStatesWithoutBuildingSlots({ modRoot: modB, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] });
  ok(r2 && r2.fixed === Object.keys(STATES).length && fs.readFileSync(path.join(modB, "map", "buildings.txt"), "utf8") === fs.readFileSync(BT, "utf8"), "⭐⭐ the same click on a second copy writes the same bytes", r2);
  const before = fs.readFileSync(BT, "utf8");
  const again = md.fixStatesWithoutBuildingSlots(rootsA);
  ok(again && !again.fixed && fs.readFileSync(BT, "utf8") === before, "a second click writes nothing", again);
  const spotOf = (l) => { const c = l.split(";"); c[5] = "*"; return c.join(";"); };
  const lines = before.split(/\r?\n/).filter(Boolean), fl = lines.filter((l) => /^1;(industrial_complex|arms_factory);/.test(l));
  const wrong = [];
  for (const l of fl) {
    fs.writeFileSync(BT, lines.filter((x) => x !== l).join("\n") + "\n");
    const top = md.ensureBuildingSlotsForState({ ...rootsA, stateId: 1, provinces: STATES[1] });
    const now = fs.readFileSync(BT, "utf8").split(/\r?\n/).filter(Boolean);
    if (!(top && top.added === 1) || JSON.stringify(now.map(spotOf).sort()) !== JSON.stringify(lines.map(spotOf).sort())) wrong.push({ l, top, back: now.filter((x) => !lines.includes(x)) });
  }
  fs.writeFileSync(BT, before);
  ok(fl.length === 12 && !wrong.length, `⭐⭐ each of state 1's ${fl.length} factory rows, dropped in turn, comes back on the very spot it had`, wrong);
}

console.log("\n=== 5. a modder's own factory rows are never moved ===");
{
  const text = fs.readFileSync(BT, "utf8").split(/\r?\n/);
  ok(HAND.every((l) => text.filter((t) => t === l).length === 1), "⭐⭐ the three hand-placed rows are in the file byte for byte, once each", HAND.filter((l) => text.filter((t) => t === l).length !== 1));
  const fac = own(4).filter((r) => FACTORY.has(r.type)), hand = fac.filter((r) => HAND.includes(r.line)), mine = fac.filter((r) => !HAND.includes(r.line));
  ok(fac.length === 12 && hand.length === 3, "(the state holds 12 factory rows: its 3 and the 9 the click added)", { fac: fac.length, hand: hand.length });
  ok(mine.length === 9 && mine.every((r) => stateOf(provAt(r.px, r.row)) === 4 && !hand.some((h) => h.px === r.px && h.row === r.row)), "…and the 9 it added stand on the state's own land, none on a pixel of theirs", mine.map((r) => [r.type, r.px, r.row]));
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
