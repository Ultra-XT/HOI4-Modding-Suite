// ⛔ #a-generated-world-has-the-layer-belows-hubs-per-state — A GENERATED WORLD'S SUPPLY HUBS ARE WHERE THE MAP UNDERNEATH WOULD
// HAVE THEM, NOT IN EVERY STATE.
//
// TEST 32 (10-01): a supply depot stood beside 749 of the 788 stars with no town (vanilla: 25%). generateSupplyNetwork gave every
// state Generate land named a hub, on its best victory point, and Fixes 4–6 stand that hub on the star — so every star got a
// depot, the "factories" the owner saw. Its comment gave two reasons, both false now: a generated state has a victory point, and a
// state with no hub is still supplied over its neighbours' provinces (00_defines.lua NSupply), as 568 of vanilla's states are.
// The base game hubs its capitals (85 of 89), a share of each state_category (megalopolis 100% … rural 40%, wasteland 11%), the
// towns first, and never land its owner can reach neither by rail nor by sea (0 of 6,275 hubs on seven shipping maps).
//
// Pinned on a mod over a layer below whose hubs say: every city state, a quarter of the rural ones, no wasteland. Every expected
// number is read back off the fixture's own files below, never typed in:
//   1. per category round(share below × states), capitals counted;  2. ⭐ each country's capital state holds one, the capital it
//   ends with after fixForeignCapitals;  3. ⭐ a state holding a town goes first;  4. every hub on its state's best victory point;
//   5. ⭐ a state on an island its country can reach neither by rail nor by sea gets none and the next takes the slot — and with a
//   port it is reachable, and so is one nobody owns;  6. the report adds up, Auto-fix's repair (no states named) asks the same, the
//   dry run is the write, a second run writes nothing;  7. CONTROL: with no hub
//   below, one in every state;  8. ⭐ on land cut finer than the layer below's, hubs are added where land is farthest from one;
//   9. the page says which;  10. ⭐ a kind no state below uses takes the share of the kind that stands in for it;
//   11. ⭐ a small or ownerless world keeps the one hub or none it gets, and neither empty-file rule offers a click that writes nothing.
// The whole flow — Generate land, then Auto-fix twice — is test-a-generated-world-and-auto-fix-keep-every-capital-on-a-hub.js.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-hubs-per-state-"));
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
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];

// ── the layer below: a text world — its states, what kind each is, its land, and which provinces carry a hub ───────────────────
/** spec [{ category, provinces: n, hubs: n }]: each state's provinces consecutive from 1, its first `hubs` of them hubbed. */
function makeGame(tag, spec, { withHubFile = true, slots = null } = {}) {
  const g = path.join(ROOT, tag);
  write(g, "hoi4.exe", "");
  const rows = ["0;0;0;0;land;false;unknown;0"], hubs = [];
  let next = 1;
  spec.forEach((s, k) => {
    const provs = []; for (let i = 0; i < s.provinces; i++) provs.push(next++);
    for (const p of provs) rows.push(`${p};${colour(p).join(";")};land;false;plains;1`);
    for (const p of provs.slice(0, s.hubs || 0)) hubs.push(p);
    write(g, `history/states/${k + 1}-S.txt`, `state={\n\tid=${k + 1}\n\tname="STATE_${k + 1}"\n\tmanpower=1000\n\tstate_category=${s.category}\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=ZZZ\n\t}\n}\n`);
  });
  write(g, "map/definition.csv", rows.join("\n") + "\n");
  if (withHubFile) write(g, "map/supply_nodes.txt", hubs.map((p) => `1 ${p}`).join("\n") + "\n");
  if (slots) write(g, "common/state_category/cats.txt", `state_categories = {\n${Object.entries(slots).map(([k, v]) => `\t${k} = { local_building_slots = ${v} }`).join("\n")}\n}\n`);
  return g;
}
/** The layer below read back off its own files: per category the share of its land states holding a hub, every state's share,
 *  and its land provinces per hub. */
function belowOf(g) {
  const hubAt = new Set(fs.readFileSync(path.join(g, "map", "supply_nodes.txt"), "utf8").split(/\r?\n/).map((l) => +l.trim().split(/\s+/)[1]).filter(Boolean));
  const per = new Map(); let states = 0, withHub = 0, land = 0;
  for (const f of fs.readdirSync(path.join(g, "history", "states"))) {
    const t = fs.readFileSync(path.join(g, "history", "states", f), "utf8");
    const cat = /state_category=(\w+)/.exec(t)[1], provs = /provinces=\{([^}]*)\}/.exec(t)[1].trim().split(/\s+/).map(Number);
    const has = provs.some((p) => hubAt.has(p)) ? 1 : 0;
    const r = per.get(cat) || { n: 0, hub: 0 }; r.n++; r.hub += has; per.set(cat, r);
    states++; withHub += has; land += provs.length;
  }
  return { rate: (c) => (per.has(c) ? per.get(c).hub / per.get(c).n : withHub / states), perHub: land / hubAt.size };
}

