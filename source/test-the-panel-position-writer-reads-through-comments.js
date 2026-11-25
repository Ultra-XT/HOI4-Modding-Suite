/**
 * THE CONTINUOUS-FOCUS PANEL WROTE ITS NEW POSITION INTO A COMMENT, AND SAID IT SAVED.
 *
 * Nova draws HOI4's continuous-focus window as a draggable box on the focus canvas. Letting go of it stages
 * a continuous_focus_position upsert (cfStageTreePosition, public/app.js) which Save applies to the
 * rewritten tree text (applyPendingTreeHeaderEdits, public/app.js).
 *
 * THE READER MASKED COMMENTS. THE WRITER DID NOT.
 *
 * parseTreeContinuousPosition strips comments before it looks for continuous_focus_position, so on a tree
 * whose only one is behind a # the editor correctly reported "no position". The writer matched raw text,
 * found that dead line, and rewrote the numbers INSIDE the author's comment. Nova then said
 * "Continuous-focus panel moved - unsaved, click Save when ready", the save reported success, and:
 *   - no live continuous_focus_position was ever produced, so the panel is still unpositioned in game and
 *     snaps back the next time the tree is opened; and
 *   - the value the modder had parked in that comment was silently changed under them.
 * Measured over 763 shipping focus-tree files in 7 installed roots: 8 files have their ONLY
 * continuous_focus_position behind a # - vanilla paraguay_uruguay_shared_branch.txt, four in Road to 56
 * (japan_old, paraguay_uruguay_shared_branch, r56_estonia_shared, silesia) and three in Old World Blues
 * (Baggers (BAG) Focus, Lanius Cohort Revolter (LAC) Focus, Withered Dogs (WHD) Focus).
 *
 * THE INSERT FALLBACK WAS BLIND THE SAME WAY. With no match it anchored on the first "focus_tree = {"
 * ANYWHERE in the text, a commented-out one included, and put a LIVE property line under it. On 5 of those
 * 763 files (OWB "New California Republic (NCR) Focus OLD", OWB "Sleepers (SLE) Focus", R56 japan_old,
 * r56_estonia_shared, silesia) the first focus_tree in the file is commented out, so the line landed outside
 * every tree. Anchoring on the first LIVE focus_tree is also what makes the insert hit the tree the user is
 * actually editing on the 22 files that declare more than one: the tree-owner dialog tells the user "this
 * file has N trees; editing the first", and "first" has to mean the first real one.
 *
 * AND ON A FILE WITH NO focus_tree AT ALL, THE EDIT WAS THROWN AWAY IN SILENCE. String.replace with no
 * match returns its input, so applyPendingTreeHeaderEdits returned the text unchanged, nothing warned (the
 * catch only fires on a bad regex), /api/save answered ok:true and the editor marked the tree clean. 114 of
 * the 763 files declare no focus_tree - the shared_focus-only branches (china_shared, baltic_shared,
 * abdacom_shared_branch, ...) that Nova's canvas happily opens, because parseFocuses accepts both
 * containers. Those have nowhere legal to put the property, so the drag is refused up front now.
 *
 * WHY THE EXISTING TEST PASSED WITH ALL OF IT LIVE. test-save-writes-what-was-staged.js drives this exact
 * staged entry through a vm and passes 80/80. Its fixture's only comment is "# a comment" and line 2 is
 * always "focus_tree = {", so the upsert branch only ever met a live line and the anchor always found a
 * live target. A fixture only measures what it happens to include.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

let failed = 0;
let checks = 0;
function rec(label, cond, detail) {
  checks += 1;
  if (cond) { console.log("  ok   " + label); return; }
  failed += 1;
  console.log("  FAIL " + label + (detail === undefined ? "" : "  --  " + JSON.stringify(detail).slice(0, 300)));
}

const APP_PATH = path.join(__dirname, "public", "app.js");
const APP_LINES = fs.readFileSync(APP_PATH, "utf8").split(/\r?\n/);

// Extract a top-level function by LINES: header line to the next line that is exactly "}" at column 0.
// The brace-counting extractor in the sibling test miscounts a regex literal containing a brace and
// silently returns "" - and the function under test now contains two of them.
function fnText(name) {
  const i = APP_LINES.findIndex((l) => l.startsWith("function " + name + "(") || l.startsWith("async function " + name + "("));
  if (i === -1) return "";
  for (let j = i + 1; j < APP_LINES.length; j += 1) if (APP_LINES[j] === "}") return APP_LINES.slice(i, j + 1).join("\n");
  return "";
}

const SRC = [fnText("applyPendingTreeHeaderEdits"), fnText("maskPdxComments"), fnText("parseTreeContinuousPosition")].join("\n");

// EXACTLY what cfStageTreePosition builds when the panel is dropped - lifted from its source, not invented.
const STAGED = {
  kind: "upsert",
  match: "continuous_focus_position\\s*=\\s*\\{[^}]*\\}",
  line: "continuous_focus_position = { x = 999 y = 888 }",
};

function run(text, entries) {
  const ctx = {
    pendingTreeHeaderEdits: new Map(entries || [["continuous_focus_position", STAGED]]),
    warnings: [],
    TEXT: text,
    out: null,
  };
  ctx.dbgWarn = (m) => ctx.warnings.push(String(m));
  vm.createContext(ctx);
  vm.runInContext(SRC + "\nout = applyPendingTreeHeaderEdits(TEXT);", ctx);
  return { text: ctx.out, warnings: ctx.warnings, read: ctx.parseTreeContinuousPosition(ctx.out), mask: ctx.maskPdxComments };
}
function liveCount(masker, text) {
  return (masker(text).match(/continuous_focus_position/g) || []).length;
}
function commentsOf(text) {
  return (text.match(/#[^\r\n]*/g) || []).join("\u0001");
}

