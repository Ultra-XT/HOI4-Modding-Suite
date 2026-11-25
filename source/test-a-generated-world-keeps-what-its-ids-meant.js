// ⛔ #a-generated-state-keeps-its-countrys-id / #same-owner-cores-carry-at-any-share / #a-raised-province-keeps-its-continent —
// GENERATE LAND, END TO END: A WORLD OF THREE COUNTRIES (AND A FOURTH, AND TWO IT REMOVED) KEEPS WHAT ITS IDS MEANT BELOW.
//
// test-a-generated-state-keeps-its-countrys-id.js pins the pure helpers. This pins their WIRING inside generateLand, where the w5b2
// critic (P7) found no back-out reached: the pins handed to the chooser, the land counted over the split's parents, the carry gate,
// and the nearest-land continent fallback. One world, built by the real writers (deleteCountry, then generateLand in inherit mode,
// the page's own mode), with every expectation derived from the fixture below — never from what Generate land reports:
//   · AAA's capital line names A1, whose land rises in two regions: R1 holds 3 of its 4 provinces, R2 one — and all of A2, a city, so
//     R2 is AAA's most important state and its capital. The pin keeps A1's id on R2; R1 takes AAA's other free id, A2's, whose land
//     it holds none of — so A2's 1936 core of the landless RRR and BBB's claim stand on land that held none of A2 (said: onLandHeldNone);
//   · A3 carries no dated core or claim, none behind an `if`, and never XXX's — a tag Delete country removed;
//   · EEE, removed with its land reassigned to BBB: its state E1 is BBB's in the frame the owner passes read, keeps its id under BBB
//     and carries the landless UUU's core, never EEE's;
//   · CCC is Spain: two states here for four ids below (C3 and C5 stand on land that cannot rise), and its history names C5 in a NOT
//     list and a `<id> = {` block, so its second state takes C5's id over C2's, whose land it holds;
//   · BBB's island, raised from open ocean and cut by the split into pieces whose NEW ids are C3's provinces below (the mod's
//     definition ends where the base game's goes on): it holds none of C3 — a piece is new land — so it takes BBB's own leftover id, B3's (land below that cannot rise), and carries
//     B3's core of the landless WWW on land raised from the sea, while A2's id carries its cores on AAA's own other land: the report
//     and the page say each of the two apart (#what-a-core-held-none-of-stands-on), and A2's core of CCC as a living country's;
//   · DDD's capital line names a state this world does not reach, so its line is written at its capital's FINAL id;
//   · BBB's two states tie on star and people, and its capital line names the higher id: the guard moves one person, total kept;
//   · every raised province keeps its continent below; the two islands, out of reach of every continent, take the nearest land's;
//   · A2, AAA's city and so its capital's land, is on another continent than A1, the state AAA's line names: the report and the page
//     say AAA's capital changed continent (#a-capital-is-said-when-it-changed-continent);
//   · ⛔ #a-generated-state-keeps-its-later-owners — B2's id stays BBB's, so B2's 1939 change of hands is written as the dated block it
//     is, and its 1940 one, past the last bookmark, is not; C2's id went to AAA, so C2's 1938 one is not; E1's that hands it to the
//     removed XXX is not, and its later one is, without XXX's core; A3's core-only 1939 block hands nothing over and is not;
//   · ⛔ #a-capital-handed-over-later-is-said — A1's 1939 block hands AAA's capital id to DDD while AAA keeps its other land: the base
//     game does that only to a country it ends by then, so the report and the page name it;
//   · renumberStates:false (a test-only switch the page never sends) writes no core but the owner's, and no dated block;
//   · two runs in two mods of the same name are byte-identical.
//
// Fixture-only: binds no port. Run: node test-a-generated-world-keeps-what-its-ids-meant.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ids-meant-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}

