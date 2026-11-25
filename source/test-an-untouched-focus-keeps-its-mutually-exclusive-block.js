// #mutex-rebuild-eats-a-commented-out-focus — SAVING A FOCUS TREE REWROTE EVERY FOCUS'S
// `mutually_exclusive` SECTION, AND PERMANENTLY DELETED THE COMMENTED-OUT `focus =` LINES INSIDE THEM.
//
// rewriteFocusBlockMutuallyExclusive strips every `mutually_exclusive` section out of a focus block and
// re-emits ONE rebuilt section from focus.mutuallyExclusive — the flat id list the parser produced. It used
// to run on EVERY focus on EVERY save, ungated, unlike its sibling rewriteFocusBlockPrerequisites, which is
// gated on focus.prereqsEdited.
//
// Measured over the 747 shipping focus-tree files in the installed corpora, feeding the rewriter exactly
// what the parser produces and editing NOTHING:
//
//     17,017 focus blocks declare mutually_exclusive
//     16,979 of them are rewritten by a no-edit pass
//         55 author-written comment lines destroyed, in 53 blocks across 16 files
//            (Millennium Dawn/sweden.txt -18, vanilla/chile.txt -5, Road to 56/australia.txt -5)
//         16 sections whose ONLY content was a commented-out `focus =` vanish whole, `#` line and all
//
// vanilla's own chile.txt is the clearest case. CHL_socialist_youth ships as
//
//     mutually_exclusive = {
//         #focus = CHL_chilean_anti_communist_action_dem_version
//     }
//
// and a save deletes the whole thing — the modder's note about which branch this used to exclude is gone,
// with no undo and nothing said. On top of that, dragging one node turned into a several-hundred-hunk diff
// on focuses the modder never touched, because the rebuild also re-sorts the ids and moves the section to
// just above completion_reward.
//
// WHAT IS *NOT* THE PROBLEM, and this matters for the shape of the fix: unlike prerequisites, sibling
// `mutually_exclusive` blocks carry no AND/OR distinction — HOI4 reads them as one exclusion set — so
// collapsing, re-sorting and relocating them is semantically neutral. The damage is the destroyed author
// content and the churn, not corrupted gating. The fix is still the same gate the prerequisite rewriter
// already has: rebuild only when the user actually edited THIS focus's mutex set (focus.mutexEdited),
// otherwise byte-preserve.
//
// Run: node test-an-untouched-focus-keeps-its-mutually-exclusive-block.js
"use strict";
const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const APP_RAW = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
// ⭐ Every source assertion below runs against the COMMENT-STRIPPED file: the fix's own prose names
// `mutexEdited` and `rewriteFocusBlockMutuallyExclusive`, so an un-stripped grep would be satisfied by the
// comment explaining the bug rather than by the code that fixes it.
const APP = stripJsComments(APP_RAW);

// public/app.js is browser code and CRLF. These are column-0 top-level declarations whose bodies contain
// regex/template literals with braces, so a character-level brace counter over-runs; take from the header
// line to the next line that is exactly "}" at column 0. (The repo's fnSource helper miscounts here and
// silently returns "".)
const lines = APP_RAW.split(/\r?\n/);
const grab = (name) => {
  const start = lines.findIndex((l) => l.startsWith(`function ${name}(`));
  if (start < 0) throw new Error("cannot find " + name);
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) { if (lines[i] === "}") { end = i; break; } }
  if (end < 0) throw new Error("no top-level close for " + name);
  return lines.slice(start, end + 1).join("\n");
};
// cleanupReferencesInBlock closes over two module-level arrays; same line-based extraction.
const grabConst = (name) => {
  const start = lines.findIndex((l) => l.startsWith(`const ${name} = [`));
  if (start < 0) throw new Error("cannot find const " + name);
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) { if (lines[i] === "];") { end = i; break; } }
  if (end < 0) throw new Error("no close for const " + name);
  return lines.slice(start, end + 1).join("\n");
};
const NAMES = [
  "findMatchingBrace",
  "maskPdxComments",
  "stripAllSubsectionsNamed",
  "collectFocusIdsFromSection",
  "rewriteFocusBlockMutuallyExclusive",
  "cleanupReferencesInBlock",
];
const PRELUDE = [grabConst("FOCUS_ID_SCALAR_KEYWORDS"), grabConst("FOCUS_ID_BLOCK_KEYWORDS")].join("\n");
const api = new Function(PRELUDE + "\n" + NAMES.map(grab).join("\n") + "\nreturn {" + NAMES.join(",") + "};")();

