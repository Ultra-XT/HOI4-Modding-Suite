// #a-dead-state-scope-runs-as-an-effect
//
// A world Nova GROWS is smaller than the one underneath it. Delete map + Generate land leaves a mod with
// states 1..N and replace_path="history/states", so the base game's states above N stop loading — while its
// history/countries files, which the mod does not replace, go on loading and go on naming them.
//
// Nova checked exactly ONE reference into those files: `capital = <id>`. That is the SAFE one. hoi4.exe's
// country.cpp refuses a capital it cannot resolve ("Attempting to set capital state #N …, it is not a valid
// state!") and returns. The reference that KILLS is a bare `<id> = { … }` STATE SCOPE, because a country's
// history file is executed as an EFFECT the moment a game starts — unconditionally, for every country — and
// an effect scoped to a state that is not there runs against a null pointer.
//
// 📊 PROVEN THREE WAYS on the owner's 2026-09-17 launches (832-state world, replace_path="history/states"):
//   • THE LAUNCH — crashes/hoi4_20260917_201653 (mod "A … keeps the base game's countries"):
//     EXCEPTION_ACCESS_VIOLATION at 0x7FF77B9276C8, game date 1936.01.01.12. The last line of its error.log
//     is the guard on the FIRST of these scopes: "[state_effect_implementation.cpp:362]: history/countries/
//     BUL - Bulgaria.txt:170: set_state_flag invalid state in set_state_flag".
//   • THE BACK-OUT CONTROL, RUN BY THE GAME — mod "C" is that mod plus 13 override files whose only change is
//     the removal of these lines (7 country files / 14 scopes, 6 air-OOB files / 6 more; `find`-diff of the two
//     mod folders shows 878 vs 891 files and no other difference). It reached 1936.01.19 — 19 in-game days —
//     and died somewhere unrelated (common/raids).
//   • THE BINARY — frame 1 of A's stack resolves to hoi4.exe 1.19.3's 0x1405576b0+24, whose instruction there is
//     `mov rbx,[rcx+28h]`: a null `this`. Its callers, read from .pdata and their string literals:
//     effectimplementation.cpp ("invalid scope"), effect.cpp ("…: Invalid Scope, supported: …, provided: …"),
//     effectbase.cpp, history.cpp ("Executing History from ").
//
// 🐺 AND IT MUST NOT CRY WOLF. Three shapes that look identical and are not, all of them in shipping content:
//   • a WEIGHT — vanilla's NOR - Norway.txt:95 is `random_list = { 1000000 = { … } }`. The first draft of this
//     rule reported state 1,000,000.
//   • a DATE — `1939.1.1 = { … }`.
//   • a TRIGGER scope — vanilla's achievements.txt alone has 3,938 numeric scopes of the `848 = {
//     is_owned_and_controlled_by = HUN }` shape. hoi4.exe answers those ("Invalid state for is_owned_by") and
//     plays on, so they are not counted.
// Measured with the shipped rule: 0 on all six shipping maps (vanilla, MD, R56, OWB, NV, RoN), 14 on the world
// that crashed, 0 on the same world repaired and on the world the owner plays today.
//
// ⚠️ EVERY COUNT BELOW IS DERIVED FROM THE FIXTURE. The fixture declares which scopes are dead and which are
// controls; the checks read those lists' lengths back.
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require(path.join(__dirname, "map-data.js"));
const labels = require(path.join(__dirname, "public", "map-rule-labels.js"));

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 500))); fails.push(name); }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

