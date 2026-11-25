// ⛔ #a-generated-world-keeps-every-country-below — EVERY COUNTRY THAT HELD LAND BELOW HOLDS LAND IN THE WORLD BUILT OVER IT.
//
// TEST 32 (the owner's flow: New mod → Delete map → Generate land 35% seed 1, inherit → Auto-fix → Redraw regions) came out with
// 60 of the base game's 90 state-owning countries. 27 of the 30 missing had not one province raised — landmasses grow whole — and
// a drowned inland country never wins the proximity contest, because its neighbours' drowned land walls it in. Their whole 1936
// start loaded for countries the game then never created.
//
// This test pins:
//   1. keepEveryCountryBelow as a PURE function — the nearest group, a capital never taken, the donor floor (a donor keeps at least
//      half its groups), the guard for land the mod already dealt with, the fromHome tie-break, no graph → nothing invented, more
//      needy countries than groups, and an answer that does not depend on input order; and ownerFactsForGeneration, which feeds it.
//   2. generateLand end to end over a lattice whose DDD is an inland, region-less block AAA walls in, so its land can never rise:
//      every country below owns a state on disk, DDD's is the nearest one a neighbour could spare, the ownership report counts the
//      world written, "single" and "none" hand nothing over, `keepEveryCountry: false` reaches the old world, and Auto-fix then
//      writes no country file.
//   3. the page says it: generatedCountriesNote, lifted out of public/map.js and run — and it says the cost too: a kept country
//      loads its order of battle, which stands on the drowned land (over vanilla the 30 kept start 664 divisions there, and
//      Auto-fix's moves copy 65 more base-game unit files into the mod).
//
// Fixture-only: binds no port. Run: node test-a-generated-world-keeps-every-country-below.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!cond) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-keep-countries-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
process.env.HOI4_MODS_ROOT = SANDBOX;
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
const adjOf = (edges) => {
  const adj = new Map();
  const add = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
  for (const [a, b] of edges) { add(a, b); add(b, a); }
  return adj;
};
const facts = (pairs) => new Map(pairs.map(([p, owner]) => [p, { owner }]));

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("=== 1. keepEveryCountryBelow and ownerFactsForGeneration, as pure functions ===");
rec("map-data.js exports keepEveryCountryBelow and ownerFactsForGeneration",
  typeof md.keepEveryCountryBelow === "function" && typeof md.ownerFactsForGeneration === "function");