console.log("\n[SETUP] the client code came across");
rec("applyPendingTreeHeaderEdits was extracted", fnText("applyPendingTreeHeaderEdits").length > 400, fnText("applyPendingTreeHeaderEdits").length);
rec("maskPdxComments came with it", fnText("maskPdxComments").length > 200, fnText("maskPdxComments").length);
rec("parseTreeContinuousPosition came too", fnText("parseTreeContinuousPosition").length > 200, fnText("parseTreeContinuousPosition").length);

// A tree whose ONLY continuous_focus_position is commented out - the shape of the 8 shipping files.
const COMMENTED = [
  "focus_tree = {",
  "\tid = probe_tree",
  "\tcountry = { factor = 1 }",
  "#\tcontinuous_focus_position = { x = 50 y = 1350 }",
  "",
  "\tfocus = {",
  "\t\tid = probe_a",
  "\t\tx = 1",
  "\t\ty = 0",
  "\t}",
  "}",
  "",
].join("\r\n");

console.log("\n[FIXTURE CONTROL] the fixture really has the property under test");
{
  const probe = run(COMMENTED, []);
  rec("the fixture DOES contain a continuous_focus_position", /continuous_focus_position/.test(COMMENTED), "nothing to be blind to");
  rec("...and it is COMMENTED OUT, invisible to a comment-masking scan", liveCount(probe.mask, COMMENTED) === 0, probe.mask(COMMENTED));
  rec("...while the writer's own raw pattern DOES match it", new RegExp(STAGED.match).test(COMMENTED), "the bug needs a raw match to exist");
  rec("...so the editor reads NO position from it", probe.read === null, probe.read);
}

