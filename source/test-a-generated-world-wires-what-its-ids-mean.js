// ⛔ #a-generated-state-keeps-its-countrys-id / #a-start-history-acts-on-its-own-states / #a-raised-province-keeps-its-continent —
// GENERATE LAND'S RENUMBERING, WIRED: EVERY ARGUMENT generateLand HANDS THE CHOOSER, THE CARRY AND THE CONTINENT PASS, EACH IN A WORLD
// WHERE THAT ARGUMENT ALONE DECIDES THE ANSWER.
//
// test-a-generated-state-keeps-its-countrys-id.js pins the pure helpers and test-a-generated-world-keeps-what-its-ids-meant.js the pins,
// the parents, the carry gate and the nearest-land fallback. The w5b3 review backed out four more call-site arguments one at a time and
// no test bit: `weightOf` (contract-F1 — measured on the owner's flow: same-owner trigger references 23,541 -> 22,000, civil wars owning
// none of their states 11 -> 16), `importanceOf`, `parentOf` and `landed` (contract-F3); the start history's second tier (`actedOf`,
// gameplay-F2) is new. Each world below is built by the real writers in the page's own mode (inherit), every expectation derived from the
// world's own words — never from what Generate land reports:
//   1. weight    a short country's free state holds half of two of its ids, neither in its start history: it takes the one the scripts
//                name (stateIdScriptWeights says which);
//   2. acted     the same world, its history starting resistance in the other: it takes that one, over the weight;
//   3. importance a short country's two states hold none of its two leftover ids: the more populous takes the more-named, though the
//                other has more provinces;
//   4. parent    a land province below, cut by the split, on another continent than the land beside it: every piece keeps its
//                parent's continent;
//   5. landed    a state on another country's id, holding half of that state below, carries the landless country's core and not the
//                core of a country that starts with land.
// Fixture-only: binds no port. Run: node test-a-generated-world-wires-what-its-ids-mean.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ids-wired-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 700) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}

/**
 * A world below and a Delete-map'd mod over it, and Generate land run on it. `grid` rows of cells (8 x 8 px; a char of `stateOf` is land
 * of that state below, anything else sea); `regions` the mod's strategic regions ("." stays sea, or land below that cannot rise); a char
 * in `merge` is ONE province over all its cells; `states` { key: { id, tag, mp, cat, cores, claims, continent } }; `countries` { TAG: its
 * history text }; `extra` { rel: text } more files below. → what was written: states, definition rows, each piece's parent.
 */