if (typeof md.keepEveryCountryBelow === "function" && typeof md.ownerFactsForGeneration === "function") {
  // (a) NEAREST, AND NEVER A CAPITAL. N held province 1; the only group one step away is D's capital, the next is two away.
  {
    const groups = [{ id: 10, provinces: [2] }, { id: 11, provinces: [3] }, { id: 12, provinces: [5] }];
    const ownerOf = new Map([[10, "DDD"], [11, "DDD"], [12, "DDD"]]);
    const r = md.keepEveryCountryBelow({ groups, facts: facts([[1, "NNN"], [2, "DDD"], [3, "DDD"], [5, "DDD"]]),
      adj: adjOf([[1, 2], [2, 3]]), ownerOf, protect: new Set([10]) });
    rec("the fixture: the group one step from N's land is D's capital, and the next is two steps away", true);
    rec("⭐⭐⭐ a country with no group takes the nearest one a neighbour can spare — never that neighbour's capital",
      r.kept.length === 1 && r.kept[0].tag === "NNN" && r.kept[0].state === 11 && r.kept[0].hops === 2 && ownerOf.get(10) === "DDD",
      { kept: r.kept, capitalOwner: ownerOf.get(10) });
  }
  // (b) THE FLOOR. X holds 3 groups (one its capital), two needy countries each have one of X's at one step, and Y (10 groups)
  // has one four steps away. X may give one and keep ceil(3/2) = 2; the second needy country goes on to Y's.
  {
    const groups = [{ id: 1, provinces: [11] }, { id: 2, provinces: [12] }, { id: 3, provinces: [13] }];
    const ownerOf = new Map([[1, "XXX"], [2, "XXX"], [3, "XXX"]]);
    const pairs = [[11, "XXX"], [12, "XXX"], [13, "XXX"], [21, "NNA"], [22, "NNB"]];
    for (let i = 0; i < 10; i++) { groups.push({ id: 100 + i, provinces: [31 + i] }); ownerOf.set(100 + i, "YYY"); pairs.push([31 + i, "YYY"]); }
    const edges = [[21, 11], [22, 12], [21, 51], [22, 51], [51, 52], [52, 53], [53, 31]];
    const r = md.keepEveryCountryBelow({ groups, facts: facts(pairs), adj: adjOf(edges), ownerOf, protect: new Set([3, 109]) });
    const xKeeps = groups.filter((g) => ownerOf.get(g.id) === "XXX").length;
    const nnb = r.kept.find((k) => k.tag === "NNB");
    rec("⭐⭐⭐ THE FLOOR: a donor of 3 keeps 2 — the second country at one step goes on to the next donor that can spare one",
      xKeeps === Math.ceil(3 / 2) && !!nnb && nnb.state === 100 && nnb.hops === 4 && nnb.from === "YYY",
      { xKeeps, kept: r.kept, heldByFloor: r.heldByFloor });
    rec("…and the refusal is counted", r.heldByFloor >= 1, r.heldByFloor);
    rec("…and nobody is left out by it", r.stillGone.length === 0, r.stillGone);
  }
  // (c) THE GUARD. G held province 61, which a state that loads now holds — the mod dealt with that land itself.
  {
    const groups = [{ id: 1, provinces: [62] }, { id: 2, provinces: [63] }, { id: 3, provinces: [64] }];
    const ownerOf = new Map([[1, "WWW"], [2, "WWW"], [3, "WWW"]]);
    const f = facts([[61, "GGG"], [62, "WWW"], [63, "WWW"], [64, "WWW"]]);
    const adj = adjOf([[61, 62], [62, 63], [63, 64]]);
    const guarded = md.keepEveryCountryBelow({ groups, facts: f, adj, ownerOf: new Map(ownerOf), protect: new Set([3]), loadedProvinces: new Set([61]) });
    const unguarded = md.keepEveryCountryBelow({ groups, facts: f, adj, ownerOf: new Map(ownerOf), protect: new Set([3]) });
    rec("CONTROL: with nothing loading on G's land, G is kept", unguarded.kept.some((k) => k.tag === "GGG"), unguarded.kept);
    rec("⭐⭐⭐ a country whose land below a state that loads now holds is the mod's answer — never handed a state, never listed as gone",
      guarded.kept.length === 0 && guarded.stillGone.length === 0, guarded);
  }
  // (d) THE TIE: two groups at one step, one of them the donor's own land below and one not. The one it never held goes.
  {
    const groups = [{ id: 1, provinces: [72] }, { id: 2, provinces: [73] }, { id: 3, provinces: [74] }];
    const ownerOf = new Map([[1, "QQQ"], [2, "QQQ"], [3, "QQQ"]]);
    const r = md.keepEveryCountryBelow({ groups, facts: facts([[71, "NNN"], [72, "QQQ"], [74, "QQQ"]]),   // 73 was open ocean below
      adj: adjOf([[71, 72], [71, 73]]), ownerOf, protect: new Set([3]) });
    rec("⭐⭐ at equal steps the group holding fewer of its owner's own provinces below goes — not the donor's homeland",
      r.kept.length === 1 && r.kept[0].state === 2 && r.kept[0].fromHome === 0, r.kept);
  }
  // (e)–(g) who is needy, and what happens without a graph or without enough groups
  {
    const groups = [{ id: 1, provinces: [2] }, { id: 2, provinces: [3] }, { id: 3, provinces: [4] }];
    const base = () => new Map([[1, "DDD"], [2, "DDD"], [3, "DDD"]]);
    const f = facts([[1, "AAA"], [2, "DDD"], [3, "DDD"], [4, "DDD"], [5, "BBB"], [6, "CCC"]]);
    const adj = adjOf([[1, 2], [2, 3], [3, 4], [5, 4], [6, 4]]);
    const owning = md.keepEveryCountryBelow({ groups, facts: f, adj, ownerOf: base(), protect: new Set([3]), alreadyOwning: new Set(["AAA", "BBB", "CCC"]) });
    rec("⭐⭐ a country that holds a state the mod already has is never given one", owning.kept.length === 0 && owning.stillGone.length === 0, owning);
    const blind = md.keepEveryCountryBelow({ groups, facts: f, adj: null, ownerOf: base(), protect: new Set([3]) });
    rec("⭐⭐ with no province graph nothing is invented — every needy country is said to be gone",
      blind.kept.length === 0 && JSON.stringify(blind.stillGone) === JSON.stringify(["AAA", "BBB", "CCC"]), blind);
    const short = md.keepEveryCountryBelow({ groups, facts: f, adj, ownerOf: base(), protect: new Set([3]) });
    // D holds 3 and keeps ceil(3/2) = 2, so exactly one group is spare: the nearest pair takes it and the other two are gone
    rec("⭐ more needy countries than groups to spare: the rest are listed as gone, exactly",
      short.kept.length === 1 && short.kept[0].tag === "AAA" && JSON.stringify(short.stillGone) === JSON.stringify(["BBB", "CCC"]), short);
  }
  // (h) ORDER-FREE: the same world handed over in another order gives the same answer.
  {
    const mkWorld = (rev) => {
      const groups = [{ id: 1, provinces: [11] }, { id: 2, provinces: [12] }, { id: 3, provinces: [13] }, { id: 4, provinces: [14] }];
      const pairs = [[11, "XXX"], [12, "XXX"], [13, "XXX"], [14, "XXX"], [21, "NNA"], [22, "NNB"]];
      const edges = [[21, 11], [21, 12], [22, 12], [22, 13], [11, 12], [12, 13], [13, 14]];
      const g = rev ? groups.slice().reverse() : groups, p = rev ? pairs.slice().reverse() : pairs;
      const ownerOf = new Map(g.map((x) => [x.id, "XXX"]));
      const r = md.keepEveryCountryBelow({ groups: g, facts: facts(p), adj: adjOf(rev ? edges.slice().reverse() : edges), ownerOf, protect: new Set([4]) });
      return JSON.stringify(r);
    };
    rec("⭐ the answer does not depend on the order the groups, the facts or the graph were handed over", mkWorld(false) === mkWorld(true), [mkWorld(false), mkWorld(true)]);
  }
  // ownerFactsForGeneration: as the world loads now, else below; a removed country maps to whoever took its land, or nobody
  {
    const beneath = new Map([[1, { owner: "AAA", manpowerPerProvince: 5 }], [2, { owner: "BBB" }], [3, { owner: "CCC" }], [4, { owner: "EEE" }]]);
    const out = md.ownerFactsForGeneration({ beneath, loadedStates: [{ id: 7, owner: "BBB", provinces: [3, 9] }],
      removed: [{ tag: "AAA", reassignedTo: "BBB" }, { tag: "EEE", reassignedTo: null }] });
    rec("⭐⭐ a province a state that loads now holds is that state's owner's, not the owner below", out.get(3).owner === "BBB", out.get(3));
    rec("⭐⭐ a removed country stands for whoever its land was reassigned to…", out.get(1).owner === "BBB" && out.get(1).manpowerPerProvince === 5, out.get(1));
    rec("…or for nobody", out.get(4).owner === "", out.get(4));
    rec("…the rest is the layer below, untouched", out.get(2).owner === "BBB" && beneath.get(1).owner === "AAA", { out2: out.get(2), below1: beneath.get(1) });
    rec("…and land only the layer that loads now holds is known too", out.has(9) && out.get(9).owner === "BBB", out.get(9));
    const same = md.ownerFactsForGeneration({ beneath });
    rec("CONTROL: with nothing loading and nothing removed it says what the layer below says",
      [...beneath].every(([p, f]) => same.get(p).owner === f.owner) && same.size === beneath.size);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE FIXTURE: a 24 x 16 lattice of one-pixel provinces. Below: AAA x<5, BBB 5..9, CCC 10..11, open ocean from x 12, and DDD an
// inland block (x 2..3, y 6..9) inside AAA's land whose provinces are in NO strategic region, so Generate land can never raise them.
// Every country has a capital line (BOM, CRLF, a trailing comment) naming its first state, worth VP 20. The mod is Delete map's
// world: every province sea, replace_path="history/states".
const W = 24, H = 16, N = W * H;
const idAt = (x, y) => y * W + x + 1, xOf = (id) => (id - 1) % W, yOf = (id) => Math.floor((id - 1) / W);
const colourOf = (id) => [id & 255, (id >> 8) & 255, 61];
const tagBelow = (id) => { const x = xOf(id), y = yOf(id); if (x >= 2 && x <= 3 && y >= 6 && y <= 9) return "DDD"; return x < 5 ? "AAA" : x < 10 ? "BBB" : x < 12 ? "CCC" : ""; };
const regionOf = (id) => (tagBelow(id) === "DDD" ? 0 : Math.floor(xOf(id) / 6) + 4 * Math.floor(yOf(id) / 8) + 1);
function defRows(blank) {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= N; id++) { const [r, g, b] = colourOf(id); rows.push(!blank && tagBelow(id) ? `${id};${r};${g};${b};land;false;plains;1` : `${id};${r};${g};${b};sea;false;ocean;0`); }
  return rows.join("\r\n") + "\r\n";
}
let BASE = null;
const TAGS_BELOW = new Set();
function makeBase() {
  const base = fs.mkdtempSync(path.join(SANDBOX, "base-"));
  mk(path.join(base, "map", "definition.csv"), defRows(false));
  mk(path.join(base, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(idAt(x, y))));
  const byRegion = new Map();
  for (let id = 1; id <= N; id++) { const r = regionOf(id); if (!r) continue; if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r).push(id); }
  for (const [r, p] of byRegion) mk(path.join(base, "map", "strategicregions", `r${r}.txt`), `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${p.join(" ")} }\n\tweather={}\n}\n`);
  mk(path.join(base, "common", "state_category", "00_default.txt"), "state_categories = {\n\ttown = { local_building_slots = 4 }\n\trural = { local_building_slots = 2 }\n}\n");
  const byKey = new Map();
  for (let id = 1; id <= N; id++) { const t = tagBelow(id); if (!t) continue; const k = `${t}|${Math.floor(yOf(id) / 4)}`; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(id); }
  let sid = 1; const capOf = {};
  for (const [k, p] of [...byKey].sort()) {
    const t = k.split("|")[0];
    if (!capOf[t]) capOf[t] = sid;
    TAGS_BELOW.add(t);
    const vp = capOf[t] === sid ? `\t\tvictory_points = { ${p[0]} 20 }\n` : "";
    mk(path.join(base, "history", "states", `${sid}-STATE_${sid}.txt`), `state = {\n\tid = ${sid}\n\tname = "STATE_${sid}"\n\tmanpower = ${1000 * p.length}\n\tstate_category = town\n\tprovinces = { ${p.join(" ")} }\n\thistory = {\n\t\towner = ${t}\n\t\tadd_core_of = ${t}\n${vp}\t}\n}\n`);
    sid++;
  }
  for (const t of Object.keys(capOf)) mk(path.join(base, "history", "countries", `${t} - Land of ${t}.txt`), `﻿capital = ${capOf[t]} # home\r\noob = "${t}_1936"\r\n`);
  return base;
}
function makeMod() {
  const mod = fs.mkdtempSync(path.join(SANDBOX, "mod-"));
  mk(path.join(mod, "descriptor.mod"), 'name="Kept"\nreplace_path="history/states"\n');
  mk(path.join(mod, "map", "definition.csv"), defRows(true));
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(idAt(x, y))));
  return mod;
}
function statesOnDisk(mod) {
  const dir = path.join(mod, "history", "states");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).map((f) => {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    return { id: +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1], owner: ((/owner\s*=\s*([A-Za-z0-9_]+)/.exec(t) || [])[1]) || "",
      provinces: ((((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1]) || "").match(/\d+/g) || []).map(Number) };
  });
}
const countryFilesIn = (mod) => { const d = path.join(mod, "history", "countries"); return fs.existsSync(d) ? fs.readdirSync(d).sort() : []; };
const eligibleOf = (mod) => fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/).filter((l) => /;sea;/.test(l) && regionOf(+l.split(";")[0])).length;
const GEN = (mod, extra) => Object.assign({ modRoot: mod, gameRoot: BASE, dependencyRoots: [], count: eligibleOf(mod), seed: 3, provincesPerState: 6 }, extra || {});