console.log("\n[THE BUG] dragging the panel must not edit a comment");
{
  const r = run(COMMENTED);
  rec("a live continuous_focus_position is produced", liveCount(r.mask, r.text) === 1, r.text);
  rec("...carrying the dragged value", /\bx = 999\b/.test(r.mask(r.text)) && /\by = 888\b/.test(r.mask(r.text)), r.text);
  rec("...and the editor can read the position back", r.read !== null && r.read.x === 999 && r.read.y === 888, r.read);
  // MUST-NOT-CHANGE control: the author's commented value is data, not a slot to write into.
  rec("the author's commented-out value is left EXACTLY as it was", commentsOf(r.text) === commentsOf(COMMENTED), commentsOf(r.text));
  rec("...so x = 50 y = 1350 still sits in the comment", /#\tcontinuous_focus_position = \{ x = 50 y = 1350 \}/.test(r.text), r.text);
  rec("...and the live line lands inside the focus_tree block", /focus_tree = \{\r?\n\tcontinuous_focus_position = \{ x = 999 y = 888 \}/.test(r.text), r.text.slice(0, 160));
}

console.log("\n[POSITIVE CONTROL] the ordinary paths still behave");
{
  const LIVE = COMMENTED.replace("#\tcontinuous_focus_position = { x = 50 y = 1350 }", "\tcontinuous_focus_position = { x = 50 y = 1350 }");
  const r = run(LIVE);
  rec("a LIVE line is replaced in place", /\tcontinuous_focus_position = \{ x = 999 y = 888 \}/.test(r.text), r.text);
  rec("...exactly once", liveCount(r.mask, r.text) === 1, r.text);
  rec("...the old value is gone", !/x = 50 y = 1350/.test(r.text), r.text);
  rec("...nothing else in the file moved", r.text.replace("x = 999 y = 888", "x = 50 y = 1350") === LIVE, r.text);
  rec("...and no warning was raised", r.warnings.length === 0, r.warnings);
}
{
  const NONE = COMMENTED.replace("#\tcontinuous_focus_position = { x = 50 y = 1350 }\r\n", "");
  const r = run(NONE);
  rec("with no occurrence at all the line is INSERTED", liveCount(r.mask, r.text) === 1, r.text);
  rec("...under focus_tree = {", /focus_tree = \{\r?\n\tcontinuous_focus_position/.test(r.text), r.text.slice(0, 140));
  rec("...and nothing else moved", r.text.replace("\tcontinuous_focus_position = { x = 999 y = 888 }\n", "") === NONE, r.text);
}
{
  // WRITE-REALLY-HAPPENED control: an empty staging map must return the text byte-identical, so that a
  // "nothing changed" result elsewhere is a measured absence and not a dead probe.
  const r = run(COMMENTED, []);
  rec("an empty staging map returns the text byte-identical", r.text === COMMENTED, "the probe cannot tell change from no-change");
}

console.log("\n[THE ANCHOR] the insert must not land in a commented-out tree");
{
  // The shape of OWB "Sleepers (SLE) Focus.txt": the first focus_tree in the file is commented out.
  const TWO = [
    "# focus_tree = {",
    "#\tid = retired_tree",
    "# }",
    "focus_tree = {",
    "\tid = real_tree",
    "\tfocus = { id = a x = 0 y = 0 }",
    "}",
    "",
  ].join("\r\n");
  const before = run(TWO, []);
  rec("FIXTURE: the first focus_tree in the raw text IS commented out", /^# focus_tree = \{/.test(TWO), TWO.slice(0, 40));
  rec("...i.e. the old raw anchor and a masked anchor disagree", /(focus_tree\s*=\s*\{[^\n]*\n)/.exec(TWO).index !== /(^|\n)[ \t]*focus_tree\s*=\s*\{[^\n]*\n/.exec(before.mask(TWO)).index, "fixture lost the property");
  const r = run(TWO);
  rec("the inserted line lands in the LIVE tree", /\r\nfocus_tree = \{\r?\n\tcontinuous_focus_position = \{ x = 999 y = 888 \}/.test(r.text), r.text);
  rec("...and not in the commented-out one", !/# focus_tree = \{\r?\n\tcontinuous/.test(r.text), r.text);
  rec("...leaving the comments byte-identical", commentsOf(r.text) === commentsOf(TWO), commentsOf(r.text));
  rec("...and the editor reads the position back", r.read !== null && r.read.x === 999, r.read);
}

console.log("\n[NO TREE] a file with no focus_tree must not swallow the edit in silence");
{
  // The shape of vanilla china_shared.txt: shared_focus blocks only, no focus_tree container.
  const SHARED_ONLY = [
    "shared_focus = {",
    "\tid = shared_a",
    "\tx = 1",
    "\ty = 0",
    "}",
    "",
  ].join("\r\n");
  const before = run(SHARED_ONLY, []);
  rec("FIXTURE: it declares no focus_tree", !/focus_tree/.test(before.mask(SHARED_ONLY)), SHARED_ONLY);
  const r = run(SHARED_ONLY);
  rec("no property is written outside a tree", !/continuous_focus_position/.test(r.text), r.text);
  rec("...the text is left alone", r.text === SHARED_ONLY, r.text);
  rec("...but the drop is REPORTED, not silent", r.warnings.length === 1, r.warnings);
  rec("...saying why", /no focus_tree/.test(r.warnings.join(" ")), r.warnings);
}

console.log("\n[SOURCE] the drag refuses up front, and the old blind calls are gone");
{
  const { stripJsComments } = require("./testlib-strip-comments.js");
  // Strip comments before grepping: the fix's OWN prose contains every string checked for below.
  const bare = stripJsComments(fs.readFileSync(APP_PATH, "utf8"));
  const at = bare.indexOf("function cfStageTreePosition(");
  rec("cfStageTreePosition is present", at !== -1, at);
  const fn = bare.slice(at, at + 2000);
  rec("...it masks comments before testing for a focus_tree", /maskPdxComments\(sourceText\)/.test(fn), fn.slice(0, 900));
  rec("...and tells the user instead of staging an edit that cannot land", /has no focus_tree/.test(fn), fn.slice(0, 900));
  const aat = bare.indexOf("function applyPendingTreeHeaderEdits(");
  const applier = bare.slice(aat, aat + 2200);
  rec("the applier no longer tests the RAW text for its match", !/re\.test\(out\)/.test(applier), applier.slice(0, 600));
  rec("...and no longer anchors the insert on unmasked text", !/out\.replace\(\/\(focus_tree/.test(applier), applier.slice(0, 900));
  rec("...it masks first", /maskPdxComments\(out\)/.test(applier), applier.slice(0, 600));
}

console.log("\n[REMOVE] the shared_focus removal path still works, and reads through comments too");
{
  const REMOVE = ["shared_focus:grp", { kind: "remove", match: "(^|\\n)[ \\t]*shared_focus[ \\t]*=[ \\t]*grp\\b[^\\n]*", line: "shared_focus = grp" }];
  const WITH_SHARED = COMMENTED.replace("\tid = probe_tree", "\tid = probe_tree\r\n\tshared_focus = grp");
  const r = run(WITH_SHARED, [REMOVE]);
  rec("a remove takes the live line out", !/\r\n\tshared_focus = grp/.test(r.text), r.text);
  rec("...leaves the id above it intact", /\tid = probe_tree\r\n/.test(r.text), r.text.slice(0, 120));
  rec("...and puts the file back exactly as it was otherwise", r.text === COMMENTED, r.text);
  // MUST-NOT-CHANGE: a commented-out shared_focus is somebody's note, not a line to delete.
  const CMT_SHARED = COMMENTED.replace("\tid = probe_tree", "\tid = probe_tree\r\n#\tshared_focus = grp");
  const r2 = run(CMT_SHARED, [REMOVE]);
  rec("a COMMENTED-OUT shared_focus is not deleted", /#\tshared_focus = grp/.test(r2.text), r2.text);
  rec("...and the file is untouched", r2.text === CMT_SHARED, r2.text);
}

console.log("\n[REAL FILES] the shipping trees this was measured on (read-only)");
{
  const OWB = "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196/common/national_focus/Baggers (BAG) Focus.txt";
  if (fs.existsSync(OWB)) {
    const before = fs.readFileSync(OWB, "utf8"); // READ-ONLY. Never written.
    const r = run(before);
    rec("OWB Baggers: its only continuous_focus_position is commented out", liveCount(r.mask, before) === 0, "fixture lost the property");
    rec("...a drag now produces a live one", liveCount(r.mask, r.text) === 1, "still no live line");
    rec("...readable by the editor", r.read !== null && r.read.x === 999 && r.read.y === 888, r.read);
    rec("...with every comment in the file byte-identical", commentsOf(r.text) === commentsOf(before), "a comment was rewritten");
  } else {
    console.log("  --   Old World Blues not installed; skipping the real-file check");
  }
  const CH = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/national_focus/china_shared.txt";
  if (fs.existsSync(CH)) {
    const before = fs.readFileSync(CH, "utf8"); // READ-ONLY.
    const r = run(before);
    rec("vanilla china_shared: no focus_tree, so nothing is written", r.text === before, "the file changed");
    rec("...and the drop is reported", r.warnings.length === 1, r.warnings);
  } else {
    console.log("  --   vanilla not installed; skipping the shared-only real-file check");
  }
}

console.log("\n[TEMP MOD] the rewritten tree round-trips through a real file on disk");
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cfp-"));
  try {
    const nf = path.join(dir, "common", "national_focus");
    fs.mkdirSync(nf, { recursive: true });
    fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="cfp probe"\r\npath="' + dir.replace(/\\/g, "/") + '"\r\n');
    const file = path.join(nf, "probe.txt");
    fs.writeFileSync(file, COMMENTED);
    const r = run(fs.readFileSync(file, "utf8"));
    fs.writeFileSync(file, r.text);
    const onDisk = fs.readFileSync(file, "utf8");
    rec("the rewritten tree really lands on disk", onDisk !== COMMENTED, "nothing was written");
    rec("...with a live continuous_focus_position in it", liveCount(r.mask, onDisk) === 1, onDisk);
    rec("...and the comment still holding the author's 50/1350", /#\tcontinuous_focus_position = \{ x = 50 y = 1350 \}/.test(onDisk), onDisk);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log("\n=== panel position writer reads through comments: " + checks + " checks, " + failed + " failed ===");
process.exitCode = failed === 0 ? 0 : 1;