// ── the world: a cell is 8 x 8 px and one province, but the island "I" (one province of six cells). The STATE grid is the land below
// ("." sea); the REGION grid is the mod's strategic regions ("." none: sea that stays sea, or land below that cannot rise). "K" (C3)
// and "Q" (C5) are provinces BELOW ONLY: the mod paints their cells as the sea province to their left, and its definition stops
// before their ids — so the split's new pieces are numbered as they are. ───────────────────────────────────────────────────────────
const STATE_GRID = [
  ".AAA.BBBB.CCC...",
  ".Aaa.bbbb.ccc...",
  ".aa3.EE.........",
  ".33.............",
  ".......III....D.",
  ".......III.KK...",
  ".QQ.....W....J..",
];
const REGION_GRID = [
  ".111.4444.777...",
  ".222.5555.888...",
  ".223.66.........",
  ".33.............",
  ".......999....B.",
  ".......999......",
  ".............A..",
];
const STATE_OF_CHAR = { A: "A1", a: "A2", "3": "A3", B: "B1", b: "B2", E: "E1", C: "C1", c: "C2", K: "C3", Q: "C5", D: "D1", W: "B3" };
const BELOW_ONLY = "KQW";   // cells of land below that the mod paints as the sea cell to their left
const COLS = STATE_GRID[0].length, ROWS = STATE_GRID.length, CELL = 8, W = COLS * CELL, H = ROWS * CELL;
// provinces: the mod's in row-major order of their first cell (I counted once), then the below-only K and Q cells
const provAt = new Map();   // "x,y" → { mod, below }
let N = 0;
const ISLAND = { id: 0, cells: [] };
for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
  const ch = STATE_GRID[y][x];
  if (BELOW_ONLY.includes(ch)) continue;
  if (ch === "I") { if (!ISLAND.id) ISLAND.id = ++N; ISLAND.cells.push([x, y]); provAt.set(`${x},${y}`, { mod: ISLAND.id, below: ISLAND.id }); continue; }
  const id = ++N;
  provAt.set(`${x},${y}`, { mod: id, below: id });
}
const MOD_MAX = N;
for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
  const ch = STATE_GRID[y][x];
  if (!BELOW_ONLY.includes(ch)) continue;
  provAt.set(`${x},${y}`, { mod: provAt.get(`${x - 1},${y}`).mod, below: ++N });   // the mod paints it as the sea cell to its left
}
const BELOW_MAX = N;
const colour = (id) => [id & 255, 40 + (id >> 8), 99];
const cellOfPx = (x, y) => provAt.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`);
const charAt = (grid, p) => { for (const [k, v] of provAt) if (v.below === p || v.mod === p) { const [x, y] = k.split(",").map(Number); return grid[y][x]; } return "."; };
const cellsOf = (p, side = "below") => [...provAt].filter(([, v]) => v[side] === p).map(([k]) => k.split(",").map(Number));
const belowLand = (p) => STATE_OF_CHAR[charAt(STATE_GRID, p)] != null;

// the states below: id, owner, category, manpower, and their history bodies (undated, dated, `if`) — the fixture's own words
const IDS = { B2: 1, A2: 2, E1: 3, C2: 4, A1: 5, C3: 6, B1: 7, A3: 8, C1: 9, C5: 10, D1: 11, B3: 12 };
const STATES = {
  A1: { tag: "AAA", cat: "rural", mp: 4000, cores: ["AAA"], claims: ["CCC"], dated: [{ date: "1939.6.1", lines: ["owner = DDD", "controller = DDD"] }] },   // AAA's capital line's id, handed over
  A2: { tag: "AAA", cat: "city", mp: 40000, cores: ["AAA", "RRR", "CCC"], claims: ["BBB"] },
  A3: { tag: "AAA", cat: "rural", mp: 3000, cores: ["AAA", "XXX"], claims: [],
    extra: "\t\t1939.1.1 = {\n\t\t\tadd_core_of = DDD\n\t\t\tadd_claim_by = FFF\n\t\t}\n\t\tif = {\n\t\t\tlimit = { has_dlc = \"X\" }\n\t\t\tadd_core_of = GGG\n\t\t}\n" },
  B1: { tag: "BBB", cat: "rural", mp: 4000, cores: ["BBB"], claims: [] },
  B2: { tag: "BBB", cat: "rural", mp: 4000, cores: ["BBB"], claims: [],
    dated: [{ date: "1939.3.1", lines: ["owner = DDD", "controller = DDD", "add_core_of = DDD"], nested: ["buildings = { arms_factory = 1 }", "if = { limit = { has_dlc = \"X\" } add_core_of = GGG }"] }, { date: "1940.1.1", lines: ["owner = CCC"] }] },
  E1: { tag: "EEE", cat: "rural", mp: 2000, cores: ["EEE", "UUU"], claims: ["VVV"],   // a claim: carried only as BBB's own state
    dated: [{ date: "1939.2.1", lines: ["controller = XXX"] }, { date: "1939.5.1", lines: ["controller = CCC", "add_core_of = XXX"] }] },
  C1: { tag: "CCC", cat: "rural", mp: 3000, cores: ["CCC"], claims: [] },
  C2: { tag: "CCC", cat: "rural", mp: 3000, cores: ["CCC"], claims: [], dated: [{ date: "1938.6.1", lines: ["owner = BBB", "controller = BBB"] }] },
  C3: { tag: "CCC", cat: "rural", mp: 1000, cores: ["CCC", "TTT"], claims: [] },
  C5: { tag: "CCC", cat: "rural", mp: 1000, cores: ["CCC"], claims: [] },
  D1: { tag: "DDD", cat: "rural", mp: 2000, cores: ["DDD"], claims: [] },
  B3: { tag: "BBB", cat: "rural", mp: 1000, cores: ["BBB", "WWW"], claims: [] },   // below only: BBB's island, raised from the sea, takes its id
};
const provincesOfState = (k) => [...new Set([...provAt].filter(([key]) => { const [x, y] = key.split(",").map(Number); return STATE_OF_CHAR[STATE_GRID[y][x]] === k; }).map(([, v]) => v.below))].sort((a, b) => a - b);
const CONTINENT_OF_TAG = { AAA: 1, EEE: 2, BBB: 2, CCC: 2, DDD: 3 }, CONTINENT_OF_STATE = { A2: 3 };   // A2, AAA's city, is on another continent than A1
const BOOKMARKS = ["1936.1.1.12", "1939.8.14.12"];   // the base game's two starts
const CONTINENTS = ["europe", "asia", "africa"];   // map/continent.txt below, in its order
const continentBelow = (p) => { const k = STATE_OF_CHAR[charAt(STATE_GRID, p)]; return k ? (CONTINENT_OF_STATE[k] || CONTINENT_OF_TAG[STATES[k].tag]) : 0; };
const REGIONS = [...new Set(REGION_GRID.join("").replace(/\./g, ""))];
const provincesOfRegion = (r) => [...new Set([...provAt].filter(([key]) => { const [x, y] = key.split(",").map(Number); return REGION_GRID[y][x] === r; }).map(([, v]) => v.mod))].sort((a, b) => a - b);
const COUNTRY_HISTORY = {
  AAA: "capital = 5\n",
  BBB: "capital = 7\n",
  // Spain's shape: the start's own setup names C5 in a NOT list and in a `<id> = {` block, and nothing names C2
  CCC: "capital = 9\nevery_owned_state = {\n\tlimit = {\n\t\tNOT = { state = 10 }\n\t}\n\tset_state_flag = ccc_garrison\n}\n10 = {\n\tset_state_flag = ccc_spared\n}\n",
  DDD: "capital = 99\n",
  EEE: "capital = 3\n",
  XXX: "",
};

function makeGame(tag) {
  const g = path.join(ROOT, tag);
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(cellOfPx(x, y).below)));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= BELOW_MAX; p++) rows.push(`${p};${colour(p).join(";")};${belowLand(p) ? `land;false;plains;${continentBelow(p)}` : "sea;false;ocean;0"}`);
  write(g, "map/definition.csv", rows.join("\n") + "\n");
  write(g, "map/continent.txt", "continents = {\n" + CONTINENTS.map((c) => "\t" + c + "\n").join("") + "}\n");
  write(g, "common/bookmarks/the_fixture.txt", "bookmarks = {\n" + BOOKMARKS.map((d, i) => `\tbookmark = {\n\t\tname = "B${i}"\n\t\tdate = ${d}\n\t\tdefault = ${i ? "no" : "yes"}\n\t}\n`).join("") + "}\n");
  write(g, "common/state_category/00.txt", "state_categories = {\n\tcity = { local_building_slots = 6 }\n\trural = { local_building_slots = 2 }\n}\n");
  for (const [k, s] of Object.entries(STATES)) {
    const id = IDS[k];
    const hist = `\t\towner = ${s.tag}\n${s.cores.map((c) => `\t\tadd_core_of = ${c}\n`).join("")}${s.claims.map((c) => `\t\tadd_claim_by = ${c}\n`).join("")}${s.extra || ""}`
      + (s.dated || []).map((b) => `\t\t${b.date} = {\n${b.lines.concat(b.nested || []).map((l) => `\t\t\t${l}\n`).join("")}\t\t}\n`).join("");   // `nested`: not the block's own statements
    write(g, `history/states/${id}-${k}.txt`, `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = ${s.mp}\n\tstate_category = ${s.cat}\n\tprovinces = { ${provincesOfState(k).join(" ")} }\n\thistory = {\n${hist}\t}\n}\n`);
  }
  for (const [t, body] of Object.entries(COUNTRY_HISTORY)) write(g, `history/countries/${t} - Land of ${t}.txt`, body);
  return g;
}
function makeMod(dir) {
  write(dir, "descriptor.mod", 'name="ids meant"\nreplace_path="history/states"\n');
  write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(cellOfPx(x, y).mod)));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= MOD_MAX; p++) rows.push(`${p};${colour(p).join(";")};sea;false;ocean;0`);
  write(dir, "map/definition.csv", rows.join("\n") + "\n");
  REGIONS.forEach((r, i) => write(dir, `map/strategicregions/r${i + 1}.txt`, `strategic_region={\n\tid=${i + 1}\n\tname="REGION_${i + 1}"\n\tprovinces={ ${provincesOfRegion(r).join(" ")} }\n\tweather={}\n}\n`));
  write(dir, "map/supply_nodes.txt", ""); write(dir, "map/railways.txt", "");
  fs.mkdirSync(path.join(dir, "history", "states"), { recursive: true });
  return dir;
}
const RAISE = REGIONS.reduce((n, r) => n + provincesOfRegion(r).length, 0);
const GAME = makeGame("game");
// the Delete-map'd mod with its two Delete country clicks, made ONCE (the stubs Delete country writes carry the time) and copied for
// each run, so two runs start from the same bytes
const TEMPLATE = makeMod(path.join(ROOT, "template", "mod"));
const DEL = { E: md.deleteCountry({ modRoot: TEMPLATE, gameRoot: GAME, dependencyRoots: [], tag: "EEE", reassignTo: "BBB" }), X: md.deleteCountry({ modRoot: TEMPLATE, gameRoot: GAME, dependencyRoots: [], tag: "XXX" }) };
function build(dir, extra = {}) {
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.cpSync(TEMPLATE, dir, { recursive: true });
  // ⛔ #a-removal-archive-lives-outside-the-mod (B2-28) — the two clicks' archives are in Nova's store for the TEMPLATE's path, not in the
  // mod, so the same mod after the same clicks at another path has that store copied beside it
  fs.cpSync(md.removedCountriesDir(TEMPLATE), md.removedCountriesDir(dir), { recursive: true });
  const mod = dir;
  const roots = { modRoot: mod, gameRoot: GAME, dependencyRoots: [] };
  const delE = DEL.E, delX = DEL.X;
  md.clearMapLayerCache();
  let r;
  try { r = md.generateLand(Object.assign({ ...roots, count: RAISE, provincesPerState: 64, seed: 1, ownerMode: "inherit", roughenCoast: false }, extra)); }
  catch (e) { r = { changed: false, error: "threw: " + ((e && e.message) || e) }; }
  return { mod, r, delE, delX };
}
const statesOf = (mod) => { const d = path.join(mod, "history", "states"); return (fs.existsSync(d) ? fs.readdirSync(d) : []).map((f) => {
  const t = fs.readFileSync(path.join(d, f), "utf8");
  const whole = (/history\s*=\s*\{([\s\S]*)\}\s*\}\s*$/.exec(t) || [])[1] || "";
  const DATED = /(\d+\.\d+\.\d+(?:\.\d+)?)\s*=\s*\{([^{}]*)\}/g, hist = whole.replace(DATED, "");
  return { id: +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1], owner: (/\bowner\s*=\s*(\w+)/.exec(t) || [])[1] || "", manpower: +((/\bmanpower\s*=\s*(\d+)/.exec(t) || [])[1] || 0),
    provinces: ((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "").trim().split(/\s+/).filter(Boolean).map(Number),
    cores: [...hist.matchAll(/\badd_core_of\s*=\s*(\w+)/g)].map((m) => m[1]), claims: [...hist.matchAll(/\badd_claim_by\s*=\s*(\w+)/g)].map((m) => m[1]),
    dated: [...whole.matchAll(DATED)].map((m) => ({ date: m[1], lines: m[2].trim().split(/\s*\n\s*/).filter(Boolean) })) };
}).sort((a, b) => a.id - b.id); };

const M = build(path.join(ROOT, "one", "mod"));
const st = statesOf(M.mod);
const REMOVED = new Map([["EEE", "BBB"], ["XXX", ""]]);   // what the two deleteCountry calls above say
const ownerBelowOf = (k) => { const t = STATES[k].tag; return REMOVED.has(t) ? REMOVED.get(t) : t; };   // the frame the owner passes read
const keyOfId = new Map(Object.entries(IDS).map(([k, v]) => [v, k]));
const landed = new Set(st.map((s) => s.owner).filter(Boolean));
const parentsOf = (s) => s.provinces.filter((p) => p <= MOD_MAX);   // a province past the mod's definition is a piece the split cut: new land
const shareOf = (s) => { const k = keyOfId.get(s.id); if (!k) return 0; const below = new Set(provincesOfState(k)); return parentsOf(s).filter((p) => below.has(p)).length / below.size; };
/** what the state ought to carry: carriedCoresAndClaims over the fixture's OWN words for the state below at its id — not Nova's reading */
const expectedCarry = (s) => {
  const k = keyOfId.get(s.id);
  if (!k || !s.owner) return { cores: [], claims: [] };
  return md.carriedCoresAndClaims({ owner: s.owner, was: { owner: ownerBelowOf(k), cores: STATES[k].cores, claims: STATES[k].claims }, share: shareOf(s),
    landed: (x) => landed.has(x), removed: (x) => REMOVED.has(x) });
};
const sorted = (a) => a.slice().sort().join(",");
const byLand = (k) => st.find((s) => provincesOfState(k).filter((p) => p <= MOD_MAX).every((p) => s.provinces.includes(p))) || { id: -1, provinces: [], cores: [], claims: [] };

console.log("\n-- the fixture --");
ok(M.r && M.r.changed && M.delE && M.delE.ok && M.delE.reassignedTo === "BBB" && M.delX && M.delX.ok, "(Delete country removed EEE, its land to BBB, and the landless XXX; Generate land ran)", { error: M.r && M.r.error, delE: M.delE, delX: M.delX });
const island = st.find((s) => s.provinces.includes(ISLAND.id)) || { provinces: [] };
const pieces = island.provinces.filter((p) => p > MOD_MAX);
ok(pieces.length >= 4 && provincesOfState("C3").every((p) => pieces.includes(p)) && island.owner && island.owner !== "CCC",
  `(the split cut the island into ${pieces.length} pieces, whose new ids include every province of C3 below; the island is ${island.owner}'s, not CCC's)`, { island, C3: provincesOfState("C3") });
{
  const underKQ = [...provAt].filter(([key]) => { const [x, y] = key.split(",").map(Number); return "KQ".includes(STATE_GRID[y][x]); }).map(([, v]) => v.mod);
  ok(underKQ.length === 4 && st.every((s) => !s.provinces.some((p) => underKQ.includes(p))) && st.filter((s) => s.owner === "CCC").length === 2,
    "(C3's and C5's land cannot rise: CCC has two states here for four ids below)", { underKQ, ccc: st.filter((s) => s.owner === "CCC").map((s) => s.id) });
}
// each piece the split cut → the province it was cut from: the mod's province of the cell its pixels stand in, off the written bitmap
const pieceParent = (() => {
  const rows = fs.readFileSync(path.join(M.mod, "map", "definition.csv"), "utf8").split(/\r?\n/).map((l) => l.split(";")).filter((c) => c.length >= 8 && /^\d+$/.test(c[0]));
  const byRgb = new Map(rows.map((c) => [(+c[1] << 16) | (+c[2] << 8) | +c[3], +c[0]]));
  const { width, rgb } = md.readBmp24(fs.readFileSync(path.join(M.mod, "map", "provinces.bmp")));
  const out = new Map();
  for (let i = 0, j = 0; j < rgb.length; i++, j += 3) { const id = byRgb.get((rgb[j] << 16) | (rgb[j + 1] << 8) | rgb[j + 2]); if (id > MOD_MAX && !out.has(id)) out.set(id, cellOfPx(i % width, Math.floor(i / width)).mod); }
  return out;
})();
// what a province of a state stood on below: land raised from the sea, its own country's land (in the removals' frame), or another's
const groundOf = (s, p) => { const k = STATE_OF_CHAR[charAt(STATE_GRID, pieceParent.get(p) || p)]; return !k ? "raised" : ownerBelowOf(k) === s.owner ? "own" : "other"; };
// the state holding the most of a state below's land (by parents)
const mostOf = (k) => { const below = new Set(provincesOfState(k)); return st.slice().sort((a, b) => parentsOf(b).filter((p) => below.has(p)).length - parentsOf(a).filter((p) => below.has(p)).length || a.id - b.id)[0] || { id: -1, provinces: [] }; };

console.log("\n-- ⭐ the ids --");
{
  const ids = st.map((s) => s.id);
  ok(ids.join() === Array.from({ length: st.length }, (_, i) => i + 1).join(), `⭐⭐ the ids are 1..${st.length}, each once`, ids);
  // each country keeps as many ids it held below as it has states here, up to the ids it held (in the removals' frame)
  const tags = [...landed];
  const keeps = (t) => st.filter((s) => s.owner === t && keyOfId.has(s.id) && ownerBelowOf(keyOfId.get(s.id)) === t).length;
  const could = (t) => Math.min(st.filter((s) => s.owner === t).length, Object.keys(IDS).filter((k) => ownerBelowOf(k) === t && IDS[k] <= st.length).length);
  ok(tags.every((t) => keeps(t) === could(t)), "⭐⭐⭐ every country keeps as many of its ids below as it has states here, up to the ids it held", tags.map((t) => [t, keeps(t), could(t)]));
  ok(byLand("E1").id === IDS.E1 && byLand("E1").owner === "BBB", "⭐⭐ E1, removed EEE's below, keeps its id under BBB, who took EEE's land", byLand("E1"));
  // Spain's shape: the ids CCC's start history TESTS (its limit's `state = <id>`, #a-start-history-is-what-a-country-tests), read off
  // the fixture's own text
  const named = [...COUNTRY_HISTORY.CCC.matchAll(/\bstate\s*=\s*(\d+)/g)].map((m) => +m[1]);
  const cccIds = st.filter((s) => s.owner === "CCC").map((s) => s.id);
  ok(named.length >= 1 && named.every((v) => cccIds.includes(v)) && byLand("C2").id === IDS.C5 && !cccIds.includes(IDS.C2),
    `⭐⭐⭐ CCC, short, keeps the id its own start history tests (${named}) — on C2's land, over C2's own id`, { named, cccIds, C2land: byLand("C2").id });
  // the pins: each capital line's id is its country's most important state — for AAA, the land of A2, its city
  const capOf = (t) => +((/^\s*capital\s*=\s*(\d+)/m.exec(COUNTRY_HISTORY[t]) || [])[1]);
  const at5 = st.find((s) => s.id === capOf("AAA")) || { provinces: [] };
  const sib = mostOf("A1");
  ok(provincesOfState("A2").every((p) => at5.provinces.includes(p)) && at5.owner === "AAA" && shareOf(at5) > 0 && shareOf(at5) < 0.5
    && sib !== at5 && sib.owner === "AAA" && 2 * parentsOf(sib).filter((p) => provincesOfState("A1").includes(p)).length >= provincesOfState("A1").length,
    `⭐⭐⭐ the PIN: AAA's capital line (${capOf("AAA")}) stays on its most important state — A2's city land, holding under half of A1 — not on the sibling (${sib.id}) holding the rest of A1`, { at5: at5.provinces, sibling: sib });
  ok(["BBB", "CCC"].every((t) => (st.find((s) => s.id === capOf(t)) || {}).owner === t), "…and BBB's and CCC's lines name a state of their own", ["BBB", "CCC"].map((t) => [t, capOf(t), (st.find((s) => s.id === capOf(t)) || {}).owner]));
  const dddFile = path.join(M.mod, "history", "countries", "DDD - Land of DDD.txt");
  const dddLine = +((/^\s*capital\s*=\s*(\d+)/m.exec(fs.existsSync(dddFile) ? fs.readFileSync(dddFile, "utf8") : "") || [])[1] || 0);
  ok(capOf("DDD") > st.length && dddLine === byLand("D1").id && byLand("D1").owner === "DDD",
    `⭐⭐ DDD's line names ${capOf("DDD")}, past this world's last id: it is written at its capital's FINAL id, ${byLand("D1").id}`, { dddLine, D1: byLand("D1") });
  // every country's people are its own below, in total: the renumbering moves no one between countries (EEE's go with its land, to BBB)
  const people = (t) => st.filter((s) => s.owner === t).reduce((a, s) => a + s.manpower, 0);
  const peopleBelow = (t) => Object.keys(STATES).filter((k) => ownerBelowOf(k) === t).reduce((a, k) => a + STATES[k].mp, 0);
  ok(tags.every((t) => people(t) === peopleBelow(t)), "⭐ every country holds its own people below in total", tags.map((t) => [t, people(t), peopleBelow(t)]));
}

