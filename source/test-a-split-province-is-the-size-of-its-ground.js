// ⛔ #a-split-province-is-the-size-of-its-ground — A RAISED PROVINCE IS CUT TO THE SIZE THE MAP BELOW DRAWS ITS GROUND AT.
//
// The split cut every raised ocean province to one size whatever it would become: on the owner's flow the land came out desert 448 ·
// forest 425 · plains 425 · hills 448 · mountain 459 px against the base game's 516 · 152 · 127 · 120 · 232, its spread p90/p10 4.0
// against 11.0 (critic P3). Now each raised province is given the terrain the click would give it (terrainOfGeneratedLand, over the
// map in memory), and its target is the median area the layer below draws that terrain at, at that latitude
// (landProvinceSizeClassesBeneath), scaled to the border budget by provinceSplitPlan.
// Pinned on a world whose layer below draws SMALL PLAINS in its north (8 px bricks) and LARGE DESERT in its south (32 px bricks),
// with an ocean of 64 px cells beside it that the click raises — every class median derived here from the layer below's own files:
//   1. the size classes: the layer below's median per (terrain, latitude band), per terrain and over all its land, exactly as this
//      test reads them off its files; a class of fewer than LAND_SIZE_CLASS_MIN provinces gives way to its terrain, a terrain the
//      layer below lacks to all its land; between two band centres the size is blended, never a jump at a band edge;
//   2. the cut: the plains pieces' median is under the desert pieces' by at least half the layer below's own ratio, and the report
//      says it was cut by the ground, with the provisional terrain of every raised province; and each parent is sized AT ITS OWN
//      LATITUDE: the plains raised where the layer below draws 128 px plains are cut larger than those raised where it draws 64 px
//      (review F3: a cut reading every parent at no latitude, or at the mirrored one, stayed green);
//   3. …and so it is when the border budget binds, which it still keeps;
//   4. where the layer below grows one ground at each latitude (this world), the provisional terrain IS the click's own: an uncut
//      twin (splitLargeProvinces: false) writes the raised provinces the same terrains the report counts;
//   5. the terrain is chosen again per piece after the cut, dealt out by count, and that alone made the owner's desert SMALLER: so a
//      province the cut sized keeps a ground the layer below draws within SPLIT_GROUND_SIZE_FACTOR of the size it was cut for
//      (keepSplitPiecesToTheirGround, pure: a desert piece drawn as a plain keeps desert, a forest beside a plain stays forest) —
//      but only where the piece's own latitude band grows that ground below: a desert family's piece in the plains-only north stays
//      plains (unguarded, the owner's flow got 2 jungle provinces in a band the base game grows none in);
//   6. a second world whose south has LARGE desert and SMALL plains side by side, and whose ocean rows are offset so one of them
//      reaches from a band that grows desert below into one that grows none:
//      · ⭐ the provisional ground is dealt by the PROVINCES IT WILL MAKE (review F1): dealt over ocean-sized provinces by count,
//        desert took its count share of the AREA, and once cut to its size its few large pieces were a fraction of its count share
//        of the provinces (the owner's flow: 8.7% of the provinces uncut → 3.9% cut). So the cut world's desert is the uncut click's
//        share of the provinces within the factor, and at least its share of the area; and a budget that allows no cut deals the
//        ground exactly as the uncut click does (a province the cut leaves whole is not dealt the large grounds by their size);
//        and the pieces are counted at the scale the cut then cuts at (the last deal's scale is the plan's, within
//        SPLIT_DEAL_SCALE_TOLERANCE). Not the area share of the uncut twin (the review's proposal): the twin cuts nothing, so its
//        area share is its count share, and the base game itself draws desert at 8.0% of its provinces and 14.6% of its land;
//      · Generate land keeps it: every province of every cut family stands on a ground of the size it was cut for (the ground the
//        cut reports for its parent, checked against the pieces' own sizes) — except where its own band grows none of that ground,
//        where the guard holds it back, as many as Generate land's report says (review F3: the guard never fired inside Generate
//        land on the old fixtures, and a latitude-blind keep rule stayed green);
//   7. the page says it (generatedProvinceSplitNote, lifted out of public/map.js): which grounds came out smaller and which larger,
//      named from the sizes the layer below draws the grounds the cut used at — never a fixed sentence (review F4: "smaller in the
//      plains and forests, larger in the deserts and mountains" was false over Millennium Dawn, Old World Blues and Hearts of
//      Minecraft) — and a binding cut as a multiple of a typical province of that ground, never the scale as "px each".
// Binds no port. Run: node test-a-split-province-is-the-size-of-its-ground.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-split-ground-"));
// BEFORE map-data.js loads: app data, ~/.nova (the split record lives there), the mods root and the game are this test's
process.env.APPDATA = path.join(ROOT, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
process.env.HOI4_MODS_ROOT = path.join(ROOT, "mods");
process.env.HOI4_ROOT = path.join(ROOT, "game");
for (const d of [process.env.APPDATA, process.env.NOVA_HOME_DIR, process.env.HOI4_MODS_ROOT]) fs.mkdirSync(d, { recursive: true });
const md = require("./map-data.js");
const SW = require("./testlib-split-world.js");
const P = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!cond) fails.push(label);
};
const lowerMedian = (v) => { const s = v.slice().sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };

// ── the world: SW's ocean of 64 px cells in the west half; in the east half SMALL bricks north of y = 120 — 8 × 8 px down to y = 68,
// 16 × 8 below that, so two latitude bands of plains differ — and LARGE ones (32 × 32 px) south of it. Every row boundary is offset
// from every other (8j − 4 in the north, 104 + 32j in the south, 64k in the ocean, and the line between the two at 120); the 8 px
// rows are shifted 0 / 4, the 16 px rows 4 / 12 and the 32 px rows 0 / 16, so no vertical edge of one row meets one of the row
// next to it — every corner is a T and nothing crosses (asserted below).
const { W, H, SEA_W } = SW;
const SPLIT_Y = 120;
// the second world's ocean (§6): rows from y = 42 + 64k, so the row 106–169 has its middle in band 4, where the layer below grows
// desert, and reaches up into band 3 (96–127), where it grows none. 42 + 64k is 2 past a multiple of 8: never one of the land's row
// boundaries (8j − 4, 104 + 32j, the line at 120), on the ocean's east edge or across the date-line seam
const OCEAN2_Y = 42;
const ocean2Key = (x, y) => { const r = Math.floor((y + 64 - OCEAN2_Y) / 64), off = r % 2 ? 32 : 0; return `o${r}_${Math.floor((x + off) / 64)}`; };
const keyAt = (x, y, mixedSouth) => {
  if (x < SEA_W) return mixedSouth ? ocean2Key(x, y) : SW.brickKey(x, y);
  const lx = x - SEA_W;
  if (y < SPLIT_Y) {
    const r = Math.floor((y + 4) / 8);
    if (r <= 8) { const off = r % 2 ? 4 : 0; return `l${r}_${Math.floor((lx + off) / 8)}`; }
    const off = r % 2 ? 4 : 12;
    return `l${r}_${Math.floor((lx + off) / 16)}`;
  }
  // the second world (§6): the south's eastern half is SMALL 8 px bricks too (shifted 0 / 4 the other way round from the north's,
  // so the row on the line meets the 16 px row above it in Ts), and its western half large bricks of 16 × 32 px (shifted 0 / 8), so
  // the layer below has as many desert provinces as a size class needs
  if (mixedSouth && lx >= SEA_W / 2) { const r = Math.floor((y + 4) / 8), off = r % 2 ? 0 : 4; return `l${200 + r}_${Math.floor((lx + off) / 8)}`; }
  if (mixedSouth) { const r = Math.floor((y - SPLIT_Y + 16) / 32), off = r % 2 ? 8 : 0; return `l${100 + r}_${Math.floor((lx + off) / 16)}`; }
  const r = Math.floor((y - SPLIT_Y + 16) / 32), off = r % 2 ? 16 : 0;
  return `l${100 + r}_${Math.floor((lx + off) / 32)}`;
};
function makeWorld(mixedSouth = false) {
  const keys = new Array(W * H), idOf = new Map(), keyOf = new Map(), first = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = keyAt(x, y, mixedSouth); keys[y * W + x] = k; if (!idOf.has(k)) { idOf.set(k, idOf.size + 1); keyOf.set(idOf.size, k); first.set(k, y * W + x); } }
  const modIds = new Int32Array(W * H);
  for (let i = 0; i < W * H; i++) modIds[i] = idOf.get(keys[i]);
  const colourOf = (id) => (((id & 255) << 16) | (((id >> 8) & 255) << 8) | 77) >>> 0;
  const typeOf = (id) => (String(keyOf.get(id) || "").startsWith("o") ? "sea" : "land");
  const firstPx = (id) => first.get(keyOf.get(id));
  const regionOf = (id) => { const i = firstPx(id), x = i % W, y = Math.floor(i / W); return Math.floor(x / 128) + 4 * Math.floor(y / 128) + 1; };
  const rowOf = (id) => { const m = /^l(\d+)_/.exec(keyOf.get(id)); return m ? +m[1] : -1; };
  return { W, H, N: idOf.size, keyAt: keys, idOf, keyOf, modIds, gameIds: Int32Array.from(modIds), colourOf, pattern: colourOf, typeOf, regionOf, rowOf, firstPx, extras: [], big: [] };
}
// a layer below for a world: makeGame's, with its land's terrain the test's — desert on the LARGE bricks (keys l1xx_), plains on
// every small one (makeGame wrote one terrain of each by id)
const SEED = 1;
function setUp(S, gameDir, rules) {
  const GAME = SW.makeGame(gameDir, S, { terrain: true, rules });
  const f = path.join(GAME.root, "map", "definition.csv");
  const out = fs.readFileSync(f, "utf8").split("\n").map((l) => { const c = l.split(";"); if (!/^\d+$/.test(c[0]) || c[0] === "0" || c[4] !== "land") return l; c[6] = /^l1\d\d_/.test(S.keyOf.get(+c[0])) ? "desert" : "plains"; return c.join(";"); });
  fs.writeFileSync(f, out.join("\n"));
  const LAND = [], SEA = [];
  for (let id = 1; id <= S.N; id++) (S.typeOf(id) === "land" ? LAND : SEA).push(id);
  const mod = (name) => SW.makeMod(path.join(process.env.HOI4_MODS_ROOT, name), S, { name, keepLand: new Set(LAND) });   // only the ocean is sea
  const BASE = { gameRoot: GAME.root, dependencyRoots: [], count: SEA.length, seed: SEED, ownerMode: "inherit", owner: "" };
  return { game: GAME.root, SEA, mod, gen: (m, extra) => md.generateLand(Object.assign({ modRoot: m }, BASE, extra || {})) };
}
const S = makeWorld();
// …and map/adjacency_rules.txt names one ocean cell of the north (a strait's icon): the click raises it but never cuts it, so the
// provinces it raises are more than the parents it cuts — the terrain is chosen over all of them, uncut and cut alike (§4)
const RULED = S.idOf.get("o0_2");
const { game, SEA, mod, gen } = setUp(S, process.env.HOI4_ROOT,
  `adjacency_rule = {\n\tname = "R_RULE"\n\tcontested = { army = no navy = no submarine = no trade = no }\n\trequired_provinces = { ${RULED} }\n\ticon = ${RULED}\n\toffset = { 0 0 0 }\n}\n`);