function world(name, { grid, regions, stateOf, merge = "", states, countries, extra = {}, continents = ["europe"] }) {
  const GAME = path.join(ROOT, name, "game"), MOD = path.join(ROOT, name, "mod");
  const COLS = grid[0].length, ROWS = grid.length, CELL = 8, W = COLS * CELL, H = ROWS * CELL;
  const provAt = new Map(), merged = new Map();
  let N = 0;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const ch = grid[y][x];
    if (merge.includes(ch)) { if (!merged.has(ch)) merged.set(ch, ++N); provAt.set(`${x},${y}`, merged.get(ch)); }
    else provAt.set(`${x},${y}`, ++N);
  }
  const cellOf = (px, py) => provAt.get(`${Math.floor(px / CELL)},${Math.floor(py / CELL)}`);
  const colour = (id) => [id & 255, 40 + (id >> 8), 99];
  const cellsOf = new Map();
  for (const [k, id] of provAt) { const [x, y] = k.split(",").map(Number); if (!cellsOf.has(id)) cellsOf.set(id, []); cellsOf.get(id).push([x, y]); }
  const charOf = (id) => { const [x, y] = cellsOf.get(id)[0]; return grid[y][x]; };
  const regionOf = (id) => { const [x, y] = cellsOf.get(id)[0]; return regions[y][x]; };
  const provsOf = (key) => [...cellsOf.keys()].filter((id) => stateOf[charOf(id)] === key).sort((a, b) => a - b);
  const keyOfProv = (id) => stateOf[charOf(id)] || null;
  const continentOf = (id) => { const k = keyOfProv(id); return k ? (states[k].continent || 1) : 0; };
  write(GAME, "hoi4.exe", "");
  write(GAME, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(cellOf(x, y))));
  write(GAME, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat([...cellsOf.keys()].map((p) => `${p};${colour(p).join(";")};${keyOfProv(p) ? `land;false;plains;${continentOf(p)}` : "sea;false;ocean;0"}`)).join("\n") + "\n");
  write(GAME, "map/continent.txt", "continents = {\n" + continents.map((c) => "\t" + c + "\n").join("") + "}\n");
  write(GAME, "common/state_category/00.txt", "state_categories = {\n\tcity = { local_building_slots = 6 }\n\trural = { local_building_slots = 2 }\n}\n");
  for (const [k, s] of Object.entries(states)) {
    const hist = `\t\towner = ${s.tag}\n${(s.cores || [s.tag]).map((c) => `\t\tadd_core_of = ${c}\n`).join("")}${(s.claims || []).map((c) => `\t\tadd_claim_by = ${c}\n`).join("")}`;
    write(GAME, `history/states/${s.id}-${k}.txt`, `state = {\n\tid = ${s.id}\n\tname = "STATE_${s.id}"\n\tmanpower = ${s.mp}\n\tstate_category = ${s.cat || "rural"}\n\tprovinces = { ${provsOf(k).join(" ")} }\n\thistory = {\n${hist}\t}\n}\n`);
  }
  for (const [t, body] of Object.entries(countries)) write(GAME, `history/countries/${t} - Land of ${t}.txt`, body);
  for (const [rel, body] of Object.entries(extra)) write(GAME, rel, body);
  write(MOD, "descriptor.mod", `name="${name}"\nreplace_path="history/states"\n`);
  write(MOD, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(cellOf(x, y))));
  write(MOD, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat([...cellsOf.keys()].map((p) => `${p};${colour(p).join(";")};sea;false;ocean;0`)).join("\n") + "\n");
  const rs = [...new Set(regions.join("").replace(/\./g, ""))];
  rs.forEach((r, i) => write(MOD, `map/strategicregions/r${i + 1}.txt`, `strategic_region={\n\tid=${i + 1}\n\tname="REGION_${i + 1}"\n\tprovinces={ ${[...cellsOf.keys()].filter((p) => regionOf(p) === r).join(" ")} }\n\tweather={}\n}\n`));
  write(MOD, "map/supply_nodes.txt", ""); write(MOD, "map/railways.txt", "");
  fs.mkdirSync(path.join(MOD, "history", "states"), { recursive: true });
  const RAISE = [...cellsOf.keys()].filter((p) => regionOf(p) !== ".").length;
  md.clearMapLayerCache();
  let r;
  try { r = md.generateLand({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [], count: RAISE, provincesPerState: 64, seed: 1, ownerMode: "inherit", roughenCoast: false }); }
  catch (e) { r = { changed: false, error: "threw: " + ((e && e.message) || e) }; }
  const d = path.join(MOD, "history", "states");
  const st = (fs.existsSync(d) ? fs.readdirSync(d) : []).map((f) => {
    const t = fs.readFileSync(path.join(d, f), "utf8"), hist = (/history\s*=\s*\{([\s\S]*)\}\s*\}\s*$/.exec(t) || [])[1] || "";
    return { id: +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1], owner: (/\bowner\s*=\s*(\w+)/.exec(t) || [])[1] || "", manpower: +((/\bmanpower\s*=\s*(\d+)/.exec(t) || [])[1] || 0),
      provinces: ((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "").trim().split(/\s+/).filter(Boolean).map(Number),
      cores: [...hist.matchAll(/\badd_core_of\s*=\s*(\w+)/g)].map((m) => m[1]), claims: [...hist.matchAll(/\badd_claim_by\s*=\s*(\w+)/g)].map((m) => m[1]) };
  }).sort((a, b) => a.id - b.id);
  const defPath = path.join(MOD, "map", "definition.csv");
  const def = new Map((fs.existsSync(defPath) ? fs.readFileSync(defPath, "utf8") : "").split(/\r?\n/).map((l) => l.split(";")).filter((c) => c.length >= 8 && /^\d+$/.test(c[0])).map((c) => [+c[0], c]));
  // each piece the split cut → the province it was cut from: the province of the cells most of its pixels stand in, off the written bitmap
  // (the cut may move a few pixels across a parent's border)
  const parent = new Map();
  try {
    const byRgb = new Map([...def.values()].map((c) => [(+c[1] << 16) | (+c[2] << 8) | +c[3], +c[0]]));
    const { width, rgb } = md.readBmp24(fs.readFileSync(path.join(MOD, "map", "provinces.bmp")));
    const tally = new Map();
    for (let i = 0, j = 0; j < rgb.length; i++, j += 3) {
      const id = byRgb.get((rgb[j] << 16) | (rgb[j + 1] << 8) | rgb[j + 2]);
      if (!(id > N)) continue;
      const q = cellOf(i % width, Math.floor(i / width));
      if (!tally.has(id)) tally.set(id, new Map());
      tally.get(id).set(q, (tally.get(id).get(q) || 0) + 1);
    }
    for (const [id, m] of tally) parent.set(id, [...m].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]);
  } catch (_) { /* no split: no pieces */ }
  const stateHolding = (p) => st.find((s) => s.provinces.includes(p)) || { id: -1, provinces: [], cores: [], claims: [] };
  return { r, st, def, parent, provsOf, stateHolding, MOD, GAME, N, continentOf, continents };
}

