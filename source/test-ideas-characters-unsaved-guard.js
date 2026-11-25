// #makers-lose-unsaved-work — the Spirit maker and the Character maker.
//
// Neither page had a dirty flag, a navigation guard or a single confirmation. Clicking another item in the
// list replaced the editor outright: for a spirit that is the modifier block, the allowed/available
// triggers and the on_add script; for a character it is the traits, the ideology, the advisor slot and
// every general stat. Changing the mod did the same thing.
//
// Both now use novaWatchUnsaved from loading-overlay.js — snapshot on load and COMPARE — whose own
// behaviour is covered by test-events-unsaved-guard.js. What THIS test checks is the wiring, and the two
// things about the wiring that are easy to get wrong:
//
//   · THE SCOPE. The watcher reads every control inside one root element, so the root decides what counts
//     as "your work". Put it too wide and typing in the list-search box offers to discard your spirit; too
//     narrow and half the editor is unwatched. The root selector is read OUT OF THE PAGE'S OWN SOURCE here
//     and checked against the real HTML, so this follows the code rather than repeating it.
//
//   · WHERE THE GUARD GOES. characters.js has THREE paths that replace the form — the mod's own list, the
//     inherited base-mod list, and the DLC-variant chips — and all three call loadChar. Guarding the three
//     call sites is how the fourth gets forgotten, so the guard is inside loadChar and this test insists on
//     that by counting.
//
// The Spirit maker also has a MODE SWITCH (Spirits ↔ Designers) which rebuilds the category dropdown and
// the panel below it. That is a discard like any other, and it must also re-baseline afterwards: without
// that, the rebuilt dropdown differs from the snapshot and the NEXT click asks about changes the user never
// made.
//
// Verified in both running makers on Millennium Dawn (119 spirits, 2,466 characters):
//     open one, then another                       → no prompt, stays clean
//     edit ideaModifiers / leaderTraits → click     → asks, and stays on the item you were editing
//     revert that edit by hand                      → clean again
//     tick the roleGeneral CHECKBOX → click         → asks   (its .value never moves; .checked is why)
//     Spirits ↔ Designers while clean               → no prompt, and clean afterwards
//     …while dirty                                  → asks; agreeing switches and leaves it clean
"use strict";
const fs = require("fs");
const path = require("path");

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
const read = (f) => stripJsComments(fs.readFileSync(path.join(PUB, f), "utf8"));
const html = (f) => fs.readFileSync(path.join(PUB, f), "utf8").split(/\r?\n/);

/**
 * The lines spanned by the element a root selector names.
 * A BARE TAG (`body`, `main`) spans the whole document — that is what "the root is too wide" looks like,
 * and it has to be measurable, or widening the root would read as "selector matches nothing" instead of
 * "the list-search box is now inside your editor".
 */
function elementSpan(lines, sel) {
  if (!sel.startsWith(".")) {
    return lines.some((l) => new RegExp("<" + sel + "\\b").test(l)) ? { start: 0, end: lines.length - 1 } : null;
  }
  const cls = sel.slice(1);
  const start = lines.findIndex((l) => new RegExp('class="[^"]*\\b' + cls + '\\b').test(l));
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    depth += (lines[i].match(/<div\b/g) || []).length - (lines[i].match(/<\/div>/g) || []).length;
    if (i > start && depth <= 0) return { start, end: i };
  }
  return null;
}
/** Every id-bearing editable control, split by whether it falls inside `span`. */
function controls(lines, span) {
  const inside = [], outside = [];
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(/<(input|textarea|select)\b([^>]*)>/gi)) {
      const id = (/\bid="([^"]+)"/.exec(m[2]) || [])[1];
      if (!id) continue;
      const type = ((/\btype="([^"]+)"/.exec(m[2]) || [])[1] || "").toLowerCase();
      if (["button", "submit", "reset", "file"].includes(type)) continue;
      (i >= span.start && i <= span.end ? inside : outside).push(id);
    }
  }
  return { inside, outside };
}

const PAGES = [
  { js: "ideas.js", page: "ideas.html", varName: "ideaUnsaved", label: "the Spirit maker", save: "saveIdeaBtn",
    mustWatch: ["ideaModifiers", "ideaAllowed", "ideaAvailable", "ideaOnAdd", "ideaName", "ideaId"] },
  { js: "characters.js", page: "characters.html", varName: "chUnsaved", label: "the Character maker", save: "saveCharBtn",
    mustWatch: ["chToken", "chName", "leaderTraits", "advisorTraits", "generalTraits", "roleGeneral", "genSkill"] },
];