// a province's latitude band and fraction as Nova reads them: its pixels' mean row
const latOf = (ids, w, h) => { const n = new Map(), sy = new Map(); for (let i = 0; i < ids.length; i++) { const p = ids[i]; n.set(p, (n.get(p) || 0) + 1); sy.set(p, (sy.get(p) || 0) + Math.floor(i / w)); } const o = new Map(); for (const [p, k] of n) o.set(p, (sy.get(p) / k + 0.5) / h); return { lat: o, area: n }; };
const bandOf = (f) => Math.max(0, Math.min(7, Math.floor(8 * f)));
// the land a click raised, by its final terrain: Map(terrain → [px]) over every ocean cell of world `S0` that is land now (cut or
// whole) and every province past the fixture's last id (the pieces)
const raisedSizes = (m, S0 = S) => {
  const def = SW.readDef(path.join(m, "map", "definition.csv")), dec = SW.decode(path.join(m, "map", "provinces.bmp"), def);
  const row = new Map();
  for (const l of fs.readFileSync(path.join(m, "map", "definition.csv"), "utf8").split(/\r?\n/)) { const c = l.split(";"); if (/^\d+$/.test(c[0])) row.set(+c[0], { type: c[4], terrain: c[6] }); }
  const area = SW.areas(dec.ids), byT = new Map();
  for (const [p, r] of row) {
    if (r.type !== "land" || !(p > S0.N || S0.typeOf(p) === "sea")) continue;
    if (!byT.has(r.terrain)) byT.set(r.terrain, []);
    byT.get(r.terrain).push(area.get(p) || 0);
  }
  return { byT };
};
// …and one ground's share of those provinces and of their area
const shareOf = (byT, t) => {
  let n = 0, a = 0, nT = 0, aT = 0;
  for (const [k, v] of byT) for (const px of v) { n++; a += px; if (k === t) { nT++; aT += px; } }
  return { count: n ? nT / n : 0, area: a ? aT / a : 0, n: nT, of: n };
};
const pct = (x) => (100 * x).toFixed(1) + "%";

