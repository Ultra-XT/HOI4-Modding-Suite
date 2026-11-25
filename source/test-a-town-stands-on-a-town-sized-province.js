// ⛔ #a-town-on-a-town-sized-province — A STATE'S TOWN GOES ON A TOWN-SIZED PROVINCE, NOT ON ITS LARGEST.
//
// TEST 31 (played 09-30) put 827 of its 832 generated hubs on their state's LARGEST province — 11% of vanilla's are — and 524 of
// its 1,081 victory points in provinces over 1,000 px (vanilla: 54 of 1,500). Vanilla's victory point and hub provinces are small
// and mostly city: a median 129 / 133 px, the city a median 85% of its province. In a province thousands of pixels across the
// star, the city and the station drift apart, and every rail into it has room to cut past the station.
//
// So ONE helper, townProvinceOf — the smallest of the state's land provinces that can hold the layer below's city core
// (townCoreArea) and has a town point of its own (a 3x3 of itself); else, as before, the largest — and four callers:
//   1. generateLand's victory point (and so its first city, and its hub, which follows the victory point);
//   2. stateBuildingAnchor's home, where a state's own buildings stand;
//   3. generateSupplyNetwork's hub for a state with no victory point;
//   4. fixStateIdFloor's victory point for a state it splits off.
// Pinned on a fixture whose layer below has one urban province carrying 95 px of city ground (vanilla's core size), under a
// generated state of four provinces — 60, 100 (a strip 2 px wide: big enough, but no 3x3 anywhere), 150 and 900 px — and a second
// state all of whose provinces are under 95 px. Every expected answer is derived from the fixture's pixels, never typed in.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-town-province-"));
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
const read8 = (file) => { const b = fs.readFileSync(file), W = b.readInt32LE(18), H = b.readInt32LE(22), off = b.readUInt32LE(10), rs = Math.floor((8 * W + 31) / 32) * 4; return (x, y) => b[off + (H - 1 - y) * rs + x]; };
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const TERRAIN_TXT = ["categories = {", "  plains = { color = { 200 200 100 } }", "  urban = { color = { 120 110 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
  "terrain = {", "  plains = { type = plains color = { 0 } }", "  terrain_city = { type = urban color = { 13 } spawn_city = yes }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n");
const SPAWN = 13, PLAINS = 0, OCEAN = 15;

