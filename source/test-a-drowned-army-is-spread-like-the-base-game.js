// ⛔ #a-drowned-army-is-spread-like-the-base-game — A DROWNED COAST'S ARMY IS NOT PILED ON ONE PROVINCE.
//
// fixDrownedDivisions moved each drowned division to the nearest land its country owns, and nothing else: a coast of
// 56 Chinese divisions has one nearest Chinese province, so all 56 landed on it. On the owner's TEST 32 that gave 82
// places where one file stacked ten or more, and one file (JAP_1939) putting 82 on a single province. Vanilla has no
// file stacking ten on one province; its largest is 9 (measured 2026-10-06 over its 203 started files).
//
// THE RULE: each file fills its nearest provinces only up to its OWN density in the layer below — its divisions over
// the provinces they stand on, rounded up — and when every province is at that density, the least-loaded, nearest
// first. Not the file's largest stack: on TEST 32's 144 started files that cap packs every destination to the file's
// maximum (stacks of 5 or more in 18.7% of places, worse than the 15.8% it replaces and vanilla's 2.7%); the mean gives
// 3.5%. Case 4 is the one fixture that tells the two apart.
//
// Every expected destination is computed HERE, by an oracle written from the rule above over the fixture's own
// centroids (8x8 provinces of 32px, ids 1..64 by row: province p sits at column (p-1)%8, row ⌊(p-1)/8⌋).
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");

const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-spread-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 400))); fails.push(name); }
};
const tmps = [APPDATA_DIR];
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-spread-" + t + "-")); tmps.push(d); return d; };
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };

function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const provAt = (x, y) => Math.floor(x / 32) + Math.floor(y / 32) * 8 + 1;
const COL = (p) => [((p * 29) % 210) + 15, ((p * 67) % 210) + 15, ((p * 101) % 210) + 15];
const BMP = bmp24(256, 256, (x, y) => COL(provAt(x, y)));
const definition = (isLand) => {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 64; p++) {
    const [r, g, b] = COL(p), land = isLand(p);
    rows.push(`${p};${r};${g};${b};${land ? "land" : "sea"};false;${land ? "plains" : "ocean"};${land ? 1 : 0}`);
  }
  return rows.join("\n") + "\n";
};
const st = (id, provs, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
const oob = (locs) => ['division_template = { name = "Inf" regiments = { infantry = { x = 0 y = 0 } } }', "units = {",
  ...locs.map((p, i) => `\tdivision = { name = "D${i + 1}" location = ${p} division_template = "Inf" }`), "}", ""].join("\n");
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const locsIn = (s) => (s.match(/location\s*=\s*(\d+)/g) || []).map((x) => Number(x.replace(/\D/g, "")));

/** One world: below, rows 0–5 are land and `tag` owns all of it; the mod keeps `modLand` and hands it out by `modStates`. */
function world(name, { tag, locs, modLand, modStates }) {
  const g = tmp(name + "-game"), m = tmp(name + "-mod");
  mk(g, "map/provinces.bmp", BMP);
  mk(g, "map/definition.csv", definition((p) => p <= 48));
  mk(g, "history/states/1.txt", st(1, range(1, 48), tag));
  mk(g, `history/countries/${tag} - ${tag}land.txt`, `capital = 1\noob = "${tag}_1936"\n`);
  mk(g, `history/units/${tag}_1936.txt`, oob(locs));
  mk(m, "descriptor.mod", `name="${name}"\nreplace_path="history/states"\n`);
  mk(m, "map/definition.csv", definition(modLand));
  modStates.forEach(([provs, owner], i) => mk(m, `history/states/${i + 1}.txt`, st(i + 1, provs, owner)));
  return { ctx: { modRoot: m, gameRoot: g, dependencyRoots: [] }, file: path.join(m, "history", "units", `${tag}_1936.txt`) };
}

// ── the oracle: the rule, written from its statement, over the fixture's own centres ────────────────────────────────
const centre = (p) => ({ x: ((p - 1) % 8) * 32 + 16, y: Math.floor((p - 1) / 8) * 32 + 16 });
const d2 = (a, b) => { const A = centre(a), B = centre(b); return (A.x - B.x) ** 2 + (A.y - B.y) ** 2; };
function oracle(locs, drowned, ownLand, cap) {
  const load = new Map();
  for (const p of locs) if (!drowned.has(p)) load.set(p, (load.get(p) || 0) + 1);
  return locs.map((p) => {
    if (!drowned.has(p)) return p;
    const ranked = ownLand.slice().sort((a, b) => d2(p, a) - d2(p, b) || a - b);
    let to = ranked.find((q) => (load.get(q) || 0) < cap);
    if (to === undefined) to = ranked.reduce((best, q) => ((load.get(q) || 0) < (load.get(best) || 0) ? q : best), ranked[0]);
    load.set(to, (load.get(to) || 0) + 1);
    return to;
  });
}
const density = (locs) => Math.ceil(locs.length / new Set(locs).size);
const counts = (locs) => { const c = new Map(); for (const p of locs) c.set(p, (c.get(p) || 0) + 1); return c; };

// THE CONTROL: the oracle's centres are the fixer's own — provinceCentroids on the fixture bitmap, z measured bottom-up
{
  const w = world("control", { tag: "ZZZ", locs: [1], modLand: (p) => p <= 16, modStates: [[range(1, 16), "ZZZ"]] });
  const c = md.provinceCentroids({ ...w.ctx, wanted: new Set([1, 9, 33, 34, 35]) });
  const okc = [1, 9, 33, 34, 35].every((p) => c.get(p) && Math.abs(c.get(p).x - centre(p).x) <= 1 && Math.abs((256 - c.get(p).z) - centre(p).y) <= 1);
  rec("THE CONTROL: the oracle's centres are the ones provinceCentroids gives (x across, z from the bottom)", okc,
    [1, 9, 33].map((p) => ({ p, got: c.get(p), want: centre(p) })));
}

// ── case 1: fill to the file's density ──────────────────────────────────────────────────────────────────────────────
// 3 divisions on each of 33, 34, 35 (row 4, drowned) and 1 already on 9 (row 1, land): 10 on 4 provinces → 3 a province.
// 9 is the nearest land to 33, so the one standing there counts: a fixer that forgets it puts 4 on 9.
console.log("=== case 1: each province takes the file's own density, the one already there included ===");
{
  const locs = [33, 33, 33, 34, 34, 34, 35, 35, 35, 9];
  const w = world("one", { tag: "ZZZ", locs, modLand: (p) => p <= 16, modStates: [[range(1, 16), "ZZZ"]] });
  const cap = density(locs);
  const want = oracle(locs, new Set([33, 34, 35]), range(1, 16), cap);
  rec("THE CONTROL: the file's density is 3, and the oracle's answer holds no province above it", cap === 3 && Math.max(...counts(want).values()) === 3, { cap, want });
  const r = md.fixDrownedDivisions(w.ctx);
  const got = locsIn(fs.readFileSync(w.file, "utf8"));
  rec("⭐⭐⭐ the nine land exactly where the rule puts them", JSON.stringify(got) === JSON.stringify(want), { got, want });
  rec("⭐⭐⭐ no province holds more than 3 of the file's divisions — the one already on 9 included",
    Math.max(...counts(got).values()) <= cap, [...counts(got)]);
  rec("⭐⭐ …and the moves say they were held to the density", r.moved === 9 && r.spread && r.spread.capped > 0 && r.spread.overflowed === 0, r.spread);
}

// ── case 2: past the density, the least-loaded, nearest first ───────────────────────────────────────────────────────
// 7 divisions on 4 drowned provinces (cap 2), and the country keeps only 2 provinces: 2 + 2, then 3 more, each to the
// least-loaded — 4 and 3, not 7 and 0, and not 5 and 2.
console.log("\n=== case 2: when every province is at the density, the least-loaded takes the next ===");
{
  const locs = [41, 41, 42, 42, 43, 43, 44];
  const w = world("two", { tag: "BBB", locs, modLand: (p) => p <= 16, modStates: [[[9, 13], "BBB"], [[...range(1, 8), 10, 11, 12, 14, 15, 16], "CCC"]] });
  const cap = density(locs);
  const want = oracle(locs, new Set([41, 42, 43, 44]), [9, 13], cap);
  const wc = counts(want);
  rec("THE CONTROL: cap 2 over two provinces leaves three to place past it, and the oracle splits them 4 and 3",
    cap === 2 && [...wc.values()].sort().join() === "3,4", { cap, want: [...wc] });
  md.fixDrownedDivisions(w.ctx);
  const got = locsIn(fs.readFileSync(w.file, "utf8"));
  rec("⭐⭐⭐ the seven land exactly where the rule puts them — 4 and 3", JSON.stringify(got) === JSON.stringify(want),
    { got: [...counts(got)], want: [...wc] });
}

// ── case 3: one division still goes to its own country's nearest land ───────────────────────────────────────────────
// The regression guard for the rule this replaces: 40 → 8 (ZZZ's, nearest), never 16 (nearer, AAA's) or 1 (ZZZ's, furthest).
console.log("\n=== case 3: a lone division still goes to the nearest land of its own country ===");
{
  const w = world("three", { tag: "ZZZ", locs: [40, 1], modLand: (p) => p <= 16, modStates: [[[1, 8], "ZZZ"], [[16], "AAA"], [[...range(2, 7), ...range(9, 15)], "CCC"]] });
  md.fixDrownedDivisions(w.ctx);
  const got = locsIn(fs.readFileSync(w.file, "utf8"));
  rec("⭐⭐⭐ 40 lands on 8", got[0] === 8 && got[1] === 1, got);
}

// ── case 4: the MEAN, not the largest stack ─────────────────────────────────────────────────────────────────────────
// 4 divisions on 33 (drowned) and one each on 16, 8 and 7 (ZZZ's land, far away): 7 on 4 provinces → 2 a province. The
// file's largest stack is 4. ZZZ's nearest land to 33 is 9, then 10: the mean puts 2 and 2, the largest stack all 4 on 9.
console.log("\n=== case 4: the density is the file's mean, not its largest stack ===");
{
  const locs = [33, 33, 33, 33, 16, 8, 7];
  const zzz = [7, 8, 9, 10, 16];
  const w = world("four", { tag: "ZZZ", locs, modLand: (p) => p <= 16, modStates: [[zzz, "ZZZ"], [range(1, 16).filter((p) => !zzz.includes(p)), "YYY"]] });
  const cap = density(locs);
  const want = oracle(locs, new Set([33]), zzz, cap);
  const maxStack = Math.max(...counts(locs).values());
  rec("THE CONTROL: the mean (2) and the largest stack (4) differ here, and the two rules give different answers",
    cap === 2 && maxStack === 4 && JSON.stringify(oracle(locs, new Set([33]), zzz, maxStack)) !== JSON.stringify(want), { cap, maxStack, want });
  md.fixDrownedDivisions(w.ctx);
  const got = locsIn(fs.readFileSync(w.file, "utf8"));
  rec("⭐⭐⭐ two on 9 and two on 10 — not four on 9", JSON.stringify(got) === JSON.stringify(want) && counts(got).get(9) === 2 && counts(got).get(10) === 2,
    { got, want });
}

// ── case 5: the density is read from the copy BELOW, not from a pile already in the mod ─────────────────────────────
// The mod already carries its own ZZZ file: four on 9 (a pile an earlier click left) and six still on 33. Read as it is,
// that is 10 on 2 provinces, a density of 5, which lets one more onto 9; below, the file is 10 on 4 → 3, and 9 is full.
console.log("\n=== case 5: the density is the layer below's, never a pile the mod already holds ===");
{
  const locs = [33, 33, 33, 34, 34, 34, 35, 35, 35, 9];
  const w = world("five", { tag: "ZZZ", locs, modLand: (p) => p <= 16, modStates: [[range(1, 16), "ZZZ"]] });
  const pile = [9, 9, 9, 9, 33, 33, 33, 33, 33, 33];
  mk(w.ctx.modRoot, "history/units/ZZZ_1936.txt", oob(pile));
  const want = oracle(pile, new Set([33]), range(1, 16), density(locs));
  rec("THE CONTROL: read off the mod's own copy the density would be 5 and put one more on 9; read below it is 3",
    density(pile) === 5 && oracle(pile, new Set([33]), range(1, 16), density(pile)).filter((p) => p === 9).length === 5 && want.filter((p) => p === 9).length === 4,
    { own: density(pile), below: density(locs) });
  md.fixDrownedDivisions(w.ctx);
  const got = locsIn(fs.readFileSync(w.file, "utf8"));
  rec("⭐⭐⭐ the six still drowned go to the nearest provinces under 3, and nothing more onto the pile", JSON.stringify(got) === JSON.stringify(want) && counts(got).get(9) === 4,
    { got, want });
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n=== a drowned army is spread like the base game: ${pass + fails.length} checks, ${fails.length} failed ===`);
if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exit(1); }
assert.ok(pass > 0);
