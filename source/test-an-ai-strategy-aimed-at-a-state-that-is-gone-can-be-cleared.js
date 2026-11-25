// #a-dead-ai-strategy-state-is-silently-discarded — THE REPAIR.
//
// The rule beside this one (test-a-dead-ai-strategy-state-is-silently-discarded.js) has reported since it was
// written that an `ai_strategy = { … }` block naming a state the world does not have is abandoned whole by
// HOI4. It deliberately shipped with NO Auto-fix, on the reasoning that the block is already discarded, so
// commenting it out "would change nothing the game does — it would only quiet a log."
//
// ⭐⭐⭐ THAT REASONING WAS CHECKED DOWNSTREAM OF AN ALWAYS-FIRING FATAL BUG. Every launch that "proved" the
// game carries on had already died at the fleet crash, during loading, before an AI ever ticked. A negative
// result behind a fatal bug carries no information. #the-bugs-are-sequential
//
// Two things moved it, on 2026-09-24:
//
//   1. The owner's launch reached 1936.01.01 — the first Nova world ever to start a game — and crashed the
//      moment he advanced time. The stack is nothing but the AI, on a tbb worker thread:
//          ai_strategy_database.h   "Index >= 0 && Index < _StrategySpecificData.GetSize()"
//          ai_general.cpp           "pTheatreManager && pTheatreManager->IsEnabled()"
//          ai_military_minister.cpp "Unknown Desire Type"
//          ai_country.cpp / ref.h   "GetPtr() != 0 && This Object is not created"
//
//   2. THE CORPUS. Of the five shipping total conversions installed here that replace history/states, FIVE OF
//      FIVE also take ownership of common/ai_strategy — Old World Blues (112 files), Millennium: Damaged
//      Continuum (135), Novum Vexillum (54), Rise of Nations (21), Hearts of Minecraft (5) — and between them
//      they leave ZERO dangling state references in it. A Nova world leaves 97. The Road to 56 is the
//      exception that proves the rule: it does not replace the folder, and only ADDS states (1143 ≥ 1081), so
//      every base-game reference still resolves.
//
// ⚠️ That is a corpus argument, not a proof that this is the crash. The rule stays a WARNING and Save still
// does not stop for it. What changed is that the modder now has a button — and CLAUDE.md is explicit that the
// work is to widen the DETERMINISTIC tier wherever a problem has one correct answer. This one does: HOI4 has
// already discarded the block, so commenting it out is the engine's own answer written down.
//
// What this test pins, beyond "it works":
//   · the decoys survive — a live state, and a `state = N` inside a `state_trigger` (a trigger, not a target)
//   · SPLICE, NOT REBUILD — undo the `#` prefixes and the note, and the file is byte-identical to the original
//   · comment POSITION, as a caption map — a surviving block keeps its OWN comment, not its neighbour's
//   · line endings — a CRLF file stays all-CRLF and an LF file stays all-LF, with no pocket of the other
//   · idempotence — a second click writes nothing
//   · #inherited-problem-not-yours — a state that was gone BEFORE this mod is not repaired into it
//   · the back-out control — on a world that kept its states, the repair does nothing at all
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require(path.join(__dirname, "map-data.js"));

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 500))); fails.push(name); }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const tmps = [];
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-aifix-" + tag + "-")); tmps.push(d); return d; };