/** A world of rectangles: { id: [x0, y0, x1, y1] } (x1, y1 exclusive), everything else province 1, the sea. */
function world(W, H, rects) {
  const provAt = (x, y) => { for (const [id, [x0, y0, x1, y1]] of Object.entries(rects)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return 1; };
  const area = new Map(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) area.set(provAt(x, y), (area.get(provAt(x, y)) || 0) + 1);
  const hasOwn3x3 = (pid) => { for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { let full = true; for (let dy = -1; dy <= 1 && full; dy++) for (let dx = -1; dx <= 1; dx++) if (provAt(x + dx, y + dy) !== pid) { full = false; break; } if (full) return true; } return false; };
  return { W, H, provAt, area, hasOwn3x3, ids: Object.keys(rects).map(Number) };
}
/** the fixture's own answer: the smallest province that holds the core and has a 3x3 of its own (lowest id on a tie), else the largest */
const townOf = (w, provs, core) => provs.filter((p) => w.area.get(p) >= core && w.hasOwn3x3(p)).sort((a, b) => w.area.get(a) - w.area.get(b) || a - b)[0]
  || provs.slice().sort((a, b) => w.area.get(b) - w.area.get(a) || a - b)[0];
const largestOf = (w, provs) => provs.slice().sort((a, b) => w.area.get(b) - w.area.get(a) || a - b)[0];
const stateFiles = (m) => fs.readdirSync(path.join(m, "history", "states")).map((f) => { const t = fs.readFileSync(path.join(m, "history", "states", f), "utf8"); return { f, t, id: +((/\bid\s*=\s*(\d+)/.exec(t) || [])[1] || 0), provinces: (((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1]) || "").trim().split(/\s+/).map(Number).filter(Boolean), vp: +((/victory_points\s*=\s*\{\s*(\d+)/.exec(t) || [])[1] || 0) }; });

// ── 1–3: a generated world ─────────────────────────────────────────────────────────────────────────────────────────────
// P = { 2: 900, 3: 150, 4: 60, 5: 100 as a 50x2 strip } in region 1, Q = { 6: 80, 7: 50, 8: 30 } in region 2.
const A = world(100, 48, { 2: [0, 0, 30, 30], 3: [30, 0, 40, 15], 4: [30, 15, 36, 25], 5: [0, 30, 50, 32], 6: [60, 0, 68, 10], 7: [68, 0, 73, 10], 8: [60, 10, 66, 15] });
const P = [2, 3, 4, 5], Q = [6, 7, 8];
const inBelowCore = (x, y) => x >= 5 && x < 24 && y >= 5 && y < 10;   // 19 x 5 = 95 px of city ground in province 2 below
const game = path.join(ROOT, "game");
write(game, "hoi4.exe", "");
write(game, "map/provinces.bmp", bmp24(A.W, A.H, (x, y) => colour(A.provAt(x, y))));
write(game, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`].concat(A.ids.map((id) => `${id};${colour(id).join(";")};land;false;${id === 2 ? "urban" : "plains"};1`)).join("\n") + "\n");
write(game, "map/terrain.bmp", bmp8(A.W, A.H, (x, y) => (A.provAt(x, y) === 1 ? OCEAN : inBelowCore(x, y) ? SPAWN : PLAINS)));
write(game, "map/heightmap.bmp", bmp8(A.W, A.H, (x, y) => (A.provAt(x, y) === 1 ? 89 : 106)));
write(game, "map/buildings.txt", "10;air_base;10.00;10.40;40.00;0.00;0\n");
write(game, "common/terrain/00_terrain.txt", TERRAIN_TXT);
const gameState = (id, provs, cat, tag) => `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower=100000\n\tstate_category=${cat}\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=${tag}\n\t\tvictory_points = { ${provs[0]} 5 }\n\t}\n}\n`;
write(game, "history/states/10-P.txt", gameState(10, P, "metropolis", "AAA"));
write(game, "history/states/11-Q.txt", gameState(11, Q, "rural", "BBB"));

const mod = path.join(ROOT, "mod");
write(mod, "descriptor.mod", 'name="town province"\nreplace_path="history/states"\n');
write(mod, "map/provinces.bmp", bmp24(A.W, A.H, (x, y) => colour(A.provAt(x, y))));
write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`].concat(A.ids.map((id) => `${id};${colour(id).join(";")};sea;false;ocean;0`)).join("\n") + "\n");
write(mod, "map/terrain.bmp", bmp8(A.W, A.H, () => OCEAN));
write(mod, "map/heightmap.bmp", bmp8(A.W, A.H, () => 89));
write(mod, "map/strategicregions/r1.txt", `strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ ${P.join(" ")} }\n\tweather={}\n}\n`);
write(mod, "map/strategicregions/r2.txt", `strategic_region={\n\tid=2\n\tname="REGION_2"\n\tprovinces={ ${Q.join(" ")} }\n\tweather={}\n}\n`);
write(mod, "map/supply_nodes.txt", ""); write(mod, "map/railways.txt", "");
fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });

console.log("\n-- the fixture --");
let belowCore = 0; for (let y = 0; y < A.H; y++) for (let x = 0; x < A.W; x++) if (inBelowCore(x, y)) belowCore++;
const CORE = typeof md.townCoreArea === "function" ? md.townCoreArea({ modRoot: mod, gameRoot: game, dependencyRoots: [] }) : belowCore;
ok(CORE === belowCore, `the town must hold the layer below's city core: its one urban province carries ${belowCore} px`, CORE);
const P_TOWN = townOf(A, P, CORE), P_BIG = largestOf(A, P), Q_TOWN = townOf(A, Q, CORE);
const thin = P.filter((p) => A.area.get(p) >= CORE && !A.hasOwn3x3(p));
ok(P_TOWN !== P_BIG && A.area.get(P_TOWN) < A.area.get(P_BIG), "P's town province and its largest are different provinces", { P_TOWN, P_BIG, areas: P.map((p) => [p, A.area.get(p)]) });
ok(P.some((p) => A.area.get(p) < CORE && p !== P_TOWN), "…P has a province too small to hold the core, which is not its town", P.map((p) => [p, A.area.get(p)]));
ok(thin.length === 1 && A.area.get(thin[0]) < A.area.get(P_TOWN), "…and one big enough but with no 3x3 of its own, smaller than its town — so the 3x3 is what passes it over", thin);
ok(Q.every((p) => A.area.get(p) < CORE) && Q_TOWN === largestOf(A, Q), "CONTROL: every province of Q is under the core size, so Q keeps its largest", Q.map((p) => [p, A.area.get(p)]));

