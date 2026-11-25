// Generate land draws the rivers of the land it raised: read off the map as the click left it, judged before a byte is written, and
// written through the one writer. #a-generated-world-has-rivers (batch B, B3)
//
// THE GAP. TEST 31 to TEST 34 had no river at all: Delete map wiped Earth's and Generate land drew none, where vanilla's are 2.18%
// of its land and 21.57% of its land-land border has a river on a side. The plan (planGeneratedRivers) and what it learns
// (riversLearnt) are pinned by their own tests on arrays; this one pins the I/O around them — generateRivers — on files:
//   · the rivers land in the mod's rivers.bmp, every byte that changed a river pixel of this plan, nothing else touched (header,
//     palette, background, a river already there), a copy of the file kept first (safeModWrite), sources whole (fixMalformedRivers);
//   · they are drawn on the provinces asked for and nowhere else, at the map below's share of their borders;
//   · the same seed writes the same bytes; another seed other bytes;
//   · a river of the map below whose mouth the raise turned to land is counted (`stranded`), never moved — by its MOUTH: one ending
//     beside the new land counts, one over it that still runs into the sea, a tributary's head and a river with no green do not —
//     and told as Nova's own when an earlier Generate land drew it (its green on the record of the land Nova drew rivers on);
//   · every refusal writes nothing and says why.
//
// Fixtures on disk (testlib-river-world.js): the base game holds the hand-drawn sample; the mod owns a Voronoi world raised whole,
// as Generate land leaves it. Every number expected is counted by this test off the files it wrote or read back.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nova-generated-rivers-"));
// ⛔ private app data and ~/.nova BEFORE map-data.js loads: the copies safeModWrite keeps and the record of the land Nova drew rivers
// on are this test's, never yours
process.env.NOVA_HOME_DIR = path.join(TMP, "home");
process.env.NOVA_APP_DATA_DIR = path.join(TMP, "appdata");
process.env.APPDATA = path.join(TMP, "roaming");
process.env.XDG_CONFIG_HOME = path.join(TMP, "xdg");
for (const d of [process.env.NOVA_HOME_DIR, process.env.NOVA_APP_DATA_DIR, process.env.APPDATA, process.env.XDG_CONFIG_HOME]) fs.mkdirSync(d, { recursive: true });