// ── 1. the reader, fed script directly ───────────────────────────────────────────────────────────────
console.log("=== findStateScopeRefs: which numeric keys are state scopes ===");
{
  const src = [
    "AAA = {",
    "\tcapital = 3",
    "\t971 = { set_state_flag = X }          # DEAD, effect",
    "\t#  1044 = { set_state_flag = Y }      commented out entirely",
    '\tname = "a { brace } in a string"',
    "\t1939.1.1 = { add_ideas = Z }",
    "\trandom_list = {",
    "\t\t1000000 = { add_ideas = W }",
    "\t}",
    "\tif = {",
    "\t\tlimit = { 1045 = { is_owned_by = BBB } }",
    "\t\t1046 = { add_dynamic_modifier = { modifier = M } }",
    "\t}",
    "}",
  ].join("\n");
  const refs = md.findStateScopeRefs(src);
  const byId = new Map(refs.map((r) => [r.id, r]));
  rec("⭐⭐ a bare `971 = {` is read as a state scope, on its own line", byId.has(971) && byId.get(971).line === 3, refs);
  rec("⭐⭐ …and so is one nested inside an `if`", byId.has(1046) && byId.get(1046).trigger === false, byId.get(1046));
  rec("⭐⭐⭐ a `random_list` WEIGHT is not a state (vanilla NOR - Norway.txt:95 is 1000000)", !byId.has(1000000), refs.map((r) => r.id));
  rec("⭐⭐ a DATE key is not a state", !byId.has(1939) && !refs.some((r) => String(r.id).startsWith("1939")), refs.map((r) => r.id));
  rec("⭐⭐ a scope inside `limit` is marked as a TRIGGER, not an effect", byId.has(1045) && byId.get(1045).trigger === true, byId.get(1045));
  rec("⭐⭐ a commented-out scope is not read at all", !byId.has(1044), refs.map((r) => r.id));
  rec("⭐⭐ a `{` inside a quoted string does not throw the brace walk off", byId.get(1046) && byId.get(1046).trigger === false, refs);
  // ⚠️ a BOM defeats /^[ \t]*x/ and CRLF defeats an anchor on a bare \n; this reader anchors on neither.
  const bom = md.findStateScopeRefs("﻿" + src.replace(/\n/g, "\r\n"));
  rec("⭐⭐⭐ a UTF-8 BOM and CRLF change nothing (MD is the only BOM-free map in the corpus)",
    JSON.stringify(bom.map((r) => [r.id, r.line, r.trigger])) === JSON.stringify(refs.map((r) => [r.id, r.line, r.trigger])), { bom: bom.map((r) => r.id), lf: refs.map((r) => r.id) });
}

// ── 2. the rule, over a world that shrank ────────────────────────────────────────────────────────────
// The owner's shape exactly: a base game whose country files name states 1..5, and a mod that replaces
// history/states with a world of 1..2.
const DEAD_IN_BASE = [                          // file -> the dead EFFECT scopes it runs
  { file: "BUL - Bulgaria.txt", ids: [4, 5] },
  { file: "JAP - Japan.txt", ids: [5] },
];
const CONTROLS_IN_BASE = [                      // …and the shapes that must stay silent
  "a live state id", "a trigger scope on a dead state", "a random_list weight", "a date block",
];
const CRLF_BODY = "capital = 1\r\n4 = {\r\n\tset_state_flag = F\r\n}\r\n2 = { set_state_flag = F }\r\n";
// Two dead scopes on ONE line. Nothing stops a modder writing this, and it is the case where a naive splice
// comments the same line range twice — `##`, and the note printed twice.
const TWO_ON_A_LINE = "capital = 1\n4 = { set_state_flag = F } 5 = { set_state_flag = F }\n";

// `crlf` adds one more country file, written entirely with CRLF, holding one dead scope and one live one —
// used only by the repair section, in a game root of its own so it cannot shift the counts above.
function makeGameRoot(crlf) {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-b2-game-"));
  if (crlf) {
    mk(path.join(g, "history", "countries", "CRL - Crlf.txt"), CRLF_BODY);
    mk(path.join(g, "history", "countries", "TWO - Pair.txt"), TWO_ON_A_LINE);
  }
  for (const id of [1, 2, 3, 4, 5]) {
    mk(path.join(g, "history", "states", `${id}-S${id}.txt`),
      `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 100\n\tprovinces = { ${id} }\n\thistory = { owner = AAA }\n}\n`);
  }
  mk(path.join(g, "history", "countries", "BUL - Bulgaria.txt"), [
    "capital = 1",
    "4 = { set_state_flag = F }",                      // DEAD, effect
    "5 = { set_state_flag = F }",                      // DEAD, effect
    "1 = { set_state_flag = F }",                      // control: a live state id
    "if = { limit = { 5 = { is_owned_by = BUL } } }",  // control: a trigger scope on a dead state
    "random_list = { 5 = { add_ideas = I } }",         // control: a weight that happens to look dead
    "1939.1.1 = { add_ideas = I }",                    // control: a date
  ].join("\n") + "\n");
  mk(path.join(g, "history", "countries", "JAP - Japan.txt"),
    "capital = 2\n5 = { start_resistance = yes }\n");
  mk(path.join(g, "history", "countries", "AAA - Quiet.txt"), "capital = 1\n");
  return g;
}
function makeMod(gameRoot, { replaceStates }) {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-b2-mod-"));
  mk(path.join(m, "descriptor.mod"), `name="B2 fixture"\n${replaceStates ? 'replace_path="history/states"\n' : ""}`);
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
  return { model, rows: (md.validateMapModel(model) || []).filter((p) => p.rule === "country_history_state_missing") };
};