// ── the fixture ──────────────────────────────────────────────────────────────────────────────────────
// A base game with states 1..5 whose ai_strategy files aim at some of them; a mod whose world is 1..2 only.
// FRA.txt is written CRLF and JAP.txt LF, on purpose: the mix is real and per-file, and a repair that emits
// the wrong one leaves a pocket exactly where the next anchored edit will look. #always-detect-line-endings
const FRA_LINES = [
  "# Hold the line in the west",
  "ai_strategy = { type = t state = 1 value = 1 }",
  "",
  "# Push on S4 — this whole strategy is discarded, first failing on 4",
  "ai_strategy = {",
  "\ttype = front_control",
  "\tstate = 4",
  "\tstate = 5",
  "\tratio = 0.8",
  "}",
  "",
  "# A trigger, not a target: the engine answers it and abandons nothing",
  "ai_strategy = { type = t state_trigger = { state = 5 } value = 2 }",
  "",
  "# Garrison S5 — discarded, failing on 5",
  "ai_strategy = { type = t state = 5 value = 3 }",
  "",
  "# Keep me: nothing here is dead",
  "ai_strategy = { type = t state = 2 value = 4 }",
  "",
];
const JAP_LINES = [
  "# The only strategy in this file, and it is discarded",
  "ai_strategy = { type = t state = 5 value = 1 }",
  "",
];
const FRA_SRC = FRA_LINES.join("\r\n");
const JAP_SRC = JAP_LINES.join("\n");

function makeGameRoot() {
  const g = tmp("game");
  for (const id of [1, 2, 3, 4, 5]) {
    mk(path.join(g, "history", "states", `${id}-S${id}.txt`),
      `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 100\n\tprovinces = { ${id} }\n\thistory = { owner = AAA }\n}\n`);
  }
  mk(path.join(g, "common", "ai_strategy", "FRA.txt"), FRA_SRC);
  mk(path.join(g, "common", "ai_strategy", "JAP.txt"), JAP_SRC);
  return g;
}
function makeMod(keepStates) {
  const m = tmp("mod");
  mk(path.join(m, "descriptor.mod"), `name="ai fix fixture"\n${keepStates.length < 5 ? 'replace_path="history/states"\n' : ""}`);
  if (keepStates.length < 5) for (const id of keepStates) {
    mk(path.join(m, "history", "states", `${id}-S${id}.txt`),
      `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 100\n\tprovinces = { ${id} }\n\thistory = { owner = AAA }\n}\n`);
  }
  return m;
}

const GAME = makeGameRoot();
const MOD = makeMod([1, 2]);
const ctx = (modRoot) => ({ modRoot, gameRoot: GAME, dependencyRoots: [] });
const rowsFor = (modRoot) => (md.validateMapModel(md.buildMapModel(ctx(modRoot))) || [])
  .filter((p) => p.rule === "ai_strategy_state_missing");

// ── 1. the repair runs ───────────────────────────────────────────────────────────────────────────────
console.log("=== the repair ===");
const before = rowsFor(MOD);
rec("THE CONTROL: the rule fires before the fix, on 3 discarded strategies",
  before.length === 1 && before[0].total === 3, before.map((r) => ({ total: r.total, items: r.items })));

const r = md.fixAiStrategyStateScopes(ctx(MOD));
rec("⭐⭐⭐ it repairs exactly the 3 the rule reported — not the decoys", r.fixed === 3, r);
rec("⭐⭐ …by copying BOTH base-game files into the mod, and it says which",
  (r.materialised || []).slice().sort().join(",") === "FRA.txt,JAP.txt", r.materialised);
rec("⭐⭐ …and reports no skips", !(r.skipped || []).length, r.skipped);

const fraOut = fs.readFileSync(path.join(MOD, "common", "ai_strategy", "FRA.txt"), "utf8");
const japOut = fs.readFileSync(path.join(MOD, "common", "ai_strategy", "JAP.txt"), "utf8");

rec("⭐⭐⭐ the rule is silent afterwards", rowsFor(MOD).length === 0, rowsFor(MOD).map((x) => x.message));

// ── 2. the decoys ────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== the decoys, which must be untouched ===");
const liveLine = fraOut.split(/\r?\n/).find((l) => l.includes("value = 4"));
const trigLine = fraOut.split(/\r?\n/).find((l) => l.includes("state_trigger"));
rec("⭐⭐⭐ a block aimed at a LIVE state is not commented out", liveLine === "ai_strategy = { type = t state = 2 value = 4 }", liveLine);
rec("⭐⭐⭐ a `state = N` inside state_trigger is a TRIGGER — that block survives too",
  trigLine === "ai_strategy = { type = t state_trigger = { state = 5 } value = 2 }", trigLine);