try {
  console.log("\n-- the fixture --");
  rec("no X-crossing in the layer below, the seam wrapped", SW.xCrossings(S.gameIds, W, H) === 0, SW.xCrossings(S.gameIds, W, H));
  // the layer below, read here from its own files: each land province's terrain, area and band
  const gDef = SW.readDef(path.join(game, "map", "definition.csv"));
  const gDec = SW.decode(path.join(game, "map", "provinces.bmp"), gDef);
  const gTerrain = new Map(); for (const l of fs.readFileSync(path.join(game, "map", "definition.csv"), "utf8").split(/\r?\n/)) { const c = l.split(";"); if (/^\d+$/.test(c[0]) && c[4] === "land" && c[0] !== "0") gTerrain.set(+c[0], c[6]); }
  const g = latOf(gDec.ids, W, H);
  const cls = new Map(), perT = new Map(), every = [];
  for (const [id, t] of gTerrain) { const a = g.area.get(id); if (!a) continue; const k = `${t}|${bandOf(g.lat.get(id))}`; (cls.get(k) || cls.set(k, []).get(k)).push(a); (perT.get(t) || perT.set(t, []).get(t)).push(a); every.push(a); }
  const MIN = md.LAND_SIZE_CLASS_MIN;
  const plainsPx = lowerMedian(perT.get("plains")), desertPx = lowerMedian(perT.get("desert")), RATIO = desertPx / plainsPx;
  rec(`the layer below draws plains small (${plainsPx} px, ${perT.get("plains").length} provinces) and desert large (${desertPx} px, ${perT.get("desert").length}): a ratio of ${RATIO.toFixed(1)}`, RATIO >= 8, { plainsPx, desertPx });
  const thinDesert = [...cls].filter(([k, v]) => k.startsWith("desert|") && v.length < MIN);
  rec(`(…and some desert band holds fewer than LAND_SIZE_CLASS_MIN = ${MIN} provinces, so the fallback is exercised; every plains band north of the line at least that)`,
    Number.isInteger(MIN) && MIN > 1 && thinDesert.length > 0 && [...cls].filter(([k]) => k.startsWith("plains|")).every(([, v]) => v.length >= MIN), [...cls].map(([k, v]) => `${k}:${v.length}`));

  console.log("\n-- 1. the size classes --");
  const R0 = mod("classes");
  const C = md.landProvinceSizeClassesBeneath({ modRoot: R0, gameRoot: game, dependencyRoots: [] });
  rec("they are read off the layer below", !!C && path.resolve(C.from) === path.resolve(game) && C.minSample === MIN, C && { from: C.from, minSample: C.minSample });
  const want = [...cls].map(([k, v]) => [k, { px: lowerMedian(v), n: v.length }]).sort();
  const got = C ? [...C.byClass].map(([k, v]) => [k, { px: v.px, n: v.n }]).sort() : [];
  rec("⭐ each (terrain, latitude band)'s median and count are the ones this test reads off the files", JSON.stringify(got) === JSON.stringify(want), { got, want });
  rec("…each terrain's, and all the land's", !!C && C.byTerrain.get("plains").px === plainsPx && C.byTerrain.get("desert").px === desertPx && C.all.px === lowerMedian(every) && C.all.n === every.length,
    C && { plains: C.byTerrain.get("plains"), desert: C.byTerrain.get("desert"), all: C.all });
  rec("(…and asked again, the same answer: one walk of the bitmap, kept)", md.landProvinceSizeClassesBeneath({ modRoot: R0, gameRoot: game, dependencyRoots: [] }) === C);
  if (C) {
    const centre = (b) => (b + 0.5) / 8;
    const fullPlains = [...cls].filter(([k, v]) => k.startsWith("plains|") && v.length >= MIN).map(([k]) => +k.split("|")[1]);
    rec("⭐ at a band's centre a full class sizes by its own median", fullPlains.length > 0 && fullPlains.every((b) => Math.abs(C.weightOf("plains", centre(b)).px - lowerMedian(cls.get(`plains|${b}`))) < 1e-9 && C.weightOf("plains", centre(b)).from === "class"),
      fullPlains.map((b) => [b, C.weightOf("plains", centre(b))]));
    const tb = +thinDesert[0][0].split("|")[1];
    const w = C.weightOf("desert", centre(tb));
    rec(`⭐ a class of fewer than ${MIN} provinces (desert in band ${tb}: ${thinDesert[0][1].length}) gives way to its terrain's median over every band`, w.from === "terrain" && w.px === desertPx, w);
    const u = C.weightOf("forest", centre(1));
    rec("…and a terrain the layer below has none of, to all its land's", u.from === "all" && u.px === lowerMedian(every), u);
    // between two band centres whose classes differ: neither a jump nor an arithmetic mean, the geometric one (a size is a ratio)
    const bands = fullPlains.filter((b) => fullPlains.includes(b + 1) && lowerMedian(cls.get(`plains|${b}`)) !== lowerMedian(cls.get(`plains|${b + 1}`)));
    const b0 = bands.length ? bands[0] : fullPlains[0], a0 = lowerMedian(cls.get(`plains|${b0}`)), a1 = lowerMedian(cls.get(`plains|${b0 + 1}`) || cls.get(`plains|${b0}`));
    const mid = C.weightOf("plains", (b0 + 1) / 8).px;
    rec(`⭐ halfway between two band centres (plains ${b0}: ${a0} px, ${b0 + 1}: ${a1} px) the size is their geometric mean, so no band edge is a size seam`,
      bands.length > 0 && Math.abs(mid - Math.sqrt(a0 * a1)) < 1e-6, { bands, mid, a0, a1 });
  }

  console.log("\n-- 2. the cut, by the ground --");
  const R1 = mod("cut");
  const r1 = gen(R1);
  const sp1 = r1.provinceSplit || {}, t1 = sp1.target || {}, prov1 = (t1.weights && t1.weights.provisional) || {};
  rec("the world was made and cut, inside the border budget (the budget does not bind here)", r1.changed === true && sp1.changed === true && sp1.newIds > 0 && t1.binds === false && t1.segmentsAfter <= t1.limit,
    { error: r1.error, sp: Object.assign({}, sp1, { regions: undefined, adjacencies: undefined }) });
  rec("⭐ the report says it was cut by the ground, each raised province sized by its class, its terrain or all the land below", t1.weights && t1.weights.by === "ground" && t1.times > 0
    && (t1.weights.from.class + t1.weights.from.terrain + t1.weights.from.all) === Object.values(t1.weights.provisional).reduce((a, b) => a + b, 0), t1.weights);
  // the raised ocean cells, north and south of the line, as this test reads them off the cut world: a family's parent, or a cell
  // the cut left whole and the click raised
  const def1 = SW.readDef(path.join(R1, "map", "definition.csv"));
  const raised = SEA.filter((id) => def1.rows.get(id) && def1.rows.get(id).type === "land");
  const cellLat = latOf(S.modIds, W, H).lat;
  const north = raised.filter((id) => cellLat.get(id) < SPLIT_Y / H), south = raised.filter((id) => cellLat.get(id) >= SPLIT_Y / H);
  rec(`(control: the click raised ocean on both sides of the line — ${north.length} north, ${south.length} south)`, north.length >= 3 && south.length >= 3, { north: north.length, south: south.length });
  rec(`(control: the cell adjacency_rules names (${RULED}) was raised and left whole, so the raised provinces outnumber the parents)`,
    raised.includes(RULED) && sp1.ruled === 1 && sp1.parents === raised.length - 1 && !(md.readProvinceSplitRecord(R1).families || []).some((f) => f.parent === RULED), { ruled: sp1.ruled, parents: sp1.parents, raised: raised.length });
  rec("⭐ the provisional terrain of every raised province is the ground below its latitude: plains north of the line, desert south of it",
    prov1.plains === north.length && prov1.desert === south.length && Object.keys(prov1).length === 2, prov1);
  const fs1 = raisedSizes(R1);
  const pl1 = fs1.byT.get("plains") || [], de1 = fs1.byT.get("desert") || [];
  const m1 = { plains: lowerMedian(pl1), desert: lowerMedian(de1), n: [pl1.length, de1.length] };
  console.log(`   MEASURE free cut: plains pieces ${m1.plains} px (${pl1.length}) · desert pieces ${m1.desert} px (${de1.length}) · ratio ${(m1.desert / m1.plains).toFixed(1)} against the layer below's ${RATIO.toFixed(1)}`);
  rec(`⭐⭐ the plains pieces' median is under the desert pieces' by at least half the layer below's own ratio (${(RATIO / 2).toFixed(1)}×)`,
    pl1.length > 0 && de1.length > 0 && m1.desert / m1.plains >= RATIO / 2, m1);
  // review F3 — the latitude half, end to end: the plains families raised in the ocean's first row (y 0–63) against its second (64–127).
  // The layer below draws 64 px plains in the first row's band and 128 px in the second's (8 px bricks north of y = 68, 16 × 8 below
  // that); the expected ratio is those two classes' own, read off its files here. Read at no latitude, or at the mirrored one, both
  // rows were cut alike.
  {
    const fams1 = md.readProvinceSplitRecord(R1).families || [];
    const ar1 = SW.areas(SW.decode(path.join(R1, "map", "provinces.bmp"), def1).ids);
    const rowPx = [[], []], rowBand = [new Set(), new Set()];
    for (const f of fams1) {
      const m = /^o(\d+)_/.exec(S.keyOf.get(f.parent) || "");
      if (!m || +m[1] > 1) continue;
      rowBand[+m[1]].add(bandOf(cellLat.get(f.parent)));
      for (const q of [f.parent, ...f.pieces]) rowPx[+m[1]].push(ar1.get(q) || 0);
    }
    const b0 = [...rowBand[0]], b1 = [...rowBand[1]];
    const c0 = b0.length === 1 && cls.get(`plains|${b0[0]}`) ? lowerMedian(cls.get(`plains|${b0[0]}`)) : NaN;
    const c1 = b1.length === 1 && cls.get(`plains|${b1[0]}`) ? lowerMedian(cls.get(`plains|${b1[0]}`)) : NaN;
    const wantR = c1 / c0, gotR = lowerMedian(rowPx[1]) / lowerMedian(rowPx[0]);
    console.log(`   MEASURE latitude: row 0 (band ${b0}) plains pieces ${lowerMedian(rowPx[0])} px (${rowPx[0].length}) · row 1 (band ${b1}) ${lowerMedian(rowPx[1])} px (${rowPx[1].length}) · ratio ${gotR.toFixed(2)} against the classes' ${wantR.toFixed(2)}`);
    rec(`(control: the layer below draws the second row's plains at least 1.5× the first's — ${c0} px in band ${b0}, ${c1} px in band ${b1})`, wantR >= 1.5, { c0, c1, b0, b1 });
    rec("⭐ each parent is sized at its own latitude: the plains of the larger-plains band are cut larger, by at least half the classes' ratio beyond 1",
      rowPx[0].length > 0 && rowPx[1].length > 0 && gotR >= 1 + (wantR - 1) / 2, { gotR, wantR, n: [rowPx[0].length, rowPx[1].length] });
  }

  console.log("\n-- 3. …and when the border budget binds --");
  const R2 = mod("bound");
  const allowed = Math.floor(sp1.newIds / 3);
  const r2 = gen(R2, { _splitBudget: allowed });
  const sp2 = r2.provinceSplit || {}, t2 = sp2.target || {};
  rec(`the budget binds (${allowed} new ids allowed of the free cut's ${sp1.newIds}) and the cut keeps inside it`, r2.changed === true && sp2.changed === true && t2.binds === true && sp2.newIds > 0 && sp2.newIds <= allowed,
    { newIds: sp2.newIds, allowed, binds: t2.binds, error: sp2.error });
  const fs2 = raisedSizes(R2);
  const pl2 = fs2.byT.get("plains") || [], de2 = fs2.byT.get("desert") || [];
  const m2 = { plains: lowerMedian(pl2), desert: lowerMedian(de2), times: t2.times };
  console.log(`   MEASURE bound cut: plains ${m2.plains} px (${pl2.length}) · desert ${m2.desert} px (${de2.length}) · ${t2.times}× a typical province of the ground`);
  rec(`⭐⭐ the plains are still under the desert by at least half the layer below's ratio, and both are larger than the free cut's`,
    pl2.length > 0 && de2.length > 0 && m2.desert / m2.plains >= RATIO / 2 && m2.plains > m1.plains && t2.times > t1.times, { m1, m2 });

  console.log("\n-- 4. one ground at each latitude: the provisional terrain is the click's own --");
  const R3 = mod("uncut");
  const r3 = gen(R3, { splitLargeProvinces: false });
  const t3 = new Map(); for (const l of fs.readFileSync(path.join(R3, "map", "definition.csv"), "utf8").split(/\r?\n/)) { const c = l.split(";"); if (/^\d+$/.test(c[0]) && c[4] === "land" && SEA.includes(+c[0])) t3.set(c[6], (t3.get(c[6]) || 0) + 1); }
  rec("(the uncut twin raised the same provinces)", r3.changed === true && r3.flippedProvinces === r1.flippedProvinces, { r3: r3.flippedProvinces, r1: r1.flippedProvinces });
  rec("⭐ the uncut twin writes the raised provinces exactly the terrains the cut's provisional terrain counted", JSON.stringify([...t3].sort()) === JSON.stringify(Object.entries(prov1).sort()),
    { uncut: [...t3], provisional: prov1 });

  console.log("\n-- 5. a piece keeps a ground of the size it was cut to (keepSplitPiecesToTheirGround, pure) --");
  {
    const F = md.SPLIT_GROUND_SIZE_FACTOR;
    // two parents: 1 cut for desert in the south, 2 for plains in the north; their pieces 10, 20 and 21; 30 belongs to no family
    const sizedBy = { classes: C, of: new Map([[1, { terrain: "desert", px: C.weightOf("desert", 0.75).px }], [2, { terrain: "plains", px: C.weightOf("plains", 0.1).px }]]) };
    const parentOf = new Map([[10, 1], [20, 2], [21, 2]]);
    const lat = new Map([[1, 0.75], [10, 0.75], [2, 0.1], [20, 0.1], [21, 0.1], [30, 0.75]]);
    const chosen = () => new Map([[1, "desert"], [10, "plains"], [2, "plains"], [20, "desert"], [21, "forest"], [30, "plains"]]);
    const t = chosen();
    // with the layer below's terrain per latitude band, as Generate land asks it
    const mix = md.terrainMixByLatitude({ modRoot: R0, gameRoot: game, dependencyRoots: [] });
    const k = md.keepSplitPiecesToTheirGround({ terrainOf: t, sizedBy, parentOf, latitudeOf: (q) => lat.get(q), mix });
    const forestRatio = C.weightOf("forest", 0.1).px / sizedBy.of.get(2).px;
    rec(`(the factor is a number above 1 — ${F} — and the forest a plains piece is drawn as here sits inside it: ${forestRatio.toFixed(2)})`, F > 1 && forestRatio <= F && forestRatio >= 1 / F, { F, forestRatio });
    rec("⭐⭐ a desert piece drawn as a plain keeps its desert, a plain's piece drawn as desert keeps its plains", t.get(10) === "desert" && t.get(20) === "plains" && k && k.kept === 2
      && k.notAtHome === 0 && k.byTerrain["plains→desert"] === 1 && k.byTerrain["desert→plains"] === 1, { t: [...t], k });
    // …but only where the piece's own band grows that ground: a piece of the southern desert's family lying in the north, where the
    // layer below grows no desert at all (read off its files here), keeps the plains it was drawn as
    const north = bandOf(0.1);
    rec(`(the layer below grows plains in band ${north} and no desert there — read off its files)`, cls.has(`plains|${north}`) && !cls.has(`desert|${north}`), [...cls.keys()]);
    const farOf = new Map([[11, 1]]), farLat = (q) => (q === 11 ? 0.1 : 0.75);
    const far = new Map([[1, "desert"], [11, "plains"]]);
    const kf = md.keepSplitPiecesToTheirGround({ terrainOf: far, sizedBy, parentOf: farOf, latitudeOf: farLat, mix });
    const farRatio = C.weightOf("plains", 0.1).px / sizedBy.of.get(1).px;
    rec(`⭐ a desert family's piece lying where the layer below grows no desert keeps the plains it was drawn as (${farRatio.toFixed(2)}× its cut size: outside the factor)`,
      far.get(11) === "plains" && !!kf && kf.kept === 0 && kf.notAtHome === 1 && (farRatio > F || farRatio < 1 / F), { far: [...far], kf, farRatio });
    const far2 = new Map([[1, "desert"], [11, "plains"]]);
    const kf2 = md.keepSplitPiecesToTheirGround({ terrainOf: far2, sizedBy, parentOf: farOf, latitudeOf: farLat });
    rec("(control: asked without the latitude mix, it would have been drawn as desert — and the report says no guard was asked)", !!kf2 && kf2.kept === 1 && far2.get(11) === "desert" && kf2.notAtHome === null, { far2: [...far2], kf2 });
    rec("…a ground of the same size class stays as chosen, and a province no family holds is left alone", t.get(21) === "forest" && t.get(30) === "plains" && t.get(1) === "desert" && t.get(2) === "plains", [...t]);
    const t2 = chosen();
    rec("(control: with no limit to the factor every choice stands)", md.keepSplitPiecesToTheirGround({ terrainOf: t2, sizedBy, parentOf, latitudeOf: (q) => lat.get(q), factor: Infinity }).kept === 0 && t2.get(10) === "plains");
    rec("…and a cut not made by the ground keeps nothing", md.keepSplitPiecesToTheirGround({ terrainOf: chosen(), sizedBy: null, parentOf, latitudeOf: (q) => lat.get(q) }) === null);
  }

  console.log("\n-- 6. a south of LARGE desert and SMALL plains side by side --");
  {
    const S2 = makeWorld(true);
    rec("(no X-crossing in the second world's layer below)", SW.xCrossings(S2.gameIds, W, H) === 0, SW.xCrossings(S2.gameIds, W, H));
    const w2 = setUp(S2, path.join(ROOT, "game2"));
    const R5 = w2.mod("mixed-cut"), R6 = w2.mod("mixed-uncut"), R7 = w2.mod("mixed-nobudget");
    const r5 = w2.gen(R5), r6 = w2.gen(R6, { splitLargeProvinces: false }), r7 = w2.gen(R7, { _splitBudget: 0 });
    const C2 = md.landProvinceSizeClassesBeneath({ modRoot: R5, gameRoot: w2.game, dependencyRoots: [] });
    const sp5 = r5.provinceSplit || {}, t5r = sp5.target || {}, w5 = t5r.weights || {};
    const F = md.SPLIT_GROUND_SIZE_FACTOR;
    rec(`(control: the cut was by the ground, dealt by the pieces it makes — ${JSON.stringify(w5.provisional)}, at the scales ${JSON.stringify(w5.scales)})`,
      r5.changed && r6.changed && sp5.changed === true && w5.by === "ground" && w5.dealtBy === "pieces" && Array.isArray(w5.scales) && w5.scales.length > 0, w5);
    const southRatio = C2 ? C2.weightOf("desert", 0.625).px / C2.weightOf("plains", 0.625).px : 0;
    rec(`(control: this layer below draws its south's desert ${southRatio.toFixed(1)}× its plains, more than the factor, from a desert class of its own)`, southRatio > F && C2.weightOf("desert", 0.625).from !== "all", C2 && [C2.weightOf("desert", 0.625), C2.weightOf("plains", 0.625)]);
    // each province's pieces are counted at the scale the cut then cuts at: the last deal's scale is the cut's own (`times`, the plan's
    // scale) within SPLIT_DEAL_SCALE_TOLERANCE — dealt once, here at the count deal's scale, they were counted at another
    const lastScale = Array.isArray(w5.scales) && w5.scales.length ? w5.scales[w5.scales.length - 1] : NaN, TOL = md.SPLIT_DEAL_SCALE_TOLERANCE;
    rec(`⭐ the ground is dealt at the scale the cut cuts at: the last deal's ${lastScale} against the cut's ${t5r.times}, within ${TOL} — after more than one deal (${JSON.stringify(w5.scales)})`,
      TOL > 0 && TOL < 0.5 && w5.scales.length >= 2 && Math.abs(lastScale / t5r.times - 1) <= TOL + 0.01, { scales: w5.scales, times: t5r.times, TOL });

    // ── review F1: the ground is dealt by the provinces it will make
    const u6 = shareOf(raisedSizes(R6, S2).byT, "desert"), c5 = shareOf(raisedSizes(R5, S2).byT, "desert");
    console.log(`   MEASURE desert: uncut ${pct(u6.count)} of ${u6.of} provinces, ${pct(u6.area)} of their area · cut ${pct(c5.count)} of ${c5.of}, ${pct(c5.area)}`);
    rec("(control: the uncut click raises desert in the south)", u6.n > 0 && u6.count > 0, u6);
    rec(`⭐⭐ the cut world's desert is the uncut click's share of the provinces within ${F}× (${pct(c5.count)} against ${pct(u6.count)}) — not the fraction left once its share of ocean-sized provinces is cut to desert's size`,
      c5.count >= u6.count / F && c5.count <= u6.count * F, { cut: c5, uncut: u6 });
    // review of b09ae613 (sizes F1): the band above is 2× each side, and dealing by 1/k² (16.4% here against the uncut 9.1%) or by
    // 1/√k (5.4%) both stayed inside it — on the owner's flow 1/k² doubled the desert (15.6% of the provinces, 31.0% of the land)
    rec(`⭐ …and over-dealt neither way: within 1.5× of the uncut click's (${pct(c5.count)} against ${pct(u6.count)})`,
      c5.count >= u6.count / 1.5 && c5.count <= u6.count * 1.5, { cut: c5, uncut: u6 });
    rec(`⭐ …and holds at least the uncut click's share of the land's area (${pct(c5.area)} against ${pct(u6.area)}): a ground the layer below draws large is not shrunk to its count`,
      c5.area >= u6.area, { cut: c5, uncut: u6 });
    const t6 = new Map(); for (const l of fs.readFileSync(path.join(R6, "map", "definition.csv"), "utf8").split(/\r?\n/)) { const c = l.split(";"); if (/^\d+$/.test(c[0]) && c[4] === "land" && w2.SEA.includes(+c[0])) t6.set(c[6], (t6.get(c[6]) || 0) + 1); }
    const w7 = ((r7.provinceSplit || {}).target || {}).weights || {};
    rec("⭐ a budget that allows no cut deals the ground exactly as the uncut click: a province the cut leaves whole is not dealt the large grounds by their size",
      (r7.provinceSplit || {}).changed === false && w7.dealtBy === "pieces" && JSON.stringify([...t6].sort()) === JSON.stringify(Object.entries(w7.provisional || {}).sort()),
      { why: (r7.provinceSplit || {}).why, uncut: [...t6], provisional: w7.provisional, dealtBy: w7.dealtBy });

    // ── Generate land keeps it: each family on a ground of the size it was cut for
    const terrainIn = (m) => { const o = new Map(); for (const l of fs.readFileSync(path.join(m, "map", "definition.csv"), "utf8").split(/\r?\n/)) { const c = l.split(";"); if (/^\d+$/.test(c[0])) o.set(+c[0], c[6]); } return o; };
    const dec5 = SW.decode(path.join(R5, "map", "provinces.bmp"), SW.readDef(path.join(R5, "map", "definition.csv")));
    const t5 = terrainIn(R5), g5 = latOf(dec5.ids, W, H), l5 = g5.lat, a5 = g5.area;
    const fams = md.readProvinceSplitRecord(R5).families || [];
    const cutFor = sp5.cutFor instanceof Map ? sp5.cutFor : new Map();
    // the ground each parent was cut for is the cut's own word (sizedBy, not in the page's JSON) — so it is checked against the pieces
    // the cut made: a family's mean piece is about `times` × the size the layer below draws that ground at, where its parent stood
    const offSize = [];
    for (const f of fams) {
      const gnd = cutFor.get(f.parent), members = [f.parent, ...f.pieces];
      const mean = members.reduce((s, q) => s + (a5.get(q) || 0), 0) / members.length;
      const r = gnd ? mean / (t5r.times * gnd.px) : NaN;
      if (!(r >= 0.6 && r <= 1.7)) offSize.push([f.parent, gnd && gnd.terrain, +mean.toFixed(0), +r.toFixed(2)]);
    }
    rec(`(the ground the cut reports for each of the ${fams.length} families is the size its pieces were cut to: a mean piece within 0.6–1.7× of ${t5r.times} × its ground's size)`,
      fams.length > 0 && fams.every((f) => cutFor.has(f.parent)) && offSize.length === 0, { off: offSize.slice(0, 8), n: offSize.length, families: fams.length, cutFor: cutFor.size });
    const grounds = new Set(fams.map((f) => cutFor.get(f.parent) && cutFor.get(f.parent).terrain));
    rec(`(control: it cut desert and plains parents alike — ${fams.length} families)`, grounds.has("desert") && grounds.has("plains"), [...grounds]);
    // the layer below's land per band, read off its files here: a ground its band grows less than LATITUDE_TERRAIN_FLOOR of is not at home
    const gDef2 = SW.readDef(path.join(w2.game, "map", "definition.csv")), gIds2 = SW.decode(path.join(w2.game, "map", "provinces.bmp"), gDef2).ids;
    const gLat2 = latOf(gIds2, W, H).lat, band2 = new Map();
    for (const l of fs.readFileSync(path.join(w2.game, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
      const c = l.split(";"); if (!/^\d+$/.test(c[0]) || c[0] === "0" || c[4] !== "land" || !gLat2.has(+c[0])) continue;
      const b = bandOf(gLat2.get(+c[0])); if (!band2.has(b)) band2.set(b, new Map()); band2.get(b).set(c[6], (band2.get(b).get(c[6]) || 0) + 1);
    }
    const atHome = (t, b) => { const m = band2.get(b); if (!m) return true; const tot = [...m.values()].reduce((a, v) => a + v, 0); return (m.get(t) || 0) / tot >= md.LATITUDE_TERRAIN_FLOOR; };
    const homeless = [], off = [], heldBack = [];
    let members = 0;
    for (const f of fams) {
      const gnd = cutFor.get(f.parent);
      if (!gnd) continue;
      for (const q of [f.parent, ...f.pieces]) {
        members++;
        const b = bandOf(l5.get(q));
        if (!atHome(t5.get(q), b)) homeless.push([q, t5.get(q), b]);
        const r = C2 ? C2.weightOf(t5.get(q), l5.get(q)).px / gnd.px : NaN;
        if (r <= F && r >= 1 / F) continue;
        (atHome(gnd.terrain, b) ? off : heldBack).push([q, f.parent, gnd.terrain, t5.get(q), b, +r.toFixed(2)]);
      }
    }
    console.log(`   groundKept: ${JSON.stringify(sp5.groundKept)} · held back where the ground grows none below: ${heldBack.length}`);
    rec("(control: the choice per piece did draw grounds of another size, and the report counts the provinces that kept theirs)", sp5.groundKept && sp5.groundKept.kept > 0, sp5.groundKept);
    rec("⭐ no province of a cut family stands on a ground its own band grows (almost) none of below", members > 0 && homeless.length === 0, homeless.slice(0, 8));
    rec(`⭐⭐ every province of every cut family stands on a ground the layer below draws within ${F}× of the size it was cut for — where its own band grows that ground`, members > 0 && off.length === 0, { off: off.slice(0, 8), n: off.length });
    rec(`⭐ …and where it grows none (the ocean row whose middle grows desert reaching into a band that grows none), the guard inside Generate land held the ground back — ${heldBack.length} provinces, as many as its report counts`,
      heldBack.length > 0 && !!sp5.groundKept && sp5.groundKept.notAtHome === heldBack.length, { heldBack: heldBack.slice(0, 8), n: heldBack.length, report: sp5.groundKept });
  }

  console.log("\n-- 7. the page says it --");
  let note = null;
  try { note = P.runPage(["function generatedProvinceSplitNote("]).sb.generatedProvinceSplitNote; } catch (e) { note = null; }
  rec("generatedProvinceSplitNote was lifted out of public/map.js and runs", typeof note === "function");
  const said1 = note ? note(r1) : "", said2 = note ? note(r2) : "";
  console.log(`   free:  ${said1}\n   bound: ${said2}`);
  // the grounds this cut used, at the size the layer below draws each over its whole land (a terrain of fewer than
  // LAND_SIZE_CLASS_MIN provinces at all its land's), read off its files here: this world's plains small, its desert large
  const sizeBelow = (t) => (perT.get(t) && perT.get(t).length >= MIN ? lowerMedian(perT.get(t)) : lowerMedian(every));
  const used = Object.keys(prov1).sort((a, b) => sizeBelow(a) - sizeBelow(b));
  rec(`(control: the cut used ${used.join(" and ")}, drawn below at ${used.map(sizeBelow).join(" and ")} px — more than ${md.SPLIT_GROUND_SIZE_FACTOR}× apart)`,
    used.length === 2 && used[0] === "plains" && used[1] === "desert" && sizeBelow("desert") > md.SPLIT_GROUND_SIZE_FACTOR * sizeBelow("plains"), used.map((t) => [t, sizeBelow(t)]));
  rec("⭐ the order the page names is the server's reading of the layer below — the grounds the cut used, at the sizes this test reads off its files, smallest first",
    JSON.stringify((t1.weights && t1.weights.classOrder) || null) === JSON.stringify(used.map((t) => [t, sizeBelow(t)])), { server: t1.weights && t1.weights.classOrder, files: used.map((t) => [t, sizeBelow(t)]) });
  const ground1 = "smaller in the plains, larger in the deserts, as the base game draws them";
  rec("⭐ a cut by the ground names the ground the layer below draws smallest and the one it draws largest — plains and deserts here — at the base game's average",
    said1.includes(ground1) && said1.includes(`averages ${Math.round(t1.T0).toLocaleString()} px`), said1);
  rec("…and no ground the cut never used (no forest or mountain grows here)", !/forests|mountains/.test(said1) && !/forests|mountains/.test(said2), [said1, said2]);
  const times = (Math.round(t2.times * 10) / 10).toLocaleString();
  rec(`⭐ …and a binding one as ${times} times a typical province of the same ground — never its scale as a size in px`,
    said2.includes(ground1) && said2.includes(`each about ${times} times the size of a typical`) && !/about [\d,.]+ px each/.test(said2), said2);
  // review of b09ae613 (sizes F4): a cut the budget does not bind is at a multiple too — seed 3 of the owner's flow cuts at 1.9×, as
  // seed 1's bound cut does at 1.86×, and the page called one "about the base game's size" and the other "as near as the budget allows"
  const times1 = (Math.round(t1.times * 10) / 10).toLocaleString();
  rec(`⭐ a FREE cut by the ground names its multiple of a typical province too (${times1}×), as the bound one does`,
    t1.binds === false && said1.includes(`each about ${times1} times the size of a typical province of the same ground and latitude`), said1);
  // the order is the map below's, never a sentence's: over a map that draws its forests larger than its deserts (Millennium Dawn's
  // forests 224 px against its mountains' 187; Old World Blues' deserts 147 against its forests' 200), the page says so
  const withOrder = (order) => { const r = JSON.parse(JSON.stringify(r1)); r.provinceSplit.target.weights.classOrder = order; return note ? note(r) : ""; };
  const owb = withOrder([["desert", 147], ["plains", 160], ["mountain", 191], ["forest", 400]]);
  rec("⭐ a map below that draws its deserts small and its forests large: the page says the land is smaller in the deserts and plains, larger in the forests and mountains",
    owb.includes("smaller in the deserts and plains, larger in the forests and mountains") && !owb.includes("larger in the deserts"), owb);
  const flat = withOrder([["plains", 140], ["forest", 200], ["desert", 260]]);
  rec("…and one whose grounds are all within the factor of each other names none of them", flat.includes("each ground at the size the base game draws it") && !/smaller in|larger in/.test(flat), flat);
} catch (e) {
  rec("the test ran to the end", false, String((e && e.stack) || e).slice(0, 800));
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}   // this test's own temp folder — never a mod directory (⛔ CLAUDE.md #1)
}
console.log(`\n=== a split province is the size of its ground: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