console.log("\n=== a world that shrank, with the base game's country files still loading ===");
const DEAD = DEAD_IN_BASE.reduce((n, f) => n + f.ids.length, 0);
const cold = rowsFor(SHRUNK, false);
rec(`THE CONTROL: the fixture's world really did shrink (${2} states, the base game has 5)`, cold.model.states.length === 2, cold.model.states.map((s) => s.id));
rec("⭐⭐⭐ the rule fires", cold.rows.length > 0, cold.rows.map((p) => p.message));
rec("⭐⭐ it is ONE problem row for the class, like its neighbours", cold.rows.length === 1, cold.rows.length);

const p = cold.rows[0] || {};
rec(`⭐⭐⭐ it counts the POPULATION, not the rows: total = the ${DEAD} dead effect scopes the fixture wrote`, p.total === DEAD, { total: p.total, expected: DEAD });
rec("⭐⭐ …with the noun problemScale needs", String(p.totalNoun || "") === "effects", p.totalNoun);
const scale = typeof labels.problemScale === "function" ? labels.problemScale(p) : null;
rec("⭐⭐ so a summary line can size it", !!scale && scale.n === DEAD, scale);
rec(`⭐⭐ it names every file the fixture put a dead scope in (${DEAD_IN_BASE.length})`,
  Array.isArray(p.files) && p.files.length === DEAD_IN_BASE.length && DEAD_IN_BASE.every((f) => p.files.includes(f.file)), p.files);
rec("⭐⭐ …and each instance carries file, line and state id, so a modder can open it",
  Array.isArray(p.items) && p.items.length === DEAD && p.items.every((i) => i.file && i.line > 0 && i.stateId > 0), (p.items || []).slice(0, 3));
const gotIds = (p.items || []).map((i) => i.stateId).sort();
const wantIds = DEAD_IN_BASE.flatMap((f) => f.ids).sort();
rec("⭐⭐⭐ exactly the dead EFFECT scopes — none of the four controls leaked in",
  JSON.stringify(gotIds) === JSON.stringify(wantIds), { got: gotIds, want: wantIds, controls: CONTROLS_IN_BASE });
rec("…an error, and in the curated FATAL set", p.severity === "error" && labels.isFatalRule("country_history_state_missing") === true);
rec('⭐⭐ …classed "crashes", because a launch crashed on it and the same world without it played on',
  labels.fatalOutcome("country_history_state_missing") === "crashes", labels.fatalOutcome("country_history_state_missing"));
rec("⭐⭐ the message says the mod does not ship those files, and what shipping one would cost",
  /Your mod does not ship/.test(p.message) && /frozen at this build/.test(p.message), String(p.message).slice(-300));
rec("⭐⭐ …and it has a fix hint on the Save gate", !!(labels.FIX_HINTS || {}).country_history_state_missing
  || (typeof labels.fixHint === "function" && !!labels.fixHint("country_history_state_missing")));

// 🔥❄️ CACHE WARMTH. buildMapModel writes onto the object its cached layer holds, and a fixture read cold has
// given a different answer from the same fixture read warm. Run both and require one answer.
const warm1 = rowsFor(SHRUNK, true);
const warm2 = rowsFor(SHRUNK, true);
rec("⭐⭐⭐ cold and warm give one answer", warm1.rows.length === cold.rows.length && (warm1.rows[0] || {}).total === p.total
  && (warm2.rows[0] || {}).total === p.total, { cold: p.total, warm1: (warm1.rows[0] || {}).total, warm2: (warm2.rows[0] || {}).total });

// ── 3. THE BACK-OUT CONTROL ──────────────────────────────────────────────────────────────────────────
// The same base game and the same country files, under a mod that does NOT replace history/states: every id
// those files name is loaded again, and the rule must go completely silent. Revert the fix (stop filtering by
// what the world has) and this is what bites.
console.log("\n=== THE BACK-OUT CONTROL: the same files under a world that kept its states ===");
const whole = rowsFor(WHOLE, false);
rec("⭐⭐⭐ the world has all five states again", whole.model.states.length === 5, whole.model.states.map((s) => s.id));
rec("⭐⭐⭐ …and the rule says nothing at all", whole.rows.length === 0, whole.rows.map((r) => r.message));

