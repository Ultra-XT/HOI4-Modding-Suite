// #a-dead-ai-strategy-state-is-silently-discarded
//
// The third thing a shrunken world breaks in files the mod does not own, and the one that is LOUD BUT
// SURVIVABLE. An `ai_strategy = { … }` whose `state = N` the world no longer has is not a crash: hoi4.exe
// logs "[ai_strategy.cpp:7656]: invalid state id N" and abandons the block, which the parser then reports as
// `Error: "Unexpected token: state, near line: N" in file: "common/ai_strategy/…"`. The game carries on.
// What is lost is the WHOLE strategy — not one field of it.
//
// Nova said nothing about this class at all, on a world where 18 of the base game's AI strategies are being
// quietly dropped. That is exactly the "does this show what the GAME will show" question, asked of the AI.
//
// ⭐⭐⭐ THE GAME'S OWN LOG IS THE ORACLE, and this rule was built against it. The owner's 2026-09-17 launch
// (crashes/hoi4_20260917_201653 — an 832-state Nova world) carries exactly 18 "invalid state id" lines, each
// paired with its "Unexpected token: state" parse error naming file and line:
//     FRA.txt:497→978  FRA.txt:506→978  GER.txt:3546→977  GER.txt:5172→972  GER.txt:5185→972
//     INS.txt:56→1058  ITA.txt:1366→841 ITA.txt:1391→837  ITA.txt:1441→835  JAP.txt:545→1039
//     JAP.txt:862→1055 JAP.txt:867→1056 JAP.txt:902→1058  JAP.txt:912→1051  JAP.txt:923→1049
//     JAP.txt:934→1054 JAP.txt:2514→997 JAP.txt:2520→995
// The rule reports 18: the same five files, the same lines, the same ids, with nothing on either side.
//
// ⚠️ AND THAT AGREEMENT IS WHAT TAUGHT THE DIRECT-CHILD RULE. Counting every `state = N` anywhere inside the
// block gave 20, and the two extras — vanilla's INS.txt:45 and SOV.txt:2623 — both sit inside a
// `state_trigger = { … }`, which is a TRIGGER: the engine answers it and does not abandon anything. Two rows
// of cry-wolf, caught because the game had already said how many there were.
//
// 🐺 0 on all six shipping maps (which hold 89/8/66/87/5/87 direct `state = N` between them) and 0 on the
// owner's kurdistan. 18 on the world he plays today.
//
// A WARNING — and, since 2026-09-24, one WITH an Auto-fix. It had none, deliberately: the block is already
// discarded, so commenting it out changes nothing the game does. ⚠️ THAT WAS CHECKED ON A LAUNCH THAT DIED AT
// THE FLEET CRASH FIRST, which makes it a negative result downstream of an always-firing fatal bug — it
// carried no information. #the-bugs-are-sequential. The owner's 2026-09-24 launch reached 1936.01.01 and
// crashed on the FIRST AI tick, in a stack that is nothing but the AI (ai_strategy_database.h
// "Index >= 0 && Index < _StrategySpecificData.GetSize()"), and 5 of the 5 installed total conversions that
// replace history/states also own common/ai_strategy, leaving 0 dangling references between them where Nova
// left 97. Still a warning and still no Save gate — a corpus argument is not a proof. The repair and its own
// controls live in test-an-ai-strategy-aimed-at-a-state-that-is-gone-can-be-cleared.js.
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require(path.join(__dirname, "map-data.js"));
const labels = require(path.join(__dirname, "public", "map-rule-labels.js"));

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 400))); fails.push(name); }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