console.log("\n-- ⭐ the cores and claims carried --");
{
  const wrong = st.filter((s) => sorted(s.cores.filter((c) => c !== s.owner)) !== sorted(expectedCarry(s).cores) || sorted(s.claims) !== sorted(expectedCarry(s).claims) || s.cores[0] !== s.owner);
  ok(st.length > 0 && !wrong.length, "⭐⭐⭐ every state writes its owner's core, then exactly the cores and claims carriedCoresAndClaims gives the fixture's own state below at its id",
    wrong.map((s) => ({ id: s.id, owner: s.owner, share: shareOf(s), cores: s.cores, claims: s.claims, want: expectedCarry(s) })));
  const all = st.flatMap((s) => s.cores.concat(s.claims));
  ok(!all.includes("FFF") && !all.includes("GGG") && !(st.find((x) => x.id === IDS.A3) || { cores: ["DDD"] }).cores.includes("DDD"), "⭐⭐ no core or claim of a dated block (DDD, FFF) or behind an `if` (GGG) is carried", byLand("A3"));
  ok(!all.includes("EEE") && !all.includes("XXX") && byLand("E1").cores.includes("UUU"), "⭐⭐ a tag Delete country removed is never written (EEE, XXX) — E1's other core is", byLand("E1"));
  const a2 = st.find((s) => s.id === IDS.A2) || { cores: [], claims: [] };
  ok(shareOf(a2) === 0 && a2.owner === "AAA" && a2.cores.includes("RRR") && a2.claims.includes("BBB"),
    "⭐⭐⭐ #same-owner-cores-carry-at-any-share: A2's id, on AAA's land that held none of A2, carries A2's cores and claims", a2);
  const cross = st.filter((s) => keyOfId.has(s.id) && ownerBelowOf(keyOfId.get(s.id)) !== s.owner);
  ok(cross.length >= 2 && cross.every((s) => shareOf(s) < 0.5 && s.cores.length === 1 && !s.claims.length) && cross.some((s) => s.id === IDS.C3),
    "⭐⭐⭐ …and a state on another country's id, holding under half of its land (C3's among them, whatever its pieces' ids say), carries nothing", cross.map((s) => [s.id, s.owner, shareOf(s), s.cores]));
  const none = st.filter((s) => shareOf(s) === 0 && s.cores.length > 1), quarter = st.filter((s) => shareOf(s) < 0.25 && s.cores.length > 1);
  const c = (M.r.stateIds || {}).carried || {};
  // #what-a-core-held-none-of-stands-on — each such state's cores under the most of its provinces' ground (a tie: raised, then another's)
  const want = { states: none.length, cores: 0, raised: 0, ownLand: 0, otherLand: 0, noOwnLand: { states: 0, cores: 0 }, living: 0 };
  for (const s of none) {
    const k = { raised: 0, own: 0, other: 0 }, n = s.cores.length - 1;
    for (const p of s.provinces) k[groundOf(s, p)]++;
    want.cores += n;
    want[k.raised >= k.other && k.raised >= k.own ? "raised" : k.other >= k.own ? "otherLand" : "ownLand"] += n;
    if (!k.own) { want.noOwnLand.states++; want.noOwnLand.cores += n; }
    want.living += s.cores.slice(1).filter((x) => landed.has(x)).length;
  }
  ok(want.raised >= 1 && want.ownLand >= 1 && want.living >= 1 && want.noOwnLand.states >= 1 && island.id === IDS.B3 && none.includes(island),
    "(the fixture: one held-none state on its country's other land, A2's id, and one on land raised from the sea, BBB's island on B3's id; one core is a living country's)", want);
  ok(JSON.stringify(c.onLandHeldNone) === JSON.stringify(want)
    && JSON.stringify(c.underQuarter) === JSON.stringify({ states: quarter.length, cores: quarter.reduce((a, s) => a + s.cores.length - 1, 0) }),
    "⭐⭐⭐ the report counts the states carrying a core on land that held none of their state below — split by what that land was: raised from the sea, their own country's, another's — and under a quarter", { report: c, want, none: none.map((s) => s.id), quarter: quarter.map((s) => s.id) });
}

