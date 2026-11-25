// #decision-guard-list-goes-stale
//
// THE UNSAVED-CHANGES GUARD WATCHED A HAND-WRITTEN LIST, AND THE EDITOR HAD GROWN PAST IT.
//
// decisions.js compares a snapshot of the editor against the state it was loaded in, and asks before
// anything replaces it. That is the best unsaved-work design in this codebase — undo a change by hand and
// the page goes quietly clean again, which a plain dirty flag cannot do. But the fields it snapshotted were
// a literal array of 38 ids, and the editor panel holds 42 controls. The three it had never heard of were
// invisible: type in one, click another decision, and the work was gone with no prompt, because "is it
// dirty?" was answered by reading fields that had not changed.
//
//   · decisionCategoryIcon  — the category's tab art, sent as `categoryIcon` on every save
//   · decisionCountryLock   — baked into the Allowed block as `tag = X`; test-decision-country-lock.js
//                             exists precisely because that field matters
//   · decisionVisibleToggle — the one harmless omission: ticking it writes into decisionVisible, which the
//                             list did contain, so the change was still noticed second-hand
//
// The file already carried a SECOND hand-written list of the same fields — the one clearNewDecisionForm
// clears — and the two disagreed: that one has decisionCategoryIcon and this one did not. Its own comment
// records being bitten by that exact omission once already (#category-icon-retargets-another-category).
// A list maintained by hand will be missed again, so the guard now asks the DOM.
//
// This test does the same thing from the other side: it parses the REAL decisions.html, builds a stand-in
// element for every control in the editor panel, RUNS the real decEditorSnapshot over them, and requires
// that changing any one of them changes the snapshot. A field added to the page in future is covered the
// day it is added — and if it somehow is not, this test names it.
//
// Verified in the running Decision Maker on Millennium Dawn (471 categories):
//     clean, click another decision            → no prompt
//     change 🔒 country lock → click another   → "You have unsaved changes to …" and it stays put
//     set the lock back by hand → click        → clean again, no prompt
//     type a category icon → click another     → prompts
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
const JS = fs.readFileSync(path.join(PUB, "decisions.js"), "utf8");
const HTML = fs.readFileSync(path.join(PUB, "decisions.html"), "utf8");
const { stripJsComments } = require("./testlib-strip-comments.js");
// ⭐ The fix's own prose names DEC_TRACKED_FIELDS and every field id below. Strip first, or the check that
// the literal list is GONE finds the sentence saying it is gone.
const CODE = stripJsComments(JS);

// ── Find the editor panel in the HTML by counting divs, not by a hardcoded line range ────────────────
const HLINES = HTML.split(/\r?\n/);
const panelStart = HLINES.findIndex((l) => /class="decision-editor-panel"/.test(l));
let panelEnd = -1;
{
  let depth = 0;
  for (let i = panelStart; i < HLINES.length; i++) {
    depth += (HLINES[i].match(/<div\b/g) || []).length - (HLINES[i].match(/<\/div>/g) || []).length;
    if (i > panelStart && depth <= 0) { panelEnd = i; break; }
  }
}

/** Every id-bearing control inside the editor panel, as {id, tag, type}. */
function panelControls() {
  const out = [];
  for (let i = panelStart; i <= panelEnd; i++) {
    for (const m of HLINES[i].matchAll(/<(input|textarea|select)\b([^>]*)>/gi)) {
      const id = (/\bid="([^"]+)"/.exec(m[2]) || [])[1];
      if (!id) continue;
      const type = ((/\btype="([^"]+)"/.exec(m[2]) || [])[1] || "").toLowerCase();
      if (["button", "submit", "reset", "file"].includes(type)) continue;
      out.push({ id, tag: m[1].toLowerCase(), type: type || (m[1].toLowerCase() === "select" ? "select-one" : "textarea") });
    }
  }
  return out;
}
const CONTROLS = panelControls();

console.log("\n[the page] the editor panel is findable and still full of fields");
{
  rec("the .decision-editor-panel is in the html", panelStart !== -1, "class not found");
  rec("…and its extent is measurable", panelEnd > panelStart, { panelStart, panelEnd });
  rec("…holding a substantial number of controls", CONTROLS.length >= 40, CONTROLS.length);
  // CONTROL: if the parse silently found nothing, every per-field check below would pass vacuously.
  rec("CONTROL: the three that were missed are among them",
    ["decisionCategoryIcon", "decisionCountryLock", "decisionVisibleToggle"].every((id) => CONTROLS.some((c) => c.id === id)),
    CONTROLS.map((c) => c.id));
  // The two search boxes must be OUTSIDE the panel, or typing a search would raise an unsaved-work prompt.
  rec("…and the search boxes are NOT", !CONTROLS.some((c) => /Search$/i.test(c.id)), CONTROLS.filter((c) => /Search$/i.test(c.id)));
}