// ⭐ DERIVE the save loop's decision from the shipped source instead of retyping it here: this is the exact
// `const withMutex = …` expression out of rewriteCoordinates, run as a function of (withPrereqs, focus).
// Retyping it would make every byte-preservation check below pass even with the gate ripped out.
const gateExprMatches = APP.match(/const withMutex = ([\s\S]*?);\r?\n/g) || [];
if (gateExprMatches.length !== 1) throw new Error("expected exactly one `const withMutex =` in app.js, found " + gateExprMatches.length);
const gateExpr = /const withMutex = ([\s\S]*?);\r?\n/.exec(APP)[1];
const rawSaveMutexStep = new Function("rewriteFocusBlockMutuallyExclusive", "withPrereqs", "focus", "return (" + gateExpr + ");");
const saveMutexStep = (block, focus) => rawSaveMutexStep(api.rewriteFocusBlockMutuallyExclusive, block, focus);

// ---------------------------------------------------------------------------------------------------
// The fixture: vanilla chile.txt's CHL_an_attempt_to_maintain_our_neutrality, tabs and all. One LIVE mutex
// entry and TWO commented-out ones, the section sitting ABOVE ai_will_do and completion_reward.
const T = "\t";
const BLOCK = [
  `${T}focus = {`,
  `${T}${T}id = CHL_an_attempt_to_maintain_our_neutrality`,
  `${T}${T}icon = GFX_goal_generic_neutrality_focus`,
  `${T}${T}relative_position_id = CHL_development_inwards`,
  `${T}${T}x = 1`,
  `${T}${T}y = 1`,
  `${T}${T}cost = 10`,
  ``,
  `${T}${T}mutually_exclusive = {`,
  `${T}${T}${T}focus = CHL_support_the_democracies`,
  `${T}${T}${T}#focus = CHL_strike_down_south_american_fascism`,
  `${T}${T}${T}#focus = CHL_sponsor_american_revolutions`,
  `${T}${T}}`,
  ``,
  `${T}${T}ai_will_do = {`,
  `${T}${T}${T}base = 1`,
  `${T}${T}}`,
  ``,
  `${T}${T}completion_reward = {`,
  `${T}${T}${T}add_political_power = 50`,
  `${T}${T}}`,
  `${T}}`,
].join("\n");