console.log("\n-- ⭐ the continents --");
{
  const def = new Map(fs.readFileSync(path.join(M.mod, "map", "definition.csv"), "utf8").split(/\r?\n/).map((l) => l.split(";")).filter((c) => c.length >= 8).map((c) => [+c[0], c]));
  const parents = st.flatMap(parentsOf).filter((p) => belowLand(p));
  ok(parents.length > 0 && parents.every((p) => +def.get(p)[7] === continentBelow(p)), "⭐⭐⭐ every raised province that was land below keeps its continent there", parents.filter((p) => +def.get(p)[7] !== continentBelow(p)));
  // land raised from the open sea, out of reach of every continent: the nearest risen land's, by cell centres
  const risen = [...provAt].filter(([, v]) => belowLand(v.below) && v.below <= MOD_MAX && st.some((s) => s.provinces.includes(v.below))).map(([k, v]) => ({ xy: k.split(",").map(Number), c: continentBelow(v.below) }));
  const nearestOf = (cells) => cells.map(([x, y]) => risen.slice().sort((a, b) => ((a.xy[0] - x) ** 2 + (a.xy[1] - y) ** 2) - ((b.xy[0] - x) ** 2 + (b.xy[1] - y) ** 2))[0].c);
  const J = st.find((s) => s.provinces.some((p) => cellsOf(p, "mod").some(([x, y]) => STATE_GRID[y][x] === "J"))) || { provinces: [] };
  const want = { island: [...new Set(nearestOf(ISLAND.cells))], J: [...new Set(nearestOf(cellsOf(J.provinces[0] || -1, "mod")))] };
  ok(want.island.length === 1 && want.J.length === 1 && want.island[0] !== want.J[0], "(the fixture: every cell of each island has one nearest continent, and the two differ)", want);
  ok(island.provinces.every((p) => +(def.get(p) || [])[7] === want.island[0]) && J.provinces.every((p) => +(def.get(p) || [])[7] === want.J[0]) && (M.r.continents || {}).fallback === 0,
    `⭐⭐⭐ the two islands, out of reach of every continent, take the nearest land's (${want.island[0]}, ${want.J[0]}) — every piece of the split too — and none the default`,
    { island: island.provinces.map((p) => [p, (def.get(p) || [])[7]]), J: J.provinces.map((p) => [p, (def.get(p) || [])[7]]), report: M.r.continents });
  // #a-capital-is-said-when-it-changed-continent — each country's capital as it loads now (the mod's line, else the one below) on the
  // continent most of its provinces are on, against the state its line below names on the continent most of its provinces were on
  const most = (ps, nameOf) => { const k = new Map(); for (const p of ps) { const c = nameOf(p); if (c) k.set(c, (k.get(c) || 0) + 1); } let b = "", bn = 0; for (const c of [...k.keys()].sort()) if (k.get(c) > bn) { b = c; bn = k.get(c); } return b; };
  const lineOf = (t) => { const f = path.join(M.mod, "history", "countries", `${t} - Land of ${t}.txt`); const m = /^\s*capital\s*=\s*(\d+)/m.exec(fs.existsSync(f) ? fs.readFileSync(f, "utf8") : COUNTRY_HISTORY[t]); return m ? +m[1] : 0; };
  const moved = [...landed].sort().map((t) => {
    const now = st.find((s) => s.id === lineOf(t) && s.owner === t), k = keyOfId.get(+((/^\s*capital\s*=\s*(\d+)/m.exec(COUNTRY_HISTORY[t]) || [])[1] || 0));
    if (!now || !k) return null;
    const to = most(now.provinces, (p) => CONTINENTS[+(def.get(p) || [])[7] - 1] || ""), from = most(provincesOfState(k), (p) => CONTINENTS[continentBelow(p) - 1] || "");
    return to && from && to !== from ? { tag: t, from, to } : null;
  }).filter(Boolean);
  ok(moved.some((m) => m.tag === "AAA"), "(the fixture: AAA's capital stands on A2's land, on another continent than A1, the state its line names)", moved);
  ok(JSON.stringify(((M.r.continents || {}).capitals || {}).moved) === JSON.stringify(moved),
    "⭐⭐⭐ the report names every country whose capital now stands on another continent than in 1936, with both continents", { report: M.r.continents, moved });
}

