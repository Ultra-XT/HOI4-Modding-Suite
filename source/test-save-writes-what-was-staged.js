// #source-patch-invalidates-block-offsets + #staged-techs-lost-on-a-silent-refusal
//
// THE OTHER HALF OF "EDITS WAIT FOR SAVE": SAVE HAS TO ACTUALLY WRITE THEM.
//
// Making edits wait is only safe if the Save button then writes every one. Two things had to be true and
// were not, and both were found by asking that question rather than the first one.
//
// ── 1. A TREE-HEADER EDIT MUST NOT BE PATCHED INTO sourceText ──────────────────────────────────────
//
// parsed.focuses[].blockStart / blockEnd are BYTE OFFSETS INTO sourceText, and Save is
// rewriteCoordinates(sourceText, parsed), which splices each focus block by those offsets. Insert a line
// above a focus and every offset below it is wrong by the length of that line.
//
// Two places patched sourceText directly while the editor was open — the continuous-focus panel position
// and the shared_focus toggle — each with a comment about keeping the text "in sync so a later save
// preserves the change". Measured on Millennium Dawn's USA tree (776 focuses, 1.37 MB), with `parsed` held
// fixed so only sourceText differed:
//
//     expected difference after staging a panel position   +51 bytes (the line itself)
//     actual                                               -43,241 bytes
//     non-whitespace characters lost                        39,888
//     still parsed to 776 focuses, braces balanced          yes  ← so the "invalid file" guard passed it
//
// Nova would have reported a successful save of a tree with 40 KB missing. Header edits are staged as DATA
// now and applied to the OUTPUT of rewriteCoordinates, once every offset has been spent.
//
// ⚠️ DATA, NOT A CLOSURE. The first version stored { apply: (t) => ... } and worked until Ctrl+Z then
// Ctrl+Y: pushUndoEntry keeps cloneJson(snapshot), JSON drops functions, and the entry came back inert. The
// map still had one entry, applying it did nothing, and the move vanished at save with nothing said. That
// is why the checks below insist on kind/match/line and round-trip the entry through JSON.
//
// ── 2. A REFUSAL MUST NOT READ AS A SAVE ───────────────────────────────────────────────────────────
//
// saveCountryTechs refuses — correctly — when there is no mod, when the previous read failed (it would
// otherwise overwrite real starting technologies with a list built on a failed read), and when the server
// answers an error. It refused by returning early, which was fine while technologies wrote on the keystroke:
// the alert appeared with nothing staged. Once they were staged for Save, the flush advanced its baseline
// and marked the page clean regardless, so a refusal became "Country details saved successfully!" over a
// list that never reached disk. Verified in the running page with the server stubbed to refuse: the save
// no longer claims success, the page stays dirty, and the staged technology is still on screen to retry.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}
const PUB = path.join(__dirname, "public");
const { stripJsComments } = require("./testlib-strip-comments.js");
// ⭐ The prose above quotes every symbol checked below, including one that must be ABSENT.
const APP = stripJsComments(fs.readFileSync(path.join(PUB, "app.js"), "utf8"));
const CS = stripJsComments(fs.readFileSync(path.join(PUB, "country-setup.js"), "utf8"));

