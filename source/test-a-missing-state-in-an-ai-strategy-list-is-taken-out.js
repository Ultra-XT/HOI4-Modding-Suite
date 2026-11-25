// #a-state-list-in-an-ai-strategy-is-never-checked — THE LIST SHAPE, AND THE ONE THAT CRASHES.
//
// An ai_strategy names states two ways. A single `state = N` is resolved at load: a missing one is logged
// ("invalid state id N") and the whole block abandoned — ai_strategy_state_missing, which is survivable. A
// `states = { … }` list is read into the strategy with NO check (hoi4.exe 1.19.4.1 CBufferUnitsAtStateData::Read), logs
// nothing, and is looked up the first time the AI plans; a missing state comes back null and the caller reads
// [null+0xCC]. Two of the owner's 2026-09-24 launches of a Nova world died there on the first in-game hour — the
// dumps held Italy's `states = { 844 }` and Japan's list stopped at index 10, the first id past the world's 832 — and
// the same world with ONLY these ids removed (TEST 23) had 0 threads faulting there. Vanilla and the seven shipping
// maps installed here have 0.
//
// What this pins:
//   · the rule counts IDS, per list, and says how many strategies are left with nothing
//   · the fix trims a list that keeps a live state, and comments out a strategy whose list names none
//   · a block whose own `state = N` is dead belongs to the OTHER rule (the engine discards it at load)
//   · a list of something other than numbers is not a list of states, and is left alone
//   · decoys: a live list, a state list inside a trigger, and a list in a comment are untouched
//   · SPLICE: comment POSITION as a caption map, line endings per file, and no line of bare whitespace left behind
//   · idempotence — a second click writes nothing — and #inherited-problem-not-yours
//   · the back-out control: a world that kept its states gets nothing from the rule and nothing from the fix
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const md = require(path.join(__dirname, "map-data.js"));

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 600))); fails.push(name); }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const tmps = [];
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ailist-" + tag + "-")); tmps.push(d); return d; };

// ── the fixture: a base game with states 1..6, a mod whose world keeps 1..3 ─────────────────────────────
// ITA.txt is CRLF and JAP.txt LF on purpose. #always-detect-line-endings
const ITA_LINES = [
  "# The Ethiopian front — its only state is gone, so the whole strategy goes",
  "ai_strategy = {",
  "\ttype = put_unit_buffers",
  "\tratio = 0.2",
  "\tstates = { 5 }",
  "\tsubtract_invasions_from_need = no",
  "}",
  "",
  "# Home defence — two live states and one dead one, so only the dead id goes",
  "ai_strategy = {",
  "\ttype = put_unit_buffers",
  "\tratio = 0.1",
  "\tstates = { 1 6 2 }",
  "}",
  "",
  "# A decoy: every state here is live",
  "ai_strategy = { type = put_unit_buffers ratio = 0.3 states = { 1 2 3 } }",
  "",
  "# A decoy: a list inside a trigger is a trigger, not the strategy's list",
  "ai_strategy = { type = t value = 1 state_trigger = { states = { 5 } } }",
  "",
  "# A decoy in a comment: ai_strategy = { type = put_unit_buffers states = { 4 } }",
  "",
];
const JAP_LINES = [
  "# One id per line, as Japan's real list is written",
  "ai_strategy = {",
  "\ttype = put_unit_buffers",
  "\tratio = 0.15",
  "\tstates = {",
  "\t\t1",
  "\t\t2",
  "\t\t4",
  "\t\t3 5",
  "\t}",
  "}",
  "",
  "# The OTHER rule's block: its own state = 6 is dead, so the engine discards it at load, list and all",
  "ai_strategy = { type = put_unit_buffers state = 6 states = { 4 } }",
  "",
  "# Not a list of state ids at all — left alone rather than guessed at",
  "ai_strategy = { type = put_unit_buffers states = { area_asia 4 } }",
  "",
];
const ITA_SRC = ITA_LINES.join("\r\n");
const JAP_SRC = JAP_LINES.join("\n");

const stateFile = (id) => `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 100\n\tprovinces = { ${id} }\n\thistory = { owner = AAA }\n}\n`;
function makeGameRoot() {
  const g = tmp("game");
  for (const id of [1, 2, 3, 4, 5, 6]) mk(path.join(g, "history", "states", `${id}-S${id}.txt`), stateFile(id));
  mk(path.join(g, "common", "ai_strategy", "ITA.txt"), ITA_SRC);
  mk(path.join(g, "common", "ai_strategy", "JAP.txt"), JAP_SRC);
  return g;
}
function makeMod(keepStates) {
  const m = tmp("mod");
  mk(path.join(m, "descriptor.mod"), `name="ai list fixture"\n${keepStates.length < 6 ? 'replace_path="history/states"\n' : ""}`);
  if (keepStates.length < 6) for (const id of keepStates) mk(path.join(m, "history", "states", `${id}-S${id}.txt`), stateFile(id));
  return m;
}