console.log("\n-- ⭐ the switches the page never sends, and a second run --");
{
  const off = build(path.join(ROOT, "off", "mod"), { renumberStates: false });
  const so = statesOf(off.mod);
  ok(off.r && off.r.changed && so.length === st.length && so.every((s) => s.cores.join() === s.owner && !s.claims.length && !s.dated.length) && !(off.r.stateIds || {}).renumbered && !(off.r.stateIds || {}).carried,
    "⭐⭐⭐ renumberStates:false keeps the cut's ids and writes no core but the owner's, and no dated block — the carry is gated on the renumbering", off.r && (off.r.error || so.filter((s) => s.cores.join() !== s.owner || s.claims.length)));
  const two = build(path.join(ROOT, "two", "mod"));
  const tree = (dir) => { const out = new Map(); const walk = (rel) => { for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) { const r = rel ? rel + "/" + e.name : e.name; if (r === ".nova") continue; if (e.isDirectory()) walk(r); else out.set(r, fs.readFileSync(path.join(dir, r))); } }; walk(""); return out; };
  const a = tree(M.mod), b = tree(two.mod);
  const differ = [...new Set([...a.keys(), ...b.keys()])].filter((k) => !a.has(k) || !b.has(k) || Buffer.compare(a.get(k), b.get(k)) !== 0);
  ok(a.size > 10 && !differ.length, `⭐⭐ two runs in two mods of the same name write the same ${a.size} files, byte for byte`, differ.slice(0, 10));
}

