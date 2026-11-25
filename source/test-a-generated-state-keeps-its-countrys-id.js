// ⛔ #a-generated-state-keeps-its-countrys-id / #a-raised-province-keeps-its-continent — WHICH ID A GENERATED STATE IS WRITTEN WITH,
// WHAT IT CARRIES FROM THE STATE BELOW THAT HAD THAT ID, AND WHICH CONTINENT ITS LAND HAD BELOW.
//
// Generate land keeps the base game's 1,081 state ids but numbered its states in the order it cut them, so on the owner's TEST 34
// 106 of 1,081 ids kept their 1936 owner, 30,652 of 34,564 trigger references named another country's state, the Spanish Civil War
// spared five other countries' states instead of Spain's, 389 of 409 `release` effects named a country with no core anywhere, and
// every land province sat on continent 1 (europe). The ids are a permutation the capital pins already start; this test pins the
// rest of it as PURE functions, every expectation derived from the inputs or from the installed game's own files, never typed:
//   1. maximumWeightAssignment equals brute force on random instances whose weights carry tier-sized units;
//   2. chooseGeneratedStateIds on random worlds: a permutation of lo..hi, every pin where it was, each country takes as many of its
//      own ids as it can (min of its free groups and its free ids), a short country keeps the ids its own start history names
//      first and then the most-named ones, and the answer does not change on a second call;
//   3. carriedCoresAndClaims over every case: same country → all its 1936 cores and claims; another → only the cores of landless
//      tags, and only from half its land; never the owner itself, never a removed tag;
//   4. over the installed game: stateIdScriptNamings marks each id a country's own history file TESTS inside a limit (the `state = <id>`
//      of Spain's garrison list among them) with that file's tag, and no id it only opens a block on, though the weight counts those
//      (#a-start-history-is-what-a-country-tests); startIdentitiesBeneath reads exactly the UNDATED top-level
//      add_core_of / add_claim_by of each state file, compared against an independent brace-depth scan;
//   5. continentsOfTheLandBelow: same id + same colour + land below → its continent; a piece → its parent's; another colour, sea
//      below, no continent, or the mod itself as "below" → nothing; and continentsFromNeighbouringLand keeps a seed over the vote.
//
// Fixture-only: binds no port. Run: node test-a-generated-state-keeps-its-countrys-id.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!cond) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-state-keeps-id-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

let seed = 20261020;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const ri = (n) => Math.floor(rnd() * n);

// ── 1. the assignment ────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const brute = (W, n) => {
    let best = -1; const perm = [...Array(n).keys()];
    const go = (k) => {
      if (k === n) { let s = 0; for (let i = 0; i < n; i++) s += W[i * n + perm[i]]; if (s > best) best = s; return; }
      for (let i = k; i < n; i++) { [perm[k], perm[i]] = [perm[i], perm[k]]; go(k + 1); [perm[k], perm[i]] = [perm[i], perm[k]]; }
    };
    go(0); return best;
  };
  let bad = 0, notPerm = 0;
  for (let t = 0; t < 300; t++) {
    const n = 1 + ri(7), W = new Float64Array(n * n);
    for (let k = 0; k < W.length; k++) W[k] = rnd() < 0.4 ? 0 : ri(20) * (rnd() < 0.3 ? 2 ** 30 : 1);
    const a = md.maximumWeightAssignment(W, n);
    if (new Set(a).size !== n) notPerm++;
    let s = 0; for (let i = 0; i < n; i++) s += W[i * n + a[i]];
    if (s !== brute(W, n)) bad++;
  }
  rec("maximumWeightAssignment: a permutation on 300 random instances", notPerm === 0, { notPerm });
  rec("maximumWeightAssignment: the brute-force optimum on all 300 (tier units of 2^30 included)", bad === 0, { bad });
}