const md = require("./map-data.js");
const sw = require("./safe-write.js");
const RW = require("./testlib-river-world.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};
const sha = (b) => crypto.createHash("sha1").update(b).digest("hex");

// ── the fixture ──
const GAME = path.join(TMP, "game");
const S = RW.gridSample();
RW.writeMap(GAME, S);
const T = RW.voronoiWorld();
const { W, H, N } = T;
const landIds = [...new Set(Array.from(T.pid).filter((p, k) => T.land[k]))].sort((a, b) => a - b);
// the mod's own rivers.bmp as Delete map leaves it: background only (white over land, grey over water)
const blank = new Uint8Array(N); for (let k = 0; k < N; k++) blank[k] = T.land[k] ? RW.BG : RW.SEA_BG;
// a river already there, standing exactly where this plan would draw one: the biggest whole river of a plan drawn with nothing in the way
const learntBelow = md.riversLearntFromMap(S);
const freePlan = md.planGeneratedRivers({ W, H, land: T.land, water: T.water, draw: T.land, height: T.height, existing: new Uint8Array(N), pid: T.pid, seed: 1,
  learnt: learntBelow, pairsDenominator: md.riverBorderPairs({ W, H, land: T.land, pid: T.pid, side: T.land }) });
const freeIdx = RW.overlay(N, freePlan.edits, W, blank);
const biggest = RW.riverTrees({ W, H, idx: freeIdx }).sort((a, b) => b.px.length - a.px.length)[0];
const withExisting = Uint8Array.from(blank); for (const k of (biggest ? biggest.px : [])) withExisting[k] = freeIdx[k];

const mod = (name, { world = T, idx = withExisting, ownRivers = true } = {}) => {
  const d = path.join(TMP, "mods", name);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), `name="${name}"\n`);
  RW.writeMap(d, world, { idx, rivers: ownRivers });
  return d;
};
const riversOf = (root) => path.join(root, "map", "rivers.bmp");
const readIdx = (file) => { const b = fs.readFileSync(file), m = md.readIndexedBmp(b), a = new Uint8Array(m.width * m.height); for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) a[y * m.width + x] = b[m.pixelOffset(x, y)]; return { b, m, a }; };
const gen = (modRoot, opts = {}) => md.generateRivers({ modRoot, gameRoot: GAME, dependencyRoots: [], provinceIds: landIds, seed: 1, ...opts });
// ⛔ R5 by this test's own judge (riverTrees, the wiki's river): a river of `idx` is stranded when its main's mouth — the end not
// reached from its green through a red — ran into water before the raise (on or 4-beside the water, or the provinces `ids` raised,
// which were sea) and runs into none now. { rivers, pixels, byNova } as generateRivers says it, pixels the stranded rivers' own,
// byNova those whose green stands on a province of `nova` (the record of the land Nova drew rivers on; null: it cannot be read).
const expectStranded = (idx, ids, nova = []) => {
  const up = new Set(ids), raisedAt = (k) => T.land[k] === 1 && up.has(T.pid[k]), mine = new Set(nova || []);
  const into = (k, wet) => wet(k) || RW.nb4(W, N, k).some(wet);
  const out = { rivers: 0, pixels: 0, byNova: nova === null ? null : 0 };
  for (const t of RW.riverTrees({ W, H, idx })) {
    const m = t.main && t.main[t.main.length - 1];
    if (m === undefined || !into(m, (k) => T.water[k] === 1 || raisedAt(k)) || into(m, (k) => T.water[k] === 1)) continue;
    out.rivers++; out.pixels += t.px.length;
    if (out.byNova !== null && t.greens.some((k) => mine.has(T.pid[k]))) out.byNova++;
  }
  return out;
};
const same = (a, b) => !!a && !!b && a.rivers === b.rivers && a.pixels === b.pixels && a.byNova === b.byNova;