const KK = {   // worlds 1 and 2: ". K x y J j ." over ". . X Y . . ." — x/X state X's two provinces, y/Y state Y's; X and Y cannot rise
  grid: [".KxyJj.", "..XY..."], regions: [".12234.", "......."],
  stateOf: { K: "K1", x: "X", X: "X", y: "Y", Y: "Y", J: "J1", j: "J2" },
  states: { K1: { id: 1, tag: "KKK", mp: 50000, cat: "city" }, X: { id: 2, tag: "KKK", mp: 1000 }, Y: { id: 3, tag: "KKK", mp: 1000 },
    J1: { id: 4, tag: "JJJ", mp: 50000, cat: "city" }, J2: { id: 5, tag: "JJJ", mp: 1000 } },
  // the scripts name Y three times, X never: a scripted trigger, in no country's start history
  extra: { "common/scripted_triggers/kk.txt": "kk_y = {\n\towns_state = 3\n\tcontrols_state = 3\n\thas_full_control_of_state = 3\n}\n" },
};

console.log("\n-- 1. the weight: a short country's free state takes the id the scripts name --");
{
  const w = world("weight", Object.assign({}, KK, { countries: { KKK: "capital = 1\n", JJJ: "capital = 4\n" } }));
  const ws = md.stateIdScriptWeights({ modRoot: w.MOD, gameRoot: w.GAME, dependencyRoots: [], ceiling: 9 });
  const nm = md.stateIdScriptNamings({ modRoot: w.MOD, gameRoot: w.GAME, dependencyRoots: [], ceiling: 9 });
  const X = KK.states.X.id, Y = KK.states.Y.id, xy = w.stateHolding(w.provsOf("X")[0]);
  ok(w.r && w.r.changed && xy.owner === "KKK" && xy.provinces.includes(w.provsOf("Y")[0]) && (ws.get(Y) || 0) > (ws.get(X) || 0)
    && ![X, Y].some((v) => nm.startHistory.has(v) || nm.startActs.has(v)),
    "(the fixture: KKK's free state holds half of X and half of Y; the scripts name Y more than X; no start history names either)", { error: w.r && w.r.error, st: w.st, ws: [...ws] });
  ok(xy.id === Y, `⭐⭐⭐ the state on X's and Y's land takes Y's id (${Y}), the one the scripts name — the weight, wired`, { xy, renumbered: (w.r.stateIds || {}).renumbered });
}

