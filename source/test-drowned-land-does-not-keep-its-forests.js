// ⛔ #drowned-land-keeps-its-forests — THE OLD WORLD SHOWING THROUGH THE NEW ONE.
//
// map/trees.bmp carries vegetation density. All six maps installed on this machine ship one, the renderer
// reads it for the same pixels heightmap.bmp and terrain.bmp cover, and outside one word in a comment Nova
// had never opened it. So a province Nova drowned kept its forest, and the forest went on being drawn,
// standing on open water — the same shape as the terrain before batch 18 and the rivers one commit ago.
//
// 📊 Measured 2026-09-17 on a copy, through the real functions, on the owner's own sequence (a new mod owning
// vanilla's provinces.bmp → Delete map → Generate land 35% seed 1) against the installed base game. The unit
// is a trees.bmp BLOCK whose whole footprint in provinces.bmp is water:
//
//     base commit 354fc72   before                   21 of 99,056 vegetated blocks afloat = 0.02%
//                           after Delete map         99,056 of 99,056 = 100.00%
//                           after + Generate land    57,135 of 99,056 = 57.68%, and 40,886 of the 445,904
//                                                    blocks over the NEW continents (9.17%) carried the
//                                                    drowned world's vegetation
//                           …and the mod owned no map/trees.bmp at all: every one of those forests was the
//                           BASE GAME's file showing through a mod that had drowned the land under it
//     with this fix         after Delete map         99,005 blocks cleared, 51 left
//                           after + Generate land    48 afloat, and 3 of 445,904 new-land blocks vegetated
//
// The residue is not slack: those 51 are blocks over land vanilla already draws BELOW sea level, so no pixel
// under them crossed the waterline and this write did not touch them. 48 is inside the range the shipping
// maps themselves sit in — vanilla 21, Road to 56 21, Rise of Nations 21, Novum Vexillum 38, Old World Blues
// 78, Millennium Dawn 6,488 — and that range is MEASURED again here rather than typed into an assertion.
//
// 🌱 THE OTHER HALF ARRIVED LATER, AND THIS FILE IS STILL THE CLEARING HALF. When this was written the
// raise path wrote nothing at all, on the reasoning that land Nova raises comes up as `plains` and the corpus
// puts nothing on plains: the share of pure-plains blocks carrying the bare index is 99.0% on vanilla, 89.0%
// Millennium Dawn, 98.9% Road to 56, 80.9% Old World Blues, 98.7% Novum Vexillum and 98.7% Rise of Nations
// — the modal index under plains is the bare one, 6 of 6. That claim is still true and is still re-measured
// off the corpus below, and it is still why plains gets nothing. What changed is that
// #a-generated-world-is-one-terrain made a quarter of a generated world `forest`, so the raise path now goes
// to a PLANTER (#a-generated-forest-has-no-trees-in-it, pinned by its own file). What this file still owns is
// the clearing: a drowned forest, the second click, and the fact that a raise which has nothing to plant
// leaves the mod without a trees.bmp it never asked for.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 350) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WORKSHOP = "D:/SteamLibrary/steamapps/workshop/content/394360/";
const CORPUS = {
  vanilla: GAME,
  "Millennium Dawn": WORKSHOP + "2777392649",
  "Road to 56": WORKSHOP + "820260968",
  "Old World Blues": WORKSHOP + "2265420196",
  "Novum Vexillum": WORKSHOP + "1827273767",
  "Rise of Nations": WORKSHOP + "2026448968",
};
const tmps = [];
const NOGAME = path.join(os.tmpdir(), "__nova_no_game_trees__");