rec("⭐⭐ the first block, on live state 1, survives",
  fraOut.split(/\r?\n/).some((l) => l === "ai_strategy = { type = t state = 1 value = 1 }"), null);
const deadOnes = fraOut.split(/\r?\n/).filter((l) => /^#.*value = 3/.test(l));
rec("⭐⭐ …and the one-line dead block IS commented out, with a note naming the state",
  deadOnes.length === 1 && /# Nova: state 5 is not in this map/.test(deadOnes[0]), deadOnes);
rec("⭐⭐ …and the MULTI-LINE dead block is commented out on every one of its lines",
  /^#ai_strategy = \{ {4}# Nova: state 4 is not in this map/m.test(fraOut.replace(/\r/g, ""))
  && /^#\tstate = 4$/m.test(fraOut.replace(/\r/g, "")) && /^#\}$/m.test(fraOut.replace(/\r/g, "")),
  fraOut.replace(/\r/g, "").split("\n").slice(3, 11));

// ── 3. SPLICE, NOT REBUILD ───────────────────────────────────────────────────────────────────────────
// Undo exactly what the repair claims to have done — a leading `#` on each line, and the note on the first
// line of each range — and the file must be byte-identical to what the base game shipped. Anything the
// repair dropped, reordered or re-indented shows up here. #preserved-is-not-the-same-as-unchanged
console.log("\n=== splice, not rebuild ===");
const unfix = (s) => s.split("\n").map((ln) => {
  const cr = ln.endsWith("\r") ? "\r" : "";
  let body = cr ? ln.slice(0, -1) : ln;
  if (!body.startsWith("#")) return ln;
  body = body.slice(1).replace(/ {4}# Nova: states? [\d, ]+ (?:is|are) not in this map, so HOI4 discards this whole strategy$/, "");
  return body + cr;
}).join("\n");
// The file's own comments start with `#` too, so undoing every `#` would eat them — put them back by only
// undoing lines the original did NOT already have commented. Compare as sets of lines at the same index.
const cmp = (out, src) => {
  const o = unfix(out).split("\n"), s = src.split("\n");
  if (o.length !== s.length) return { lines: [o.length, s.length] };
  for (let i = 0; i < o.length; i++) {
    // a line the ORIGINAL had as a comment comes back with one `#` too few — allow exactly that
    if (o[i] === s[i]) continue;
    if ("#" + o[i] === s[i]) continue;
    return { at: i + 1, got: o[i], want: s[i] };
  }
  return null;
};
// ⚠️ `out !== src` FIRST, OR THIS PASSES VACUOUSLY. A repair that did nothing at all undoes to the source
// trivially, and the first draft of this check reported ok for a file the fix had not written. A control that
// does not bite means the assertion is not load-bearing.
rec("⭐⭐⭐ FRA.txt really changed, and undoes to the base game's bytes exactly",
  fraOut !== FRA_SRC && cmp(fraOut, FRA_SRC) === null, { changed: fraOut !== FRA_SRC, diff: cmp(fraOut, FRA_SRC) });
rec("⭐⭐⭐ JAP.txt really changed, and undoes to the base game's bytes exactly",
  japOut !== JAP_SRC && cmp(japOut, JAP_SRC) === null, { changed: japOut !== JAP_SRC, diff: cmp(japOut, JAP_SRC) });

// ── 4. comment POSITION, as a caption map ────────────────────────────────────────────────────────────
// A writer that keeps every comment and re-attaches it to the wrong statement passes a multiset comparison
// at identical byte count. Compare comment text → the code line it sits above. #comments-are-content
console.log("\n=== comment position, not comment presence ===");
const captions = (s) => {
  const lines = s.split(/\r?\n/);
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const m = /^#\s*(?!ai_strategy|\tstate|\ttype|\tratio|\})(.+)$/.exec(lines[i]);
    if (!m || / # Nova: /.test(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    out[m[1].trim()] = (lines[j] || "").trim();
  }
  return out;
};
const capBefore = captions(FRA_SRC), capAfter = captions(fraOut);
rec("⭐⭐⭐ every surviving block keeps its OWN comment, not its neighbour's",
  capAfter["Keep me: nothing here is dead"] === "ai_strategy = { type = t state = 2 value = 4 }"
  && capAfter["Hold the line in the west"] === "ai_strategy = { type = t state = 1 value = 1 }"
  && capAfter["A trigger, not a target: the engine answers it and abandons nothing"] === capBefore["A trigger, not a target: the engine answers it and abandons nothing"],
  { capBefore, capAfter });
rec("⭐⭐ …and no comment was lost", Object.keys(capBefore).every((k) => k in capAfter),
  { missing: Object.keys(capBefore).filter((k) => !(k in capAfter)) });

// ── 5. LINE ENDINGS ──────────────────────────────────────────────────────────────────────────────────
// A file may not MIX the two: a pocket of LF in a CRLF file is exactly where the next anchored edit looks,
// and nothing at runtime complains. #always-detect-line-endings
console.log("\n=== line endings, per file ===");
const endings = (s) => {
  let crlf = 0, lf = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === "\n") { if (s[i - 1] === "\r") crlf++; else lf++; }
  return { crlf, lf };
};
const eF = endings(fraOut), eJ = endings(japOut);
rec("⭐⭐⭐ the CRLF file stays ALL CRLF — no pocket of LF", eF.crlf === endings(FRA_SRC).crlf && eF.lf === 0, { got: eF, want: endings(FRA_SRC) });
rec("⭐⭐⭐ the LF file stays ALL LF — no pocket of CRLF", eJ.lf === endings(JAP_SRC).lf && eJ.crlf === 0, { got: eJ, want: endings(JAP_SRC) });
rec("⭐⭐⭐ the note rides BEFORE the carriage return, not after it — no stray CR mid-line",
  !/\r(?!\n)/.test(fraOut), { strayCR: (fraOut.match(/\r(?!\n)/g) || []).length });

// ── 6. idempotence ───────────────────────────────────────────────────────────────────────────────────
console.log("\n=== a second click writes nothing ===");
const hashBefore = [fraOut, japOut].join("\u0000");
const r2 = md.fixAiStrategyStateScopes(ctx(MOD));
const hashAfter = [fs.readFileSync(path.join(MOD, "common", "ai_strategy", "FRA.txt"), "utf8"),
  fs.readFileSync(path.join(MOD, "common", "ai_strategy", "JAP.txt"), "utf8")].join("\u0000");
rec("⭐⭐⭐ the second click repairs 0 and leaves the bytes identical", r2.fixed === 0 && hashAfter === hashBefore, { r2, same: hashAfter === hashBefore });

// ── 6b. THE OVERLAY BUG THIS REPAIR FOUND ────────────────────────────────────────────────────────────
// readAiStrategyFiles used to record a file only if it HAD blocks. So a mod file whose every strategy is
// commented out — which is exactly what this repair produces, and exactly what a modder blanking a base-game
// file by hand produces — never reached the effective layer, and the BASE GAME'S copy showed through. The
// repair wrote correct bytes and the rule went on reporting the file it had just overridden.
// ⭐⭐⭐ Presence is what displaces a file, not content. #does-this-show-what-the-GAME-will-show
console.log("\n=== a mod file with no strategies left still displaces the one below it ===");
{
  const g3 = tmp("game3");
  for (const id of [1, 2]) mk(path.join(g3, "history", "states", `${id}-S${id}.txt`),
    `state = {\n\tid = ${id}\n\tprovinces = { ${id} }\n\thistory = { owner = AAA }\n}\n`);
  mk(path.join(g3, "common", "ai_strategy", "SOV.txt"), "ai_strategy = { type = t state = 9 value = 1 }\n");
  const m3 = tmp("mod3");
  mk(path.join(m3, "descriptor.mod"), 'name="blanked by hand"\nreplace_path="history/states"\n');
  for (const id of [1, 2]) mk(path.join(m3, "history", "states", `${id}-S${id}.txt`),
    `state = {\n\tid = ${id}\n\tprovinces = { ${id} }\n\thistory = { owner = AAA }\n}\n`);
  // the modder's own copy, with the strategy commented out by hand
  mk(path.join(m3, "common", "ai_strategy", "SOV.txt"), "# ai_strategy = { type = t state = 9 value = 1 }\n");
  const c3 = { modRoot: m3, gameRoot: g3, dependencyRoots: [] };
  const seen = (md.buildMapModel(c3).aiStrategyScopeFiles || []).find((a) => a.file === "SOV.txt") || {};
  rec("⭐⭐⭐ the model reads the MOD's SOV.txt, not the base game's", seen.fromMod === true, seen);
  rec("⭐⭐⭐ …so the rule says nothing about a strategy the modder already removed",
    (md.validateMapModel(md.buildMapModel(c3)) || []).filter((p) => p.rule === "ai_strategy_state_missing").length === 0, null);
}

// ── 7. #inherited-problem-not-yours ──────────────────────────────────────────────────────────────────
// A state that was already gone in the layer BELOW is not this mod's doing, and repairing it would copy
// someone else's file into the mod for a fault the modder did not cause.
console.log("\n=== a fault that predates this mod is left alone ===");
{
  const g2 = tmp("game2");
  for (const id of [1, 2]) mk(path.join(g2, "history", "states", `${id}-S${id}.txt`),
    `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tprovinces = { ${id} }\n\thistory = { owner = AAA }\n}\n`);
  mk(path.join(g2, "common", "ai_strategy", "FRA.txt"), "ai_strategy = { type = t state = 9 value = 1 }\n");
  const m2 = tmp("mod2");
  mk(path.join(m2, "descriptor.mod"), 'name="no states of its own"\n');
  const rr = md.fixAiStrategyStateScopes({ modRoot: m2, gameRoot: g2, dependencyRoots: [] });
  rec("⭐⭐⭐ state 9 is gone in the base game too, so nothing is repaired and no file is copied in",
    rr.fixed === 0 && !(rr.materialised || []).length && !fs.existsSync(path.join(m2, "common", "ai_strategy", "FRA.txt")), rr);
}

// ── 8. THE BACK-OUT CONTROL ──────────────────────────────────────────────────────────────────────────
// Give the world its states back and the repair must do nothing. A fix that fires on a healthy world is
// cry-wolf with a write behind it.
console.log("\n=== THE BACK-OUT CONTROL: a world that kept its states ===");
{
  const whole = makeMod([1, 2, 3, 4, 5]);
  rec("the control world really does have all five states",
    md.buildMapModel(ctx(whole)).states.length === 5, md.buildMapModel(ctx(whole)).states.map((s) => s.id));
  const rw = md.fixAiStrategyStateScopes(ctx(whole));
  rec("⭐⭐⭐ the repair does nothing, and copies no file in",
    rw.fixed === 0 && !fs.existsSync(path.join(whole, "common", "ai_strategy")), rw);
}

// ── 9. it is wired into the click ────────────────────────────────────────────────────────────────────
console.log("\n=== wired into Auto-fix all ===");
{
  const m3 = makeMod([1, 2]);
  const fx = (md.autoFixMap(ctx(m3)) || {}).fixes || {};
  rec("⭐⭐⭐ one click on Auto-fix all runs it — the rule is no use without the button",
    ((fx.deadAiStrategies || {}).fixed || 0) === 3, fx.deadAiStrategies);
  rec("⭐⭐ …and the click leaves the rule silent", rowsFor(m3).length === 0, rowsFor(m3).map((x) => x.rule));
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n=== an ai_strategy aimed at a state that is gone can be cleared: ${pass + fails.length} checks, ${fails.length} failed ===`);
if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exit(1); }
assert.ok(pass > 0);