function fnText(code, name) {
  const at = code.search(new RegExp("(?:async\\s+)?function\\s+" + name + "\\s*\\("));
  if (at === -1) return "";
  // ⚠️ Skip the PARAMETER LIST before hunting the body brace. `saveFileWithOptions(options = {})` has a
  // default object in its signature, and taking the first "{" after the name landed on that — the match
  // closed one character later and the function came back empty.
  let p = code.indexOf("(", at), depth = 0, sigEnd = -1;
  for (let k = p; k < code.length; k++) {
    if (code[k] === "(") depth++;
    else if (code[k] === ")") { depth--; if (depth === 0) { sigEnd = k; break; } }
  }
  if (sigEnd === -1) return "";
  let i = code.indexOf("{", sigEnd), d = 0, mode = null, quote = "";
  for (; i < code.length; i++) {
    const c = code[i], p = code[i - 1];
    if (mode) {
      if (mode === "str" && c === quote && p !== "\\") mode = null;
      else if (mode === "re" && c === "/" && p !== "\\") mode = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { mode = "str"; quote = c; continue; }
    if (c === "/" && /[=(,:[!&|?{};]\s*$/.test(code.slice(Math.max(0, i - 12), i))) { mode = "re"; continue; }
    if (c === "{") d++;
    else if (c === "}") { d--; if (d === 0) return code.slice(at, i + 1); }
  }
  return "";
}

console.log("\n[1] the offset invariant — nothing may patch sourceText while the editor is open");
{
  // ⭐ THE WHOLE BUG IN ONE DERIVED CHECK. Any `sourceText = sourceText.replace(...)` shifts every focus
  // offset, whoever writes it and for whatever reason.
  const patches = (APP.match(/sourceText = sourceText\.replace\(/g) || []).length;
  rec("no code patches sourceText in place", patches === 0, patches + " site(s) still splice sourceText");
  // …and every remaining assignment replaces the text WHOLESALE from a source that is re-parsed with it, so
  // text and offsets stay in step. Listed by right-hand side rather than counted, so a new assignment from
  // somewhere else shows up here by name instead of quietly joining a total.
  const SAFE_SOURCES = [
    '""',            // the initial value
    "nextSource",    // a freshly loaded file — parsed alongside it
    "rewritten",     // what Save just wrote — reparsed alongside it
  ];
  const rhs = [...APP.matchAll(/^\s*sourceText = ([^;\n]+);/gm)]
    .map((m) => m[1].trim())
    .filter((r) => !SAFE_SOURCES.includes(r) && !/^typeof snapshot\.sourceText/.test(r));
  rec("…and every other assignment replaces it wholesale from a re-parsed source", rhs.length === 0, rhs);

  rec("a staging area for header edits exists", /let pendingTreeHeaderEdits = new Map\(\)/.test(APP), "no staging area");
  rec("the panel move stages instead of patching", /pendingTreeHeaderEdits\.set\("continuous_focus_position"/.test(APP), "the panel writes into sourceText again");
  rec("…and so does the shared_focus toggle", /pendingTreeHeaderEdits\.set\("shared_focus:"/.test(APP), "shared_focus patches sourceText again");

  // The composition is the fix: rewrite FIRST (spending the offsets), header edits after.
  // ⚠️ Scoped to the SAVE function. Tested against the whole file, this passed with the save path reversed,
  // because focusEditorDebug.verify() still had the right composition a few thousand lines away.
  const saveFn = fnText(APP, "saveFileWithOptions");
  rec("saveFileWithOptions is found", saveFn.length > 500, saveFn.length);
  rec("Save applies them after the rewrite", /applyPendingTreeHeaderEdits\(rewriteCoordinates\(sourceText, parsed\)\)/.test(saveFn), "the order changed — offsets would be stale again");
  // The crisp invariant, file-wide: the inverted composition must appear NOWHERE. Feeding sourceText
  // through the header edits before the rewrite is exactly the bug, just spelled differently.
  rec("…and nowhere is it composed the other way round", !/rewriteCoordinates\(applyPendingTreeHeaderEdits\(/.test(APP), "a path patches the text before the offsets are spent");
  rec("…and every rewrite goes through them", !/[^(]rewriteCoordinates\(sourceText, parsed\)(?!\))/.test(APP.replace(/applyPendingTreeHeaderEdits\(rewriteCoordinates\(sourceText, parsed\)\)/g, "")), "a rewrite path skips the staged header edits");
  // ⚠️ Anchored to the post-save resync, NOT to `pendingTreeHeaderEdits = new Map();` on its own — that also
  // matches the declaration, so removing the clear left the check passing and the back-out silent.
  rec("…and they are cleared once written",
    /sourceText = rewritten;[\s\S]{0,400}?pendingTreeHeaderEdits = new Map\(\);/.test(APP),
    "a stale header edit would be re-applied on the next save");

  // Undo must carry them, and that is only possible because they are data.
  rec("the undo snapshot carries them", /pendingTreeHeaderEdits: \[\.\.\.pendingTreeHeaderEdits\.entries\(\)\]/.test(fnText(APP, "snapshotEditorState")), "Ctrl+Z would leave the move staged");
  rec("…and the restore puts them back", /pendingTreeHeaderEdits = new Map\(snapshot\.pendingTreeHeaderEdits \|\| \[\]\)/.test(fnText(APP, "restoreEditorState")), "redo would lose the move");
}

console.log("\n[RUN IT] the header-edit mechanism, against real text");
{
  // #header-edit-lands-in-a-comment — the applier masks comments before it looks for its match now, so
  // maskPdxComments has to come into the vm with it or the extraction throws ReferenceError.
  const src = [fnText(APP, "applyPendingTreeHeaderEdits"), fnText(APP, "maskPdxComments")].join("\n");
  rec("applyPendingTreeHeaderEdits was extracted", src.length > 150, src.length);

  const TREE = [
    "# a comment",
    "focus_tree = {",
    "\tid = probe_focus",
    "\tcountry = { base = 0 }",
    "",
    "\tfocus = {",
    "\t\tid = probe_a",
    "\t\tx = 1",
    "\t}",
    "}",
  ].join("\n");

  const run = (entries, text) => {
    const ctx = { pendingTreeHeaderEdits: new Map(entries), warnings: [], dbgWarn: (...a) => ctx.warnings.push(a[0]), out: null };
    vm.createContext(ctx);
    vm.runInContext(src + "\nout = applyPendingTreeHeaderEdits(" + JSON.stringify(text) + ");", ctx);
    return { text: ctx.out, warnings: ctx.warnings };
  };

  const POS = ["continuous_focus_position", { kind: "upsert", match: "continuous_focus_position\\s*=\\s*\\{[^}]*\\}", line: "continuous_focus_position = { x = 10 y = 20 }" }];

  {
    const r = run([POS], TREE);
    rec("an upsert INSERTS when the line is absent", /continuous_focus_position = \{ x = 10 y = 20 \}/.test(r.text), r.text);
    rec("…inside the focus_tree block", /focus_tree = \{\n\tcontinuous_focus_position/.test(r.text), r.text.slice(0, 120));
    rec("…exactly once", (r.text.match(/continuous_focus_position/g) || []).length === 1, r.text);
    // ⭐ THE POINT: everything else is byte-identical. That is what the 43 KB loss was not.
    rec("…and changes NOTHING else", r.text.replace(/\n\tcontinuous_focus_position = \{ x = 10 y = 20 \}/, "") === TREE, JSON.stringify(r.text));
  }
  {
    const withPos = TREE.replace("\tid = probe_focus", "\tid = probe_focus\n\tcontinuous_focus_position = { x = 1 y = 2 }");
    const r = run([POS], withPos);
    rec("an upsert REPLACES when the line is present", /x = 10 y = 20/.test(r.text) && !/x = 1 y = 2 \}/.test(r.text), r.text);
    rec("…still exactly once", (r.text.match(/continuous_focus_position/g) || []).length === 1, r.text);
  }
  {
    const withShared = TREE.replace("\tid = probe_focus", "\tid = probe_focus\n\tshared_focus = probe_shared");
    const r = run([["shared_focus:probe_shared", { kind: "remove", match: "(^|\\n)[ \\t]*shared_focus[ \\t]*=[ \\t]*probe_shared\\b[^\\n]*", line: "shared_focus = probe_shared" }]], withShared);
    rec("a remove takes the line out", !/shared_focus/.test(r.text), r.text);
  }
  {
    // ⚠️ AN UPSERT MUST PUT BACK EVERYTHING ITS MATCH ATE.
    //
    // The shared_focus pattern begins `(^|\n)` so that REMOVING it also takes the newline and leaves no
    // blank line. Substituting the bare line then welded it onto the line above:
    //     id = my_tree     became     id = my_treeshared_focus = grp
    // which renames the tree and is a corrupt file. Reproduced exactly, so it stays reproduced.
    const SHARED = ["shared_focus:grp", {
      kind: "upsert",
      match: "(^|\\n)[ \\t]*shared_focus[ \\t]*=[ \\t]*grp\\b[^\\n]*",
      line: "shared_focus = grp",
      replace: "$1\tshared_focus = grp",
    }];
    const withShared = TREE.replace("\tid = probe_focus", "\tid = probe_focus\n\tshared_focus = grp");
    const r = run([SHARED], withShared);
    rec("re-upserting an existing line does not weld it onto the one above", !/probe_focusshared_focus/.test(r.text), r.text.slice(0, 130));
    rec("…and the id above it survives intact", /\tid = probe_focus\n/.test(r.text), r.text.slice(0, 130));
    rec("…leaving exactly one shared_focus line", (r.text.match(/shared_focus/g) || []).length === 1, r.text);
    // The code must actually carry a replacement for that entry, or the shape above is theoretical.
    rec("…and the page stores that replacement", /replace: "\$1\\tshared_focus = " \+ sharedId/.test(APP), "the shared_focus entry has no explicit replacement");
  }
  {
    // ⚠️ THE v1 BUG, PINNED. cloneJson is JSON.parse(JSON.stringify(...)); a closure does not survive it.
    const cloned = JSON.parse(JSON.stringify([POS]));
    const r = run(cloned, TREE);
    rec("an entry SURVIVES a JSON round-trip and still applies", /x = 10 y = 20/.test(r.text), "the staged edit is inert after undo/redo");
    rec("…because it carries no function", typeof cloned[0][1].apply !== "function", cloned[0][1]);
    rec("…and the code stores kind/match/line, not an apply()", !/pendingTreeHeaderEdits\.set\([^)]*apply:/.test(APP), "a closure is being stored again");
  }
  {
    // A malformed entry must be reported, not swallowed — and must not take the save down.
    const r = run([["broken", { kind: "upsert" }]], TREE);
    rec("a malformed entry is skipped, not thrown", r.text === TREE, r.text);
    rec("…and is reported rather than swallowed", r.warnings.length > 0, r.warnings);
  }
}

console.log("\n[1b] a position edit must reach the file — `moved` could not carry two meanings");
{
  // focus.moved means two different things to two different readers:
  //   resolveLayout      "displayX/displayY are authoritative — do NOT recompute them from x/y"
  //   rewriteCoordinates "this focus's position must be written to the file"
  // The sidebar's Grid X/Y boxes have to clear it for the first meaning, which cancelled the second.
  // Measured on Millennium Dawn's USA tree, USA_focus_2012_blue_chip (file x = 1):
  //   drag it                              → the rewrite emitted the new value
  //   then type ANY sidebar field          → the rewrite emitted 1 again, silently reverting the drag
  //   type a Grid X with no drag at all    → never reached the file
  const gate = /const withPosition = ([^\n]+)/.exec(APP);
  rec("the position write gate is findable", !!gate, "gate not found");
  rec("…and consults positionDirty", !!gate && /focus\.positionDirty/.test(gate[1]), gate && gate[1]);
  rec("…alongside moved, which still means what it meant", !!gate && /focus\.moved/.test(gate[1]), gate && gate[1]);

  const drag = /focus\.displayY = startGY \+ allowedDGY;[\s\S]{0,200}/.exec(APP);
  rec("a canvas drag marks the position dirty", !!drag && /focus\.positionDirty = true/.test(drag[0]), drag && drag[0].slice(0, 200));

  const side = fnText(APP, "applySidebarLiveChanges");
  rec("applySidebarLiveChanges is found", side.length > 500, side.length);
  rec("…it marks the position dirty when the Grid boxes change", /gridChanged \|\| focus\.moved\) focus\.positionDirty = true/.test(side), side.slice(-400));
  // ⭐ The comparison must happen BEFORE the assignment, or nothing can tell a retyped value from the old one.
  rec("…comparing before it assigns", side.indexOf("const gridChanged") < side.indexOf("if (!isNaN(nx)) focus.x = nx"), "gridChanged is computed after the write, so it is always false");
  // …and it must STILL clear moved, or the canvas stops following the boxes.
  rec("…and still hands displayX/Y back to resolveLayout", /focus\.moved = false;/.test(side), "clearing moved was removed — the canvas would stop tracking the Grid boxes");

  // CONTROL: the other reader is untouched, which is the whole reason for a second flag.
  rec("CONTROL: resolveLayout still keys on moved alone", /if \(!focus\.moved\) \{\s*focus\.displayX = focus\.x;/.test(APP), "resolveLayout changed — re-check the two meanings");
  // forceRewrite is INTERNAL: computeWriteValues resets it for every focus and re-derives it, so setting it
  // from outside does nothing. Two callers did, and both of their fixes were inert.
  const cwv = fnText(APP, "computeWriteValues");
  rec("forceRewrite is still owned by computeWriteValues", /focus\.forceRewrite = false;/.test(cwv), "if this changed, forceRewrite may be settable from outside now");
  rec("…and nothing outside it sets forceRewrite any more", (APP.match(/\.forceRewrite = true/g) || []).length === (cwv.match(/\.forceRewrite = true/g) || []).length,
    "a caller outside computeWriteValues is writing to a flag that gets wiped");

  // ⭐ THE ONE THAT MADE THE DOCUMENTED FIX INERT. Deleting a focus rebases its relatives to absolute
  // coordinates; the block then has to be re-emitted or the old OFFSET is written and read as absolute,
  // teleporting the focus and its whole sub-branch to the top-left. 758 of Millennium Dawn's 776 USA focuses
  // use a relative anchor, so this is most of the tree.
  rec("the delete-rebase marks the position dirty", /focus\.relativePositionId = "";[\s\S]{0,400}focus\.positionDirty = true;/.test(APP), "the rebase still cannot reach the file");

  // …and a focus marked that way must have something to WRITE, or the block comes out `x = undefined`.
  rec("computeWriteValues gives a positionDirty focus a write value", /if \(!focus\.positionDirty\) return;[\s\S]{0,200}focus\.writeX = focus\.x;/.test(cwv), "the block would be emitted as x = undefined");
  // ⭐ focus.x, NOT displayX. For a focus that still has an anchor, x IS the offset the sidebar edits;
  // writing displayX there would silently absolutise it and drop the anchor.
  rec("…from focus.x/y, so a typed OFFSET stays an offset", /focus\.writeX = focus\.x;\s*\n\s*focus\.writeY = focus\.y;/.test(cwv), "a relative focus would be absolutised by a typed coordinate");
  // …and only where the rules that know about drags and re-anchoring did not already decide.
  rec("…and only where nothing else decided", /if \(focus\.writeX != null && focus\.writeY != null\) return;/.test(cwv), "it would override the drag and re-anchor rules");
  rec("…running after them", cwv.lastIndexOf("focus.positionDirty") > cwv.indexOf("toAbsolute.has(focus.id)"), "the fallback runs before the rules it defers to");
}

console.log("\n[1c] a localisation failure must not strand the structural edits");
{
  // Saving a focus tree is two writes: the .txt, then localisation. Every localisation failure path does
  // `markDirty(true); return;` — and the pending containers used to be cleared AFTER that point, so a
  // localisation failure left behind edits describing a file that no longer existed. sourceText and parsed
  // have already adopted the written .txt by then, and:
  //
  //   · pendingDeletedBlocks holds blockStart/blockEnd offsets into the OLD sourceText, and rewriteCoordinates
  //     splices deleteOps by exactly those numbers — so the "Save again" the status line suggests would cut
  //     the new file at positions measured in the old one.
  //   · pendingNewFocuses would insert focuses the file already contains, a second time.
  const save = fnText(APP, "saveFileWithOptions");
  rec("saveFileWithOptions is found", save.length > 1000, save.length);

  const at = (needle) => save.indexOf(needle);
  const wrote = at("sourceText = rewritten;");
  const structural = at("pendingDeletedBlocks = new Map();");
  const locWrite = at('fetch("/api/localization/upsert"');
  const locClear = at("pendingLocalizationEdits = new Map();");
  rec("all four landmarks are present", [wrote, structural, locWrite, locClear].every((i) => i !== -1), { wrote, structural, locWrite, locClear });

  // ⭐ THE ORDER IS THE FIX.
  rec("the structural edits are cleared once the .txt is written", wrote < structural, { wrote, structural });
  rec("…BEFORE localisation is attempted, so no failure path can skip it", structural < locWrite, { structural, locWrite });
  rec("…while the localisation edits are cleared only after it", locWrite < locClear, { locWrite, locClear });
  // …and they must not be cleared early, or a failed localisation write loses the names it never wrote.
  rec("…and are not cleared alongside the structural ones", at("pendingLocalizationEdits = new Map();") > at("pendingEffectBlockRemovals = new Map();"), "the names would be dropped by a failed localisation write");

  // pendingEffectEdits is re-derived from the file that was just written, so it must be rebuilt there too.
  rec("pendingEffectEdits is re-derived at the write", /pendingEffectEdits = new Map\(\);[\s\S]{0,300}extractCompletionRewardManagedLines/.test(save.slice(wrote)), "it would describe the previous file");
  rec("…exactly once", (save.match(/pendingEffectEdits = new Map\(\);/g) || []).length === 1, (save.match(/pendingEffectEdits = new Map\(\);/g) || []).length);

  // CONTROL: the failure paths still exist and still keep the tree dirty for a retry.
  rec("CONTROL: a localisation failure still marks the tree dirty", /localization request failed[\s\S]{0,400}markDirty\(true\)/.test(save), "the retry prompt went");
  rec("CONTROL: …and still says the tree itself was saved", /Focus tree was saved, but the localization/.test(save), "the message no longer distinguishes the two writes");
}

console.log("\n[2] Country Setup — a refusal must not read as a save");
{
  const techs = fnText(CS, "saveCountryTechs");
  rec("saveCountryTechs is found", techs.length > 200, techs.length);
  // Every early exit is a refusal and must say so.
  const returns = (techs.match(/return (true|false);/g) || []);
  rec("…and every exit reports whether it wrote", returns.length >= 5, returns);
  rec("…refusing with no mod", /Please select an active mod first\.\"\);\s*return false;/.test(techs), techs.slice(0, 300));
  rec("…refusing after a failed read", /Not saved\"\);\s*return false;/.test(techs), "the techLoadFailed guard no longer reports");
  rec("…refusing on a server error", /return false;[\s\S]{0,120}addTechInput\.value/.test(techs) || /resp\.ok \|\| data\.error[\s\S]{0,120}return false/.test(techs), techs.slice(0, 600));
  rec("…and checking the HTTP status, not just data.error", /!resp\.ok \|\| data\.error/.test(techs), "a 500 with no error key would read as success");
  rec("…returning true only after the write", /await loadCountryTechs\(selectedTag\);\s*return true;/.test(techs), techs.slice(-300));

  const flush = fnText(CS, "flushStagedStartup");
  rec("the flush reports upward", /return allWritten;/.test(flush), "the caller cannot know whether it worked");
  // ⭐ THE BUG: the baseline used to advance unconditionally.
  rec("…and advances the tech baseline ONLY on a real write", /if \(allWritten\) savedTechs = \[\.\.\.currentTechs\]/.test(flush), "a refusal would still look saved");

  const save = fnText(CS, "saveCountryDetails");
  rec("the save asks the flush how it went", /const allWritten = await flushStagedStartup\(\)/.test(save), "the result is ignored");
  rec("…and only marks clean when everything landed", /if \(allWritten\) csMarkClean\(\)/.test(save), "the page would go clean over unwritten work");
  rec("…and only claims success then too", /else if \(allWritten\)[\s\S]{0,80}saved successfully/.test(save), "a refusal would still say 'saved successfully'");
  // Ordering: the message must follow the write, not precede it.
  rec("…with the message AFTER the staged half is written",
    save.indexOf("flushStagedStartup()") < save.indexOf("saved successfully"), "success is announced before the write");

  // ── A NO-OP IS NOT A REMOVAL ──────────────────────────────────────────────────────────────────────
  //
  // Removing a starting spirit from a country whose history file this mod does not own answers
  // { ok: true, noop: true } and writes nothing. That refusal is correct — materialising a full vanilla-copy
  // override to take one line out would drop ~57 KB of the base game's country into the mod, where it
  // shadows that country forever, frozen at this patch. But ok:true was read as done: the baseline advanced,
  // the page said "Country details saved successfully!", and the reload underneath put the spirit straight
  // back with no explanation. Reachable with no failure anywhere — on a country the mod does not own, an
  // unchanged details form ALSO no-ops (server.js:26989), so nothing materialises to make the removal work.
  rec("a declined removal is collected", /if \(!active && data && data\.noop\) notRemoved\.push\(itemId\)/.test(flush), "a noop removal still reads as done");
  rec("…and reported to the user", /nbAlert\([\s\S]{0,200}nothing to \" \+\n?\s*\"remove|nothing to remove/.test(flush) || /notRemoved\.join/.test(flush), flush.slice(-600));
  rec("…saying how to make it work", /own copy of the/.test(flush), "the message does not say what to do about it");
  rec("…and it does not count as a clean save", /let allWritten = notRemoved\.length === 0;/.test(flush), "a declined removal would still say 'saved successfully'");
  // Only a REMOVAL can no-op this way; an add materialises the file, so it must not be swallowed as one.
  rec("…and only removals are treated this way", /!active && data && data\.noop/.test(flush), "an add that no-ops would be reported as a refusal");

  // The other hole: re-clicking the country you are already on reloads the form, so it is a discard.
  const sel = fnText(CS, "selectCountry");
  rec("re-selecting the SAME country still asks when dirty", /if \(csDirty\) \{/.test(sel) && !/csDirty && tag !== selectedTag/.test(sel), sel.slice(0, 300));
}

console.log("\n[CONTROL] the machinery around all this is untouched");
{
  rec("Save still posts the tree", /fetch\("\/api\/save"/.test(APP), "the focus-tree save vanished");
  rec("…still guards on the on-disk fingerprint", /baseFingerprint: loadedFingerprint/.test(APP), "the conflict check went");
  rec("…and still refuses to write an unparseable rewrite", /Save blocked: generated file is invalid/.test(APP), "the validation guard went");
  rec("the panel move is still undoable", /pushUndoSnapshot\(\)/.test(fnText(APP, "cfPanelEndDrag")), "the drag stopped snapshotting");
  rec("Country Setup still writes both staged lists", /set-startup/.test(CS) && /save-country-techs/.test(CS), "a writer vanished");
  rec("…and the tech guard that protects a failed read is still there", /techLoadFailed/.test(CS), "the overwrite guard went");
}

console.log(`\n=== save writes what was staged: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