// ── the measuring kit. Deliberately its own code: a measurement that runs the writer's own helpers cannot
//    refute the writer. Geometry comes out of each file's OWN header — dataOffset AND the DIB header size,
//    because 40 and 124 both appear in this corpus and a header's length is never judged.
function indexed(file) {
  const buf = fs.readFileSync(file);
  const dataOffset = buf.readUInt32LE(10), W = buf.readInt32LE(18), rawH = buf.readInt32LE(22);
  const H = Math.abs(rawH), up = rawH > 0, rowSize = (W + 3) & ~3;
  return { buf, dataOffset, W, H, up, rowSize, off: (x, y) => dataOffset + (up ? (H - 1 - y) : y) * rowSize + x, at(x, y) { return this.buf[this.off(x, y)]; } };
}
function truecolour(file) {
  const buf = fs.readFileSync(file);
  const dataOffset = buf.readUInt32LE(10), W = buf.readInt32LE(18), rawH = buf.readInt32LE(22);
  const H = Math.abs(rawH), up = rawH > 0, rowSize = Math.floor((24 * W + 31) / 32) * 4;
  return { buf, dataOffset, W, H, up, rowSize };
}
function byColour(csv) {
  const out = new Map();
  for (const line of fs.readFileSync(csv, "latin1").split(/\r?\n/)) {
    const c = line.trim().split(";");
    if (c.length < 5 || !/^\d+$/.test(c[0])) continue;
    out.set(((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0,
      { id: +c[0], land: (c[4] || "").trim().toLowerCase() === "land", terrain: (c[6] || "").trim().toLowerCase() });
  }
  return out;
}
/** Fold every provinces.bmp pixel into the trees.bmp block covering it, at the scale the two files' headers
 *  give. `sole` is the one land province under a block, or -1 when more than one shares it. */
function blockFacts(treesFile, provFile, defFile) {
  const t = indexed(treesFile), p = truecolour(provFile), def = byColour(defFile);
  const n = t.W * t.H;
  const hasLand = new Uint8Array(n), hasWater = new Uint8Array(n);
  const sole = new Int32Array(n).fill(-2);
  const terr = new Array(n).fill(undefined);
  for (let y = 0; y < p.H; y++) {
    const rowBase = Math.min(t.H - 1, Math.floor(y * t.H / p.H)) * t.W;
    const prow = p.dataOffset + (p.up ? (p.H - 1 - y) : y) * p.rowSize;
    for (let x = 0; x < p.W; x++) {
      const o = prow + x * 3;
      const rec = def.get(((p.buf[o + 2] << 16) | (p.buf[o + 1] << 8) | p.buf[o]) >>> 0);
      const b = rowBase + Math.min(t.W - 1, Math.floor(x * t.W / p.W));
      if (!rec) { sole[b] = -1; continue; }
      if (!rec.land) { hasWater[b] = 1; continue; }
      hasLand[b] = 1;
      sole[b] = sole[b] === -2 ? rec.id : (sole[b] === rec.id ? rec.id : -1);
      if (terr[b] === undefined) terr[b] = rec.terrain; else if (terr[b] !== rec.terrain) terr[b] = null;
    }
  }
  return { t, p, n, hasLand, hasWater, sole, terr };
}
/** The index this map uses for "nothing grows here": the modal one under blocks that are entirely water. */
function bareIndexOf(f) {
  const votes = new Map();
  for (let b = 0; b < f.n; b++) {
    if (f.hasLand[b] || !f.hasWater[b]) continue;
    const i = f.t.at(b % f.t.W, Math.floor(b / f.t.W));
    votes.set(i, (votes.get(i) || 0) + 1);
  }
  let bare = -1, best = -1, total = 0;
  for (const [i, c] of votes) { total += c; if (c > best || (c === best && i < bare)) { bare = i; best = c; } }
  return { bare, share: total ? best / total : 0 };
}
/** Vegetated blocks standing entirely over water — the number this whole item is about. */
function afloat(f, bare) {
  let veg = 0, over = 0;
  for (let b = 0; b < f.n; b++) {
    if (!f.hasLand[b] && !f.hasWater[b]) continue;
    if (f.t.at(b % f.t.W, Math.floor(b / f.t.W)) === bare) continue;
    veg++;
    if (!f.hasLand[b]) over++;
  }
  return { veg, over, share: veg ? over / veg : 0 };
}

// ══ 1. THE BEHAVIOUR, on a fixture small enough to state every expected byte ═════════════════════════════
//
// 12x4 provinces, and a trees.bmp at 6x2 — HALF the width and HALF the height, so one block covers a 2x2
// square of province pixels and a writer that assumed the two files were the same size addresses the wrong
// bytes. The fixture's own bare index is 7, not 0: the writer must VOTE for it off this map's untouched open
// water, and one that types vanilla's 0 fails here.
console.log("\n=== the fixture: a trees.bmp at its own scale, with its own bare index ===");
const SEA_LEVEL = md.HEIGHTMAP_SEA_LEVEL, SEA_VALUE = md.HEIGHTMAP_SEA_VALUE;
const FIX_W = 12, FIX_H = 4, TR_W = 6, TR_H = 2;
const WOOD = 6, BARE = 7;                       // ⚠️ neither is 0 — see above
const provAtX = (x) => (x < 3 ? 1 : x < 6 ? 2 : x < 9 ? 3 : 4);   // 1,2,3 land · 4 sea
const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40] };
// block bx covers x = 2*bx, 2*bx+1 → bx0 is province 1 alone; bx1 STRADDLES provinces 1 and 2; bx5 is the
// only block that is open water and nothing else, so it is the only thing that gets to vote.
const treeAt = (bx, by) => (bx === 0 && by === 1) ? BARE : (bx === 5 ? BARE : WOOD);