console.log("\n-- 2. the start history's second tier: what the country's own history acts on, over the weight --");
{
  const KKK = "capital = 1\n2 = {\n\tstart_resistance = yes\n}\n";
  const w = world("acted", Object.assign({}, KK, { countries: { KKK, JJJ: "capital = 4\n" } }));
  const nm = md.stateIdScriptNamings({ modRoot: w.MOD, gameRoot: w.GAME, dependencyRoots: [], ceiling: 9 });
  const X = KK.states.X.id, Y = KK.states.Y.id, xy = w.stateHolding(w.provsOf("X")[0]);
  const acts = +(/^(\d+)\s*=\s*\{\s*start_resistance/m.exec(KKK) || [])[1];
  ok(w.r && w.r.changed && xy.owner === "KKK" && acts === X && (nm.startActs.get(X) || new Set()).has("KKK") && !(nm.startHistory.get(X) || new Set()).has("KKK")
    && (nm.weights.get(Y) || 0) > (nm.weights.get(X) || 0),
    "(the fixture: KKK's history starts resistance in X, which it tests nowhere; the scripts still name Y more)", { error: w.r && w.r.error, nm: { w: [...nm.weights], acts: [...nm.startActs].map(([v, s]) => [v, [...s]]) } });
  ok(xy.id === X, `⭐⭐⭐ the state on X's and Y's land takes X's id (${X}), the one KKK's own history acts on, over the weight — the second tier, wired`, { xy, renumbered: (w.r.stateIds || {}).renumbered });
}

console.log("\n-- 3. the importance: the more populous of two idle states takes the more-named id --");
{
  // ". a b c d ." over ". e f . . .": a is P1 (PPP's capital, its people), b P4 (many people), c and d P5 (few) — P4's and P5's ids
  // lie past this world's three — and e, f are P2 and P3, which cannot rise. The scripts name P3 twice, P2 never.
  const w = world("importance", {
    grid: [".abcd.", ".ef..."], regions: [".1233.", "......"],
    stateOf: { a: "P1", b: "P4", c: "P5", d: "P5", e: "P2", f: "P3" },
    states: { P1: { id: 1, tag: "PPP", mp: 100000, cat: "city" }, P2: { id: 2, tag: "PPP", mp: 1000 }, P3: { id: 3, tag: "PPP", mp: 1000 },
      P4: { id: 7, tag: "PPP", mp: 50000 }, P5: { id: 8, tag: "PPP", mp: 1000 } },
    countries: { PPP: "capital = 1\n" },
    extra: { "common/scripted_triggers/pp.txt": "pp_three = {\n\towns_state = 3\n\tcontrols_state = 3\n}\n" },
  });
  const ws = md.stateIdScriptWeights({ modRoot: w.MOD, gameRoot: w.GAME, dependencyRoots: [], ceiling: 9 });
  const many = w.stateHolding(w.provsOf("P4")[0]), few = w.stateHolding(w.provsOf("P5")[0]);
  const ids = [2, 3].sort((a, b) => (ws.get(b) || 0) - (ws.get(a) || 0)), named = ids[0], other = ids[1];
  ok(w.r && w.r.changed && w.st.length === 3 && many !== few && many.owner === "PPP" && few.owner === "PPP" && many.manpower > few.manpower
    && few.provinces.length > many.provinces.length && (ws.get(named) || 0) > (ws.get(other) || 0) && ![many, few].some((s) => s.provinces.some((p) => w.provsOf("P2").concat(w.provsOf("P3")).includes(p))),
    "(the fixture: PPP's two states besides its capital hold none of its leftover ids P2 and P3; the one on P4's land has more people, the other more provinces; the scripts name one id more)", { error: w.r && w.r.error, st: w.st, ws: [...ws] });
  ok(many.id === named && few.id === other, `⭐⭐⭐ the more populous state takes the more-named id (${named}), though the other holds more provinces — the importance, wired`, { many, few, renumbered: (w.r.stateIds || {}).renumbered });
}

console.log("\n-- 4. the parent: a cut province's every piece keeps the continent it had below --");
{
  // ". m m m m m m ." over ". L L L L L L .": L is ONE province of six cells, on asia, under six provinces of europe; both rise
  const w = world("parent", {
    grid: [".mmmmmm.", ".LLLLLL.", "........"], regions: [".111111.", ".222222.", "........"], merge: "L", continents: ["europe", "asia"],
    stateOf: { m: "M1", L: "L1" },
    states: { M1: { id: 1, tag: "MMM", mp: 6000, continent: 1 }, L1: { id: 2, tag: "LLL", mp: 4000, continent: 2 } },
    countries: { MMM: "capital = 1\n", LLL: "capital = 2\n" },
  });
  const L = w.provsOf("L1")[0], pieces = [...w.parent].filter(([, q]) => q === L).map(([p]) => p);
  const lland = w.st.filter((s) => s.provinces.some((p) => p === L || pieces.includes(p))).flatMap((s) => s.provinces);
  ok(w.r && w.r.changed && pieces.length >= 1 && w.provsOf("M1").every((p) => +(w.def.get(p) || [])[7] === w.continentOf(p)),
    `(the fixture: the split cut L into ${pieces.length + 1} provinces; the land beside it kept europe)`, { error: w.r && w.r.error, pieces, provinceSplit: w.r && w.r.provinceSplit, st: w.st });
  ok(lland.length >= 2 && lland.every((p) => +(w.def.get(p) || [])[7] === w.continentOf(L)),
    `⭐⭐⭐ every piece of L keeps L's continent below (${w.continents[w.continentOf(L) - 1]}), not its neighbours' — the parent, wired`, lland.map((p) => [p, (w.def.get(p) || [])[7]]));
}

console.log("\n-- 5. landed: a state on another country's id carries no core of a country that starts with land --");
{
  // ". X a b y Y ." over ". . . . z . .": X is X1 (XXX's capital); a, b X2 (XXX's, its id past this world's three); y and z Y2 (YYY's,
  // cored by YYY and by the landless ZZZ; z cannot rise); Y is Y1 (YYY's capital). a, b and y rise as one state, XXX's by its land, which
  // takes Y2's id — YYY has no state left to take it — holding half of it.
  const w = world("landed", {
    grid: [".XabyY.", "....z.."], regions: [".12223.", "......."],
    stateOf: { X: "X1", a: "X2", b: "X2", y: "Y2", z: "Y2", Y: "Y1" },
    states: { X1: { id: 1, tag: "XXX", mp: 10000, cat: "city" }, Y1: { id: 2, tag: "YYY", mp: 10000, cat: "city" },
      Y2: { id: 3, tag: "YYY", mp: 1000, cores: ["YYY", "ZZZ"] }, X2: { id: 9, tag: "XXX", mp: 3000 } },
    countries: { XXX: "capital = 1\n", YYY: "capital = 2\n" },
  });
  const Y2 = w.provsOf("Y2"), s = w.stateHolding(w.provsOf("Y2")[0]);
  const landed = new Set(w.st.map((x) => x.owner).filter(Boolean));
  const share = Y2.filter((p) => s.provinces.includes(p)).length / Y2.length;
  const want = md.carriedCoresAndClaims({ owner: s.owner, was: { owner: "YYY", cores: ["YYY", "ZZZ"], claims: [] }, share, landed: (x) => landed.has(x) });
  ok(w.r && w.r.changed && s.id === 3 && s.owner === "XXX" && share >= 0.5 && landed.has("YYY") && !landed.has("ZZZ"),
    "(the fixture: XXX's state on half of Y2's land takes Y2's id; YYY starts with land, ZZZ with none)", { error: w.r && w.r.error, st: w.st, share });
  ok(s.cores.slice(1).sort().join() === want.cores.slice().sort().join() && s.cores.includes("ZZZ") && !s.cores.includes("YYY") && !s.claims.length,
    "⭐⭐⭐ it carries the landless ZZZ's core and not YYY's, a country that starts with land — landed, wired", { s, want });
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
