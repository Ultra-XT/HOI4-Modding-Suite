// ⛔ #a-new-state-is-carved-like-a-split — A STATE MADE EMPTY AND FILLED BY THE MAP'S CLICKS IS CARVED THE WAY AUTO-FIX CUTS ONE.
//
// The map page's "+ New state" stages POST /api/map/create-state { name: "", owner: <the country dropdown> } and arms fill mode: each
// click on the map then queues POST /api/map/move-province { provinceId, toStateId } (the state it came from rides in the write's meta,
// not its body). createState writes the new state with `owner = T` and `add_core_of = T` for the dropdown's country (nothing for
// "— select —"), `state_category = rural` and `manpower = 1000`. So a piece carved out of Gyeongsang (base game 1030: JAP's, cored by KOR
// only, a town of 4,761,368) gave Japan a new core on Korean land and dropped Korea's, made the piece rural, and invented 1,000 people
// while 1030 kept every one of its own; left at "— select —" the land left Japan altogether (the generator-knowledge audit, SUS-3).
// Auto-fix's carve (splitStateOffProvinces) and Generate land (carriedCoresAndClaims) carry who the land is, its category and a share of
// its people. Pinned on a mod over a base game that owns the map and the states, as a new mod over vanilla is:
//   (a) ⭐ the dropdown on the source's own owner: the first fill takes the source's owner, cores and claims verbatim in place of what
//       createState wrote, its category, and its manpower shared by provinces — taken off the source in the same click; the second fill
//       takes nothing more;
//   (b) ⭐ the dropdown left at "— select —": the piece stays the source owner's, as the source writes it;
//   (c) ⭐ another country picked: it keeps the piece and its own core, and the source's cores and claims come with the land;
//   (d) CONTROLS: a state created with land already, and a fill out of a state with one province, take no share of anything the rule
//       does not give;
//   (e) the page: firstLandNote words both kinds, and adoptFirstLand takes what was written into the page's own copy of both states.
// Every expected value is read off the fixture. Fixture-only: binds no port.
// Run: node test-a-new-state-is-carved-like-a-split.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-new-state-carve-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const P = require("./testlib-map-page.js");

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
function bmp8(W, H, fn) {
  const rs = Math.floor((8 * W + 31) / 32) * 4, off = 54 + 1024, b = Buffer.alloc(off + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(rs * H, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * rs + x] = fn(x, y);
  return b;
}

// ── the world: 9 x 5 provinces of 12 px, id = row * 9 + col + 1; land on rows 1-3, cols 0-7, sea round it ─────────────────────────
const CELL = 12, COLS = 9, ROWS = 5, W = COLS * CELL, H = ROWS * CELL;
const idAt = (c, r) => r * COLS + c + 1;
const provAt = (x, y) => idAt(Math.floor(x / CELL), Math.floor(y / CELL));
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const cells = (cs, rs) => { const out = []; for (const r of rs) for (const c of cs) out.push(idAt(c, r)); return out; };
//   KG is Gyeongsang's shape: AAA's, cored by BBB only, claimed by CCC, a town — what the audit carved
const STATES = [
  { name: "KG", category: "town", manpower: 8000, provinces: cells([0, 1, 2, 3], [1]), identity: ["owner = AAA", "# Korea's land, not the owner's", "add_core_of = BBB", "add_claim_by = CCC"], vp: [idAt(0, 1), 3] },
  { name: "AH", category: "city", manpower: 20000, provinces: cells([4, 5, 6, 7], [1]), identity: ["owner = AAA", "add_core_of = AAA"], vp: [idAt(5, 1), 20] },
  { name: "BH", category: "rural", manpower: 3000, provinces: cells([0, 1, 2, 3], [2, 3]), identity: ["owner = BBB", "add_core_of = BBB"], vp: [idAt(1, 2), 5] },
  { name: "CH", category: "rural", manpower: 2500, provinces: cells([4, 5, 6], [2, 3]), identity: ["owner = CCC", "add_core_of = CCC"], vp: [idAt(5, 2), 5] },
  { name: "IS", category: "large_town", manpower: 700, provinces: cells([7], [2]), identity: ["owner = BBB", "add_core_of = BBB", "add_core_of = CCC"], vp: null },
  { name: "CS", category: "rural", manpower: 900, provinces: cells([7], [3]), identity: ["owner = CCC", "add_core_of = CCC"], vp: null },
].map((s, k) => ({ ...s, id: k + 1 }));
const S = Object.fromEntries(STATES.map((s) => [s.name, s]));
const LAND = new Set(STATES.flatMap((s) => s.provinces));
const stateFile = (s) => `state={\n\tid=${s.id}\n\tname="STATE_${s.id}" # ${s.name}\n\tmanpower=${s.manpower}\n\tstate_category=${s.category}\n\tprovinces={ ${s.provinces.join(" ")} }\n`
  + `\thistory={\n${s.identity.map((l) => `\t\t${l}\n`).join("")}${s.vp ? `\t\tvictory_points = { ${s.vp[0]} ${s.vp[1]} }\n` : ""}\t\tbuildings = { infrastructure = 2 }\n\t}\n}\n`;

const GAME = path.join(ROOT, "game");
write(GAME, "hoi4.exe", "");
write(GAME, "common/terrain/00_terrain.txt", ["categories = {", "  plains = { color = { 200 200 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
  "terrain = {", "  plains = { type = plains color = { 0 } }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
write(GAME, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
{
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${LAND.has(id) ? "land;false;plains;1" : "sea;false;ocean;0"}`);
  write(GAME, "map/definition.csv", rows.join("\n") + "\n");
}
write(GAME, "map/terrain.bmp", bmp8(W, H, (x, y) => (LAND.has(provAt(x, y)) ? 0 : 15)));
write(GAME, "map/heightmap.bmp", bmp8(W, H, (x, y) => (LAND.has(provAt(x, y)) ? 106 : 89)));
write(GAME, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
write(GAME, "map/strategicregions/r1.txt", `strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ ${[...LAND].join(" ")} }\n\tweather={}\n}\n`);
{
  const sea = []; for (let id = 1; id <= COLS * ROWS; id++) if (!LAND.has(id)) sea.push(id);
  write(GAME, "map/strategicregions/r2.txt", `strategic_region={\n\tid=2\n\tname="REGION_2"\n\tprovinces={ ${sea.join(" ")} }\n\tnaval_terrain=water_shallow_sea\n\tweather={}\n}\n`);
}
for (const s of STATES) write(GAME, `history/states/${s.id}-${s.name}.txt`, stateFile(s));
write(GAME, "history/countries/AAA - Aay.txt", `capital = ${S.AH.id}\n`);
write(GAME, "history/countries/BBB - Bee.txt", `capital = ${S.BH.id}\n`);
write(GAME, "history/countries/CCC - Cee.txt", `capital = ${S.CH.id}\n`);
const NEXT_ID = STATES.length + 1;

/** a new mod over the base game, as the owner's own are: a descriptor, nothing else */
const makeMod = (tag) => { const m = path.join(ROOT, tag); write(m, "descriptor.mod", `name="${tag}"\nsupported_version="1.*"\n`); return m; };
const modStateText = (m, file) => fs.readFileSync(path.join(m, "history", "states", file), "utf8");
const historyLines = (text) => {
  const h = /history\s*=\s*\{([\s\S]*)\}\s*\}\s*$/.exec(text.replace(/#[^\n]*/g, ""));
  return h ? h[1].split(/\r?\n/).map((l) => l.trim()).filter((l) => /^(?:owner|controller|add_core_of|add_claim_by)\s*=/.test(l)).map((l) => l.replace(/\s+/g, " ")) : [];
};
const scalarOf = (text, key) => { const m = new RegExp(`(?:^|\\s)${key}\\s*=\\s*([A-Za-z0-9_]+)`).exec(text.replace(/#[^\n]*/g, "")); return m ? m[1] : null; };
const kgFile = `${S.KG.id}-KG.txt`;

// ── server.js's own /api/map/move-province handler, as the page reaches it ─────────────────────────────────────────────────────────
const SERVER = fs.readFileSync(path.join(__dirname, "server.js"), "utf8").replace(/\r\n/g, "\n");
const routes = {};
{
  const at = SERVER.indexOf('app.post("/api/map/move-province"');
  const end = at < 0 ? -1 : SERVER.indexOf("\n  app.", at + 10);
  ok(at >= 0 && end > at, "(server.js's /api/map/move-province handler is found)", { at, end });
  vm.runInNewContext(SERVER.slice(at, end), {
    app: { post: (url, mw, fn) => { routes[url] = fn; } }, express: { json: () => null }, mapData: md, DEV_ROOT: "<dev>",
    getActiveRoot: () => "", checkActiveRootNotGameRoot() {}, resolveHoi4GameRoot: () => GAME, resolveDependencyRootsForAssets: () => [],
  });
}
/** what the page queues for a fill click — { provinceId, toStateId } — with the modPath every write carries */
const fill = (mod, provinceId, toStateId) => {
  let status = 200, json = null;
  routes["/api/map/move-province"]({ body: { provinceId, toStateId, modPath: mod } }, { status(c) { status = c; return this; }, json(j) { json = j; return this; } });
  return { status, ...(json || {}) };
};
/** what the page's "+ New state" stages: { name: "", owner: <the dropdown> } — create-state forwards it to createState as it is */
const newState = (mod, owner) => md.createState({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], name: "", owner });

console.log("\n-- the fixture can tell right from wrong --");
const SHARE = Math.round(S.KG.manpower / S.KG.provinces.length);
ok(SHARE === 2000 && SHARE !== 1000 && S.KG.category !== "rural", `(the fixture: a quarter of KG's people is ${SHARE}, not createState's 1,000, and KG is a ${S.KG.category}, not rural)`);
{
  const m = makeMod("mod-guard");
  const r = newState(m, "AAA");
  ok(r && r.ok && r.id === NEXT_ID && r.manpower === 1000 && r.category === "rural", `(the fixture: + New state makes state ${NEXT_ID}, rural, 1,000 people)`, r);
  ok(JSON.stringify(historyLines(modStateText(m, r.file))) === JSON.stringify(["owner = AAA", "add_core_of = AAA"]), "(…owned and cored by the dropdown's country, as createState writes it)", historyLines(modStateText(m, r.file)));
}

console.log("\n-- ⭐ (a) the dropdown on the source's own owner --");
{
  const m = makeMod("mod-same-owner");
  const c = newState(m, "AAA");
  const p = S.KG.provinces[1];
  const r = fill(m, p, c.id);
  ok(r.status === 200 && r.ok && (r.sources || []).includes(S.KG.id), `(guard: province ${p} moved out of KG into state ${c.id})`, { status: r.status, error: r.error, sources: r.sources });
  const text = modStateText(m, c.file), lines = historyLines(text);
  ok(JSON.stringify(lines) === JSON.stringify(["owner = AAA", "add_core_of = BBB", "add_claim_by = CCC"]),
    "⭐⭐⭐ the new state is who the land is, as KG writes it — AAA's, cored by BBB, claimed by CCC — and AAA has no new core on it", lines);
  ok(scalarOf(text, "state_category") === S.KG.category, `⭐⭐ …a ${S.KG.category}, as KG is, not rural`, scalarOf(text, "state_category"));
  ok(Number(scalarOf(text, "manpower")) === SHARE, `⭐⭐ …with ${SHARE} people, KG's shared by provinces, not 1,000 invented`, scalarOf(text, "manpower"));
  const kg = modStateText(m, kgFile);
  ok(Number(scalarOf(kg, "manpower")) === S.KG.manpower - SHARE, `⭐⭐ …taken off KG in the same click (${S.KG.manpower - SHARE} left)`, scalarOf(kg, "manpower"));
  ok(kg.includes("# Korea's land, not the owner's") && historyLines(kg).join("|") === "owner = AAA|add_core_of = BBB|add_claim_by = CCC" && kg.includes(`victory_points = { ${S.KG.vp[0]} ${S.KG.vp[1]} }`) && !kg.includes(` ${p} `),
    "…and KG is otherwise as it was: its comment, its owner, core and claim, its victory point; the province gone from it", kg);
  const fl = r.firstLand || {};
  ok(fl.from === S.KG.id && fl.identityReplaced === true && JSON.stringify(fl.identity) === JSON.stringify(["owner = AAA", "add_core_of = BBB", "add_claim_by = CCC"])
    && fl.category === S.KG.category && fl.manpower === SHARE && fl.sourceManpower === S.KG.manpower - SHARE,
    "⭐⭐ the click answers with what it took, for the Save line and the page's own copy of both states", r.firstLand);
  const model = md.buildMapModel({ modRoot: m, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false });
  const st = model.states.find((s) => s.id === c.id);
  ok(st && st.owner === "AAA" && JSON.stringify(st.cores) === JSON.stringify(["BBB"]) && st.category === S.KG.category, "…and the model reads it so", st && { owner: st.owner, cores: st.cores, category: st.category });
  // the second fill takes nothing more: the state has land now
  const p2 = S.KG.provinces[2];
  const r2 = fill(m, p2, c.id);
  ok(r2.ok && !r2.firstLand && Number(scalarOf(modStateText(m, c.file), "manpower")) === SHARE && Number(scalarOf(modStateText(m, kgFile), "manpower")) === S.KG.manpower - SHARE
    && historyLines(modStateText(m, c.file)).length === 3,
    "⭐⭐ the second fill takes nothing more — no second share, no second copy of who it is", { firstLand: r2.firstLand, lines: historyLines(modStateText(m, c.file)) });
  ok(!/\r\n/.test(modStateText(m, c.file)) && !/\r\n/.test(modStateText(m, kgFile)), "…and both files keep the one line ending they were written with");
}

console.log("\n-- ⭐ (b) the dropdown left at \"— select —\" --");
{
  const m = makeMod("mod-no-owner");
  const c = newState(m, "");
  ok(c.ok && historyLines(modStateText(m, c.file)).length === 0, "(guard: createState writes no owner and no core for \"— select —\")", historyLines(modStateText(m, c.file)));
  const r = fill(m, S.KG.provinces[1], c.id);
  const lines = historyLines(modStateText(m, c.file));
  ok(r.ok && JSON.stringify(lines) === JSON.stringify(["owner = AAA", "add_core_of = BBB", "add_claim_by = CCC"]) && (r.firstLand || {}).identityReplaced === true,
    "⭐⭐⭐ the piece stays AAA's, as KG writes it — the land does not leave its country because the dropdown was not set", { lines, firstLand: r.firstLand });
  const model = md.buildMapModel({ modRoot: m, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false });
  ok((model.states.find((s) => s.id === c.id) || {}).owner === "AAA", "…and the model gives it an owner");
}

console.log("\n-- ⭐ (c) another country picked --");
{
  const m = makeMod("mod-other-owner");
  const c = newState(m, "DDD");
  const r = fill(m, S.KG.provinces[1], c.id);
  const text = modStateText(m, c.file), lines = historyLines(text);
  ok(r.ok && lines[0] === "owner = DDD" && lines.includes("add_core_of = DDD") && lines.includes("add_core_of = BBB") && lines.includes("add_claim_by = CCC") && !lines.includes("owner = AAA") && lines.length === 4,
    "⭐⭐⭐ DDD keeps the piece and the core it was made with, and BBB's core and CCC's claim come with the land", lines);
  ok((r.firstLand || {}).identityReplaced === false && JSON.stringify(r.firstLand.identity) === JSON.stringify(["add_core_of = BBB", "add_claim_by = CCC"]),
    "…and the click says it added those two, beside the owner picked", r.firstLand);
  ok(scalarOf(text, "state_category") === S.KG.category && Number(scalarOf(text, "manpower")) === SHARE, "⭐ …its category and its share of the people, as in (a)", { cat: scalarOf(text, "state_category"), mp: scalarOf(text, "manpower") });
}

console.log("\n-- (d) CONTROLS --");
{
  const m = makeMod("mod-made-with-land");
  const c = md.createState({ modRoot: m, gameRoot: GAME, dependencyRoots: [], name: "", owner: "AAA", provinces: [S.KG.provinces[0]] });
  const before = modStateText(m, c.file), kgBefore = modStateText(m, kgFile);
  const r = fill(m, S.KG.provinces[1], c.id);
  ok(c.ok && r.ok && !r.firstLand && Number(scalarOf(modStateText(m, c.file), "manpower")) === Number(scalarOf(before, "manpower"))
    && Number(scalarOf(modStateText(m, kgFile), "manpower")) === Number(scalarOf(kgBefore, "manpower")) && historyLines(modStateText(m, c.file)).join("|") === historyLines(before).join("|"),
    "CONTROL: a state created with land already is not re-carved by a later move (its people, its category, who it is: all as they were)", r.firstLand);
  const m2 = makeMod("mod-one-province-source");
  const c2 = newState(m2, "BBB");
  const r2 = fill(m2, S.IS.provinces[0], c2.id);
  const t2 = modStateText(m2, c2.file), isText = modStateText(m2, `${S.IS.id}-IS.txt`);
  // ⛔ (review T14) The land's people go with it. It took no share here, so createState's 1,000 stayed and the merge of the emptied state added its people to them: a state of
  // 201,100 people came out 202,100, the 1,000 the first gap said Nova invents. One stays, as every share leaves one, and the merge that removes the state brings it.
  ok(r2.ok && Number(scalarOf(t2, "manpower")) === S.IS.manpower - 1 && Number(scalarOf(isText, "manpower")) === 1 && r2.firstLand.manpower === S.IS.manpower - 1 && r2.firstLand.sourceManpower === 1 && scalarOf(t2, "state_category") === S.IS.category
    && JSON.stringify(historyLines(t2)) === JSON.stringify(["owner = BBB", "add_core_of = BBB", "add_core_of = CCC"]),
    "⭐⭐ out of a state of one province, every person but one goes with its land, in place of 1,000, and who it is and its category as ever", { lines: historyLines(t2), mp: scalarOf(t2, "manpower"), source: scalarOf(isText, "manpower"), cat: scalarOf(t2, "state_category"), firstLand: r2.firstLand });
  // …and a source with the least a state holds: the new state takes it, and no state with land is left with none
  const low = md.newStateFirstLandCarve({ toState: { owner: "", category: "rural", manpower: 1000 }, toBlock: 'state={\n\tid=9\n\tmanpower=1000\n\tstate_category=rural\n\thistory={\n\t}\n}\n', source: { id: 8, owner: "", category: "rural", manpower: 1, provinces: [5] }, sourceBlock: 'state={\n\tid=8\n\tmanpower=1\n\tstate_category=rural\n\thistory={\n\t}\n}\n' });
  ok(low && low.manpower && low.manpower.share === 1 && low.manpower.sourceLeft === 0 && /manpower=0/.test(low.source('state={\n\tid=8\n\tmanpower=1\n}\n')) && /manpower=1\b/.test(low.target('state={\n\tid=9\n\tmanpower=1000\n}\n')),
    "⭐⭐ one person, in a state of one province: that one goes with its land, and its emptied state has none to bring", low && low.manpower);
  const lowMany = md.newStateFirstLandCarve({ toState: { owner: "", category: "rural", manpower: 1000 }, toBlock: 'state={\n\tid=9\n\tmanpower=1000\n\tstate_category=rural\n\thistory={\n\t}\n}\n', source: { id: 8, owner: "", category: "rural", manpower: 1, provinces: [5, 6] }, sourceBlock: 'state={\n\tid=8\n\tmanpower=1\n\tstate_category=rural\n\thistory={\n\t}\n}\n' });
  const lowBlock = 'state={\n\tid=8\n\tmanpower=1\n}\n';
  ok(lowMany && lowMany.manpower && lowMany.manpower.share === 1 && lowMany.manpower.sourceLeft === 1 && lowMany.source(lowBlock) === lowBlock,
    "⭐ …one person in a state that keeps land: it keeps its one, and the new state has the least a state holds, in place of 1,000", lowMany && lowMany.manpower);
}

console.log("\n-- (e) the page words it, and keeps its own copy of both states --");
{
  const shown = (sid) => `state ${sid}`;
  const to = { id: NEXT_ID, owner: "", cores: [], category: "rural", manpower: 1000, provinces: [S.KG.provinces[1]] };
  const from = { id: S.KG.id, owner: "AAA", cores: ["BBB"], category: "town", manpower: S.KG.manpower, provinces: S.KG.provinces.slice() };
  const provinceToOwner = {};
  const { sb } = P.runPage(["function firstLandNote(", "function adoptFirstLand("], { stateById: new Map([[to.id, to], [from.id, from]]), provinceToOwner });
  const fl = { from: S.KG.id, identity: ["owner = AAA", "add_core_of = BBB", "add_claim_by = CCC"], identityReplaced: true, category: "town", manpower: SHARE, sourceManpower: S.KG.manpower - SHARE };
  const note = sb.firstLandNote(fl, to.id, shown);
  ok(note.startsWith("🏷") && note.includes(`state ${S.KG.id}`) && note.includes("owner AAA") && note.includes("cores BBB") && note.includes("claims CCC") && note.includes("town") && note.includes(SHARE.toLocaleString()) && note.includes((S.KG.manpower - SHARE).toLocaleString()),
    "⭐ firstLandNote says who the piece is now, as the source writes it, its category and its people, and what the source keeps", note);
  const noteBeside = sb.firstLandNote({ from: S.KG.id, identity: ["add_core_of = BBB", "add_claim_by = CCC"], identityReplaced: false }, to.id, shown);
  ok(noteBeside.includes("beside the owner you picked") && noteBeside.includes("BBB") && noteBeside.includes("CCC's claim"), "⭐ …and, for a country picked, the cores and claims it added beside it", noteBeside);
  ok(sb.firstLandNote(null, to.id, shown) === "", "…and nothing for a move that carved nothing");
  sb.adoptFirstLand(fl, to.id);
  ok(to.owner === "AAA" && JSON.stringify(to.cores) === JSON.stringify(["BBB"]) && sb.provinceToOwner[S.KG.provinces[1]] === "AAA" && to.category === "town" && to.manpower === SHARE && from.manpower === S.KG.manpower - SHARE,
    "⭐⭐ adoptFirstLand puts it in the page's own copy of both states, so the panel shows what was written and its next save does not undo it", { to, from, provinceToOwner: sb.provinceToOwner });
  const src = P.MASKED;   // comments masked: a comment naming the call is not the call
  ok(/if \(res\.firstLand && w\.url === "\/api\/map\/move-province"\) \{\s*adoptFirstLand\(res\.firstLand, body\.toStateId\);/.test(src) && /firstLandNote\(res\.firstLand, body\.toStateId, \w+\)/.test(src),
    "…and flushMapSaves calls both on a fill's answer, with the state id it sent (remapped from the provisional one)");
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