function bmp8(width, height, indexFn, palette) {
  const rowSize = (width + 3) & ~3, imageSize = rowSize * height, dataOffset = 54 + 256 * 4;
  const buf = Buffer.alloc(dataOffset + imageSize);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(dataOffset, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(8, 28); buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34); buf.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { const c = (palette && palette[i]) || { r: i, g: 255 - i, b: (i * 7) & 0xff }; const o = 54 + i * 4; buf[o] = c.b; buf[o + 1] = c.g; buf[o + 2] = c.r; buf[o + 3] = 0; }
  for (let y = 0; y < height; y++) { const row = dataOffset + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) buf[row + x] = indexFn(x, y) & 0xff; }
  return buf;
}
function makeFixture(opts) {
  const o = opts || {};
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-trees-fix-")); tmps.push(d);
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "nova-trees-base-")); tmps.push(base);
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="Trees"\n');
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.mkdirSync(path.join(base, "map"), { recursive: true });

  const rowSize = (FIX_W * 3 + 3) & ~3, imageSize = rowSize * FIX_H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(FIX_W, 18); bmp.writeInt32LE(FIX_H, 22); bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < FIX_H; y++) { let p = 54 + (FIX_H - 1 - y) * rowSize; for (let x = 0; x < FIX_W; x++) { const c = COL[provAtX(x)]; bmp[p++] = c[2]; bmp[p++] = c[1]; bmp[p++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);
  fs.writeFileSync(path.join(d, "map", "definition.csv"),
    ["0;0;0;0;land;false;unknown;0", "1;10;10;10;land;false;plains;1", "2;20;20;20;land;false;plains;1",
      "3;30;30;30;land;true;plains;1",
      o.allLand ? "4;40;40;40;land;true;plains;1" : "4;40;40;40;sea;false;ocean;0"].join("\n") + "\n");
  // Land sits above sea level, water at the sea value — so a sink actually CROSSES the waterline.
  fs.writeFileSync(path.join(d, "map", "heightmap.bmp"),
    bmp8(FIX_W, FIX_H, (x) => (provAtX(x) === 4 && !o.allLand ? SEA_VALUE : SEA_LEVEL + 11)));
  // ⚠️ trees.bmp lives in the BASE root, not the mod: the mod must take its own copy to clear anything, and
  // the copy must carry that file's header and palette byte for byte.
  const where = o.treesInMod ? d : base;
  fs.writeFileSync(path.join(where, "map", "trees.bmp"), bmp8(TR_W, TR_H, (bx, by) => treeAt(bx, by)));
  return { d, base };
}

{
  const f = makeFixture();
  const srcTrees = fs.readFileSync(path.join(f.base, "map", "trees.bmp"));
  const r = md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: f.base, dependencyRoots: [], provinceIds: [1] });
  ok(r.changed === true, "drowning province 1 changed the map", r.error || r.reason || r);
  const tr = r.trees || {};
  ok(tr.changed === true, "⭐ …and trees.bmp was cleared beside the heightmap and the terrain", tr);
  ok(tr.width === TR_W && tr.height === TR_H,
    "⭐ the writer worked at trees.bmp's OWN size, not provinces.bmp's", { got: [tr.width, tr.height], provinces: [FIX_W, FIX_H] });
  ok(tr.bare === BARE, "⭐ the bare index was VOTED for by this map's own open water, not typed as 0", { got: tr.bare, fixture: BARE });
  ok(tr.materialized === true && fs.existsSync(path.join(f.d, "map", "trees.bmp")),
    "…and the mod took its own copy, because you cannot clear vegetation you do not own", tr);

  // Every block, stated: only the one block that is province 1 alone AND was not already bare may change.
  // ⚠️ Read through the file the mod EFFECTIVELY has. Backing the fix out leaves no mod copy, and a test that
  // throws there reports one crash instead of the eight things that stopped being true — a back-out control
  // has to survive the back-out to be read.
  const written = fs.existsSync(path.join(f.d, "map", "trees.bmp"));
  const out = indexed(path.join(written ? f.d : f.base, "map", "trees.bmp"));
  const expect = (bx, by) => (bx === 0 ? BARE : treeAt(bx, by));
  const wrong = [];
  for (let by = 0; by < TR_H; by++) for (let bx = 0; bx < TR_W; bx++) {
    const got = out.at(bx, by), want = expect(bx, by);
    if (got !== want) wrong.push(`(${bx},${by}) got ${got} want ${want}`);
  }
  ok(wrong.length === 0, "⭐⭐ every one of the 12 blocks holds exactly what it should", wrong);
  ok(tr.pixels === 1, "…and it reported the ONE block it actually changed — the other half of that column was already bare", tr.pixels);
  ok(out.at(1, 0) === WOOD && out.at(1, 1) === WOOD,
    "⭐⭐ the block STRADDLING drowned province 1 and standing province 2 kept its trees: one index covers both",
    [out.at(1, 0), out.at(1, 1)]);
  ok(out.at(3, 0) === WOOD && out.at(4, 0) === WOOD,
    "…and nothing that did not cross the waterline was touched at all", [out.at(3, 0), out.at(4, 0)]);
  const off = srcTrees.readUInt32LE(10);
  ok(written && out.buf.length === srcTrees.length && Buffer.compare(out.buf.slice(0, off), srcTrees.slice(0, off)) === 0,
    `⭐ the first ${off} bytes — header and palette — came through byte-identical`, { written, src: srcTrees.length, out: out.buf.length });
}