console.log("\n-- ⭐ a capital handed to another while its country keeps land: the rule --");
{
  // ⛔ #a-capital-handed-over-later-is-said — capitalsHandedOver, pure: each case is the rule's own words
  const f = md.capitalsHandedOver;
  ok(typeof f === "function", "map-data.js exports capitalsHandedOver");
  if (typeof f === "function") {
    const S = (id, owner, ...blocks) => ({ id, owner, dated: blocks.map(([date, ...lines]) => ({ date, lines })) });
    const got = f({ capitals: [{ tag: "AAA", id: 1 }, { tag: "CCC", id: 3 }, { tag: "DDD", id: 4 }, { tag: "FFF", id: 5 }, { tag: "GGG", id: 6 }, { tag: "HHH", id: 7 }],
      states: [S(1, "AAA", ["1939.1.1", "owner = BBB", "controller = BBB"]), S(2, "AAA"),
        S(3, "CCC", ["1938.1.1", "owner = BBB"]),
        S(4, "DDD", ["1939.2.1", "owner = EEE"]), S(5, "FFF", ["1939.3.1", "owner = DDD"]),
        S(6, "GGG", ["1939.3.1", "controller = BBB"]), S(9, "GGG"),
        S(7, "HHH", ["1938.1.1", "owner = III"], ["1939.1.1", "owner = HHH"]), S(8, "HHH")] });
    const tags = got.map((x) => x.tag).join();
    ok(got.some((x) => x.tag === "AAA" && x.state === 1 && x.to === "BBB" && x.date === "1939.1.1"), "⭐⭐⭐ AAA's capital goes to BBB while AAA keeps 2: named, with the taker and the date", got);
    ok(!/CCC/.test(tags), "⭐⭐⭐ …CCC's, its only state, is not: the base game's own shape, a country it ends", got);
    ok(/DDD/.test(tags), "⭐⭐ …DDD's is: it holds land THEN, the state it was handed", got);
    ok(!/FFF/.test(tags), "⭐⭐ …FFF's is not: its one state went, and with it the country", got);
    ok(!/GGG/.test(tags), "⭐⭐ …nor GGG's, held by another but still owned: a `controller` hands nothing over", got);
    ok(!/HHH/.test(tags), "⭐ …nor HHH's, handed back by the last block", got);
    ok(tags === "AAA,DDD", "…and those two only, by tag", got);
  }
}