const GAME = makeGameRoot();
const MOD = makeMod([1, 2, 3]);
const ctx = (modRoot) => ({ modRoot, gameRoot: GAME, dependencyRoots: [] });
const rowsFor = (modRoot, rule) => (md.validateMapModel(md.buildMapModel(ctx(modRoot))) || []).filter((p) => p.rule === rule);

try {
  // ── 1. the rule ───────────────────────────────────────────────────────────────────────────────────
  console.log("=== the rule ===");
  const before = rowsFor(MOD, "ai_strategy_state_list_missing");
  const b0 = before[0] || {};
  rec("THE CONTROL: the rule fires on the shrunken world — one row", before.length === 1, before.map((r) => r.message));
  rec("⭐⭐⭐ it counts 4 missing ids — 5 and 6 in Italy's lists, 4 and 5 in Japan's — and nothing from the decoys",
    b0.total === 4, b0.items);
  rec("⭐⭐ it is an ERROR (a crash in two launches), not a warning", b0.severity === "error", b0.severity);
  rec("⭐⭐ it is FATAL with the outcome \"crashes\", like country_history_state_missing",
    (() => { const L = require(path.join(__dirname, "public", "map-rule-labels.js")); return L.isFatalRule("ai_strategy_state_list_missing") && L.fatalOutcome("ai_strategy_state_list_missing") === "crashes"; })());
  rec("⭐⭐ the message says a strategy is left with nothing, and how many",
    /one list names no state this map has at all/.test(b0.message || ""), b0.message);
  rec("⭐⭐ the block with a dead `state = 6` is the OTHER rule's, and is not counted here",
    !(b0.items || []).some((i) => (i.stateIds || []).includes(4) && i.line === 14), b0.items);
  const other = rowsFor(MOD, "ai_strategy_state_missing");
  rec("…and the other rule does report it", other.length === 1 && other[0].total === 1, other.map((r) => r.items));

  // ── 2. the fix ────────────────────────────────────────────────────────────────────────────────────
  console.log("\n=== the fix ===");
  const r = md.fixAiStrategyStateLists(ctx(MOD));
  rec("⭐⭐⭐ it takes out exactly the 4 ids the rule reported", r.fixed === 4, r);
  rec("⭐⭐ …commenting out the ONE strategy left with no state", r.blocks === 1, r);
  rec("⭐⭐ …copying both base-game files in, and saying which", (r.materialised || []).slice().sort().join(",") === "ITA.txt,JAP.txt", r.materialised);
  rec("…and no skips", !(r.skipped || []).length, r.skipped);
  rec("⭐⭐⭐ the rule is silent afterwards", rowsFor(MOD, "ai_strategy_state_list_missing").length === 0);

  const ita = fs.readFileSync(path.join(MOD, "common", "ai_strategy", "ITA.txt"), "utf8");
  const jap = fs.readFileSync(path.join(MOD, "common", "ai_strategy", "JAP.txt"), "utf8");
  const itaL = ita.split("\r\n"), japL = jap.split("\n");

  rec("⭐⭐⭐ a list with live states keeps them, in order, and loses only the dead id",
    itaL.includes("\tstates = { 1 2 }"), itaL.filter((l) => /states/.test(l)));
  rec("⭐⭐⭐ the strategy whose only state is gone is commented out WHOLE, note on its first line",
    itaL[1].startsWith("#ai_strategy = {    # Nova: state 5 is not in this map") && itaL.slice(2, 7).every((l) => l.startsWith("#")), itaL.slice(0, 8));
  rec("⭐⭐ its caption stays above it, uncommented — the comment is content",
    itaL[0] === "# The Ethiopian front — its only state is gone, so the whole strategy goes", itaL[0]);
  rec("⭐⭐⭐ Japan's one-id-per-line list loses the line that held only 4 — no line of bare whitespace left",
    japL.slice(4, 10).join("|") === "\tstates = {|\t\t1|\t\t2|\t\t3|\t}|}", japL.slice(4, 10));
  rec("⭐⭐ …and 5, which shared its line with 3, goes without taking 3 with it", japL.includes("\t\t3"), japL.slice(4, 10));

  // decoys
  rec("⭐⭐⭐ decoy: an all-live list is untouched", itaL.includes("ai_strategy = { type = put_unit_buffers ratio = 0.3 states = { 1 2 3 } }"));
  rec("⭐⭐⭐ decoy: a list inside a trigger is untouched", itaL.includes("ai_strategy = { type = t value = 1 state_trigger = { states = { 5 } } }"));
  rec("⭐⭐ decoy: a list in a comment is untouched", itaL.includes("# A decoy in a comment: ai_strategy = { type = put_unit_buffers states = { 4 } }"));
  rec("⭐⭐ the other rule's block is not this fix's to touch", japL.includes("ai_strategy = { type = put_unit_buffers state = 6 states = { 4 } }"));
  rec("⭐⭐ a list that is not all numbers is left alone", japL.includes("ai_strategy = { type = put_unit_buffers states = { area_asia 4 } }"));

  // splice, not rebuild
  // Only the lines the fix commented (1–6) lose a '#': the captions were comments before it ran.
  const unItA = itaL.map((l, i) => (i >= 1 && i <= 6 ? l.replace(/^#/, "").replace(/    # Nova: .*$/, "") : l)).join("\r\n");
  rec("⭐⭐⭐ SPLICE: undo the #s and the note, put the one id back, and Italy's file is byte-identical to the original",
    unItA.replace("\tstates = { 1 2 }", "\tstates = { 1 6 2 }") === ITA_SRC, null);
  rec("⭐⭐ Italy's file is still all CRLF, Japan's all LF",
    (ita.match(/\r\n/g) || []).length === (ita.match(/\n/g) || []).length && jap.indexOf("\r") === -1, null);

  // idempotence
  const again = md.fixAiStrategyStateLists(ctx(MOD));
  rec("⭐⭐⭐ a second click writes nothing", again.fixed === 0 && fs.readFileSync(path.join(MOD, "common", "ai_strategy", "ITA.txt"), "utf8") === ita, again);

  // ── 3. #inherited-problem-not-yours ────────────────────────────────────────────────────────────────
  console.log("\n=== a state that was gone before this mod ===");
  // A mod that does NOT replace history/states but depends on a layer whose world is 1..3: the base game had 4..6, the
  // dependency deleted them. A list the BASE GAME ships naming 4 is the dependency's doing — but it still reaches this
  // mod's game, and the dependency's own replace means this mod inherits it. Nova's sibling rules skip an id the layers
  // below lack too, and so must this one: repairing it would copy a file in for a fault this mod did not cause.
  const DEP = makeMod([1, 2, 3]);
  const ADDON = tmp("addon");
  mk(path.join(ADDON, "descriptor.mod"), `name="addon"\n`);
  const addonRows = (md.validateMapModel(md.buildMapModel({ modRoot: ADDON, gameRoot: GAME, dependencyRoots: [DEP] })) || [])
    .filter((p) => p.rule === "ai_strategy_state_list_missing");
  rec("⭐⭐ an add-on on that world is not blamed for lists its dependency broke", addonRows.length === 0, addonRows.map((x) => x.message));
  const addonFix = md.fixAiStrategyStateLists({ modRoot: ADDON, gameRoot: GAME, dependencyRoots: [DEP] });
  rec("⭐⭐ …and the fix copies nothing into it", addonFix.fixed === 0 && !fs.existsSync(path.join(ADDON, "common")), addonFix);

  // ── 4. the back-out control ────────────────────────────────────────────────────────────────────────
  console.log("\n=== the back-out control ===");
  const WHOLE = makeMod([1, 2, 3, 4, 5, 6]);
  rec("⭐⭐⭐ on a world that kept its states the rule says nothing", rowsFor(WHOLE, "ai_strategy_state_list_missing").length === 0);
  const w = md.fixAiStrategyStateLists(ctx(WHOLE));
  rec("⭐⭐⭐ …and the fix writes nothing", w.fixed === 0 && !fs.existsSync(path.join(WHOLE, "common")), w);

  // ── 5. it is wired into the click ──────────────────────────────────────────────────────────────────
  console.log("\n=== Auto-fix all ===");
  const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const a = src.indexOf("fixes.deadAiStrategies = fixAiStrategyStateScopes(");
  const b = src.indexOf("fixes.deadAiStrategyLists = fixAiStrategyStateLists(");
  rec("⭐⭐ autoFixMap runs it, AFTER the single-state pass", a !== -1 && b > a, { a, b });
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