// …and the other half of the control: a scope the MOD itself owns is reported, and attributed to the mod.
const MINE = makeMod(GAME, { replaceStates: true });
mk(path.join(MINE, "history", "countries", "BUL - Bulgaria.txt"), "capital = 1\n4 = { set_state_flag = F }\n");
const mine = rowsFor(MINE, false);
const mineRow = mine.rows[0] || {};
rec("⭐⭐ a country file the MOD ships is read the same way (it replaces the base one by filename)",
  mine.rows.length === 1 && (mineRow.items || []).some((i) => i.file === "BUL - Bulgaria.txt" && i.stateId === 4), mineRow.items);
rec("⭐⭐⭐ …and the mod's own scope is NOT blamed on the base game",
  (mineRow.items || []).filter((i) => i.file === "BUL - Bulgaria.txt").every((i) => i.fromMod === true), (mineRow.items || []).filter((i) => i.file === "BUL - Bulgaria.txt"));
rec("⭐⭐ the mod's override really did replace the base file: its two dead scopes are down to one",
  (mineRow.items || []).filter((i) => i.file === "BUL - Bulgaria.txt").length === 1, mineRow.items);

// ⭐ …and the inherited gate must not excuse the MOD'S OWN line. A state id NO layer ever had is skipped as
// "already gone beneath this mod" for a base-game file — that is the gate's job — but a line the modder wrote
// is theirs whatever any layer holds, and it is the one they can certainly fix.
{
  const own = makeMod(GAME, { replaceStates: false });          // states 1..5 all load: nothing below is missing
  mk(path.join(own, "history", "countries", "OWN - Mine.txt"), "capital = 1\n9999 = { set_state_flag = F }\n");
  const r = rowsFor(own, false);
  const it = ((r.rows[0] || {}).items || []).filter((i) => i.file === "OWN - Mine.txt");
  rec("⭐⭐⭐ a scope the MOD wrote on a state no layer ever had is still reported",
    it.length === 1 && it[0].stateId === 9999 && it[0].fromMod === true, { rows: r.rows.length, items: (r.rows[0] || {}).items });
  // THE CONTROL, the other half: the same id in a BASE file, where no layer below has it either, stays quiet.
  mk(path.join(GAME, "history", "countries", "THR - Theirs.txt"), "capital = 1\n9998 = { set_state_flag = F }\n");
  const r2 = rowsFor(makeMod(GAME, { replaceStates: false }), false);
  rec("⭐⭐⭐ THE CONTROL: the same shape in a file the mod does not ship, that no layer below has either, stays quiet",
    !((r2.rows[0] || {}).items || []).some((i) => i.stateId === 9998), (r2.rows[0] || {}).items);
  try { fs.rmSync(own, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(path.join(GAME, "history", "countries", "THR - Theirs.txt"), { force: true }); } catch (_) {}
}

// ── 4. the repair ────────────────────────────────────────────────────────────────────────────────────
// ⭐ IT COMMENTS OUT, IT DOES NOT DELETE: the modder can see what Nova did and undo it, the statement is
// still there if they give their world that state id back, and — the reason that decided it — prefixing `#`
// to lines that already exist inserts no newline, so the file's line endings cannot be changed at all.
console.log("\n=== the repair ===");
const GAME2 = makeGameRoot(true);               // its own game root, so the CRLF file cannot shift the counts above
const FIXME = makeMod(GAME2, { replaceStates: true });
const fixModel = () => md.buildMapModel({ modRoot: FIXME, gameRoot: GAME2, dependencyRoots: [] });
const deadBefore = md.deadCountryHistoryScopes(fixModel()).length;
const fix = md.fixCountryHistoryStateScopes({ modRoot: FIXME, gameRoot: GAME2, dependencyRoots: [] });
rec("⭐⭐⭐ it repairs exactly what the rule reported, no more", fix.fixed === deadBefore, { fixed: fix.fixed, reported: deadBefore });
rec("⭐⭐ …and says which base-game files it had to make the mod's own", Array.isArray(fix.materialised) && fix.materialised.length === (fix.files || []).length, fix);
rec("⭐⭐⭐ the rule then goes silent", md.deadCountryHistoryScopes(fixModel()).length === 0, md.deadCountryHistoryScopes(fixModel()));
const again = md.fixCountryHistoryStateScopes({ modRoot: FIXME, gameRoot: GAME2, dependencyRoots: [] });
rec("⭐⭐ a second click writes nothing", again.fixed === 0 && (again.materialised || []).length === 0, again);

// the bytes: only the reported statements changed, and only by a `#`.
{
  const f = "BUL - Bulgaria.txt";
  const before = fs.readFileSync(path.join(GAME2, "history", "countries", f), "utf8");
  const after = fs.readFileSync(path.join(FIXME, "history", "countries", f), "utf8");
  const bl = before.split("\n"), al = after.split("\n");
  const changed = bl.map((_, i) => i).filter((i) => bl[i] !== al[i]);
  rec("⭐⭐ the materialised file has the same number of lines as the one it came from", bl.length === al.length, { before: bl.length, after: al.length });
  rec("⭐⭐⭐ only the two dead lines differ, and each only by a leading `#` and a note",
    changed.length === 2 && changed.every((i) => al[i].startsWith("#" + bl[i]) && /# Nova: state \d+ is not in this map/.test(al[i])),
    changed.map((i) => ({ before: bl[i], after: al[i] })));
  rec("⭐⭐⭐ THE CONTROL: the live scope and all three decoys are untouched",
    al.filter((l, i) => !changed.includes(i)).join("\n") === bl.filter((_, i) => !changed.includes(i)).join("\n"));
  const base = fs.readFileSync(path.join(GAME2, "history", "countries", f), "utf8");
  rec("⭐⭐⭐ …and the base game's own file was not written to", base === before);
}
// ⚠️ LINE ENDINGS. This is what a delete-the-lines repair would have to get right and this one cannot get wrong.
{
  const after = fs.readFileSync(path.join(FIXME, "history", "countries", "CRL - Crlf.txt"), "utf8");
  const crlf = (after.match(/\r\n/g) || []).length;
  const bareLf = (after.match(/(^|[^\r])\n/g) || []).length;
  rec("⭐⭐⭐ a CRLF file stays entirely CRLF — no pocket of LF where the next anchored edit would look",
    crlf === (CRLF_BODY.match(/\r\n/g) || []).length && bareLf === 0, { crlf, bareLf });
  rec("⭐⭐ …and the live scope in it is still live", /\n2 = \{ set_state_flag = F \}/.test(after.replace(/\r/g, "")), after);
}
// ⚠️ TWO ON ONE LINE — the case a naive splice comments twice.
{
  const after = fs.readFileSync(path.join(FIXME, "history", "countries", "TWO - Pair.txt"), "utf8");
  const line = after.split("\n")[1] || "";
  rec("⭐⭐⭐ two dead scopes on one line are commented ONCE, not twice", line.startsWith("#") && !line.startsWith("##"), line);
  rec("⭐⭐ …and the one note names BOTH states", /# Nova: states 4, 5 are not in this map/.test(line), line);
  const both = (fix.details || []).filter((d) => d.file === "TWO - Pair.txt");
  rec("⭐⭐⭐ …while the COUNT still says two effects, because two of them will no longer run",
    both.length === 2 && both.map((d) => d.stateId).sort().join() === "4,5", both);
}
// THE CONTROL on the fixer: a world with nothing to repair must write NOTHING — not a file, not a folder.
{
  const quiet = makeMod(GAME2, { replaceStates: false });
  const r = md.fixCountryHistoryStateScopes({ modRoot: quiet, gameRoot: GAME2, dependencyRoots: [] });
  rec("⭐⭐⭐ THE CONTROL: nothing reported → nothing written, not even history/countries",
    r.fixed === 0 && !fs.existsSync(path.join(quiet, "history", "countries")), { r, made: fs.existsSync(path.join(quiet, "history", "countries")) });
  try { fs.rmSync(quiet, { recursive: true, force: true }); } catch (_) {}
}

for (const d of [GAME, SHRUNK, WHOLE, MINE, FIXME]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }

console.log(`\n=== a dead state scope runs as an effect: ${pass + fails.length} checks, ${fails.length} failed ===`);
if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exit(1); }
assert.ok(pass > 0);