// ── 2. the renumbering ───────────────────────────────────────────────────────────────────────────────────────────────────────────
function randomWorld() {
  const tags = ["AAA", "BBB", "CCC", "DDD", "EEE"].slice(0, 2 + ri(4));
  const lo = 1 + ri(3), n = 6 + ri(30), hi = lo + n - 1;
  const groups = [];
  for (let i = 0; i < n; i++) groups.push({ id: lo + i, owner: rnd() < 0.08 ? "" : tags[ri(tags.length)], provinces: new Array(1 + ri(6)).fill(0), imp: ri(5) });
  const baseOwner = new Map(), baseSize = new Map(), weight = new Map(), first = new Set(), pre = new Set();
  for (let v = lo; v <= hi; v++) {
    if (rnd() < 0.06) { pre.add(v); continue; }
    if (rnd() < 0.05) continue;   // an id the layer below does not declare
    baseOwner.set(v, rnd() < 0.1 ? "" : tags[ri(tags.length)]);
    baseSize.set(v, 1 + ri(6));
    weight.set(v, rnd() < 0.2 ? 0 : ri(12));
    if (rnd() < 0.2) first.add(v);
  }
  const overlap = new Map();
  for (const g of groups) { const m = new Map(); for (let k = 0; k < ri(3); k++) { const v = lo + ri(n); if (baseSize.has(v)) m.set(v, Math.min(baseSize.get(v), (m.get(v) || 0) + 1 + ri(3))); } overlap.set(g, m); }
  // pins: a few groups hold an id of their own country, as a capital line would name it
  const pins = new Map(), taken = new Set();
  for (const g of groups) if (g.owner && rnd() < 0.15) { const v = lo + ri(n); if (!taken.has(v)) { pins.set(g, v); taken.add(v); } }
  const eligible = (v) => baseSize.has(v) && !pre.has(v);
  const opts = { groups, lo, hi, pins, ownerOf: (g) => g.owner, overlapOf: (g) => overlap.get(g), baseOwnerOf: (v) => baseOwner.get(v) || "",
    baseSizeOf: (v) => baseSize.get(v) || 0, weightOf: (v) => weight.get(v) || 0, firstOf: (v) => first.has(v), importanceOf: (g) => g.imp, eligible };
  return { opts, tags, lo, hi, groups, baseOwner, weight, first, pins, eligible };
}
{
  let notPerm = 0, pinMoved = 0, notMax = 0, firstShort = 0, weightShort = 0, unstable = 0, ordersDiffer = 0, halfLost = 0, weightLost = 0, worlds = 0;
  const examples = [];
  for (let t = 0; t < 400; t++) {
    const w = randomWorld();
    worlds++;
    const r = md.chooseGeneratedStateIds(w.opts);                                             // the default order
    const rw = md.chooseGeneratedStateIds(Object.assign({}, w.opts, { order: "weight" }));   // the weight above the land
    const ids = w.groups.map((g) => r.idOf.get(g));
    if (new Set(ids).size !== w.groups.length || ids.some((v) => !(v >= w.lo && v <= w.hi))) notPerm++;
    for (const [g, v] of w.pins) if (r.idOf.get(g) !== v) pinMoved++;
    const r2 = md.chooseGeneratedStateIds(w.opts);
    if (w.groups.some((g) => r2.idOf.get(g) !== r.idOf.get(g))) unstable++;
    const pinnedIds = new Set(w.pins.values());
    const isHalf = (g, v) => { const k = w.opts.overlapOf(g).get(v) || 0, s = w.opts.baseSizeOf(v); return k > 0 && s > 0 && 2 * k >= s ? 1 : 0; };
    for (const t of w.tags) {
      const G = w.groups.filter((g) => g.owner === t && !w.pins.has(g));
      const F = [];
      for (let v = w.lo; v <= w.hi; v++) if (w.eligible(v) && !pinnedIds.has(v) && w.baseOwner.get(v) === t) F.push(v);
      const keptBy = (x) => G.filter((g) => F.includes(x.idOf.get(g)));
      const kept = keptBy(r).map((g) => r.idOf.get(g)), keptW = keptBy(rw).map((g) => rw.idOf.get(g));
      if (kept.length !== keptW.length) ordersDiffer++;
      if (kept.length !== Math.min(G.length, F.length)) { notMax++; if (examples.length < 3) examples.push({ t, G: G.length, F: F.length, kept: kept.length }); }
      // the two orders, each lexicographic over its own tiers: the default keeps at least as many half-held pairs, the weight order at
      // least as much weight — per country, since a country's own ids are decided by its own assignment alone
      const halfOf = (x) => keptBy(x).reduce((a, g) => a + isHalf(g, x.idOf.get(g)), 0);
      const wOf = (arr) => arr.reduce((a, v) => a + (w.weight.get(v) || 0), 0);
      const firstOfKept = (arr) => arr.filter((v) => w.first.has(v)).length;
      if (firstOfKept(kept) === firstOfKept(keptW) && halfOf(r) < halfOf(rw)) halfLost++;
      if (firstOfKept(kept) === firstOfKept(keptW) && halfOf(r) === halfOf(rw) && wOf(kept) > wOf(keptW)) weightLost++;
      if (G.length < F.length) {
        // the ids its own start history names, first (either order); then, in the weight order, the weight — sums compared, so a tie
        // may fall either way
        const firsts = F.filter((v) => w.first.has(v)), rest = F.filter((v) => !w.first.has(v));
        const k1 = Math.min(G.length, firsts.length), k2 = G.length - k1;
        if (firstOfKept(kept) !== k1 || firstOfKept(keptW) !== k1) firstShort++;
        const top = (arr, k) => arr.map((v) => w.weight.get(v) || 0).sort((a, b) => b - a).slice(0, k).reduce((a, b) => a + b, 0);
        if (wOf(keptW.filter((v) => w.first.has(v))) !== top(firsts, k1) || wOf(keptW.filter((v) => !w.first.has(v))) !== top(rest, k2)) weightShort++;
      }
    }
  }
  rec(`chooseGeneratedStateIds: every answer a permutation of lo..hi (${worlds} random worlds)`, notPerm === 0, { notPerm });
  rec("chooseGeneratedStateIds: no pin ever moves", pinMoved === 0, { pinMoved });
  rec("chooseGeneratedStateIds: each country takes min(its free groups, its free ids) of its own ids", notMax === 0, { notMax, examples });
  rec("chooseGeneratedStateIds: both orders keep as many own ids", ordersDiffer === 0, { ordersDiffer });
  rec("chooseGeneratedStateIds: a short country keeps every id its own start history names that it can, first", firstShort === 0, { firstShort });
  rec("chooseGeneratedStateIds: the weight order then keeps the ids its scripts name most", weightShort === 0, { weightShort });
  rec("chooseGeneratedStateIds: the default order keeps at least as many half-held own ids as the weight order", halfLost === 0, { halfLost });
  rec("chooseGeneratedStateIds: …and never more weight at the same half count (the weight is its next tier)", weightLost === 0, { weightLost });
  rec("chooseGeneratedStateIds: the same answer on a second call", unstable === 0, { unstable });
}
{
  // the two orders on one short country (one group, two ids): the group holds half of id 1, its scripts name id 2 more —
  // the default keeps the land it stands on, the weight order the id its scripts name most
  const G = (owner, land) => ({ owner, provinces: [0, 0, 0], land: new Map(land) });
  const gs = [G("AAA", [[1, 2]]), G("BBB", []), G("", []), G("CCC", [])];
  const own = { 1: "AAA", 2: "AAA", 3: "BBB", 4: "DDD" }, wt = { 1: 1, 2: 9, 3: 0, 4: 5 };
  const o = { groups: gs, lo: 1, hi: 4, ownerOf: (g) => g.owner, overlapOf: (g) => g.land, baseOwnerOf: (v) => own[v], baseSizeOf: () => 4, weightOf: (v) => wt[v] };
  rec("chooseGeneratedStateIds: the default order keeps the id whose land the group holds at half", md.chooseGeneratedStateIds(o).idOf.get(gs[0]) === 1);
  rec("chooseGeneratedStateIds: the weight order keeps the most-named id", md.chooseGeneratedStateIds(Object.assign({}, o, { order: "weight" })).idOf.get(gs[0]) === 2);
  rec("chooseGeneratedStateIds: either keeps an id its own start history names first", md.chooseGeneratedStateIds(Object.assign({}, o, { firstOf: (v) => v === 2 })).idOf.get(gs[0]) === 2);
}
{
  // land decides among a country's own ids only after the tiers above it: a group holding half of id 1 takes 1 when nothing names
  // either more, and a group left over (its country has more groups than ids) takes the free id whose land it holds
  const G = (owner, land) => ({ owner, provinces: [0, 0, 0], land: new Map(land) });
  const gs = [G("AAA", []), G("AAA", [[1, 2]]), G("BBB", []), G("BBB", [[3, 3]])];
  const own = { 1: "AAA", 2: "AAA", 3: "CCC", 4: "BBB" };
  const r = md.chooseGeneratedStateIds({ groups: gs, lo: 1, hi: 4, ownerOf: (g) => g.owner, overlapOf: (g) => g.land, baseOwnerOf: (v) => own[v],
    baseSizeOf: () => 4, weightOf: () => 0 });
  rec("chooseGeneratedStateIds: the group holding half of its own id takes it", r.idOf.get(gs[1]) === 1, gs.map((g) => r.idOf.get(g)));
  rec("chooseGeneratedStateIds: the other takes its country's other id", r.idOf.get(gs[0]) === 2);
  rec("chooseGeneratedStateIds: the country's one id goes to a group of its own", [r.idOf.get(gs[2]), r.idOf.get(gs[3])].includes(4));
  rec("chooseGeneratedStateIds: the group left over takes the free id whose land it holds", r.idOf.get(gs[3]) === 3 && r.report.land === 1, r.report);
}