console.log("\n=== 2. generateLand: every country below keeps a state ===");
BASE = makeBase();
let keptResult = null;
{
  const mod = makeMod();
  const r = md.generateLand(GEN(mod));
  keptResult = r;
  rec("generate land ran", r.changed === true && r.createdStates > 4, { changed: r.changed, states: r.createdStates, error: r.error });
  rec("the fixture: DDD's land is in no strategic region, so none of it could rise",
    statesOnDisk(mod).every((s) => s.provinces.every((p) => tagBelow(p) !== "DDD")), [...TAGS_BELOW].sort());
  const st = statesOnDisk(mod);
  const owners = new Set(st.map((s) => s.owner).filter(Boolean));
  rec("⭐⭐⭐ EVERY country that held a state below holds one on disk (the tags read off the layer below's state files)",
    [...TAGS_BELOW].every((t) => owners.has(t)), { below: [...TAGS_BELOW].sort(), onDisk: [...owners].sort() });
  rec("…and nothing is invented", [...owners].every((t) => TAGS_BELOW.has(t)), [...owners].sort());
  const ddd = st.filter((s) => s.owner === "DDD");
  rec("⭐⭐ DDD holds exactly one state, kept by the nearest-land pass — and the report names the id it was written under",
    ddd.length === 1 && ((r.countries || {}).kept || []).some((k) => k.tag === "DDD" && k.state === ddd[0].id), { ddd: ddd.map((s) => s.id), kept: (r.countries || {}).kept });
  // the nearest a neighbour could spare, measured by an independent BFS over the province graph, the capitals left out
  const model = md.buildMapModel({ modRoot: mod, gameRoot: BASE, dependencyRoots: [], cacheStableLayers: false });
  const adj = md.provinceNeighbourGraph({ modRoot: mod, gameRoot: BASE, dependencyRoots: [], model });
  const capitals = new Set(Object.values(model.capitals || {}));
  const stateOf = new Map(); for (const s of st) for (const p of s.provinces) stateOf.set(p, s);
  const hopsTo = new Map();
  let front = []; const seen = new Set();
  for (let id = 1; id <= N; id++) if (tagBelow(id) === "DDD") { front.push(id); seen.add(id); }
  for (let d = 0; front.length; d++) {
    const next = [];
    for (const p of front) { const s = stateOf.get(p); if (s && !hopsTo.has(s.id)) hopsTo.set(s.id, d); for (const q of (adj.get(p) || [])) if (!seen.has(q)) { seen.add(q); next.push(q); } }
    front = next;
  }
  const minSpare = Math.min(...[...hopsTo].filter(([sid]) => !capitals.has(sid) || ddd.some((s) => s.id === sid)).map(([, d]) => d));
  rec("⭐⭐ …and it is the nearest state that was not a capital (an independent BFS from DDD's land)",
    ddd.length === 1 && hopsTo.get(ddd[0].id) === minSpare, { dddState: ddd[0] && ddd[0].id, hops: ddd[0] && hopsTo.get(ddd[0].id), minSpare });
  rec("⭐⭐ the ownership report describes the world WRITTEN — its country count is the distinct owners on disk",
    r.ownership.countries === owners.size && r.ownership.keptByNearest === ((r.countries || {}).kept || []).length, { reported: r.ownership.countries, onDisk: owners.size, keptByNearest: r.ownership.keptByNearest });
  rec("…and no country was left off this map", ((r.countries || {}).stillGone || []).length === 0, (r.countries || {}).stillGone);
  const capOwner = Object.entries(model.capitals || {}).filter(([t]) => owners.has(t)).map(([t, sid]) => [t, (st.find((s) => s.id === sid) || {}).owner]);
  rec("⭐⭐ every country's capital line names a state it owns on disk — no capital was taken from its country",
    capOwner.length === owners.size && capOwner.every(([t, o]) => t === o), capOwner);
  rec("⭐⭐ …and not one country file was written to make that true", countryFilesIn(mod).length === 0, countryFilesIn(mod));
  const fixed = md.autoFixMap({ modRoot: mod, gameRoot: BASE, dependencyRoots: [] });
  rec("⭐⭐ Auto-fix afterwards re-points no capital and writes no country file",
    ((fixed.fixes || {}).capitals || {}).fixed === 0 && countryFilesIn(mod).length === 0, { capitals: (fixed.fixes || {}).capitals, files: countryFilesIn(mod) });
}
{
  const mod = makeMod();
  const r = md.generateLand(GEN(mod, { keepEveryCountry: false }));
  const owners = new Set(statesOnDisk(mod).map((s) => s.owner).filter(Boolean));
  rec("⭐⭐ keepEveryCountry: false reaches the old world — DDD is left off, and the report keeps nobody",
    !owners.has("DDD") && ((r.countries || {}).kept || []).length === 0 && owners.size === TAGS_BELOW.size - 1, { owners: [...owners].sort(), kept: (r.countries || {}).kept });
}
{
  const single = makeMod();
  const r = md.generateLand(GEN(single, { owner: "ZZZ" }));
  const st = statesOnDisk(single);
  rec("⭐ \"single\" hands nothing over: every state is the one tag's", st.length > 0 && st.every((s) => s.owner === "ZZZ") && ((r.countries || {}).kept || []).length === 0, { other: st.filter((s) => s.owner !== "ZZZ").length });
  const none = makeMod();
  const r2 = md.generateLand(GEN(none, { ownerMode: "none" }));
  const st2 = statesOnDisk(none);
  rec("⭐ \"none\" hands nothing over: no state has an owner", st2.length > 0 && st2.every((s) => !s.owner) && ((r2.countries || {}).kept || []).length === 0, { owned: st2.filter((s) => s.owner).length });
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 3. the page says it ===");
{
  const { maskJsLiterals, jsBodyAt, stripJsComments } = require("./testlib-strip-comments.js");
  const PAGE = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"), MASKED = maskJsLiterals(PAGE);
  const at = MASKED.indexOf("function generatedCountriesNote("), body = at < 0 ? null : jsBodyAt(MASKED, at);
  rec("public/map.js has generatedCountriesNote", !!body);
  const note = body ? require("vm").runInNewContext("(" + PAGE.slice(at, body[1] + 1) + ")") : () => "";
  const said = note(keptResult);
  const k = ((keptResult.countries || {}).kept || [])[0] || {};
  rec("⭐⭐ a hand-over is said, naming who took land from whom", said.includes(`${k.tag} from ${k.from}`) && /nearest/.test(said), said);
  const ARMIES = /army or fleet[^.]*under the sea: Auto-fix moves[^.]*order-of-battle file[^.]*into your mod/;
  rec("⭐⭐ …and what it costs: the armies of a kept country start under the sea, and Auto-fix moves them and copies their files into the mod",
    ARMIES.test(said), said);
  const gone = note({ countries: { kept: [], stillGone: ["HUN", "ROM"], capitals: {} } });
  rec("CONTROL: with nobody kept, no army is spoken of", !ARMIES.test(gone) && !/order-of-battle/.test(gone), gone);
  rec("⭐⭐⭐ a country that could not be kept is WARNED about, by name", /⚠/.test(gone) && gone.includes("HUN") && gone.includes("ROM") && /not on this map/.test(gone), gone);
  rec("CONTROL: nothing to say says nothing", note({ countries: { kept: [], stillGone: [], capitals: {} } }) === "" && note({}) === "" && note(null) === "");
  rec("…and a capital that could not be settled is said with its reason", /⚠/.test(note({ countries: { error: "boom" } })) && note({ countries: { error: "boom" } }).includes("boom"));
  // The click's success line is the LAST reload before its .catch: the first one after the POST is a click that stopped
  // part-way (#a-click-that-stopped-part-way-said-nothing-changed), which kept no country to report
  const handler = stripJsComments(PAGE), post = handler.indexOf('fetch("/api/map/generate-land"');
  const caught = post < 0 ? -1 : handler.indexOf(".catch(", post), done = caught < 0 ? -1 : handler.lastIndexOf("reloadAfterImmediateWrite(", caught);
  // ⚠️ MOVED WITH 🌍 Generate a world: the handler hands generatedLandResultNote(res) to the reload, and the notes are built in that
  // function (the world shows the same words for its own Generate land step) — so the report is read through it (testlib-map-page.js)
  const line = require("./testlib-map-page.js").generateLandReportLine(handler);
  rec("⭐⭐ the Generate land report on the page carries it", /=\s*generatedCountriesNote\(res\)/.test(line) && /\$\{countriesNote\}/.test(line.slice(line.lastIndexOf("reloadAfterImmediateWrite("))), line.slice(-200));
}

try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}   // scratch fixtures only — never a mod directory (⛔ CLAUDE.md #1)
console.log("\n" + (fails.length ? "FAILED " + fails.length + " of " + checks : "PASSED " + checks + " checks"));
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