// ── the mod: cells of 8 px, id = row * COLS + col + 1, sea round everything so the east-west wrap joins nothing ─────────────────
//   rows 1-3, cols 1-12   the mainland: fifteen states, handed out in row order from MAINLAND
//   row 5, cols 1-3       an island: one rural state of XXX's, holding a town, its capital on the mainland
const COLS = 14, ROWS = 7, CELL = 8, W = COLS * CELL, H = ROWS * CELL;
const idAt = (c, r) => r * COLS + c + 1;
const MAINLAND = [];
for (let r = 1; r <= 3; r++) for (let c = 1; c <= 12; c++) MAINLAND.push(idAt(c, r));
const ISLAND = [1, 2, 3].map((c) => idAt(c, 5));
//   name, category, provinces, owner. YYY's largest state is R7, small enough that it is no rural state's pick by size.
const PLAN = [["C1", "city", 2, "XXX"], ["C2", "city", 2, "XXX"], ["R1", "rural", 1, "XXX"], ["R2", "rural", 6, "XXX"], ["R3", "rural", 5, "XXX"],
  ["R4", "rural", 4, "XXX"], ["R5", "rural", 2, "XXX"], ["R6", "rural", 2, "XXX"], ["R7", "rural", 3, "YYY"], ["R8", "rural", 2, "YYY"], ["R9", "rural", 1, "YYY"],
  ["R10", "rural", 1, "XXX"], ["R11", "rural", 1, "XXX"], ["W1", "wasteland", 2, "XXX"], ["W2", "wasteland", 2, "XXX"], ["RI", "rural", 3, "XXX"]];
const STATES = []; { let at = 0; PLAN.forEach(([name, category, n, owner], k) => { const provinces = name === "RI" ? ISLAND : MAINLAND.slice(at, at += n); STATES.push({ id: k + 1, name, category, owner, provinces }); }); }
const S = Object.fromEntries(STATES.map((s) => [s.name, s]));
const URBAN = new Set([S.R5.provinces[1], S.RI.provinces[0]]);
const vpOf = (s) => s.provinces[s.provinces.length - 1];   // every state's star on its LAST province — neither its first nor its town
const landSet = new Set(MAINLAND.concat(ISLAND));

/** o: { port (RI's island carries a naval base), ports { state name: province } (naval bases where they are named), capitals
 *  { XXX, YYY }: state names, states, cells } */