// ── 3. the cores and claims carried ──────────────────────────────────────────────────────────────────────────────────────────────
{
  const was = { owner: "SOV", cores: ["SOV", "UKR", "POL", "XXX"], claims: ["POL", "SOV"] };
  const landed = (t) => ["SOV", "POL", "GER"].includes(t), removed = (t) => t === "XXX";
  const same = md.carriedCoresAndClaims({ owner: "SOV", was, share: 0, landed, removed });
  rec("carried: the same country carries its 1936 cores and claims at any share (CORE_CARRY_SAME_SHARE)",
    JSON.stringify(same) === JSON.stringify({ cores: ["UKR", "POL"], claims: ["POL"] }), same);
  const cross = md.carriedCoresAndClaims({ owner: "GER", was, share: 0.5, landed, removed });
  rec("carried: another country holding half carries only the cores of landless tags, and no claim",
    JSON.stringify(cross) === JSON.stringify({ cores: ["UKR"], claims: [] }), cross);
  const less = md.carriedCoresAndClaims({ owner: "GER", was, share: 0.49, landed, removed });
  rec("carried: another country holding less than half carries nothing (CORE_CARRY_CROSS_SHARE)", !less.cores.length && !less.claims.length, less);
  const none = md.carriedCoresAndClaims({ owner: "GER", was, share: 0, landed, removed, crossShare: 0 });
  rec("carried: another country holding none of it carries nothing, whatever the threshold", !none.cores.length, none);
  const all = [same, cross, md.carriedCoresAndClaims({ owner: "UKR", was, share: 1, landed: () => false, removed })];
  rec("carried: never the owner's own tag, never a removed tag", all.every((c, i) => !c.cores.includes(["SOV", "GER", "UKR"][i]) && !c.cores.includes("XXX") && !c.claims.includes("XXX")), all);
  rec("carried: nothing without a state below", JSON.stringify(md.carriedCoresAndClaims({ owner: "SOV", was: null, share: 1 })) === JSON.stringify({ cores: [], claims: [] }));
}

