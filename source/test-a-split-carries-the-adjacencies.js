// ⛔ #a-split-carries-the-adjacencies — A CUT CARRIES THE ADJACENCY ROWS THAT NAME ITS PARENTS, AND LEAVES AUTO-FIX'S ALONE.
//
// map/adjacencies.csv names provinces by id, and Generate land's cut (#a-raised-province-is-cut-to-land-size) leaves a parent's id on
// ONE of its pieces. On the owner's flow 44 of vanilla's rows name a cut parent: Auto-fix retypes 37 of them, but only a row still
// "inherited as it stands" (retypeAdjacencyRow), so a carry that rewrote them would stop that — and of the 7 left, 5 are land-land
// walls (the Himalayas, the Greenland Glacier) whose kept pair no longer touches, so the base game's wall opened between the pieces.
// Pinned on testlib-split-world.js's world, cut by planGeneratedProvinceSplit + writeGeneratedProvinceSplit as Generate land does,
// over a layer below whose map/adjacencies.csv has:
//   W0  a land-land wall between two raised rectangles P and Q, each anchored (unitstacks.txt) at its far side, so the kept pair
//       no longer touches once they are cut;
//   S1  a strait between two land bricks through a raised ocean cell — a row Auto-fix retypes to a land crossing;
//   W1  a wall between a raised ocean cell A and the sea cell B beside it, A anchored on the shared edge — Auto-fix opens it;
//   T1  a strait from a raised rectangle X to a land brick through the sea O2 X borders, X anchored far from O2;
// and a map/adjacency_rules.txt naming a fourth raised rectangle R.
//   1. W0 gains a wall for exactly every pixel-touching pair of P's and Q's families but P-Q itself, with W0's comment;
//   2. S1 and W1 are byte-identical after the cut, and Auto-fix still retypes them (and exactly them);
//   3. T1's X end is the piece of X that borders O2 nearest the row's own start point; the rest of the row stands; and the graph
//      the click walks on after the cut was read after that re-home (a row is a link too);
//   4. R is not cut, and the report says one raised province stays whole for a rule;
//   5. no row of the layer below is lost, and every carried wall survives Auto-fix.
// Every expected pair, piece and count is derived from the bitmap as written. Binds no port.
// Run: node test-a-split-carries-the-adjacencies.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-split-adj-"));
// BEFORE map-data.js loads: app data, ~/.nova (the split record lives there) and the mods root are this test's
process.env.APPDATA = path.join(ROOT, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
process.env.HOI4_MODS_ROOT = path.join(ROOT, "mods");
for (const d of [process.env.APPDATA, process.env.NOVA_HOME_DIR, process.env.HOI4_MODS_ROOT]) fs.mkdirSync(d, { recursive: true });
const md = require("./map-data.js");
const SW = require("./testlib-split-world.js");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!cond) fails.push(label);
};
const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

const SEED = 1, W = SW.W, H = SW.H;
const S = SW.makeShapes({ big: [
  { x0: 288, y0: 32, w: 48, h: 48, key: "P" }, { x0: 336, y0: 32, w: 48, h: 48, key: "Q" },   // side by side: W0 walls them
  { x0: 256, y0: 120, w: 48, h: 48, key: "X" },                                              // on the coast of O2
  { x0: 400, y0: 160, w: 48, h: 48, key: "R" },                                              // the rule's
] });
const at = (x, y) => S.idOf.get(S.keyAt[y * W + x]);
const P = at(300, 50), Q = at(350, 50), X = at(280, 140), R = at(420, 180);
const A = at(100, 30), B = at(150, 30), O = at(100, 150), O2 = at(220, 150);
const Y = at(258, 175), L1 = at(300, 230), L2 = at(340, 230);
// the Standstills the cut anchors on: each piece that keeps its parent's id is the one its station stands on
const anchors = new Map([[P, [290, 56]], [Q, [382, 56]], [X, [302, 144]], [A, [127, 30]]]);
const z = (y) => H - 1 - y + 0.5;
const HEADER = "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment";
const ROWS = {
  W0: `${P};${Q};impassable;-1;-1;-1;-1;-1;;Great Wall`,
  S1: `${L1};${L2};sea;${O};-1;-1;-1;-1;;Inland Strait`,
  W1: `${A};${B};impassable;-1;-1;-1;-1;-1;;Sea Wall`,
  T1: `${X};${Y};sea;${O2};258;${H - 1 - 160};259;${H - 1 - 176};;Coast Strait`,
};
const ADJ = [HEADER, ...Object.values(ROWS), "-1;-1;;-1;-1;-1;-1;-1;;"].join("\r\n") + "\r\n";
const RULES = `adjacency_rule = {\n\tname = "R_RULE"\n\tcontested = { army = no navy = no submarine = no trade = no }\n\trequired_provinces = { ${R} }\n\ticon = ${R}\n\toffset = { 0 0 0 }\n}\n`;
const game = path.join(ROOT, "game");
SW.makeGame(game, S, { adjacencies: ADJ, rules: RULES, unitstacks: new Map([...anchors].map(([p, [x, y]]) => [p, [x + 0.5, z(y)]])) });
const mod = SW.makeMod(path.join(process.env.HOI4_MODS_ROOT, "adj"), S, { name: "adj", keepLand: new Set([Y, L1, L2]) });
const picked = [P, Q, X, R, A, O].map(String);