console.log("\n=== 🌱 a raise with nothing underneath to learn from still writes nothing ===");
{
  // The raise path goes to the planter now. This fixture's base root holds a trees.bmp and NOTHING else — no
  // provinces.bmp, no definition.csv — so there is no whole map underneath to read a vegetation mix off, and
  // a trees.bmp with no definition.csv beside it is evidence of nothing. The planter must decline, and say so.
  // ⚠️ THE ASSERTION IS THAT NO FILE APPEARS, not merely that a flag is false: a planter that wrote a bare
  // copy would satisfy `changed === false` and still leave the mod owning a file it never asked for.
  const f = makeFixture();
  const up = md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: f.base, dependencyRoots: [], provinceIds: [4], raise: true });
  ok(up.changed === true, "raising the sea province changed the heightmap", up.error || up.reason || up);
  ok(!!(up.trees && up.trees.changed) === false && /underneath/.test(String((up.trees || {}).reason || "")),
    "⭐ …and trees.bmp was not written: an unknown is not a licence to paint", up.trees);
  ok(!fs.existsSync(path.join(f.d, "map", "trees.bmp")),
    "⭐⭐ a mod that only ADDS land never acquires a trees.bmp it did not ask for", fs.readdirSync(path.join(f.d, "map")));
}

console.log("\n=== a map with nothing to teach it is left alone ===");
{
  // Every province on this map is land and every one of them is drowned in one call, so nothing is left that
  // is open water AND untouched — there is no evidence anywhere on it about what "nothing grows here" means.
  const f = makeFixture({ allLand: true });
  const r = md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: f.base, dependencyRoots: [], provinceIds: [1, 2, 3, 4] });
  ok(!!(r.trees && r.trees.changed) === false && /bare index/.test(String((r.trees || {}).reason || "")),
    "⭐ with no untouched water to read a bare index from it declines — an unknown is not a licence to paint", r.trees);
  ok(!fs.existsSync(path.join(f.d, "map", "trees.bmp")), "…and writes no file");
}