const commentLines = (s) => (s.match(/#[^\r\n]*/g) || []).map((x) => x.trim());
const mutexSectionCount = (s) => (s.match(/mutually_exclusive\s*=\s*\{/g) || []).length;

console.log("\n[the fixture really has the property under test]");
{
  // ⭐ CONTROL — without these the byte-preservation checks below would pass vacuously on a block that has
  // nothing to lose.
  rec("CONTROL: the fixture has a mutually_exclusive section", mutexSectionCount(BLOCK) === 1, mutexSectionCount(BLOCK));
  rec("CONTROL: it holds TWO commented-out `focus =` lines", commentLines(BLOCK).length === 2, commentLines(BLOCK));
  const refs = api.collectFocusIdsFromSection(BLOCK, "mutually_exclusive");
  rec("CONTROL: the parser reads only the LIVE entry (the model has no field for the other two)",
    JSON.stringify(refs) === JSON.stringify(["CHL_support_the_democracies"]), refs);
  rec("CONTROL: the section sits ABOVE completion_reward in the file",
    BLOCK.indexOf("mutually_exclusive") < BLOCK.indexOf("completion_reward"), "");
}

console.log("\n[the damage is real: what the rebuild does when it runs]");
{
  // Compose the OLD behaviour beside the new one — the ungated call, on the model the parser produces.
  const parsedModel = { id: "CHL_an_attempt_to_maintain_our_neutrality", mutuallyExclusive: api.collectFocusIdsFromSection(BLOCK, "mutually_exclusive") };
  const ungated = api.rewriteFocusBlockMutuallyExclusive(BLOCK, parsedModel);
  rec("the ungated rebuild CHANGES an untouched block", ungated !== BLOCK, "");
  rec("⭐ …and DESTROYS both commented-out entries", commentLines(ungated).length === 0, commentLines(ungated));
  rec("…and relocates the section below completion_reward's old place",
    ungated.indexOf("mutually_exclusive") > ungated.indexOf("ai_will_do"), "");
  rec("…while keeping the live entry (which is why a leaf-assignment diff never saw this)",
    /focus = CHL_support_the_democracies/.test(ungated), "");
}

console.log("\n[the gate: an untouched focus is byte-preserved]");
{
  // The save loop's own decision, lifted out of the shipped source (see saveMutexStep above).
  const untouched = { id: "CHL_an_attempt_to_maintain_our_neutrality", mutuallyExclusive: api.collectFocusIdsFromSection(BLOCK, "mutually_exclusive") };
  const saved = saveMutexStep(BLOCK, untouched);
  rec("⭐ UNEDITED save preserves the block BYTE-FOR-BYTE", saved === BLOCK, "");
  rec("…both commented-out entries survive", commentLines(saved).length === 2, commentLines(saved));
  rec("…and the section is still where the author put it", saved.indexOf("mutually_exclusive") < saved.indexOf("completion_reward"), "");
}

console.log("\n[the gate does not over-correct: a genuine edit still writes]");
{
  // ⭐ POSITIVE CONTROL — a gate that never lets anything through would pass every check above. A real
  // mutex link must still land in the file.
  const edited = {
    id: "CHL_an_attempt_to_maintain_our_neutrality",
    mutuallyExclusive: api.collectFocusIdsFromSection(BLOCK, "mutually_exclusive").concat(["CHL_zz_probe_added"]),
    mutexEdited: true,
  };
  const saved = saveMutexStep(BLOCK, edited);
  rec("⭐ EDITED save DOES rewrite the block", saved !== BLOCK, "");
  rec("⭐ …and the newly linked id is written", /focus = CHL_zz_probe_added/.test(saved), saved);
  rec("…and the pre-existing live entry is still there", /focus = CHL_support_the_democracies/.test(saved), "");

  // Removing the last live entry must still delete the section — the gate must not freeze an unlink.
  const emptied = { id: "x", mutuallyExclusive: [], mutexEdited: true };
  const afterUnlink = saveMutexStep(BLOCK, emptied);
  rec("unlinking the last mutex entry still removes the section", mutexSectionCount(afterUnlink) === 0, mutexSectionCount(afterUnlink));
}

console.log("\n[what must NOT change: deletes and renames stay surgical on an UNTOUCHED focus]");
{
  // The obvious over-correction: gating the rebuild could have stopped deleted/renamed mutex refs from being
  // cleaned. They never went through the rebuild — cleanupReferencesInBlock runs BEFORE the gate and covers
  // mutually_exclusive by name. Assert that on a focus with mutexEdited unset.
  const deleted = api.cleanupReferencesInBlock(BLOCK, new Set(["CHL_support_the_democracies"]), new Map());
  rec("a DELETED mutex ref is still stripped without mutexEdited", !/focus = CHL_support_the_democracies/.test(deleted), deleted);
  rec("⭐ …and the commented-out lines beside it are untouched", commentLines(deleted).length === 2, commentLines(deleted));

  const renamed = api.cleanupReferencesInBlock(BLOCK, new Set(), new Map([["CHL_support_the_democracies", "CHL_renamed_target"]]));
  rec("a RENAMED mutex ref is still rewritten without mutexEdited", /focus = CHL_renamed_target/.test(renamed), renamed);
  rec("…and that rename does not touch the commented-out lines", commentLines(renamed).length === 2, commentLines(renamed));
}

console.log("\n[the shipped save loop really uses the gate]");
{
  const gated = /const withMutex = focus\.mutexEdited\s*\?\s*rewriteFocusBlockMutuallyExclusive\(withPrereqs, focus\)\s*:\s*withPrereqs;/.test(APP);
  rec("save loop calls the mutex rebuild ONLY under `focus.mutexEdited ? ...`", gated,
    "if this became unconditional again the blast radius is 16,979 blocks");
  const callSites = (APP.match(/rewriteFocusBlockMutuallyExclusive\s*\(/g) || []).length; // definition + the one gated call
  rec("exactly ONE call site besides the definition", callSites === 2, callSites);
  // ⭐ Derived, not typed: the flag is set at the two ends of each of the three real user-edit points
  // (applyMutexLink add, applyMutexLink remove, the sidebar list-item remove) = 6 assignments.
  const flagSets = (APP.match(/mutexEdited\s*=\s*true/g) || []).length;
  rec("mutexEdited is set at exactly the 6 known user-edit assignments (tripwire vs. an ungated set)", flagSets === 6, flagSets);
  const setInMutexLink = (APP.slice(APP.indexOf("function applyMutexLink(")).slice(0, 2600).match(/mutexEdited\s*=\s*true/g) || []).length;
  rec("…4 of them inside applyMutexLink (both ends, add and remove)", setInMutexLink === 4, setInMutexLink);
  const parserBody = APP.slice(APP.indexOf("function parseFocuses("));
  const parserEnd = parserBody.indexOf("\n}");
  rec("the parser does NOT set mutexEdited (a freshly loaded focus stays gated)",
    !/mutexEdited/.test(parserBody.slice(0, parserEnd > 0 ? parserEnd : 4000)), "");
  // The sibling gate this one copies must still be there — if it went away, this fix has no precedent and
  // the two rewriters have silently diverged again.
  rec("CONTROL: the prerequisite rewriter is still gated on prereqsEdited",
    /const withPrereqs = focus\.prereqsEdited/.test(APP), "");
}

console.log("\n[RUN IT] every focus in every installed real tree, gated vs ungated");
{
  const ROOTS = [
    ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
    ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"],
    ["Road to 56", "D:/SteamLibrary/steamapps/workshop/content/394360/820260968"],
    ["Old World Blues", "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196"],
    ["Rise of Nations", "D:/SteamLibrary/steamapps/workshop/content/394360/2026448968"],
  ].filter(([, r]) => fs.existsSync(path.join(r, "common", "national_focus")));
  console.log("     corpora found: " + (ROOTS.map((r) => r[0]).join(", ") || "(none)"));

  const blocksOf = (text) => {
    const out = [];
    const re = /(^|\n)[ \t]*(focus|shared_focus)[ \t]*=[ \t]*\{/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const open = text.indexOf("{", m.index);
      const close = api.findMatchingBrace(text, open);
      if (close === -1) break;
      out.push(text.slice(m.index + (m[0].startsWith("\n") ? 1 : 0), close + 1));
      re.lastIndex = close + 1;
    }
    return out;
  };

  let declaring = 0, ungatedChanged = 0, gatedChanged = 0, commentLinesLost = 0, noMutexChanged = 0, noMutexTotal = 0;
  for (const [, root] of ROOTS) {
    const dir = path.join(root, "common", "national_focus");
    for (const f of fs.readdirSync(dir)) {
      if (!/\.txt$/i.test(f)) continue;
      let text;
      try { text = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
      for (const b of blocksOf(text)) {
        const hasSection = /(^|\n)[ \t]*mutually_exclusive\s*=\s*\{/.test(b);
        const focus = { mutuallyExclusive: api.collectFocusIdsFromSection(b, "mutually_exclusive") };
        // The OLD behaviour, run beside the new one.
        const ungated = api.rewriteFocusBlockMutuallyExclusive(b, focus);
        // The SHIPPED decision, on a focus nobody edited.
        const gated = saveMutexStep(b, focus);
        if (!hasSection) { noMutexTotal++; if (ungated !== b) noMutexChanged++; continue; }
        declaring++;
        if (ungated !== b) ungatedChanged++;
        if (gated !== b) gatedChanged++;
        const lost = commentLines(b).length - commentLines(ungated).length;
        if (lost > 0) commentLinesLost += lost;
      }
    }
  }
  console.log(`     ${declaring} blocks declare mutually_exclusive · ungated rewrites ${ungatedChanged} · gated rewrites ${gatedChanged} · comment lines the ungated pass destroys ${commentLinesLost}`);

  rec("the corpus (or at least one tree) was read", declaring > 0 || ROOTS.length === 0, declaring);
  if (declaring > 0) {
    // ⭐ CONTROL: if the ungated pass changed nothing, the run below would prove nothing.
    rec("CONTROL: the ungated rebuild really does rewrite the corpus", ungatedChanged > 1000, ungatedChanged);
    rec("CONTROL: …and really does destroy author comment lines", commentLinesLost > 0, commentLinesLost);
    rec("⭐ RUN: with the gate, a no-edit save rewrites ZERO blocks", gatedChanged === 0, gatedChanged);
    // A block with no mutually_exclusive at all must be untouched either way — proves the measurement is
    // not just "everything differs".
    rec("CONTROL: blocks without the section are never touched", noMutexChanged === 0, `${noMutexChanged} of ${noMutexTotal}`);
  }
}

console.log(`\n=== an untouched focus keeps its mutually_exclusive block: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((f) => console.log("   - " + f)); process.exit(1); }