// ── 4. over the installed game ───────────────────────────────────────────────────────────────────────────────────────────────────
if (!fs.existsSync(path.join(GAME, "history", "states"))) {
  console.log(`  SKIP §4 — no game at ${GAME} (set HOI4_ROOT). THIS PART DID NOT RUN.`);
  fails.push("§4 did not run: no installed game");
} else {
  const mod = path.join(SANDBOX, "mod-over-vanilla");
  mk(path.join(mod, "descriptor.mod"), 'name="Over vanilla"\nsupported_version="1.19.*"\nreplace_path="history/states"\n');
  const strip = (t) => t.replace(/^\uFEFF/, "").replace(/"[^"\n]*"|#[^\n]*/g, (m) => (m[0] === "#" ? "" : m));
  // 4a. the start histories (#a-start-history-is-what-a-country-tests): every id a history/countries file TESTS inside a limit — the
  // value of a trigger that tests a state by number — is marked with its tag, Spain's garrison list among them; an id it only opens a
  // block on and never tests is not, though the weight still counts it
  const nm = md.stateIdScriptNamings({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], ceiling: 1081 });
  const dir = path.join(GAME, "history", "countries");
  const TESTS = new Set(["state", "owns_state", "controls_state", "has_full_control_of_state", "is_in_state"]);
  let tested = 0, blockOnly = 0;
  const missed = [], wrong = [], unweighted = [];
  for (const f of fs.readdirSync(dir)) {
    const tag = (/^([A-Za-z0-9_]{2,8})\s*-/.exec(f) || [])[1];
    if (!tag) continue;
    const T = tag.toUpperCase();
    const t = strip(fs.readFileSync(path.join(dir, f), "utf8"));
    // a brace walk: the key that opened each block, so a random_list's weights (`50 = { … }`) are not read as states, and a value
    // knows whether a `limit` encloses it
    const stack = [], testedHere = new Set(), blocksHere = new Set();
    for (const m of t.matchAll(/\{|\}|([A-Za-z0-9_.@:]+)\s*=\s*(\{|[A-Za-z0-9_.@:]+)/g)) {
      if (m[0] === "}") { stack.pop(); continue; }
      if (m[0] === "{") { stack.push(""); continue; }
      const key = m[1].toLowerCase();
      if (m[2] === "{") {
        if (/^\d+$/.test(key) && stack[stack.length - 1] !== "random_list" && +key >= 1 && +key <= 1081) blocksHere.add(+key);
        stack.push(key);
        continue;
      }
      if (/^\d+$/.test(m[2]) && TESTS.has(key) && stack.includes("limit") && +m[2] >= 1 && +m[2] <= 1081) testedHere.add(+m[2]);
    }
    for (const v of testedHere) { tested++; if (!(nm.startHistory.get(v) || new Set()).has(T)) missed.push(`${T}:${v}`); }
    for (const v of blocksHere) {
      if (testedHere.has(v)) continue;
      blockOnly++;
      if ((nm.startHistory.get(v) || new Set()).has(T)) wrong.push(`${T}:${v}`);
      if (!((nm.weights.get(v) || 0) > 0)) unweighted.push(`${T}:${v}`);
    }
  }
  rec(`stateIdScriptNamings: every id a country's own history tests inside a limit is marked with its tag (${tested} found)`, tested > 0 && !missed.length, missed.slice(0, 10));
  rec(`stateIdScriptNamings: an id it only opens a block on is not (${blockOnly} found), though the weight still counts it`, blockOnly > 0 && !wrong.length && !unweighted.length,
    { wrong: wrong.slice(0, 10), unweighted: unweighted.slice(0, 10) });
  const spr = strip(fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => /^SPR\s*-/.test(f))), "utf8"));
  const garrison = /every_owned_state\s*=\s*\{[\s\S]*?NOT\s*=\s*\{([^{}]*)\}/.exec(spr);
  const six = garrison ? [...garrison[1].matchAll(/state\s*=\s*(\d+)/g)].map((m) => +m[1]) : [];
  rec(`stateIdScriptNamings: Spain's garrison list (${six.join(" ")}) is Spain's start history`, six.length >= 1 && six.every((v) => (nm.startHistory.get(v) || new Set()).has("SPR")));
  rec("stateIdScriptNamings: nothing above the ceiling", [...nm.weights.keys()].every((v) => v <= 1081) && [...nm.startHistory.keys()].every((v) => v <= 1081));
  rec("stateIdScriptNamings: those ids are named somewhere at least once", six.every((v) => (nm.weights.get(v) || 0) > 0));
  // 4b. the identities below: an independent scan of each state file — depth 1 is the state, depth 2 its history, so a core at depth
  // 2 is undated and unconditional; one in a dated block or an `if` is deeper
  const want = new Map();
  for (const f of fs.readdirSync(path.join(GAME, "history", "states"))) {
    const t = strip(fs.readFileSync(path.join(GAME, "history", "states", f), "utf8"));
    let depth = 0, id = null, owner = "", inHistory = false;
    const cores = [], claims = [];
    const tokens = t.match(/\{|\}|[A-Za-z0-9_.]+\s*=\s*[A-Za-z0-9_.]+|[A-Za-z0-9_.]+\s*=\s*(?=\{)/g) || [];
    for (const tok of tokens) {
      if (tok === "{") { depth++; continue; }
      if (tok === "}") { depth--; if (depth < 2) inHistory = false; continue; }
      const m = /^([A-Za-z0-9_.]+)\s*=\s*([A-Za-z0-9_.]*)$/.exec(tok);
      if (!m) continue;
      if (depth === 1 && m[1] === "id" && m[2]) id = +m[2];
      if (depth === 1 && m[1] === "history" && !m[2]) inHistory = true;
      if (depth === 2 && inHistory && m[1] === "owner" && m[2]) owner = m[2].toUpperCase();
      if (depth === 2 && inHistory && m[1] === "add_core_of" && m[2] && !cores.includes(m[2].toUpperCase())) cores.push(m[2].toUpperCase());
      if (depth === 2 && inHistory && m[1] === "add_claim_by" && m[2] && !claims.includes(m[2].toUpperCase())) claims.push(m[2].toUpperCase());
    }
    if (id != null) want.set(id, { owner, cores, claims });
  }
  const got = md.startIdentitiesBeneath({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
  const diff = [];
  for (const [id, w] of want) {
    const g = got.get(id);
    if (!g || g.owner !== w.owner || g.cores.join() !== w.cores.join() || g.claims.join() !== w.claims.join()) diff.push({ id, want: w, got: g || null });
  }
  let nCores = 0; for (const w of want.values()) nCores += w.cores.length;
  rec(`startIdentitiesBeneath: the undated cores and claims of all ${want.size} states below, as an independent scan reads them (${nCores} cores)`,
    want.size > 1000 && got.size === want.size && !diff.length, diff.slice(0, 3));
}

// ── 5. continents ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const below = path.join(SANDBOX, "below");
  const defBelow = ["0;0;0;0;land;false;unknown;0", "1;20;0;0;land;false;plains;3", "2;40;0;0;land;false;plains;5", "3;60;0;0;sea;false;ocean;0",
    "4;80;0;0;land;false;plains;0", "5;100;0;0;land;false;plains;6", "6;120;0;0;land;false;plains;2"];
  mk(path.join(below, "map", "definition.csv"), defBelow.join("\r\n") + "\r\n");
  const mod = path.join(SANDBOX, "mod-cont");
  mk(path.join(mod, "descriptor.mod"), 'name="Cont"\nsupported_version="1.19.*"\n');
  // the mod's rows as Delete map leaves them: every province sea, the colours kept — except 2, whose colour a mod changed
  const rowsNow = md.parseDefinitionCsv(["0;0;0;0;land;false;unknown;0", "1;20;0;0;sea;false;ocean;0", "2;41;0;0;sea;false;ocean;0",
    "3;60;0;0;sea;false;ocean;0", "4;80;0;0;sea;false;ocean;0", "5;100;0;0;sea;false;ocean;0", "6;120;0;0;sea;false;ocean;0", "9;140;0;0;sea;false;ocean;0"].join("\n"));
  const got = md.continentsOfTheLandBelow({ modRoot: mod, gameRoot: below, dependencyRoots: [], rows: rowsNow, provinceIds: [1, 2, 3, 4, 9], parentOf: new Map([[9, 1]]) });
  const exp = new Map();
  const bRows = md.parseDefinitionCsv(defBelow.join("\n")), byB = new Map(bRows.map((p) => [p.id, p])), byN = new Map(rowsNow.map((p) => [p.id, p]));
  for (const id of [1, 2, 3, 4, 9]) {   // the rule, applied to the fixture's own rows
    const src = id === 9 ? 1 : id, b = byB.get(src), m = byN.get(src);
    if (b && m && b.type === "land" && b.continent > 0 && b.r === m.r && b.g === m.g && b.b === m.b) exp.set(id, b.continent);
  }
  rec("continentsOfTheLandBelow: same id, same colour, land on a continent below → that continent; a piece → its parent's",
    JSON.stringify([...got].sort()) === JSON.stringify([...exp].sort()) && got.get(1) === 3 && got.get(9) === 3, [...got]);
  rec("continentsOfTheLandBelow: a recoloured row, sea below and land on no continent below → nothing", !got.has(2) && !got.has(3) && !got.has(4));
  const self = md.continentsOfTheLandBelow({ modRoot: below, gameRoot: below, dependencyRoots: [], rows: rowsNow, provinceIds: [1] });
  rec("continentsOfTheLandBelow: the mod is never its own layer below", self.size === 0, [...self]);
  // a continent is carried by its NAME: below's list is { europe asia africa }, the mod's own { asia europe } — so below's 1 (europe) is
  // the mod's 2, below's 2 (asia) the mod's 1, and below's 3 (africa), which the mod's list does not declare, is not carried
  const below2 = path.join(SANDBOX, "below-named");
  mk(path.join(below2, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0", "1;20;0;0;land;false;plains;1", "5;100;0;0;land;false;plains;3", "6;120;0;0;land;false;plains;2"].join("\r\n") + "\r\n");
  const belowNames = ["europe", "asia", "africa"], modNames = ["asia", "europe"];
  mk(path.join(below2, "map", "continent.txt"), `continents = {\n${belowNames.map((n) => "\t" + n + "\n").join("")}}\n`);
  const mod2 = path.join(SANDBOX, "mod-named");
  mk(path.join(mod2, "descriptor.mod"), 'name="Named"\nsupported_version="1.19.*"\n');
  mk(path.join(mod2, "map", "continent.txt"), `continents = {\n${modNames.map((n) => "\t" + n + "\n").join("")}}\n`);
  const named = md.continentsOfTheLandBelow({ modRoot: mod2, gameRoot: below2, dependencyRoots: [], rows: rowsNow, provinceIds: [1, 5, 6] });
  const byName = (c) => { const j = modNames.indexOf(belowNames[c - 1]); return j >= 0 ? j + 1 : undefined; };
  rec("continentsOfTheLandBelow: where the mod's continent list differs, a continent is carried by its name",
    named.get(1) === byName(1) && named.get(6) === byName(2) && named.get(1) === 2 && named.get(6) === 1, [...named]);
  rec("continentsOfTheLandBelow: …and one the mod's list does not declare is not carried", !named.has(5) && byName(3) === undefined, [...named]);
  const mod3 = path.join(SANDBOX, "mod-own-map");
  mk(path.join(mod3, "descriptor.mod"), 'name="Own map"\nsupported_version="1.19.*"\nreplace_path="map"\n');
  const ownMap = md.continentsOfTheLandBelow({ modRoot: mod3, gameRoot: below, dependencyRoots: [], rows: rowsNow, provinceIds: [1, 9], parentOf: new Map([[9, 1]]) });
  rec("continentsOfTheLandBelow: a mod that replaces map/ has no land below to keep a continent of", ownMap.size === 0, [...ownMap]);
  // the walk keeps a seed over the border vote and carries it through new land: [1 land c3][2 new][3 new][4 new][5 land c6]
  const W = 20, H = 4, rgb = new Uint8Array(W * H * 3);
  const colour = (id) => [id * 20, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b] = colour(Math.floor(x / 4) + 1), o = (y * W + x) * 3; rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b; }
  const wmod = path.join(SANDBOX, "mod-walk");
  mk(path.join(wmod, "map", "provinces.bmp"), md.writeBmp24({ width: W, height: H, rgb }));
  const rows = md.parseDefinitionCsv(["1;20;0;0;land;false;plains;3", "2;40;0;0;sea;false;ocean;0", "3;60;0;0;sea;false;ocean;0", "4;80;0;0;sea;false;ocean;0", "5;100;0;0;land;false;plains;6"].join("\n"));
  const plain = md.continentsFromNeighbouringLand({ modRoot: wmod, gameRoot: null, rows, provinceIds: [2, 3, 4] });
  const seeded = md.continentsFromNeighbouringLand({ modRoot: wmod, gameRoot: null, rows, provinceIds: [2, 3, 4], seeds: new Map([[4, 2], [7, 4]]) });
  rec("continentsFromNeighbouringLand: without seeds the border vote decides (2 → 3, 4 → 6)", plain.get(2) === 3 && plain.get(4) === 6, [...plain]);
  rec("continentsFromNeighbouringLand: a seed keeps its continent over the border vote (4 → 2)", seeded.get(4) === 2 && seeded.get(2) === 3, [...seeded]);
  rec("continentsFromNeighbouringLand: a seed for a province not being raised is ignored", !seeded.has(7));
  const allSea = md.parseDefinitionCsv(["1;20;0;0;sea;false;ocean;0", "2;40;0;0;sea;false;ocean;0", "3;60;0;0;sea;false;ocean;0", "4;80;0;0;sea;false;ocean;0", "5;100;0;0;sea;false;ocean;0"].join("\n"));
  const blank = md.continentsFromNeighbouringLand({ modRoot: wmod, gameRoot: null, rows: allSea, provinceIds: [1, 2, 3], seeds: new Map([[1, 5]]) });
  rec("continentsFromNeighbouringLand: on a canvas with no land (Delete map) a seed still walks through the new land", blank.get(1) === 5 && blank.get(2) === 5 && blank.get(3) === 5, [...blank]);
  const none = md.continentsFromNeighbouringLand({ modRoot: wmod, gameRoot: null, rows: allSea, provinceIds: [1, 2, 3] });
  rec("continentsFromNeighbouringLand: …and with no seed and no land, nothing (the old answer)", none.size === 0, [...none]);
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