console.log("\n=== and it will not write into the base game ===");
{
  const f = makeFixture({ treesInMod: true });
  const clear = md.clearProvincesInTreesBmp;
  ok(typeof clear === "function", "the writer is exported, so a test can drive it directly", typeof clear);
  const call = (args) => { try { return clear(args); } catch (e) { return { changed: null, error: String(e && e.message) }; } };
  const r = typeof clear === "function"
    ? call({ modRoot: f.base, gameRoot: f.base, dependencyRoots: [], provinceIds: [1], crossed: { mask: new Uint8Array(FIX_W * FIX_H), W: FIX_W, H: FIX_H } }) : {};
  ok(r.changed === false && /game directory/.test(String(r.error || "")), "refused when the mod IS the game root", r);
  const s = typeof clear === "function" ? call({ modRoot: f.d, gameRoot: f.base, dependencyRoots: [], provinceIds: [1], crossed: null }) : {};
  ok(s.changed === false && /crossed/.test(String(s.reason || "")), "…and with no crossed mask it does nothing at all", s);
}

// ══ 2. THE CORPUS: a map nobody has edited is the standard ═══════════════════════════════════════════════
console.log("\n=== 🈯 what the six shipping maps look like, measured in this run ===");
const shipping = [];
{
  for (const [name, root] of Object.entries(CORPUS)) {
    const at = (rel) => fs.existsSync(path.join(root, rel)) ? path.join(root, rel) : path.join(GAME, rel);
    const trees = at("map/trees.bmp"), prov = at("map/provinces.bmp"), def = at("map/definition.csv");
    if (!fs.existsSync(trees) || !fs.existsSync(prov) || !fs.existsSync(def)) { console.log(`  ..   (${name} is not installed)`); continue; }
    const f = blockFacts(trees, prov, def);
    const b = bareIndexOf(f), a = afloat(f, b.bare);
    // What does this map put under ordinary land of each kind? The raise path's whole case.
    const perCat = new Map();
    for (let i = 0; i < f.n; i++) {
      if (!f.hasLand[i] || f.hasWater[i] || !f.terr[i]) continue;
      const h = perCat.get(f.terr[i]) || { n: 0, bare: 0, votes: new Map() };
      h.n++; const idx = f.t.at(i % f.t.W, Math.floor(i / f.t.W));
      if (idx === b.bare) h.bare++;
      h.votes.set(idx, (h.votes.get(idx) || 0) + 1);
      perCat.set(f.terr[i], h);
    }
    const plains = perCat.get("plains");
    let plainsModal = -1, pm = -1;
    if (plains) for (const [i, c] of plains.votes) if (c > pm || (c === pm && i < plainsModal)) { plainsModal = i; pm = c; }
    shipping.push({ name, ...b, ...a, scale: f.t.W / f.p.W, size: `${f.t.W}x${f.t.H}`, plainsModal, plainsBare: plains ? plains.bare / plains.n : null });
    console.log(`  ..   ${name}: trees ${f.t.W}x${f.t.H} at ${(f.t.W / f.p.W).toFixed(4)} of provinces.bmp · bare index ${b.bare} `
      + `(${(100 * b.share).toFixed(2)}% of its water) · ${a.over} of ${a.veg} vegetated blocks afloat (${(100 * a.share).toFixed(3)}%)`
      + (plains ? ` · plains modal index ${plainsModal}, ${(100 * plains.bare / plains.n).toFixed(1)}% bare` : ""));
  }
  ok(shipping.length >= 2, "at least two shipping maps were measured", shipping.length);
  ok(shipping.every((s) => s.bare === shipping[0].bare),
    "⭐ every shipping map votes for the same bare index — derived here, not typed", shipping.map((s) => `${s.name}:${s.bare}`));
  ok(new Set(shipping.map((s) => s.size)).size > 1,
    "⭐ …and they do NOT share a trees.bmp size, which is why the scale is read per file", shipping.map((s) => `${s.name}:${s.size}`));
  ok(shipping.every((s) => s.plainsModal === s.bare),
    "⭐⭐ the modal index under PLAINS is the bare one on every one of them — which is why the raise writes nothing",
    shipping.map((s) => `${s.name}:${s.plainsModal}/${s.bare}`));
}
// The standard Nova's own world is held to: the WORST any shipping map manages, measured in this same run.
const worstShipping = shipping.length ? Math.max(...shipping.map((s) => s.over)) : Infinity;