console.log("\n-- ⭐ 1. the victory point, the first city and the hub go on the town province --");
const r = md.generateLand({ modRoot: mod, gameRoot: game, dependencyRoots: [], count: A.ids.length, provincesPerState: 8, seed: 1, splitLargeProvinces: false });   // #a-raised-province-is-cut-to-land-size: not this test's subject — its fixture's cells are its provinces, and the cut would add more
ok(r && r.changed && r.createdStates === 2, "Generate land raised P and Q as two states", r && (r.error || r.createdStates));
const states = stateFiles(mod);
const sP = states.find((s) => s.provinces.includes(P[0])), sQ = states.find((s) => s.provinces.includes(Q[0]));
ok(sP && sP.provinces.slice().sort().join() === P.slice().sort().join() && sQ && sQ.provinces.slice().sort().join() === Q.slice().sort().join(), "(the states are P and Q)", states.map((s) => s.provinces));
ok(sP && sP.vp === P_TOWN, `⭐⭐ P's victory point is its town province, ${P_TOWN} (${A.area.get(P_TOWN)} px), not its largest, ${P_BIG}`, sP && sP.vp);
ok(sQ && sQ.vp === Q_TOWN, `⭐ CONTROL: Q, with nothing that holds the core, keeps its largest, ${Q_TOWN}`, sQ && sQ.vp);
const hubs = fs.readFileSync(path.join(mod, "map", "supply_nodes.txt"), "utf8").split(/\r?\n/).map((l) => parseInt(l.trim().split(/\s+/)[1], 10)).filter(Number.isFinite);
ok(hubs.filter((h) => P.includes(h)).join() === String(P_TOWN), "⭐ P's supply hub stands on its town province", hubs);
const at = read8(path.join(mod, "map", "terrain.bmp"));
const cityIn = new Map(); for (let y = 0; y < A.H; y++) for (let x = 0; x < A.W; x++) if (at(x, y) === SPAWN) cityIn.set(A.provAt(x, y), (cityIn.get(A.provAt(x, y)) || 0) + 1);
// ⚠️ MOVED WITH #every-generated-capital-has-a-city: this said the map holds ONE city. Q is a capital its category's count gave no
// town, so it now gets one, on its star (cities.forCapitals); P's city is still one core, all of it in P's town province.
const capTowns = (r && r.cities && r.cities.forCapitals) || [];
ok(cityIn.get(P_TOWN) === CORE && P.every((p) => p === P_TOWN || !cityIn.has(p)), "⭐ …and so does its city: one core of the layer below's size, all of it in the town province", [...cityIn]);
ok([...cityIn.keys()].every((p) => P.includes(p) || (Q.includes(p) && capTowns.includes(p) && p === Q_TOWN)), "…and the only other city ground is the town Q's capital is given, on its star", { cityIn: [...cityIn], capTowns, Q_TOWN });

console.log("\n-- ⭐ 2. the state's own buildings stand in its town province (stateBuildingAnchor's home) --");
const rows = fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.split(";")).filter((c) => c.length >= 7)
  .map((c) => ({ sid: +c[0], type: c[1], province: A.provAt(Math.floor(+c[2]), A.H - 1 - Math.floor(+c[4])) }));
const perState = md.STATE_BUILDING_SLOTS.map(([t]) => t);
const pRows = rows.filter((x) => sP && x.sid === sP.id && perState.includes(x.type)), qRows = rows.filter((x) => sQ && x.sid === sQ.id && perState.includes(x.type));
const slots = md.STATE_BUILDING_SLOTS.reduce((a, [, n]) => a + n, 0);
// ⚠️ MOVED WITH #a-states-buildings-are-spread-not-piled. This pinned all 22 rows INSIDE the town province, which was the pile
// TEST 31 showed at every star. The rows now spread out FROM it (test-a-states-buildings-are-spread-not-piled.js): the home is
// still the town province, so the anchor stands in it and the first factory of each kind stands on its ring — and the rest reach
// the state's other provinces, which the pile never did.
const homeOf = (provs) => { const a = md.stateBuildingAnchor({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinces: provs }); return a ? A.provAt(Math.floor(a.x), A.H - 1 - Math.floor(a.z)) : 0; };
const firstIn = (list, type) => (list.find((x) => x.type === type) || {}).province;
ok(pRows.length === slots && homeOf(P) === P_TOWN && firstIn(pRows, "industrial_complex") === P_TOWN && firstIn(pRows, "arms_factory") === P_TOWN,
  `⭐⭐ P's ${slots} state building rows (${perState.length} types) start from its town province: its anchor stands there, and the first factory of each kind`, { home: homeOf(P), rows: pRows.map((x) => [x.type, x.province]) });