function makeMod(tag, o = {}) {
  const m = path.join(ROOT, tag);
  const states = o.states || STATES, land = o.land || landSet;
  write(m, "descriptor.mod", 'name="hubs per state"\nreplace_path="history/states"\n');
  write(m, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(idAt(Math.floor(x / CELL), Math.floor(y / CELL)))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${land.has(id) ? `land;false;${(o.urban || URBAN).has(id) ? "urban" : "plains"};1` : "sea;false;ocean;0"}`);
  write(m, "map/definition.csv", rows.join("\n") + "\n");
  write(m, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  write(m, "map/supply_nodes.txt", ""); write(m, "map/railways.txt", "");
  for (const s of states) {
    const at = o.ports && o.ports[s.name] ? o.ports[s.name] : o.port && o.portState === s.name ? s.provinces[0] : 0;
    const port = at ? `\t\tbuildings = {\n\t\t\t${at} = {\n\t\t\t\tnaval_base = 1\n\t\t\t}\n\t\t}\n` : "";
    // an ownerless state is written as Generate land writes one: no owner line at all
    write(m, `history/states/${s.id}-S.txt`, `state={\n\tid=${s.id}\n\tname="STATE_${s.id}"\n\tmanpower=1000\n\tstate_category=${s.category}\n\tprovinces={ ${s.provinces.join(" ")} }\n\thistory={\n${s.owner ? `\t\towner=${s.owner}\n` : ""}\t\tvictory_points = { ${vpOf(s)} 3 }\n${port}\t}\n}\n`);
  }
  for (const [tag2, capital] of Object.entries(o.capitals || { XXX: S.R1.id, YYY: S.C1.id })) write(m, `history/countries/${tag2} - ${tag2}.txt`, `capital = ${capital}\n`);
  return m;
}
const hubsOn = (m) => fs.readFileSync(path.join(m, "map", "supply_nodes.txt"), "utf8").split(/\r?\n/).map((l) => +l.trim().split(/\s+/)[1]).filter(Boolean);
const stateOfProv = (states) => { const out = new Map(); for (const s of states) for (const p of s.provinces) out.set(p, s); return out; };

const SPEC = [...Array(4)].map(() => ({ category: "city", provinces: 5, hubs: 1 }))
  .concat([...Array(12)].map((_, k) => ({ category: "rural", provinces: 4, hubs: k < 3 ? 1 : 0 })))
  .concat([...Array(2)].map(() => ({ category: "wasteland", provinces: 1, hubs: 0 })));
const G = makeGame("game", SPEC);
const B = belowOf(G);

console.log("\n-- the layer below, as supplyHubsBeneath reads it --");
{
  ok(typeof md.supplyHubsBeneath === "function" && typeof md.chooseSupplyHubs === "function" && typeof md.capitalStateFor === "function", "map-data.js exports supplyHubsBeneath, chooseSupplyHubs and capitalStateFor");
  const sb = typeof md.supplyHubsBeneath === "function" ? md.supplyHubsBeneath({ modRoot: path.join(ROOT, "nothing"), gameRoot: G, dependencyRoots: [] }) : null;
  ok(sb && ["city", "rural", "wasteland"].every((c) => Math.abs(sb.rateByCategory.get(c) - B.rate(c)) < 1e-9) && Math.abs(sb.landProvincesPerHub - B.perHub) < 1e-9,
    `the share of each kind of state below that holds a hub (city ${B.rate("city")}, rural ${B.rate("rural")}, wasteland ${B.rate("wasteland")}) and its land provinces per hub (${B.perHub})`, sb && { by: [...sb.rateByCategory], perHub: sb.landProvincesPerHub });
}

console.log("\n-- ⭐ 1-4. the capitals, then the share of each kind below, the towns first, each on its star --");
const MOD = makeMod("mod");
const plan = md.generateSupplyNetwork({ modRoot: MOD, gameRoot: G, dependencyRoots: [], stateIds: STATES.map((s) => s.id), dryRun: true });
const hubProv = new Set((plan.newHubs || []).map((h) => h.province));
const hubbed = (s) => s.provinces.some((p) => hubProv.has(p));
{
  const target = Math.round(STATES.filter((s) => s.name !== "RI").reduce((a, s) => a + s.provinces.length, 0) / B.perHub);
  const want = (cat) => Math.round(B.rate(cat) * STATES.filter((s) => s.category === cat).length);
  ok(target <= want("city") + want("rural") + want("wasteland"), `(the fixture: the routable land asks for ${target} hubs by area, no more than the kinds give, so nothing is added for area here)`, { target });
  for (const cat of ["city", "rural", "wasteland"]) {
    const got = STATES.filter((s) => s.category === cat && hubbed(s)).length;
    ok(got === want(cat), `⭐⭐ ${cat}: ${want(cat)} of its ${STATES.filter((s) => s.category === cat).length} states hold a hub — round(${B.rate(cat)} × states), as below`, { got, hubbed: STATES.filter((s) => s.category === cat && hubbed(s)).map((s) => s.name) });
  }
  ok(STATES.filter((s) => s.category === "rural").length - want("rural") > 2, "(the fixture: most rural states get none)");
  ok(hubbed(S.R1), "⭐⭐ XXX's capital state R1 holds one — one province, no town, last in its kind's order", S.R1);
  // YYY's `capital =` names a state XXX owns: the capital it ENDS with is the one fixForeignCapitals re-points it to
  const fixed = md.fixForeignCapitals({ modRoot: makeMod("mod-capitals"), gameRoot: G, dependencyRoots: [] });
  const m2 = md.buildMapModel({ modRoot: path.join(ROOT, "mod-capitals"), gameRoot: G, dependencyRoots: [], cacheStableLayers: false });
  const yyyCap = m2.capitals && m2.capitals.YYY, yyyState = STATES.find((s) => s.id === yyyCap);
  ok(fixed && fixed.fixed === 1 && yyyState && yyyState.owner === "YYY" && yyyState !== S.C1, "(the fixture: Auto-fix moves YYY's capital off the state XXX owns, onto one of its own)", { fixed, yyyCap });
  ok(yyyState && hubbed(yyyState), `⭐⭐ …and the state it ends on (${yyyState && yyyState.name}) is the one holding YYY's hub`, { yyyCap, hubs: [...hubProv] });
  const sorted = STATES.filter((s) => s.category === "rural" && s.name !== "RI" && !URBAN.has(s.provinces[1])).sort((a, b) => b.provinces.length - a.provinces.length || a.id - b.id);
  ok(sorted.slice(0, want("rural")).every((s) => s.name !== yyyState.name && s.name !== "R1"), "(the fixture: neither capital is among the rural states the size order alone would pick)", sorted.slice(0, want("rural")).map((s) => s.name));
  ok(hubbed(S.R5) && !hubbed(S.R2), "⭐⭐ the rural slot the capitals leave goes to R5, which holds a town — not R2, the largest", STATES.filter(hubbed).map((s) => s.name));
  ok(plan.newHubs.length > 0 && plan.newHubs.every((h) => { const s = stateOfProv(STATES).get(h.province); return s && h.province === vpOf(s); }), "every hub stands on its state's victory point", plan.newHubs);
}

console.log("\n-- ⭐ 5. an island its country can reach neither by rail nor by sea gets none; with a port it is reached --");
{
  ok(URBAN.has(S.RI.provinces[0]) && S.RI.provinces.length > S.R5.provinces.length && S.RI.owner === "XXX", "(the fixture: RI holds a town and more land than R5, so it is first in the rural order, and it is XXX's, whose capital is on the mainland)");
  ok(!hubbed(S.RI), "⭐⭐ RI gets no hub: no port, and not its country's capital", [...hubProv]);
  ok((plan.density || {}).unroutable === 1, "…and the report counts it", plan.density);
  // ⚠️ Moved with #a-hub-only-where-its-capital-reaches (supply critique, commit 1 (c)): a port on the island alone no longer
  // reaches it — a convoy leaves from a port on the capital's land, and XXX's capital R1 had none. So the sea route here is a
  // harbour at each end: the island's, and one on R1 (its one province, its star, which its capital hub stands on).
  const PM1 = makeMod("mod-port-island-only", { port: true, portState: "RI" });
  const p1 = md.generateSupplyNetwork({ modRoot: PM1, gameRoot: G, dependencyRoots: [], stateIds: STATES.map((s) => s.id), dryRun: true });
  ok(!S.RI.provinces.some((p) => (p1.newHubs || []).some((h) => h.province === p)) && (p1.density || {}).unroutable === 1,
    "⭐ a port on the island and none on its capital's land: no convoy reaches it, and RI gets no hub", { hubs: (p1.newHubs || []).map((h) => h.province), density: p1.density });
  const PM = makeMod("mod-port", { ports: { RI: S.RI.provinces[0], R1: S.R1.provinces[0] } });
  const pp = md.generateSupplyNetwork({ modRoot: PM, gameRoot: G, dependencyRoots: [], stateIds: STATES.map((s) => s.id), dryRun: true });
  const ph = new Set((pp.newHubs || []).map((h) => h.province));
  ok(S.R1.provinces.length === 1, "(the fixture: R1 is one province, so its harbour stands under its capital hub)");
  ok(S.RI.provinces.some((p) => ph.has(p)) && !S.R5.provinces.some((p) => ph.has(p)), "⭐⭐ with a port on the island and one on its capital's land it is reached by sea, and RI takes the slot ahead of R5", [...ph]);
  // ⛔ …AND A STATE NOBODY OWNS HAS NO CAPITAL TO BE CUT OFF FROM (review H2, 10-07): no rule asks it for a port. Generate land
  // writes a state it cannot decide with no owner, and Old World Blues ships 313 of them, 185 hubbed (.591). With nothing pinning
  // this, a filter that asked every state for a port or a capital took their hubs off any island and every test stayed green.
  const OS = STATES.map((s) => (s.name === "RI" ? { ...s, owner: "" } : s));
  const op = md.generateSupplyNetwork({ modRoot: makeMod("mod-ownerless-isle", { states: OS }), gameRoot: G, dependencyRoots: [], stateIds: OS.map((s) => s.id), dryRun: true });
  const oh = new Set((op.newHubs || []).map((h) => h.province));
  ok(OS.find((s) => s.name === "RI").owner === "" && !fs.readFileSync(path.join(ROOT, "mod-ownerless-isle", "history", "states", `${S.RI.id}-S.txt`), "utf8").includes("owner"),
    "(the fixture: RI is written with no owner line, on its island with no port)");
  ok(S.RI.provinces.some((p) => oh.has(p)) && !S.R5.provinces.some((p) => oh.has(p)) && op.density && op.density.unroutable === 0,
    "⭐⭐ RI with NO owner and no port still takes its turn in the rural order, ahead of R5 — nobody's capital is out of its reach", { hubs: [...oh], density: op.density });
}

console.log("\n-- 6. the report adds up, Auto-fix's repair asks the same, the dry run is the write, and a second run writes nothing --");
{
  const d = plan.density || {};
  ok(d.fromLayerBelow === true && d.served === STATES.length && d.withHub === STATES.filter(hubbed).length && d.capitals + d.harbours + d.quota + d.topUp === plan.newHubs.length && d.capitals === 2,
    "density: from the layer below, every state served, the hubbed states, capitals + harbours + share + area = the hubs", d);
  // Auto-fix's repair of an emptied file names no states (autoFixMap's own call): on a world the mod owns outright it serves every
  // state of the mod's, and must ask the map underneath the same way — its validator text says so (autoFixClause)
  const repair = md.generateSupplyNetwork({ modRoot: MOD, gameRoot: G, dependencyRoots: [], dryRun: true });
  ok(repair.dryRun === true && (repair.density || {}).fromLayerBelow === true && (repair.newHubs || []).map((h) => h.province).join() === plan.newHubs.map((h) => h.province).join(),
    "⭐ Auto-fix's repair (no states named) puts the same hubs as Generate land's call, chosen by the map underneath", { repair: (repair.newHubs || []).map((h) => h.province), density: repair.density, reason: repair.reason });
  const r = md.generateSupplyNetwork({ modRoot: MOD, gameRoot: G, dependencyRoots: [], stateIds: STATES.map((s) => s.id) });
  const rows = hubsOn(MOD);
  ok(r.changed === true && r.hubs === plan.newHubs.length && rows.length === plan.newHubs.length && rows.every((p) => hubProv.has(p)), "the write is exactly the dry run's hubs", { r: { hubs: r.hubs, err: r.error }, rows });
  const before = fs.readFileSync(path.join(MOD, "map", "supply_nodes.txt")), beforeRail = fs.readFileSync(path.join(MOD, "map", "railways.txt"));
  const again = md.generateSupplyNetwork({ modRoot: MOD, gameRoot: G, dependencyRoots: [], stateIds: STATES.map((s) => s.id) });
  ok(again.changed === false && fs.readFileSync(path.join(MOD, "map", "supply_nodes.txt")).equals(before) && fs.readFileSync(path.join(MOD, "map", "railways.txt")).equals(beforeRail), "⭐ a second run adds nothing: the hubs it placed count", again);
}

console.log("\n-- 7. CONTROL: with no hub below to ask, one in every state, as before --");
{
  const G0 = makeGame("game-nohubs", SPEC, { withHubFile: false });
  const p0 = md.generateSupplyNetwork({ modRoot: makeMod("mod-nohubs"), gameRoot: G0, dependencyRoots: [], stateIds: STATES.map((s) => s.id), dryRun: true });
  const h0 = new Set((p0.newHubs || []).map((h) => h.province));
  ok(STATES.every((s) => s.provinces.some((p) => h0.has(p))) && p0.newHubs.length === STATES.length && p0.density && p0.density.fromLayerBelow === false, "every state gets one, and the report says nothing below was asked", { hubs: p0.newHubs.length, density: p0.density });
}

console.log("\n-- ⭐ 8. land cut finer than the layer below's gets hubs where it is farthest from one --");
// one long rural state per country along row 1 (XXX's capital on the left, YYY's on the right), and XXX's island on row 3 with a
// port, over a layer below that hubs half its rural states and one land province in two. ⚠️ XXX's capital state A holds a port too,
// on its star: a convoy leaves from a port on the capital's land, so without it the island is reached by nothing
// (#a-hub-only-where-its-capital-reaches, supply critique commit 1 (c)) — and on the star, so it stands under A's capital hub and
// the harbour step (#a-hub-stands-on-its-pieces-harbour) adds none to the hubs replayed below.
const STRIP = [...Array(12)].map((_, k) => idAt(k + 1, 1)), ISLE = [idAt(1, 3), idAt(2, 3)];
const TS = [{ id: 1, name: "A", category: "rural", owner: "XXX", provinces: STRIP.slice(0, 6) }, { id: 2, name: "B", category: "rural", owner: "YYY", provinces: STRIP.slice(6) },
  { id: 3, name: "I", category: "rural", owner: "XXX", provinces: ISLE }];
const TG = makeGame("game-fine", [...Array(4)].map((_, k) => ({ category: "rural", provinces: 2, hubs: k < 2 ? 2 : 0 })));
{
  const TB = belowOf(TG);
  const vpFirst = TS.map((s) => ({ ...s, provinces: s.provinces }));
  const TM = makeMod("mod-fine", { states: vpFirst, land: new Set(STRIP.concat(ISLE)), urban: new Set(), ports: { I: ISLE[0], A: vpOf(TS[0]) }, capitals: { XXX: 1, YYY: 2 } });
  const tp = md.generateSupplyNetwork({ modRoot: TM, gameRoot: TG, dependencyRoots: [], stateIds: TS.map((s) => s.id), dryRun: true });
  const got = (tp.newHubs || []).map((h) => h.province);
  const served = STRIP.concat(ISLE), target = Math.round(served.length / TB.perHub);
  const byKind = Math.round(TB.rate("rural") * TS.length);
  ok(byKind === 2 && target > byKind, `(the fixture: the kinds below give ${byKind} hubs, the capitals; the land asks for ${target})`, { byKind, target, perHub: TB.perHub });
  ok(got.length === target, `⭐⭐ ${target} hubs: round(${served.length} provinces of land ÷ ${TB.perHub} a hub below)`, got);
  // replay: from the capitals' hubs (their stars), each next one on the strip province farthest from every hub, ties to the lower id
  const nb = (p) => [p - 1, p + 1].filter((q) => STRIP.includes(q));
  const caps = got.slice(0, 2), want = caps.slice();
  while (want.length < target) {
    const dist = new Map(want.map((p) => [p, 0])); let q = want.slice();
    for (let d = 1; q.length; d++) { const nx = []; for (const u of q) for (const v of nb(u)) if (!dist.has(v)) { dist.set(v, d); nx.push(v); } q = nx; }
    let pick = -1, far = 0; for (const p of STRIP.slice().sort((a, b) => a - b)) { const d = dist.get(p); if (d > far) { far = d; pick = p; } }
    if (pick < 0) break; want.push(pick);
  }
  ok(caps.includes(vpOf(TS[0])) && caps.includes(vpOf(TS[1])) && got.join() === want.join(), "⭐⭐ each added hub is on the land province farthest from every hub when it is placed, ties to the lower id", { got, want });
  ok(!got.some((p) => ISLE.includes(p)), "…and never on land no hub reaches over land — the island is the sea's (its port)", got);
  ok(tp.density && tp.density.topUp === target - 2, "the report says how many were added for area", tp.density);
  // …and land no hub may stand on is not land a hub is owed for: without its port the island is XXX's with no way in, so the
  // target counts the strip alone and its hubs are not handed to the strip instead
  const NM = makeMod("mod-fine-noport", { states: vpFirst, land: new Set(STRIP.concat(ISLE)), urban: new Set(), capitals: { XXX: 1, YYY: 2 } });
  const np = md.generateSupplyNetwork({ modRoot: NM, gameRoot: TG, dependencyRoots: [], stateIds: TS.map((s) => s.id), dryRun: true });
  const stripTarget = Math.round(STRIP.length / TB.perHub);
  ok(stripTarget !== target && (np.newHubs || []).length === stripTarget && np.density && np.density.unroutable === 1,
    `⭐ without the island's port: ${stripTarget} hubs, round(${STRIP.length} provinces of the strip ÷ ${TB.perHub}) — the island it cannot serve owes none`, { hubs: (np.newHubs || []).map((h) => h.province), density: np.density });
}

console.log("\n-- 9. what the page says is what was done --");
{
  let note = () => "(public/map.js has no generatedSupplyNote)";
  try { note = vm.runInNewContext(require("./testlib-map-page.js").lift("function generatedSupplyNote(") + "\ngeneratedSupplyNote", {}); } catch (e) { ok(false, "public/map.js has a generatedSupplyNote(res) to lift", e.message); }
  const real = md.generateSupplyNetwork({ modRoot: makeMod("mod-page"), gameRoot: G, dependencyRoots: [], stateIds: STATES.map((s) => s.id) });
  const said = note({ supplyNetwork: real }), d = real.density || {};
  ok(real.changed && d.served > 0 && said.includes(` in ${d.withHub} of ${d.served} new states`) && !/one hub per new state/.test(said) && /cannot reach by rail or by sea/.test(said),
    `⭐ with a map underneath: "${real.hubs} supply hubs in ${d.withHub} of ${d.served} new states", and the island that got none`, said);
  const G0 = makeGame("game-nohubs-page", SPEC, { withHubFile: false });
  const fallback = md.generateSupplyNetwork({ modRoot: makeMod("mod-page-fallback"), gameRoot: G0, dependencyRoots: [], stateIds: STATES.map((s) => s.id) });
  const said0 = note({ supplyNetwork: fallback });
  ok(fallback.changed && /one hub per new state/.test(said0) && !/ of \d+ new states/.test(said0), "…and with nothing underneath, one hub per new state, as it was", said0);
  ok(note({ supplyNetwork: { hubs: 0 } }) === "" && note({}) === "", "no hubs placed says nothing");
}

console.log("\n-- ⭐ 10. a kind no state below uses asks the kind that stands in for it --");
{
  // Land raised from open ocean is written `rural`, and on Millennium Dawn, MD: Damaged Continuum and Novum Vexillum no state below
  // is rural: its share comes from the kind whose building slots are nearest (#a-placeholder-state-stands-for-the-states-below), as
  // the city pass's does. Here three `metro` states (12 slots) over a layer below of city (8), rural (2) and wasteland (0) states.
  const SLOTS = { city: 8, rural: 2, wasteland: 0, metro: 12 };
  const GS = makeGame("game-standin", SPEC, { slots: SLOTS }), BS = belowOf(GS);
  const used = new Set(SPEC.map((s) => s.category));
  const stand = [...used].sort((a, b) => Math.abs(SLOTS[a] - SLOTS.metro) - Math.abs(SLOTS[b] - SLOTS.metro))[0];
  const METRO = [0, 1, 2].map((k) => ({ id: k + 1, name: `M${k + 1}`, category: "metro", owner: "XXX", provinces: MAINLAND.slice(4 * k, 4 * k + 4) }));
  const mean = SPEC.filter((s) => s.hubs).length / SPEC.length;
  ok(!used.has("metro") && stand === "city" && Math.round(BS.rate(stand) * METRO.length) !== Math.round(mean * METRO.length),
    `(the fixture: no state below is metro; city stands in for it, and its share gives a different count from every state's, ${mean.toFixed(3)})`, { stand, rate: BS.rate(stand), mean });
  const run = (game, tag) => {
    const m = makeMod(tag, { states: METRO, land: new Set(METRO.flatMap((s) => s.provinces)), urban: new Set(), capitals: { XXX: 1 } });
    const p = md.generateSupplyNetwork({ modRoot: m, gameRoot: game, dependencyRoots: [], stateIds: METRO.map((s) => s.id), dryRun: true });
    const h = new Set((p.newHubs || []).map((x) => x.province));
    return METRO.filter((s) => s.provinces.some((q) => h.has(q))).length;
  };
  const got = run(GS, "mod-standin");
  ok(got === Math.round(BS.rate(stand) * METRO.length), `⭐⭐ ${Math.round(BS.rate(stand) * METRO.length)} of the ${METRO.length} metro states hold a hub — city's share below, not every state's`, got);
  const G0 = makeGame("game-standin-noslots", SPEC);
  const got0 = run(G0, "mod-standin-noslots");
  ok(got0 === Math.max(1, Math.round(mean * METRO.length)), `CONTROL: with no building slots to say which kind stands in, every state's share, ${Math.round(mean * METRO.length)} (the capital counted)`, got0);
}

console.log("\n-- ⭐ 11. a small world: what Generate land leaves there is the base game's shape, and no rule calls it a gap --");
{
  // ⛔ #a-small-world-needs-no-railway (review H1, 10-07). Over this layer below, which hubs a quarter of its rural states, a country
  // of three rural states gets ONE hub, its capital's, and no railway — the base game's own shape (5 of vanilla's 9 three-state
  // countries hold one hub; 118 of its 119 pieces of land holding one hub or none carry no railway) — and a lone ownerless rural state
  // gets none. Then railways_empty, and with no hub supply_nodes_empty, offered an Auto-fix that wrote nothing and said "the land here
  // was not made that way". So every reported row is held to the click itself: autoFix is true exactly where the click writes.
  // Auto-fix's call is read out of autoFixMap, not assumed, so this cannot drift from the click it models.
  const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
  const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"), masked = maskJsComments(src);
  const at = masked.indexOf("function autoFixMap(");
  const body = at < 0 ? null : jsBodyAt(maskJsLiterals(src), at);
  const calls = body ? [...masked.slice(body[0], body[1]).matchAll(/generateSupplyNetwork\(([^)]*)\)/g)].map((m) => m[1].replace(/\s+/g, " ").trim()) : [];
  ok(calls.length === 1 && calls[0] === "{ modRoot, gameRoot, dependencyRoots }", "(Auto-fix's supply step, read out of autoFixMap: one call, naming no states)", calls);
  const RULES = { supply_nodes_empty: "supply_nodes.txt", railways_empty: "railways.txt" };
  const fired = (m) => md.validateMapBitmap({ modRoot: m, gameRoot: G, dependencyRoots: [] }).filter((p) => RULES[p.rule]);
  /** the validator's two rows, then the click's own supply step for real, then the validator again */
  const click = (m) => {
    const before = fired(m);
    const read = () => Object.fromEntries(Object.values(RULES).map((f) => [f, fs.readFileSync(path.join(m, "map", f), "utf8")]));
    const was = read(), r = md.generateSupplyNetwork({ modRoot: m, gameRoot: G, dependencyRoots: [] }), now = read();
    return { before, r, wrote: Object.fromEntries(Object.entries(RULES).map(([rule, f]) => [rule, was[f] !== now[f]])), after: fired(m) };
  };
  const offerIsTheClick = (c) => c.before.every((p) => p.autoFix === c.wrote[p.rule]);
  // a strip of row 1, two provinces a state; the states are made by `owners`
  const STRIP2 = [...Array(6)].map((_, k) => idAt(k + 1, 1));
  const world = (tag, owners) => {
    const states = owners.map((owner, k) => ({ id: k + 1, name: `T${k + 1}`, category: "rural", owner, provinces: STRIP2.slice(2 * k, 2 * k + 2) }));
    const m = makeMod(tag, { states, land: new Set(states.flatMap((s) => s.provinces)), urban: new Set(), capitals: owners.some(Boolean) ? { XXX: 1 } : {} });
    return { m, states, gen: md.generateSupplyNetwork({ modRoot: m, gameRoot: G, dependencyRoots: [], stateIds: states.map((s) => s.id) }) };
  };
  const rails = (m) => fs.readFileSync(path.join(m, "map", "railways.txt"), "utf8").split(/\r?\n/).filter((l) => l.trim()).length;

  // A. one country, three rural states
  const one = world("mod-small", ["XXX", "XXX", "XXX"]);
  const wantOne = Math.max(1, Math.round(B.rate("rural") * 3));   // the capital, counted in its kind's share
  ok(wantOne === 1, `(the fixture: round(${B.rate("rural")} × 3 rural states) with the capital counted is ${wantOne} hub, on the one piece of land — nothing for a railway to join)`);
  ok(one.gen.hubs === wantOne && hubsOn(one.m).length === wantOne && one.gen.railways === 0 && rails(one.m) === 0, `Generate land's call: ${wantOne} hub and no railway`, one.gen);
  const c1 = click(one.m);
  ok(c1.before.length === 0, "⭐⭐ neither rule reports it: an empty railways.txt under one hub is what the generator — and the base game — leave", c1.before.map((p) => [p.rule, p.autoFix]));
  ok(!c1.wrote.supply_nodes_empty && !c1.wrote.railways_empty && c1.after.length === 0, "…and the click, which nothing offered, writes nothing", c1.r);

  // B. one ownerless rural state: the map underneath hubs none
  const nob = world("mod-nobody-1", [""]);
  ok(Math.round(B.rate("rural") * 1) === 0, "(the fixture: round(share × 1) with no capital is no hub)");
  ok(nob.gen.changed === false && nob.gen.hubs === 0 && hubsOn(nob.m).length === 0, "Generate land's call: no hub", nob.gen);
  ok(!/every state already has a hub/.test(String(nob.gen.reason)) && /map underneath would hub none/.test(String(nob.gen.reason)),
    "⭐ …and its reason says the map underneath hubs none of it, not that every state already has one", nob.gen.reason);
  const c2 = click(nob.m);
  ok(c2.before.length === 0, "⭐⭐ neither rule reports the empty files: the click would hub none of these states either", c2.before.map((p) => [p.rule, p.autoFix]));
  ok(!c2.wrote.supply_nodes_empty && !c2.wrote.railways_empty && !/every state already has a hub/.test(String(c2.r.reason)), "…the click writes nothing, and says why truly", c2.r);

  // C. three ownerless rural states: one hub, no railway
  const nob3 = world("mod-nobody-3", ["", "", ""]);
  ok(nob3.gen.hubs === Math.round(B.rate("rural") * 3) && nob3.gen.railways === 0, `Generate land's call: ${Math.round(B.rate("rural") * 3)} hub, no railway`, nob3.gen);
  const c3 = click(nob3.m);
  ok(c3.before.length === 0 && c3.after.length === 0, "⭐⭐ railways_empty is not reported over a lone hub", c3.before.map((p) => [p.rule, p.autoFix]));

  // D. CONTROL — a world the click DOES fill: this file's own sixteen states, both files empty
  const blank = makeMod("mod-blank-files");
  const c4 = click(blank);
  ok(c4.before.length === 2 && c4.before.every((p) => p.autoFix === true && /Auto-fix will put them back/.test(p.message)), "CONTROL: with hubs the click would place, both rules report and offer the button", c4.before.map((p) => [p.rule, p.autoFix]));
  ok(c4.wrote.supply_nodes_empty && c4.wrote.railways_empty && c4.after.length === 0, "…and the click writes both files, and both rows are gone", c4.r);
  ok(offerIsTheClick(c4), "⭐ every row's autoFix is what the click then wrote");

  // E. CONTROL — hubs a railway WOULD join, placed by hand: reported, but the click never lays track between hubs already placed
  const hand = world("mod-hand-hubs", ["XXX", "XXX", "XXX"]);
  const handHubs = [vpOf(hand.states[0]), vpOf(hand.states[2])];
  fs.writeFileSync(path.join(hand.m, "map", "supply_nodes.txt"), handHubs.map((p) => `1 ${p}`).join("\n") + "\n");
  fs.writeFileSync(path.join(hand.m, "map", "railways.txt"), "");
  const c5 = click(hand.m);
  const r5 = c5.before.find((p) => p.rule === "railways_empty");
  const join = handHubs.length - 1;   // two hubs on one piece of land: one railway joins them
  ok(c5.before.length === 1 && !!r5, "CONTROL: two hubs on one piece of land and no railway — railways_empty IS reported", c5.before.map((p) => p.rule));
  ok(!!r5 && r5.autoFix === false && /Auto-fix leaves it alone/.test(r5.message) && !/will put them back/.test(r5.message), "⭐⭐ …with no button, because the click lays railways only with the hubs it places", r5 && { autoFix: r5.autoFix, msg: r5.message.slice(r5.message.indexOf("Auto-fix"), r5.message.indexOf("Auto-fix") + 200) });
  ok(!!r5 && r5.message.includes(`${join} railway would join the ones here`), `…and it says how many railways would join them (${join})`, r5 && r5.message.slice(r5.message.indexOf("Auto-fix"), r5.message.indexOf("Auto-fix") + 200));
  ok(!c5.wrote.railways_empty && !c5.wrote.supply_nodes_empty && offerIsTheClick(c5), "…and the click indeed writes nothing", c5.r);
  ok([c1, c2, c3, c4, c5].every(offerIsTheClick), "⭐⭐⭐ in all five worlds, no row offers a click that does not write");

  // F. owning every state is not the click writing: the game's own folder opened as the mod is all "its own", and the click refuses it
  const self = makeMod("mod-the-game-itself");
  const selfFired = md.validateMapBitmap({ modRoot: self, gameRoot: self, dependencyRoots: [] }).filter((p) => RULES[p.rule]);
  const selfClick = md.generateSupplyNetwork({ modRoot: self, gameRoot: self, dependencyRoots: [] });
  ok(selfClick.changed === false && !!selfClick.error && fs.readFileSync(path.join(self, "map", "supply_nodes.txt"), "utf8") === "", "(the fixture: the click refuses the game's own folder and writes nothing)", selfClick);
  ok(selfFired.length === 2 && selfFired.every((p) => p.autoFix === false && /Auto-fix leaves it alone/.test(p.message)),
    "⭐⭐ …so both rows are still reported, with no button, and say the click leaves them", selfFired.map((p) => [p.rule, p.autoFix, p.message.slice(p.message.indexOf("Auto-fix"), p.message.indexOf("Auto-fix") + 90)]));
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