console.log("\n[the guard] it must not hold a list of field ids");
{
  rec("the hand-written DEC_TRACKED_FIELDS array is gone", !/DEC_TRACKED_FIELDS/.test(CODE), "the literal list is back");
  rec("…and the snapshot is scoped to the editor panel", /DEC_EDITOR_SELECTOR = "\.decision-editor-panel"/.test(CODE), "the scope changed");
  rec("…reading every control it finds there", /querySelectorAll\("input, textarea, select"\)/.test(CODE), "the query narrowed");
  // A checkbox's .value never changes when ticked. Reading .value would leave every checkbox permanently
  // clean — in the list and still not watched.
  rec("…and checkboxes are read by .checked, not .value", /type === "checkbox"[\s\S]{0,80}el\.checked/.test(CODE), "a tick would be invisible");
}

console.log("\n[RUN IT] every field in the panel must move the snapshot");
{
  // Lift the real snapshot builder out and run it over stand-ins for the real page's controls.
  const from = CODE.indexOf("const DEC_EDITOR_SELECTOR");
  const at = from === -1 ? -1 : CODE.indexOf("const decEditorSnapshot = () => {", from);
  let block = "";
  if (at !== -1) {
    const open = CODE.indexOf("{", at + "const decEditorSnapshot = () =>".length);
    let d = 0;
    for (let i = open; i < CODE.length; i++) { if (CODE[i] === "{") d++; else if (CODE[i] === "}") { d--; if (d === 0) { block = CODE.slice(from, i + 1) + ";"; break; } } }
  }
  const extracted = block.includes("decEditorSnapshot") && block.length > 200;
  rec("the real snapshot builder was extracted", extracted, from === -1 ? "no DEC_EDITOR_SELECTOR — the guard is not DOM-derived" : block.length);
  // Bail out rather than throw. Everything below RUNS the extracted code, so without it the section can only
  // produce a stack trace, and a suite that reports a stack trace instead of a named failure wastes the
  // reader's time working out which check broke.
  if (!extracted) {
    rec("…so the per-field coverage could not be measured", false, "extraction failed; the checks below did not run");
  } else {

  const makeEls = () => CONTROLS.map((c) => ({ id: c.id, type: c.type, value: "", checked: false }));
  function runSnapshot(els) {
    const ctx = { document: { querySelector: () => ({ querySelectorAll: () => els }) }, out: null };
    vm.createContext(ctx);
    vm.runInContext(block + "\nout = decEditorSnapshot();", ctx);
    return ctx.out;
  }

  const els = makeEls();
  const base = runSnapshot(els);
  rec("a snapshot of the untouched panel is non-empty", typeof base === "string" && base.length > 50, String(base).slice(0, 80));

  // THE POINT OF THE WHOLE TEST: change one field at a time and require the snapshot to notice.
  const blind = [];
  const UNTRACKED_ON_PURPOSE = ["aiDecisionPrompt"]; // the AI prompt is never written to the mod
  for (const c of CONTROLS) {
    if (UNTRACKED_ON_PURPOSE.includes(c.id)) continue;
    const probe = makeEls();
    const el = probe.find((e) => e.id === c.id);
    if (c.type === "checkbox" || c.type === "radio") el.checked = true;
    else el.value = "CHANGED";
    if (runSnapshot(probe) === base) blind.push(c.id + " <" + c.type + ">");
  }
  rec(`all ${CONTROLS.length - UNTRACKED_ON_PURPOSE.length} editable fields are watched`, blind.length === 0, blind);

  // …and the deliberate exclusion really is excluded, or the comment is a lie.
  {
    const probe = makeEls();
    const ai = probe.find((e) => e.id === "aiDecisionPrompt");
    if (ai) { ai.value = "write me a decision"; rec("the AI prompt box is deliberately NOT watched", runSnapshot(probe) === base, "typing an AI prompt would prompt to discard"); }
    else { rec("the AI prompt box is deliberately NOT watched", true, "no such field in the panel"); }
  }

  // Two different fields must not produce the same snapshot — a join with no separator can alias them.
  {
    const a = makeEls(), b = makeEls();
    const [f1, f2] = CONTROLS.filter((c) => c.type !== "checkbox" && c.type !== "radio").slice(0, 2);
    a.find((e) => e.id === f1.id).value = "1";
    b.find((e) => e.id === f2.id).value = "1";
    rec("two different fields give two different snapshots", runSnapshot(a) !== runSnapshot(b), { f1: f1 && f1.id, f2: f2 && f2.id });
  }
  }
}

console.log("\n[CONTROL] the rest of the guard still works the way it did");
{
  rec("the dirty test still compares against the loaded baseline", /decCleanSnapshot !== null && decEditorSnapshot\(\) !== decCleanSnapshot/.test(CODE), "the comparison changed shape");
  rec("…so undoing an edit by hand goes clean again", /decCleanSnapshot !== null/.test(CODE), "the null-means-nothing-loaded rule went");
  rec("switching decision still asks first", /confirmDiscardDecisionEdits\(/.test(CODE), "the item-switch guard vanished");
  rec("the page still registers with the shared nav guard", /novaGuardSuiteNav\(decisionEditorIsDirty/.test(CODE), "leaving the page is unguarded again");
  rec("…and still publishes a saver for Electron's quit dialog", /onSave:[\s\S]{0,120}saveDecisionBtn/.test(CODE), "quitting would dead-end on Save Failed");
  rec("a save still re-baselines", /markDecisionEditorClean\(\)/.test(CODE), "the page would stay dirty after saving");
}

console.log(`\n=== decision unsaved guard covers every field: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