try {
  console.log("1. The map below, as this test counts it");
  const own = RW.borderShareOf({ W: S.W, H: S.H, isLand: (k) => S.type[k] === 1, pid: S.pid, isRiver: (k) => RW.isRiverIndex(S.idx[k]) });
  rec("THE CONTROL: the sample has rivers on a real share of its land-land border", own.share > 0.05 && own.share < 0.5, own);
  rec("THE CONTROL: the river already in the mod's file is a whole river of a free plan (one green, on its lanes)", !!biggest && biggest.greens.length === 1 && biggest.px.length >= learntBelow.minMain, biggest && biggest.px.length);

  console.log("\n2. Generate land's rivers, on the whole raised world");
  const A = mod("Whole");
  const before = readIdx(riversOf(A));
  const rulesOf = () => [...new Set((md.validateMapBitmap({ modRoot: A, gameRoot: GAME, dependencyRoots: [] }) || []).map((p) => `${p.rule}:${p.severity}`))].sort().join(",");
  const rulesBefore = rulesOf();
  const r = gen(A);
  const after = readIdx(riversOf(A));
  rec("⭐ rivers were drawn and written", r.changed === true && r.systems > 0 && r.pixels > 0, r);
  rec("…learnt from the map underneath (the mod's own file holds only land this write raises)", r.learntFrom === "the map underneath", r.learntFrom);
  // ⛔ R5 on a drawn plan (review R-3): the river already there stands on the raised land and still runs into the water, so none
  // now ends inland. Counting by a pixel on the new land called it stranded.
  const exp2 = expectStranded(withExisting, landIds);
  rec("THE CONTROL: the river already there stands on the land this write raises", biggest.px.some((k) => T.land[k] && landIds.includes(T.pid[k])));
  rec("⭐ …and says no river of the map below now ends inland: the one already there still runs into the water", exp2.rivers === 0 && same(r.stranded, exp2), { got: r.stranded, want: exp2 });
  const off = before.b.readUInt32LE(10);   // the pixel array's offset: everything before it is the header and the palette
  rec("⭐ header and palette bytes are the file's own", before.b.subarray(0, off).equals(after.b.subarray(0, off)) && before.b.length === after.b.length);
  const changed = []; for (let k = 0; k < N; k++) if (before.a[k] !== after.a[k]) changed.push(k);
  rec("⭐ every byte that changed was background and is now a river pixel", changed.length > 0 && changed.every((k) => (before.a[k] === RW.BG || before.a[k] === RW.SEA_BG) && RW.isRiverIndex(after.a[k])), changed.length);
  rec("…as many as the result says", changed.length === r.pixels, { changed: changed.length, said: r.pixels });
  const ex = biggest.px;
  rec("⭐ the river already there is byte for byte as it was", ex.every((k) => after.a[k] === withExisting[k]));
  const touch = changed.filter((k) => { const x = k % W, y = (k - x) / W; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && withExisting[yy * W + xx] !== blank[yy * W + xx]) return true; } return false; });
  rec("…and no new pixel touches it, 4- or 8-way", touch.length === 0, touch.length);
  const offRaised = changed.filter((k) => T.land[k] && !landIds.includes(T.pid[k]));
  rec("no river pixel on land this write did not raise", offRaised.length === 0, offRaised.length);
  const nearB = changed.filter((k) => T.land[k]); const onLane = nearB.filter((k) => RW.nearBorder(T, k));
  rec("⭐ ≥ 95% of the new land pixels on a province border or beside one", onLane.length >= 0.95 * nearB.length, { land: nearB.length, near: onLane.length });

  console.log("\n3. Every river keeps the rules a river is drawn by (this test's own judge, read off the file)");
  const trees = RW.riverTrees({ W, H, idx: after.a });
  rec("⭐ every river has exactly one green and no loop", trees.every((t) => t.greens.length === 1 && !t.cycle), trees.filter((t) => t.greens.length !== 1 || t.cycle).length);
  const wet = (k) => T.water[k] || RW.nb4(W, N, k).some((j) => T.water[j]);
  rec("⭐ every main reaches water", trees.every((t) => t.main && wet(t.main[t.main.length - 1])), trees.filter((t) => !t.main || !wet(t.main[t.main.length - 1])).length);
  const narrow = trees.reduce((s, t) => s + (t.main ? RW.narrowings(after.a, t.main) : 0) + t.tribs.reduce((u, tr) => u + RW.narrowings(after.a, tr.path), 0), 0);
  rec("⭐ no river narrows downstream", narrow === 0, narrow);
  const wider = trees.reduce((s, t) => s + t.tribs.filter((tr) => { const w = Math.max(...tr.path.map((k) => after.a[k]).filter((v) => v >= 3)); return w > after.a[tr.junction]; }).length, 0);
  rec("…and no tributary is wider than the river it joins", wider === 0, wider);
  const fx = md.fixMalformedRivers({ modRoot: A, gameRoot: GAME, dependencyRoots: [], dryRun: true });
  rec("⭐ Nova's own source repair finds nothing to add", fx && (fx.sourceless || []).length === 0 && r.addedSource === 0, { sourceless: fx && (fx.sourceless || []).length, addedSource: r.addedSource });
  const rulesAfter = rulesOf();
  rec("⭐ Map Errors' bitmap rules are the same before and after (no river rule cries, none goes quiet)", rulesAfter === rulesBefore, { before: rulesBefore, after: rulesAfter });

  console.log("\n4. At the map below's share of the raised land's borders, counted by this test");
  const raised = new Uint8Array(N); for (let k = 0; k < N; k++) if (T.land[k] && landIds.includes(T.pid[k])) raised[k] = 1;
  const isNew = new Uint8Array(N); for (const k of changed) isNew[k] = 1;
  const drawnShare = RW.borderShareOf({ W, H, isLand: (k) => T.land[k] === 1, pid: T.pid, isRiver: (k) => isNew[k] === 1, side: raised });
  rec("⭐ the share the result reports is the share on disk", Math.abs(drawnShare.share - r.borderShare) < 0.0002, { disk: drawnShare.share, said: r.borderShare });
  rec("⭐ …and it is the map below's, within 0.02 — or the result says the lanes ran out", r.saturated === true || Math.abs(r.borderShare - own.share) <= 0.02, { got: r.borderShare, below: own.share, saturated: r.saturated });

  console.log("\n5. Kept and recorded");
  let names = []; try { names = fs.readdirSync(sw.BACKUP_DIR); } catch (_) {}
  const copy = names.find((n) => { try { return fs.readFileSync(path.join(sw.BACKUP_DIR, n)).equals(before.b); } catch (_) { return false; } });
  rec("⭐ a copy of the rivers.bmp it overwrote is in the backups", !!copy, names.length);
  let recd = { provinces: [] }; try { recd = JSON.parse(fs.readFileSync(md.generatedRiversRecordPath(A), "utf8")); } catch (_) {}
  rec("the provinces it drew rivers on are recorded, so the next Generate land learns from the world and not from these", landIds.every((p) => recd.provinces.includes(p)), recd.provinces.length);
  // ⛔ R2-2: a river a later raise strands is told as Nova's by its green on a province of this record (§7)
  const greensDrawn = changed.filter((k) => after.a[k] === RW.GREEN);
  rec("…and the green of every river it drew stands on one of them, so a river a later raise strands is told as Nova's", greensDrawn.length === r.systems && greensDrawn.every((k) => recd.provinces.includes(T.pid[k])), { greens: greensDrawn.length, systems: r.systems });

  console.log("\n6. The same seed draws the same rivers; another seed others");
  const B = mod("Again"), C = mod("Other");
  gen(B); gen(C, { seed: 2 });
  rec("⭐ seed 1 twice → the same bytes", sha(fs.readFileSync(riversOf(B))) === sha(after.b));
  rec("⭐ seed 2 → other bytes", sha(fs.readFileSync(riversOf(C))) !== sha(after.b));

  console.log("\n6b. A second Generate land keeps the first one's rivers, and learns from the world below, not from them");
  {
    const E = mod("Twice", { idx: blank });
    const sx = new Map(), sn = new Map();
    for (let k = 0; k < N; k++) if (T.land[k]) { const p = T.pid[k]; sx.set(p, (sx.get(p) || 0) + (k % W)); sn.set(p, (sn.get(p) || 0) + 1); }
    const west = landIds.filter((p) => sx.get(p) / sn.get(p) < 300), east = landIds.filter((p) => sx.get(p) / sn.get(p) >= 300);
    const r1 = md.generateRivers({ modRoot: E, gameRoot: GAME, dependencyRoots: [], provinceIds: west, seed: 1 });
    const mid = readIdx(riversOf(E));
    const r2 = md.generateRivers({ modRoot: E, gameRoot: GAME, dependencyRoots: [], provinceIds: east, seed: 1 });
    const fin = readIdx(riversOf(E));
    const first = []; for (let k = 0; k < N; k++) if (mid.a[k] !== blank[k]) first.push(k);
    rec("THE CONTROL: both halves drew rivers", r1.changed === true && r2.changed === true && first.length > 0, { r1: r1.reason || r1.systems, r2: r2.reason || r2.systems });
    // ⛔ R1 — the share is counted over the border pairs with a RAISED side: the west half, drawn first on a world with no river, reaches
    // the map below's share and is not saturated (counted over every pair of the map, it could not reach it, and would draw the west half
    // as densely as its lanes allow)
    const westSide = new Uint8Array(N); for (let k = 0; k < N; k++) if (T.land[k] && west.includes(T.pid[k])) westSide[k] = 1;
    const isNew1 = new Uint8Array(N); for (const k of first) isNew1[k] = 1;
    const sh1 = RW.borderShareOf({ W, H, isLand: (k) => T.land[k] === 1, pid: T.pid, isRiver: (k) => isNew1[k] === 1, side: westSide });
    rec("⭐ the first half's share of ITS borders is the map below's, within 0.02, and not saturated", r1.saturated === false && Math.abs(sh1.share - own.share) <= 0.02, { got: sh1.share, below: own.share, saturated: r1.saturated });
    rec("⭐ every byte of the first one's rivers is as it was", first.every((k) => fin.a[k] === mid.a[k]));
    rec("⭐ the second learnt from the map underneath — never from the rivers Nova drew the first time", r2.learntFrom === "the map underneath", r2.learntFrom);
    const eastSide = new Uint8Array(N); for (let k = 0; k < N; k++) if (T.land[k] && east.includes(T.pid[k])) eastSide[k] = 1;
    const isNew2 = new Uint8Array(N); for (let k = 0; k < N; k++) if (fin.a[k] !== mid.a[k]) isNew2[k] = 1;
    const sh2 = RW.borderShareOf({ W, H, isLand: (k) => T.land[k] === 1, pid: T.pid, isRiver: (k) => isNew2[k] === 1, side: eastSide });
    rec("⭐ the new land's share is the map below's, within 0.02 — or the lanes ran out", r2.saturated === true || Math.abs(sh2.share - own.share) <= 0.02, { got: sh2.share, below: own.share, saturated: r2.saturated });
  }

  console.log("\n7. A river of the map below whose mouth the raise turned to land is counted, never moved");
  {
    // a straight river: green at `from`, body (index 3) to its mouth at `to`, along row y
    const strandIdx = Uint8Array.from(blank);
    const river = (pts) => { pts.forEach((k, i) => { strandIdx[k] = i === 0 ? RW.GREEN : 3; }); return pts; };
    const row = (y, from, to) => { const p = [], d = to < from ? -1 : 1; for (let x = from; x !== to + d; x += d) p.push(y * W + x); return p; };
    const firstLand = (y, x0) => { for (let x = x0; x < W; x++) if (T.land[y * W + x]) return x; return -1; };
    const near = (k, f) => f(k) || RW.nb4(W, N, k).some(f);
    // (a) a 30 px river whose last 3 px stand inside a raised province, its mouth inland of them
    const land0 = firstLand(200, 140), px = river(row(200, land0 + 40, land0 + 11));
    const tail = px.slice(-3).map((k) => T.pid[k]);
    // (b) review R-1: its mouth on the land BESIDE a raised province, not one pixel on it — 24 of vanilla's 267 rivers that reach the
    // sea end so. At the first border of row 60 east of x 160: the river runs east from there, the province west of it is raised.
    let xm = 161; while (xm < W && (T.pid[60 * W + xm] === T.pid[60 * W + xm - 1] || !T.land[60 * W + xm - 1])) xm++;
    const beside = river(row(60, xm + 29, xm)), besideId = T.pid[60 * W + xm - 1];
    // (c) review R-1: a river over a raised province that still runs on into the sea (3 px into it, as the sample's mouths do)
    const coastal = river(row(120, 170, 97)), crossedId = T.pid[120 * W + 140];
    // (d) a tributary's head on a raised province: a head is not a mouth. Its main ends inland, far from the water and the raise.
    const main = river(row(236, 300, 200)), trib = []; for (let y = 206; y <= 235; y++) trib.push(y * W + 250);
    trib.forEach((k, i) => { strandIdx[k] = i === trib.length - 1 ? RW.RED : 3; });
    const headId = T.pid[206 * W + 250];
    // (e) a river with no green, one end on a raised province: the game draws none (vanilla ships 12 of its 328 so)
    const sourceless = row(170, 220, 200); for (const k of sourceless) strandIdx[k] = 3;
    const greenlessId = T.pid[170 * W + 200];
    const ids = [...new Set([...tail, besideId, crossedId, headId, greenlessId])];
    const up = new Set(ids), raisedAt = (k) => T.land[k] === 1 && up.has(T.pid[k]), wetAt = (k) => T.water[k] === 1;
    const D = mod("Stranded", { idx: strandIdx });
    // review R2-2: (b) and (c) as an earlier Generate land drew them — their greens' provinces in the record of the land Nova drew
    // rivers on, written by its own writer. (b) is stranded and Nova's; (c) is Nova's and still runs into the sea; (a) is not Nova's,
    // though its lower course runs over land an earlier Generate land raised (as the map underneath's run-ons into the sea do): the
    // provinces it crosses below its green, less the ones raised now, are in the record too. Whose a river is goes by its green.
    const aBelow = [...new Set(px.map((k) => T.pid[k]))].filter((p) => p !== T.pid[px[0]] && !up.has(p));
    const novaRec = [...new Set([T.pid[beside[0]], T.pid[coastal[0]], ...aBelow])].filter((p) => !up.has(p));
    md.recordGeneratedRivers({ modRoot: D, provinceIds: novaRec });
    const b0 = fs.readFileSync(riversOf(D));
    const rs = md.generateRivers({ modRoot: D, gameRoot: GAME, dependencyRoots: [], provinceIds: ids, seed: 1 });
    const a0 = readIdx(riversOf(D));
    const exp7 = expectStranded(strandIdx, ids, novaRec);
    rec("THE CONTROL: the record holds (b)'s and (c)'s greens and land (a) crosses, not (a)'s green, and no province raised now",
      aBelow.length > 0 && novaRec.length === 2 + aBelow.length && novaRec.includes(T.pid[beside[0]]) && novaRec.includes(T.pid[coastal[0]]) && !novaRec.includes(T.pid[px[0]]), { novaRec, aBelow });
    rec("THE CONTROL: (a)'s last pixels stand on the raised provinces, and its mouth runs into no water now", px.slice(-3).every(raisedAt) && !near(px[px.length - 1], wetAt));
    rec("THE CONTROL: (b) has no pixel on the raised land, its mouth stands beside it and runs into no water now", !beside.some(raisedAt) && near(beside[beside.length - 1], raisedAt) && !near(beside[beside.length - 1], wetAt), { xm, besideId });
    rec("THE CONTROL: (c) crosses the raised land, and its mouth stands in the sea", coastal.some(raisedAt) && wetAt(coastal[coastal.length - 1]));
    rec("THE CONTROL: (d)'s head stands on the raised land, its main's mouth beside neither the water nor the raise", raisedAt(trib[0]) && !near(main[main.length - 1], (k) => wetAt(k) || raisedAt(k)));
    rec("THE CONTROL: (e) stands on the raised land, and neither end of it runs into water now", sourceless.some(raisedAt) && !near(sourceless[0], wetAt) && !near(sourceless[sourceless.length - 1], wetAt));
    // the fixture tells a mouth from a pixel on the new land: the pixel rule counts (a), (c), (d) and (e); the mouths, (a) and (b)
    const byPixel = RW.riverTrees({ W, H, idx: strandIdx }).filter((t) => t.px.some(raisedAt)).length;
    rec("THE CONTROL: this test's judge counts (a) and (b), every pixel of them, (b) alone Nova's — a pixel on the new land would count four others", exp7.rivers === 2 && exp7.pixels === px.length + beside.length && exp7.byNova === 1 && byPixel === 4, { exp7, byPixel });
    // ⛔ the refusal branch on purpose: the count was once lost by every refusal after it (the answer was built without it)
    rec("THE CONTROL: on so little land the plan refuses — the count must survive a refusal", rs.changed === false && !!rs.reason, rs.reason || rs.systems);
    rec("⭐ counted by the mouth: the two rivers of the map below that now end inland, with their pixels, and the one Nova drew", same(rs.stranded, exp7), { got: rs.stranded || rs, want: exp7 });
    rec("…and every byte of every river is as it was", b0.equals(a0.b));
    // ⛔ a record that cannot be read: whose they are is not known — null, never a guess of 0
    fs.writeFileSync(md.generatedRiversRecordPath(D), "{ not json");
    const ru = md.generateRivers({ modRoot: D, gameRoot: GAME, dependencyRoots: [], provinceIds: ids, seed: 1 }), expU = expectStranded(strandIdx, ids, null);
    rec("⭐ the record unreadable: the same two counted, and whose they are said to be unknown (byNova null)", expU.byNova === null && same(ru.stranded, expU), { got: ru.stranded || ru, want: expU });
    // ⛔ …and on a plan that draws (review R-3): the whole world raised, with (a) alone already there
    const one = Uint8Array.from(blank); for (const k of px) one[k] = strandIdx[k];
    const F = mod("Drawn Beside A Stranded River", { idx: one });
    const rd = gen(F), expD = expectStranded(one, landIds);
    rec("⭐ a plan that draws says the river it stranded too", rd.changed === true && expD.rivers === 1 && same(rd.stranded, expD), { changed: rd.changed, got: rd.stranded, want: expD });
  }

  console.log("\n7b. The gate (riverPlanGate), on plans made wrong by hand — the planner never makes one, so these are the only way to see it refuse");
  {
    const gate = (edits, idx = blank, existing = new Uint8Array(N)) => md.riverPlanGate({ W, H, idx, palette: RW.PALETTE, existing, learnt: learntBelow, edits }).problems;
    const good = gate(freePlan.edits);
    rec("THE CONTROL: the free plan passes it", freePlan.edits.length > 0 && good.length === 0, good);
    // over a river already there: the free plan again, over a file that holds its biggest river
    const exMask = new Uint8Array(N); for (const k of biggest.px) exMask[k] = 1;
    const overN = freePlan.edits.filter((e) => exMask[e.y * W + e.x]).length;
    const over = gate(freePlan.edits, withExisting, exMask);
    rec("⭐ a plan over a river already there is refused, every such pixel counted", overN > 0 && over.some((p) => p.startsWith(`${overN} pixel(s) over a river already there (at `)), { overN, over });
    // an index the map below does not write: one body pixel made the first river index its rivers never use
    const roles = md.riverIndexRoles(RW.PALETTE), writes = new Set([learntBelow.source, learntBelow.flowIn, ...Object.keys(learntBelow.bodyShare).map(Number)]);
    const unused = roles.bg.findIndex((bg, i) => !bg && !writes.has(i));
    const bi = freePlan.edits.findIndex((e) => e.index !== learntBelow.source && e.index !== learntBelow.flowIn);
    const foreign = gate(freePlan.edits.map((e, i) => (i === bi ? { ...e, index: unused } : e)));
    rec("⭐ a pixel in an index the map below never writes is refused", unused >= 0 && bi >= 0 && foreign.some((p) => p.startsWith("1 pixel(s) in an index the map below does not write")), { unused, foreign });
    // a river with no green: its source pixel made body
    const gi = freePlan.edits.findIndex((e) => e.index === learntBelow.source), body = Number(Object.keys(learntBelow.bodyShare)[0]);
    const sourceless = gate(freePlan.edits.map((e, i) => (i === gi ? { ...e, index: body } : e)));
    rec("⭐ a river without its green is refused, by the shape rule's own name", gi >= 0 && sourceless.some((p) => /^noSource 1 \(at \d+,\d+\)$/.test(p)), sourceless);
    // review R2-3: a plan that TOUCHES a river already there without a pixel over it — judged blind to the old river (only the plan's
    // own pixels laid over an empty map), both passed. A hand-made river along row hy from its green at x0 to x1, and plans down a
    // column from row 5 to the row above it: at x 50 (beside nothing), at its middle (4-beside its body), one past its end (diagonal).
    const hy = 20, x0 = 20, x1 = 40, oldIdx = Uint8Array.from(blank), oldMask = new Uint8Array(N);
    for (let x = x0; x <= x1; x++) { oldIdx[hy * W + x] = x === x0 ? RW.GREEN : body; oldMask[hy * W + x] = 1; }
    const column = (x) => { const e = []; for (let y = 5; y < hy; y++) e.push({ x, y, index: y === 5 ? learntBelow.source : body }); return e; };
    const free = gate(column(50), oldIdx, oldMask);
    rec("THE CONTROL: a plan beside nothing passes, over the same river", free.length === 0, free);
    const xMid = (x0 + x1) >> 1, four = gate(column(xMid), oldIdx, oldMask);
    rec("⭐ a plan ending 4-beside a river already there is refused: that river branches without a marker and the two have two greens",
      four.length === 2 && four[0] === `illegalBranch 1 (at ${xMid},${hy})` && four[1] === `twoSources 1 (at ${xMid},5)`, four);
    const diag = gate(column(x1 + 1), oldIdx, oldMask);
    rec("⭐ a plan touching it only diagonally is refused", diag.length === 1 && diag[0] === `diagonalOnly 1 (at ${x1 + 1},${hy - 1})`, diag);
  }

  console.log("\n8. Refusals write nothing and say why");
  const refuses = (label, root, opts, want) => {
    const f = riversOf(root), had = fs.existsSync(f) ? sha(fs.readFileSync(f)) : null;
    const res = md.generateRivers({ modRoot: root, gameRoot: GAME, dependencyRoots: [], provinceIds: landIds, seed: 1, ...opts });
    const now = fs.existsSync(f) ? sha(fs.readFileSync(f)) : null;
    rec(label, res.changed === false && want.test(String(res.reason || res.error || "")) && had === now, { res: res.reason || res.error, same: had === now });
  };
  // R9: the raise did not stand the land up — heights still the sea floor's 89
  refuses("⭐ land the heightmap still draws under the water: nothing written, and it says so", mod("Drowned", { world: { ...T, height: Uint8Array.from(T.height, (h, k) => (T.land[k] ? 89 : h)) } }), {}, /waterline/);
  refuses("the game itself: refused", GAME, {}, /game directory/);
  {
    const DRY = path.join(TMP, "game-no-rivers"); RW.writeMap(DRY, S, { rivers: false });
    const m = mod("Over A Riverless Game", { ownRivers: false });
    const res = md.generateRivers({ modRoot: m, gameRoot: DRY, dependencyRoots: [], provinceIds: landIds, seed: 1 });
    rec("⭐ nothing below to learn from: a reason, and no rivers.bmp made in the mod", res.changed === false && /rivers\.bmp/.test(res.reason || "") && !fs.existsSync(riversOf(m)), res);
  }
  {
    const m = mod("Odd Size");
    fs.writeFileSync(riversOf(m), RW.bmp8(W, H - 8, blank.subarray(0, W * (H - 8))));
    refuses("a rivers.bmp not the size of provinces.bmp: refused", m, {}, /rivers\.bmp is \d+x\d+, provinces\.bmp/);
  }
  refuses("no province asked for is land: nothing written", mod("Sea Only"), { provinceIds: [100000] }, /none of the provinces/);
} finally {
  try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 3 }); } catch (_) {}
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