/** every pair of different provinces sharing a pixel edge (x wraps), from a raster */
function touchingPairs(ids) {
  const out = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = ids[y * W + x], r = ids[y * W + (x + 1) % W], d = y + 1 < H ? ids[(y + 1) * W + x] : a;
    if (a !== r) out.add(pairKey(a, r));
    if (a !== d) out.add(pairKey(a, d));
  }
  return out;
}
const rowsOf = (text) => text.split(/\r?\n/).filter((l) => /^\d+;/.test(l));

try {
  console.log("\n-- the fixture --");
  const before = touchingPairs(S.modIds);
  rec("(P and Q share an edge, X borders O2, A borders B; Y, L1 and L2 are land kept by the mod, the rest is Delete map's sea)",
    before.has(pairKey(P, Q)) && before.has(pairKey(X, O2)) && before.has(pairKey(A, B)) && new Set([P, Q, X, R, A, B, O, O2, Y, L1, L2]).size === 11,
    { P, Q, X, R, A, B, O, O2, Y, L1, L2 });

  const model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [], cacheStableLayers: true });
  const p2r = model.provinceToRegion || {};
  const lines = fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split("\n");
  const cut = md.planGeneratedProvinceSplit({ modRoot: mod, gameRoot: game, dependencyRoots: [], picked, lines, model, p2r, seed: SEED });
  const w = cut.write ? md.writeGeneratedProvinceSplit({ modRoot: mod, gameRoot: game, dependencyRoots: [], write: cut.write, picked }) : { ok: false, error: cut.report.skipped };
  rec("(the cut was planned and written whole)", w.ok === true && cut.report.newIds > 0, { error: w.error, report: cut.report });
  const fam = new Map();
  for (const f of md.readProvinceSplitRecord(mod).families) fam.set(f.parent, [f.parent, ...f.pieces]);
  const familyOf = (p) => fam.get(p) || [p];
  // the bitmap as written, decoded with the definition as written
  const def = SW.readDef(path.join(mod, "map", "definition.csv"));
  const ids = SW.decode(path.join(mod, "map", "provinces.bmp"), def).ids;
  const after = touchingPairs(ids);
  rec("(P, Q, X and A were cut; the kept P-Q pair no longer touches, the kept X no longer borders O2, the kept A still borders B)",
    [P, Q, X, A].every((p) => familyOf(p).length > 1) && !after.has(pairKey(P, Q)) && !after.has(pairKey(X, O2)) && after.has(pairKey(A, B)),
    { cut: [P, Q, X, A].map((p) => familyOf(p).length), PQ: after.has(pairKey(P, Q)), XO2: after.has(pairKey(X, O2)), AB: after.has(pairKey(A, B)) });

  const adjFile = path.join(mod, "map", "adjacencies.csv");
  const text = fs.existsSync(adjFile) ? fs.readFileSync(adjFile, "utf8") : "";
  const rows = rowsOf(text), belowRows = rowsOf(ADJ);
  const added = rows.filter((r) => !belowRows.includes(r) && !r.endsWith(";Coast Strait"));

  console.log("\n-- 1. the land-land wall --");
  const want = [];
  for (const a of familyOf(P)) for (const b of familyOf(Q)) if (after.has(pairKey(a, b)) && pairKey(a, b) !== pairKey(P, Q)) want.push(pairKey(a, b));
  const got = added.map((r) => { const c = r.split(";"); return pairKey(+c[0], +c[1]); });
  rec(`⭐⭐ W0 gains a wall for exactly the ${want.length} pixel-touching pairs of P's and Q's families but P-Q itself`,
    want.length > 0 && got.length === want.length && want.every((k) => got.includes(k)) && w.adjacencies.added === want.length, { want: want.sort(), got: got.sort(), report: w.adjacencies });
  rec("…each an impassable row with W0's comment and no Through", added.every((r) => { const c = r.split(";"); return c[2] === "impassable" && c[3] === "-1" && c[9] === "Great Wall"; }), added.slice(0, 4));

  console.log("\n-- 2. the rows Auto-fix retypes --");
  rec("⭐⭐ S1 and W1 are byte-identical after the cut (left for Auto-fix, as the report says)", rows.includes(ROWS.S1) && rows.includes(ROWS.W1) && w.adjacencies.leftToAutoFix === 2, { rows, report: w.adjacencies });

  console.log("\n-- 3. the strait whose cut end left its sea --");
  const t1 = rows.find((r) => r.endsWith(";Coast Strait")) || "";
  const c1 = t1.split(";"), end = +c1[0];
  const cents = new Map();
  for (let i = 0; i < ids.length; i++) { const p = ids[i], c = cents.get(p) || cents.set(p, { x: 0, y: 0, n: 0 }).get(p); c.x += i % W; c.y += Math.floor(i / W); c.n++; }
  const near = familyOf(X).filter((m) => after.has(pairKey(m, O2)));
  const dist = (m) => { const c = cents.get(m); return (c.x / c.n - 258) ** 2 + (c.y / c.n - 160) ** 2; };
  const nearest = near.slice().sort((a, b) => dist(a) - dist(b) || a - b)[0];
  rec("⭐⭐ T1's X end is the piece of X that borders O2 nearest the row's own start point", near.length > 0 && end === nearest && end !== X && w.adjacencies.rehomed === 1, { end, nearest, near, rehomed: w.adjacencies.rehomed });
  rec("…and the rest of T1 stands as it was", c1.slice(1).join(";") === ROWS.T1.split(";").slice(1).join(";"), t1);
  // ⛔ a row is a link too (provinceNeighbourGraph): the graph the click walks on after the cut (`neighboursAfter`) is the one read
  // AFTER the re-home — the strait joins its new end to Y, and the kept X, which no longer touches Y, no longer through it
  const g = w.graph;
  rec("(control: the kept X does not touch Y on the bitmap as written, and the piece now at T1's end is not X)", !after.has(pairKey(X, Y)) && end !== X, { XY: after.has(pairKey(X, Y)), end });
  rec("⭐⭐ the graph the click goes on with links T1's new end to Y, and no longer the kept X: it was read after the re-home",
    !!g && (g.get(end) || new Set()).has(Y) && !(g.get(X) || new Set()).has(Y), { endToY: !!g && (g.get(end) || new Set()).has(Y), XtoY: !!g && (g.get(X) || new Set()).has(Y) });

  console.log("\n-- 4. the province a rule names --");
  const area = SW.areas(ids);
  rec("⭐ R is not cut: no family, every pixel its own", !fam.has(R) && area.get(R) === 48 * 48, { family: fam.get(R), px: area.get(R) });
  rec("…and the report says one raised province stays whole for a rule, which the target would have cut", cut.report.ruled === 1 && cut.report.ruledOverTarget === 1, { ruled: cut.report.ruled, over: cut.report.ruledOverTarget });

  console.log("\n-- 5. Auto-fix --");
  // what Generate land's one rewrite does next: the raised rows and their pieces to land
  const raised = new Set([...picked.map(Number), ...cut.write.newIds]);
  const defFile = path.join(mod, "map", "definition.csv");
  fs.writeFileSync(defFile, fs.readFileSync(defFile, "utf8").split("\n").map((l) => { const c = l.split(";"); return raised.has(+c[0]) && /^\d+$/.test(c[0]) ? [c[0], c[1], c[2], c[3], "land", "false", "plains", "1"].join(";") : l; }).join("\n"));
  const fix = md.autoFixMap({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
  const at2 = ((fix && fix.fixes) || {}).adjacencyTypes || {};
  const rows2 = rowsOf(fs.readFileSync(adjFile, "utf8"));
  const s1 = ROWS.S1.split(";"), w1 = ROWS.W1.split(";");
  const retS1 = [s1[0], s1[1], "", "-1", ...s1.slice(4)].join(";"), retW1 = [w1[0], w1[1], "", ...w1.slice(3)].join(";");
  rec("⭐⭐ Auto-fix still retypes S1 to a land crossing and opens W1 — and nothing else", rows2.includes(retS1) && rows2.includes(retW1) && at2.retyped === 2 && at2.landCrossings === 1 && at2.wallsOpened === 1,
    { adjacencyTypes: at2, S1: rows2.find((r) => r.endsWith("Inland Strait")), W1: rows2.find((r) => r.endsWith("Sea Wall")) });
  rec("⭐ every carried wall survives Auto-fix, and no row of the layer below is lost", added.every((r) => rows2.includes(r)) && rows2.length === belowRows.length + added.length
    && [ROWS.W0, t1].every((r) => rows2.includes(r)), { rows: rows2.length, below: belowRows.length, added: added.length });
} catch (e) {
  rec("the test ran to the end", false, String((e && e.stack) || e).slice(0, 800));
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}   // this test's own temp folder — never a mod directory (⛔ CLAUDE.md #1)
}
console.log(`\n=== a split carries the adjacencies: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