ok(qRows.length === slots && homeOf(Q) === Q_TOWN && firstIn(qRows, "industrial_complex") === Q_TOWN && firstIn(qRows, "arms_factory") === Q_TOWN,
  "…and Q's from its largest, the province its victory point is on", { home: homeOf(Q), rows: qRows.map((x) => [x.type, x.province]) });
ok(new Set(pRows.map((x) => x.province)).size > 1 && pRows.every((x) => P.includes(x.province)) && qRows.every((x) => Q.includes(x.province)),
  "…from there they reach the state's other provinces, and none leaves the state", [...new Set(pRows.map((x) => x.province))]);

console.log("\n-- ⭐ 3. a state with no victory point gets its hub on its town province --");
{
  const f = path.join(mod, "history", "states", sP.f);
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(/^\s*victory_points\s*=.*\r?\n/m, ""));
  fs.writeFileSync(path.join(mod, "map", "supply_nodes.txt"), "");
  ok(stateFiles(mod).find((s) => s.id === sP.id).vp === 0, "(P's victory point is gone, and so is every hub)");
  const g = md.generateSupplyNetwork({ modRoot: mod, gameRoot: game, dependencyRoots: [], stateIds: [sP.id], dryRun: true });
  ok(g && g.newHubs && g.newHubs.length === 1 && g.newHubs[0].province === P_TOWN, `⭐⭐ generateSupplyNetwork puts P's hub on its town province, ${P_TOWN}, not its largest`, g && (g.newHubs || g.reason || g.error));
}

// ── 4: a state the id floor splits off ─────────────────────────────────────────────────────────────────────────────────
console.log("\n-- ⭐ 4. a state fixStateIdFloor splits off gets its victory point on its town province --");
{
  // V (150, the parent's victory point) — A (900) — B (200) — C (400) in a row; the base game names state 2, the world has 1
  const C4 = world(80, 36, { 2: [0, 0, 10, 15], 3: [10, 0, 40, 30], 4: [40, 0, 50, 20], 5: [50, 0, 70, 20] });
  const g2 = path.join(ROOT, "game-floor"), m2 = path.join(ROOT, "mod-floor");
  write(g2, "map/provinces.bmp", bmp24(C4.W, C4.H, (x, y) => colour(C4.provAt(x, y))));
  write(g2, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`].concat(C4.ids.map((id) => `${id};${colour(id).join(";")};land;false;plains;1`)).join("\n") + "\n");
  write(g2, "history/states/1-S.txt", gameState(1, [2, 3], "rural", "AAA"));
  write(g2, "history/states/2-S.txt", gameState(2, [4, 5], "rural", "AAA"));
  write(g2, "events/base.txt", "namespace = base\ncountry_event = {\n\tid = base.1\n\toption = {\n\t\tname = base.1.a\n\t\t2 = { add_core_of = ROOT }\n\t}\n}\n");
  write(m2, "descriptor.mod", 'name="floor town"\nreplace_path="history/states"\n');
  write(m2, "history/states/1-W.txt", "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 4000\n\tstate_category = rural\n\tprovinces = { 2 3 4 5 }\n\thistory = {\n\t\towner = AAA\n\t\tvictory_points = { 2 5 }\n\t}\n}\n");
  const fr = md.fixStateIdFloor({ modRoot: m2, gameRoot: g2, dependencyRoots: [] });
  const made = (fr && fr.statesMade) || [];
  const child = made[0] && stateFiles(m2).find((s) => s.id === made[0].id);
  const core2 = typeof md.townCoreArea === "function" ? md.townCoreArea({ modRoot: m2, gameRoot: g2, dependencyRoots: [] }) : 1;
  const want = child && townOf(C4, child.provinces, core2), big = child && largestOf(C4, child.provinces);
  ok(fr && fr.added === 1 && child && child.provinces.length >= 2 && !child.provinces.includes(2), "the floor split one state off, of two or more provinces, around the victory point", fr && (fr.error || fr.details));
  ok(child && want !== big, "(the fixture: the split-off state's town province and its largest differ)", child && { provinces: child.provinces.map((p) => [p, C4.area.get(p)]), want, big });
  ok(child && child.vp === want && made[0].vp && made[0].vp.province === want, "⭐⭐ its victory point is on its town province, not its largest", child && { vp: child.vp, want, big });
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