for (const P of PAGES) {
  const JS = read(P.js);
  console.log(`\n[${P.js}] wired to the shared watcher`);
  rec("it creates a watcher", new RegExp(`const ${P.varName} = [\\s\\S]{0,120}novaWatchUnsaved\\(`).test(JS), "the page is unguarded again");
  // The label may be a plain string, as characters.js passes, or a FUNCTION — the Spirits page also hosts
  // the Company editor and renames itself at runtime, so a string fixed at registration told someone
  // editing a company they had unsaved changes "in the Spirit maker". What matters either way is that the
  // page can still produce its own name; how it is expressed is not this test's business.
  // (read() strips comments, so this cannot match the prose explaining the fix instead of the code.)
  rec("…labelled for the dialog", new RegExp(`label:[\\s\\S]{0,200}?"${P.label}"`).test(JS), "the prompt would not say which editor");
  rec("…and told which button saves", new RegExp(`saveButtonId: "${P.save}"`).test(JS), "Electron's quit dialog would dead-end on Save Failed");
  rec("…and it does not reimplement the snapshot", !/querySelectorAll\("input, textarea, select"\)/.test(JS), "the page grew its own copy of the pattern");
  rec("…nor register a beforeunload of its own", !/addEventListener\("beforeunload"/.test(JS), "a raw beforeunload kills the nav bar under Electron");
  rec("switching mod asks first", new RegExp(`${P.varName}\\.confirmDiscard\\("Switch mod"`).test(JS), "the mod dropdown is unguarded");
  rec("…putting the dropdown back before it asks", /(sel|selector)\.value = (localStorage\.getItem\("activeModPath"\)|previous)[\s\S]{0,200}confirmDiscard\("Switch mod"/.test(JS), "cancelling would leave the dropdown lying");
  rec("a loaded item becomes the baseline", new RegExp(`${P.varName}\\.markClean\\(\\)`).test(JS), "nothing would ever read as clean");

  // ⭐ THE SCOPE — read the selector out of the page's own source, then check it against the real HTML.
  console.log(`  the root it watches`);
  const rootSel = (new RegExp(`root: "([^"]+)"`).exec(JS) || [])[1];
  rec("the root selector is declared", !!rootSel, "no root");
  const span = rootSel ? elementSpan(html(P.page), rootSel) : null;
  rec(`…and ${rootSel} exists in ${P.page}`, !!span, "the selector matches nothing — the watcher would see an empty editor");
  if (span) {
    const { inside, outside } = controls(html(P.page), span);
    rec("…covering the fields worth protecting", P.mustWatch.every((id) => inside.includes(id)), P.mustWatch.filter((id) => !inside.includes(id)));
    // Any *Search box inside the root would make typing a search offer to discard the user's work.
    const searchInside = inside.filter((id) => /search$/i.test(id));
    rec("…and NO search box", searchInside.length === 0, searchInside);
    rec("…while the list search really is outside it", outside.some((id) => /search$/i.test(id)), outside);
    rec("CONTROL: the parse actually found the editor", inside.length >= 15, inside.length);
  }
}

console.log("\n[the Spirit maker] the mode switch rebuilds the panel, so it is a discard too");
{
  const JS = read("ideas.js");
  rec("clicking another spirit asks first", /ideaUnsaved\.confirmDiscard\("Switch spirit"/.test(JS), "the list click is unguarded");
  rec("Spirits ↔ Designers asks too", /ideaUnsaved\.confirmDiscard\("Switch mode"/.test(JS), "a mode switch would discard silently");
  // …and re-baselines, or the rebuilt category dropdown makes the NEXT click ask about nothing.
  rec("…and re-baselines afterwards", /applyIdeaMode\(b\.dataset\.mode\);[\s\S]{0,80}ideaUnsaved\.markClean\(\)/.test(JS), "the rebuilt dropdown would read as an edit");
  rec("applyIdeaMode still rebuilds the category list", /ideaCategory\.innerHTML =/.test(JS), "if it no longer does, the re-baseline note is stale");
}

console.log("\n[the Character maker] ONE OWNER — guard the function, not the call sites");
{
  const JS = read("characters.js");
  // ⭐ COUNT, DO NOT ASSUME. Three paths replace the form today; guarding each is how the fourth is missed.
  const calls = (JS.match(/(?<!function )\bloadChar\(/g) || []).length;
  rec("loadChar is still called from several places", calls >= 3, calls);
  const at = JS.indexOf("function loadChar(c, file) {");
  rec("loadChar is found", at !== -1, "the loader was renamed");
  const head = at === -1 ? "" : JS.slice(at, at + 500);
  rec("…and the guard is INSIDE it", /chUnsaved && chUnsaved\.isDirty\(\)/.test(head), "the guard moved out to the call sites");
  rec("…as the very first thing it does", head.indexOf("isDirty()") < head.indexOf("editingFile = file"), head.slice(0, 200));
  rec("…re-entering rather than duplicating the load", /confirmDiscard\("Switch character", \(\) => loadChar\(c, file\)\)/.test(head), head.slice(0, 300));
  // No call site may carry its own copy — that is the drift this guards against.
  const perSite = (JS.match(/confirmDiscard\("Switch character"/g) || []).length;
  rec("…and exactly one place asks the question", perSite === 1, perSite);
  // The late re-baseline must respect typing, as recruitRefresh repaints asynchronously.
  rec("the async repaint re-baselines without swallowing typing", /markCleanUnlessTouched\(\)/.test(JS), "a late markClean would adopt the user's keystrokes");
}

console.log("\n[CONTROL] the shared machinery both of these lean on");
{
  const OV = read("loading-overlay.js");
  rec("novaWatchUnsaved still exists", /window\.novaWatchUnsaved = function/.test(OV), "the shared watcher vanished");
  rec("…and still keys by position, not id", /var key = i \+ ":" \+ \(el\.id \|\| el\.className/.test(OV), "class-only fields would stop being watched");
  rec("…and still reads checkboxes by .checked", /el\.checked \? "1" : "0"/.test(OV), "the character role toggles would stop registering");
  rec("…and still registers with the nav guard", /novaGuardSuiteNav\(api\.isDirty/.test(OV), "leaving the page would be unguarded");
}

console.log(`\n=== ideas + characters unsaved guard: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