console.log("\n-- ⭐ the later changes of hands --");
{
  // #a-generated-state-keeps-its-later-owners — what each state ought to carry, off the fixture's own data: only where its id kept the
  // country it had below (the removals' frame), only blocks that hand the state over, dated at or before the last bookmark, none whose
  // owner or controller is a removed country, and no statement naming one
  const last = BOOKMARKS.slice().sort((a, b) => { const pa = a.split(".").map(Number), pb = b.split(".").map(Number); for (let i = 0; i < 4; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); return 0; }).pop();
  const upTo = (d) => { const pa = d.split(".").map(Number), pb = last.split(".").map(Number); for (let i = 0; i < 4; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0); return true; };
  const tagOfLine = (l) => l.split("=")[1].trim();
  const wantDated = (s) => {
    const k = keyOfId.get(s.id);
    if (!k || !s.owner || ownerBelowOf(k) !== s.owner) return [];
    return (STATES[k].dated || []).filter((b) => upTo(b.date))
      .filter((b) => { const hands = b.lines.filter((l) => /^(owner|controller)\b/.test(l)); return hands.length && !hands.some((l) => REMOVED.has(tagOfLine(l))); })
      .map((b) => ({ date: b.date, lines: b.lines.filter((l) => !REMOVED.has(tagOfLine(l))) }));
  };
  const atId = (k) => st.find((x) => x.id === IDS[k]) || { id: -1, dated: [] };   // the meaning is the id's, wherever its land is
  const b2 = atId("B2"), c2Id = atId("C2"), e1 = atId("E1");
  ok(b2.owner === "BBB" && c2Id.owner && c2Id.owner !== "CCC" && e1.owner === "BBB" && wantDated(b2).length === 1 && wantDated(e1).length === 1,
    "(the fixture: B2's id stays BBB's with a 1939 and a 1940 change of hands, C2's id went to another country, E1's id stays BBB's with a block handing it to the removed XXX)", { b2, c2Id, e1 });
  const wrong = st.filter((x) => JSON.stringify(x.dated) !== JSON.stringify(wantDated(x)));
  ok(!wrong.length, "⭐⭐⭐ every state writes exactly the dated changes of hands of its state below, where its id kept its country, up to the last bookmark — and none past it, none of an id that moved, none handing it to a removed country",
    wrong.map((x) => ({ id: x.id, owner: x.owner, dated: x.dated, want: wantDated(x) })));
  ok(atId("A3").id === IDS.A3 && !atId("A3").dated.length, "⭐⭐ …and a dated block that only adds a core (A3's 1939) hands nothing over and is not written", atId("A3"));
  const dd = ((M.r.stateIds || {}).carried || {}).dated || {}, withDated = st.filter((x) => x.dated.length);
  ok(dd.states === withDated.length && dd.blocks === withDated.reduce((a, x) => a + x.dated.length, 0) && withDated.length >= 2 && dd.until === last,
    "⭐⭐ the report counts the states and blocks, up to the last bookmark", { dd, withDated: withDated.map((x) => x.id) });
  // #a-capital-handed-over-later-is-said — off the files written: a country's capital (its line) whose carried blocks end in another's
  // hands, while a state of its own stays its own
  const lastOwner = (x) => { let o = x.owner; for (const b of x.dated) for (const l of b.lines) { const m = /^owner = (\w+)$/.exec(l); if (m) o = m[1]; } return o; };
  const capLine = (t) => { const f = path.join(M.mod, "history", "countries", `${t} - Land of ${t}.txt`); const m = /^\s*capital\s*=\s*(\d+)/m.exec(fs.existsSync(f) ? fs.readFileSync(f, "utf8") : COUNTRY_HISTORY[t] || ""); return m ? +m[1] : 0; };
  const taken = Object.keys(COUNTRY_HISTORY).sort().map((t) => ({ t, cap: st.find((x) => x.id === capLine(t) && x.owner === t) }))
    .filter(({ t, cap }) => cap && lastOwner(cap) !== t && st.some((x) => x !== cap && x.owner === t && lastOwner(x) === t)).map(({ t, cap }) => ({ tag: t, state: cap.id, to: lastOwner(cap) }));
  ok(taken.some((x) => x.tag === "AAA" && x.to === "DDD"), "(the fixture: the block carried onto AAA's capital hands it to DDD in 1939, and AAA keeps other land)", taken);
  ok(JSON.stringify((dd.capitalsTaken || []).map(({ tag, state, to }) => ({ tag, state, to }))) === JSON.stringify(taken),
    "⭐⭐⭐ the report names every country that keeps land here while the block carried onto its capital hands it to another — and no other", { report: dd.capitalsTaken, taken });
}