// ── 1. the reader ────────────────────────────────────────────────────────────────────────────────────
console.log("=== findAiStrategyStateRefs: which `state = N` the engine resolves ===");
{
  const src = [
    "ai_strategy = {",                       // block 1: two direct states, one of them dead
    "\ttype = front_control",
    "\tstate = 42",
    "\tstate = 978",
    "\tratio = 0.8",
    "}",
    "ai_strategy = {",                       // block 2: the state lives inside a TRIGGER
    "\ttype = front_control",
    "\tstate_trigger = {",
    "\t\tOR = {",
    "\t\t\tstate = 928",
    "\t\t}",
    "\t}",
    "\ttag = FIN",
    "}",
    "# ai_strategy = { state = 555 }",       // commented out entirely
    'ai_strategy = { type = x name = "a { brace }" state = 7 }',
  ].join("\n");
  const blocks = md.findAiStrategyStateRefs(src);
  const flat = blocks.flatMap((b) => b.states.map((s) => s.id));
  rec("⭐⭐ a block's DIRECT `state = N` fields are read, with their lines",
    blocks.length === 2 && blocks[0].states.length === 2 && blocks[0].states[0].line === 3 && blocks[0].states[1].line === 4, blocks);
  rec("⭐⭐⭐ a `state = N` inside state_trigger is NOT one — this is the two rows of cry-wolf the engine's log caught",
    !flat.includes(928), flat);
  rec("⭐⭐ a commented-out block is not read", !flat.includes(555), flat);
  rec("⭐⭐ a `{` inside a quoted string does not throw the brace walk off", flat.includes(7), flat);
  const bom = md.findAiStrategyStateRefs("﻿" + src.replace(/\n/g, "\r\n"));
  // ⚠️ COMPARE WHAT THE CALLERS READ, NOT THE WHOLE OBJECT. The blocks also carry `start`/`stop` byte offsets
  // for the fixer, and those MUST differ between an LF file and a BOM+CRLF one — a byte offset that survived
  // adding two bytes per line would be the bug. What must not move is the answer: the same blocks, the same
  // lines, the same ids. A whole-object compare here started failing the day the offsets were added, which is
  // the assertion doing its job in the wrong units.
  const shape = (bs) => JSON.stringify(bs.map((b) => ({ line: b.line, closed: b.closed, states: b.states })));
  rec("⭐⭐⭐ a UTF-8 BOM and CRLF change nothing about which states are found, or on which lines",
    shape(bom) === shape(blocks), { bom: shape(bom), lf: shape(blocks) });
  rec("⭐⭐ …and the byte offsets DO move, because the bytes did", bom[0].start !== blocks[0].start,
    { bom: bom[0].start, lf: blocks[0].start });
}

// ── 2. the rule ──────────────────────────────────────────────────────────────────────────────────────
// A base game whose ai_strategy names states 1..5, under a mod whose world is 1..2.
const DEAD_BLOCKS = [                        // file -> the id each DISCARDED block first fails on
  { file: "FRA.txt", ids: [4, 5] },
  { file: "JAP.txt", ids: [5] },
];
const DECOYS = ["a live state", "a dead state inside state_trigger", "a second dead state in an already-dead block"];

function makeGameRoot() {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-b2ai-game-"));
  for (const id of [1, 2, 3, 4, 5]) {
    mk(path.join(g, "history", "states", `${id}-S${id}.txt`),
      `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 100\n\tprovinces = { ${id} }\n\thistory = { owner = AAA }\n}\n`);
  }
  mk(path.join(g, "common", "ai_strategy", "FRA.txt"), [
    "ai_strategy = { type = t state = 1 value = 1 }",              // decoy: a live state
    "ai_strategy = { type = t state = 4 state = 5 value = 1 }",    // DISCARDED, first fails on 4
    "ai_strategy = { type = t state_trigger = { state = 5 } }",    // decoy: a trigger
    "ai_strategy = { type = t state = 5 value = 1 }",              // DISCARDED, fails on 5
  ].join("\n") + "\n");
  mk(path.join(g, "common", "ai_strategy", "JAP.txt"), "ai_strategy = { type = t state = 5 value = 1 }\n");
  return g;
}
function makeMod(gameRoot, { replaceStates }) {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-b2ai-mod-"));
  mk(path.join(m, "descriptor.mod"), `name="B2 ai fixture"\n${replaceStates ? 'replace_path="history/states"\n' : ""}`);
  if (replaceStates) for (const id of [1, 2]) {
    mk(path.join(m, "history", "states", `${id}-S${id}.txt`),
      `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 100\n\tprovinces = { ${id} }\n\thistory = { owner = AAA }\n}\n`);
  }
  return m;
}

const GAME = makeGameRoot();
const SHRUNK = makeMod(GAME, { replaceStates: true });
const WHOLE = makeMod(GAME, { replaceStates: false });
const rowsFor = (modRoot, cacheStableLayers) => {
  const model = md.buildMapModel({ modRoot, gameRoot: GAME, dependencyRoots: [], cacheStableLayers });
  return { model, rows: (md.validateMapModel(model) || []).filter((p) => p.rule === "ai_strategy_state_missing") };
};