// ══ 3. THE OWNER'S OWN CLICK, against the installed base game ════════════════════════════════════════════
console.log("\n=== 🈯 Delete map on a copy of the real world ===");
if (!shipping.length || !fs.existsSync(path.join(GAME, "map", "trees.bmp"))) {
  console.log("  ..   (the base game is not installed — the measuring half cannot run)");
} else {
  const BARE_IDX = shipping[0].bare;
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-trees-world-")); tmps.push(m);
  fs.writeFileSync(path.join(m, "descriptor.mod"), 'name="TreesWorld"\n');
  fs.mkdirSync(path.join(m, "map"), { recursive: true });
  // ⛔ #a-blank-claims-a-world-the-mod-does-not-own — the blank refuses on a mod owning no provinces.bmp, so
  // the fixture does the one thing that refusal tells the modder to do.
  fs.copyFileSync(path.join(GAME, "map", "provinces.bmp"), path.join(m, "map", "provinces.bmp"));
  ok(!fs.existsSync(path.join(m, "map", "trees.bmp")), "the mod owns no trees.bmp of its own yet");

  const untouched = afloat(blockFacts(path.join(GAME, "map", "trees.bmp"), path.join(m, "map", "provinces.bmp"), path.join(GAME, "map", "definition.csv")), BARE_IDX);
  console.log(`  ..   the world as it ships: ${untouched.over} of ${untouched.veg} vegetated blocks afloat`);
  const res = md.blankMapToSea({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
  ok(res.changed === true, "Delete map ran", res.error || res);
  const tr = (res.heightmap && res.heightmap.trees) || {};
  ok(tr.changed === true, "⭐ it cleared trees.bmp as well as the heightmap and the terrain", tr);
  ok(tr.materialized === true && fs.existsSync(path.join(m, "map", "trees.bmp")), "…and the mod now owns map/trees.bmp", tr);
  ok(tr.bare === BARE_IDX, "…using the index the base game itself votes for", { got: tr.bare, corpus: BARE_IDX });

  // ⚠️ Same reason as the fixture above: read the file the mod EFFECTIVELY has, so a back-out reports what
  // stopped being true instead of throwing on the first missing file.
  const wrote = fs.existsSync(path.join(m, "map", "trees.bmp"));
  const src = fs.readFileSync(path.join(GAME, "map", "trees.bmp"));
  const out = fs.readFileSync(path.join(wrote ? m : GAME, "map", "trees.bmp"));
  const off = src.readUInt32LE(10);
  ok(wrote && out.length === src.length, "the written file is exactly as long as the one it came from", { wrote, src: src.length, out: out.length });
  ok(wrote && Buffer.compare(out.slice(0, off), src.slice(0, off)) === 0, `⭐ its first ${off} bytes — header and palette — are byte-identical`, { wrote });

  const facts = blockFacts(path.join(wrote ? m : GAME, "map", "trees.bmp"), path.join(m, "map", "provinces.bmp"), path.join(m, "map", "definition.csv"));
  const after = afloat(facts, BARE_IDX);
  // ⭐ THE BACK-OUT CONTROL, measured in this same run rather than remembered: the mod's drowned world read
  // against the file it INHERITED is exactly the state the base commit leaves behind, because the base commit
  // never wrote trees.bmp at all. That is the number this item exists to move.
  const inherited = afloat(blockFacts(path.join(GAME, "map", "trees.bmp"), path.join(m, "map", "provinces.bmp"), path.join(m, "map", "definition.csv")), BARE_IDX);
  console.log(`  ..   the same world through the file it would have inherited: ${inherited.over} of ${inherited.veg} afloat`
    + ` → through the one Nova wrote: ${after.over} of ${after.veg}; shipping maps run ${Math.min(...shipping.map((s) => s.over))}–${worstShipping}`);
  ok(inherited.over > 1000 && inherited.over === inherited.veg,
    "⭐⭐ without this write, EVERY vegetated block on the drowned world stands over open water", inherited);
  ok(after.over < inherited.over / 100, "⭐⭐ with it, fewer than one in a hundred of them do", { inherited: inherited.over, after: after.over });
  ok(after.over <= worstShipping,
    "⭐⭐ …and the world Nova hands back is no worse than the WORST shipping map on this machine",
    { nova: after.over, worstShipping, maps: shipping.map((s) => `${s.name}:${s.over}`) });

  // ⭐ THE SAFETY INVARIANT, block by block rather than in aggregate. One trees block covers about 3.4x3.4
  // province pixels and carries ONE index for all of them, so a looser gate takes the trees off land nobody
  // touched. Nothing that still has land under it may have moved.
  let changed = 0, overLand = 0;
  for (let b = 0; b < facts.n; b++) {
    const x = b % facts.t.W, y = Math.floor(b / facts.t.W);
    if (out[facts.t.off(x, y)] === src[facts.t.off(x, y)]) continue;
    changed++;
    if (facts.hasLand[b]) overLand++;
  }
  ok(changed === tr.pixels, "the count it reported is the count that changed on disk", { reported: tr.pixels, onDisk: changed });
  ok(overLand === 0, "⭐⭐ not one block with land still under it was touched", overLand);
}

// ══ 4. THE OVERLAY QUESTION: who gets handed a file they did not ask for ═════════════════════════════════
console.log("\n=== 🈯 …and drowning one bare province hands the mod nothing ===");
if (!shipping.length || !fs.existsSync(path.join(GAME, "map", "trees.bmp"))) {
  console.log("  ..   (the base game is not installed — the measuring half cannot run)");
} else {
  const BARE_IDX = shipping[0].bare;
  // Both provinces are chosen BY MEASUREMENT: a province id typed into a test is a number that stops being
  // true. One owns only bare blocks; one owns wooded ones.
  const f = blockFacts(path.join(GAME, "map", "trees.bmp"), path.join(GAME, "map", "provinces.bmp"), path.join(GAME, "map", "definition.csv"));
  const own = new Map();
  for (let b = 0; b < f.n; b++) {
    const id = f.sole[b];
    if (id < 1 || !f.hasLand[b] || f.hasWater[b]) continue;
    const rec = own.get(id) || { blocks: 0, wooded: 0 };
    rec.blocks++;
    if (f.t.at(b % f.t.W, Math.floor(b / f.t.W)) !== BARE_IDX) rec.wooded++;
    own.set(id, rec);
  }
  let bareProv = 0, woodProv = 0;
  for (const [id, rec] of [...own.entries()].sort((a, b) => a[0] - b[0])) {
    if (!bareProv && rec.blocks >= 4 && rec.wooded === 0) bareProv = id;
    if (!woodProv && rec.wooded >= 4) woodProv = id;
    if (bareProv && woodProv) break;
  }
  ok(bareProv > 0 && woodProv > 0, "found a bare land province and a wooded one, by measurement", { bareProv, woodProv });

  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-trees-one-")); tmps.push(m);
  fs.writeFileSync(path.join(m, "descriptor.mod"), 'name="TreesOne"\n');
  const dry = md.sinkProvincesInHeightmap({ modRoot: m, gameRoot: GAME, dependencyRoots: [], provinceIds: [bareProv] });
  ok(dry.changed === true, `drowning the bare province ${bareProv} changed the heightmap`, dry.error || dry.reason);
  ok(!!(dry.trees && dry.trees.changed) === false, "⭐ …and wrote nothing to trees.bmp: nothing was growing there", dry.trees);
  ok(!fs.existsSync(path.join(m, "map", "trees.bmp")),
    "⭐⭐ so this mod was NOT handed a trees.bmp it did not ask for", fs.readdirSync(path.join(m, "map")));

  const wet = md.sinkProvincesInHeightmap({ modRoot: m, gameRoot: GAME, dependencyRoots: [], provinceIds: [woodProv] });
  ok(!!(wet.trees && wet.trees.changed) === true, `⭐ drowning the wooded province ${woodProv} DID clear trees.bmp`, wet.trees);
  ok(fs.existsSync(path.join(m, "map", "trees.bmp")), "…and only then did the mod take its own copy");
  const wetPx = (wet.trees || {}).pixels;
  ok(wetPx > 0 && wetPx < f.n / 100, "…a handful of blocks, not the whole map", { pixels: wetPx, of: f.n });
  // It can never be the FIRST file such a click acquires: `crossed` exists only after the heightmap write landed.
  ok(fs.existsSync(path.join(m, "map", "heightmap.bmp")),
    "⭐ …and never before heightmap.bmp, which is the only thing that can produce the crossed mask");
}

// ══ 5. THE PAGE, lifted and RUN — a source-shape assertion is not a control ══════════════════════════════
console.log("\n=== the page names the file the mod just acquired ===");
{
  // 🈯 Lifted CRLF-tolerantly on purpose: a fresh worktree checks out CRLF while D:/Nova's copy is LF, and a
  // bare-newline anchor finds nothing in one of them while reporting success.
  const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8").replace(/\r\n/g, "\n");
  const s0 = MAP.indexOf("function heightmapNote(hm) {");
  const body = s0 < 0 ? "" : MAP.slice(s0, MAP.indexOf("\n  }\n", s0) + 4);
  let note = null;
  try { note = new Function(body + "\nreturn heightmapNote;")(); } catch (_) { note = null; }
  ok(typeof note === "function", "heightmapNote lifted and runs");
  const said = typeof note === "function"
    ? note({ pixels: 3969959, raised: false, materialized: true, terrain: { pixels: 3969927, materialized: true }, trees: { pixels: 99005, materialized: true } })
    : "";
  ok(/map\/trees\.bmp/.test(said), "⭐ it names map/trees.bmp among the files the mod now owns", said);
  ok(/99,005/.test(said), "…and says how much vegetation it took off the water", said);
  ok(/map\/heightmap\.bmp/.test(said) && /map\/terrain\.bmp/.test(said), "…without losing the two it already named", said);
  const two = typeof note === "function"
    ? note({ pixels: 10, raised: false, materialized: true, terrain: { pixels: 10, materialized: true }, trees: { changed: false, pixels: 0 } })
    : "";
  ok(/heightmap\.bmp and map\/terrain\.bmp/.test(two) && !/trees/.test(two),
    "…and says nothing about trees.bmp on a click that did not touch it", two);
  const quiet = typeof note === "function"
    ? note({ pixels: 1270, raised: true, materialized: false, terrain: { pixels: 1270, materialized: false }, trees: { changed: false, pixels: 0 } })
    : "x";
  ok(quiet === "", "…and nothing at all when no file was acquired", quiet);
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n${fails.length ? "FAILED" : "PASSED"}: ${pass} ok, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