console.log("\n-- the page says it --");
{
  const { maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
  const PAGE = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"), MASKED = maskJsLiterals(PAGE);
  const at = MASKED.indexOf("function generatedStateMeaningNote("), body = at < 0 ? null : jsBodyAt(MASKED, at);
  const note = body ? require("vm").runInNewContext("(" + PAGE.slice(at, body[1] + 1) + ")") : () => "";
  const said = note(M.r), c = M.r.stateIds.carried, h = c.onLandHeldNone;
  ok(said.includes(`${M.r.stateIds.renumbered.sameOwner} of ${M.r.createdStates} new states`) && said.includes(`${h.states} of them hold none of their state underneath`),
    "⭐⭐ the page says how many ids kept their country, and how many states carry cores on land that held none of their state", said);
  // #what-a-core-held-none-of-stands-on — each part by its own count, and never one word for all of them
  ok(said.includes(`${h.ownLand} stand${h.ownLand === 1 ? "s" : ""} on other land of the same country`) && said.includes(`${h.raised} on land raised from the sea`)
    && said.includes(`${h.noOwnLand.states} of those states stand${h.noOwnLand.states === 1 ? "s" : ""} on not one province`) && said.includes(`${h.living} of those cores ${h.living === 1 ? "is" : "are"} of a country that starts with land`)
    && !said.includes(`so ${h.cores} of those cores stand on other land`),
    "⭐⭐⭐ …and what that land was: the cores on their country's other land and those on land raised from the sea, apart, the states on none of their country's land, and the living countries' cores", said);
  const dd = c.dated || {};
  // counted out of the ids that kept their country, the only states that carry one — "of those states", after the held-none count,
  // read as a share of the states on land that held none of theirs
  ok(dd.states >= 1 && said.includes(`${dd.states} of the ${M.r.stateIds.renumbered.sameOwner} that took their country's id keep the changes of hands`)
    && said.includes(dd.until.split(".").slice(0, 3).join(".")) && !said.includes("of those states keep"),
    "⭐⭐ …and how many of the states that kept their country's id keep its later changes of hands, up to which bookmark", said);
  const tk = dd.capitalsTaken || [];
  ok(tk.length >= 1 && tk.every((x) => said.includes(`${x.tag}'s ${x.state} to ${x.to}`)) && said.includes("a state of its own as capital"),
    "⭐⭐ …and names the countries that keep land while their capital is handed to another, and what the game does with them", said);
  const cAt = MASKED.indexOf("function generatedContinentsNote("), cBody = cAt < 0 ? null : jsBodyAt(MASKED, cAt);
  const cont = cBody ? require("vm").runInNewContext("(" + PAGE.slice(cAt, cBody[1] + 1) + ")") : () => "";
  const saidC = cont(M.r), mv = ((M.r.continents || {}).capitals || {}).moved || [];
  ok(mv.length >= 1 && mv.every((m) => saidC.includes(`${m.tag} ${m.from} → ${m.to}`)) && /continent checks read/.test(saidC),
    "⭐⭐ the page names the countries whose capital changed continent, with both continents", saidC);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