console.log("\n=== a world that shrank, with the base game's ai_strategy still loading ===");
const LOST = DEAD_BLOCKS.reduce((n, f) => n + f.ids.length, 0);
const cold = rowsFor(SHRUNK, false);
rec("THE CONTROL: the fixture's world really did shrink", cold.model.states.length === 2, cold.model.states.map((s) => s.id));
rec("⭐⭐⭐ the rule fires", cold.rows.length === 1, cold.rows.map((r) => r.message));
const p = cold.rows[0] || {};
rec(`⭐⭐⭐ it counts the POPULATION: total = the ${LOST} blocks the fixture will lose`, p.total === LOST, { total: p.total, expected: LOST });
rec("⭐⭐ …with the noun problemScale needs", String(p.totalNoun || "") === "AI strategies", p.totalNoun);
rec("⭐⭐⭐ it is a WARNING, not an error, and NOT in the FATAL set — the game plays on",
  p.severity === "warning" && labels.isFatalRule("ai_strategy_state_missing") === false, { severity: p.severity, fatal: labels.isFatalRule("ai_strategy_state_missing") });
// ⚠️ This used to require the words "this is not a crash". It no longer claims that, and deliberately: what is
// log-verified is that HOI4 discards the block and reaches the main menu. Whether a discarded strategy costs
// the AI something later is exactly what is under investigation, and a message that ruled it out would be
// overclaiming. It says what was measured and nothing more.
rec("⭐⭐ …and its message says what was measured — reaches the menu, no Save gate — without ruling a crash out",
  /reaches the main menu either way/.test(String(p.message)) && /Save does not stop for this/.test(String(p.message)),
  String(p.message).slice(0, 300));
rec("⭐⭐ …and quotes what the engine actually logs", /invalid state id/.test(String(p.message)) && /Unexpected token: state/.test(String(p.message)), String(p.message).slice(0, 260));
const got = (p.items || []).map((i) => `${i.file}:${i.stateId}`).sort();
const want = DEAD_BLOCKS.flatMap((f) => f.ids.map((id) => `${f.file}:${id}`)).sort();
rec("⭐⭐⭐ exactly the blocks the engine would abandon — ONE per block, at the FIRST id it cannot resolve, and no decoy",
  JSON.stringify(got) === JSON.stringify(want), { got, want, decoys: DECOYS });
rec("⭐⭐ …with file and line, so a modder can open it", (p.items || []).every((i) => i.file && i.line > 0), (p.items || []).slice(0, 3));
// ⚠️ THIS ASSERTION USED TO READ `!/Auto-fix/` — "and no Auto-fix claims to repair it". It encoded the rule's
// original reasoning: the block is already discarded, so commenting it out changes nothing the game does. That
// reasoning was checked on a launch that died at the FLEET crash first, which makes it a negative result
// downstream of an always-firing fatal bug. #the-bugs-are-sequential. It moved with the fix, 2026-09-24.
rec("⭐⭐⭐ it now OFFERS the repair — and still refuses to call it a crash",
  /Auto-fix all/.test(String(p.message)) && !/crash/i.test(String(p.message).replace(/not a crash/gi, "")),
  String(p.message).slice(-260));

// 🔥❄️ cold and warm must give one answer.
const warm = rowsFor(SHRUNK, true);
const warm2 = rowsFor(SHRUNK, true);
rec("⭐⭐⭐ cold and warm give one answer", (warm.rows[0] || {}).total === p.total && (warm2.rows[0] || {}).total === p.total,
  { cold: p.total, warm: (warm.rows[0] || {}).total, warm2: (warm2.rows[0] || {}).total });

// ── 3. THE BACK-OUT CONTROL ──────────────────────────────────────────────────────────────────────────
console.log("\n=== THE BACK-OUT CONTROL: the same files under a world that kept its states ===");
const whole = rowsFor(WHOLE, false);
rec("⭐⭐⭐ the world has all five states again", whole.model.states.length === 5, whole.model.states.map((s) => s.id));
rec("⭐⭐⭐ …and the rule says nothing at all", whole.rows.length === 0, whole.rows.map((r) => r.message));

for (const d of [GAME, SHRUNK, WHOLE]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }

console.log(`\n=== a dead ai_strategy state is silently discarded: ${pass + fails.length} checks, ${fails.length} failed ===`);
if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exit(1); }
assert.ok(pass > 0);
