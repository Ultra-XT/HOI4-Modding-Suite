// #companies-list-cleared-by-spirits — MILLENNIUM DAWN'S 399 COMPANIES SHOWED AS AN EMPTY LIST.
//
// The Spirits page hosts two different sidebars in one element. In spirits mode #ideasList holds the mod's
// national spirits; in designers mode the MIO editor lists the mod's COMPANIES into the very same element.
//
// Measured in the running app by hooking the innerHTML setter on #ideasList. One load of the
// Military > Companies iframe against Millennium Dawn produced four writes:
//
//   1  loadIdeasList   (ideas.js)      "Loading Spirits..."
//   2  mio-editor                      111 KB — MD's 399 companies
//   3  renderIdeasList (ideas.js)      ""      <-- cleared the company list
//   4  mio-editor                      111 KB — companies again
//
// Whichever of 3 and 4 landed last is what the user saw, so the tab showed companies on one load and
// spirits on the next. That intermittency is why it read as "sometimes empty".
//
// loadIdeasList ALREADY carried the correct guard, and its comment stated the rule outright: in designers
// mode the sidebar belongs to the MIO editor, so do not overwrite it. The guard never fired, because BOTH
// loadIdeasList() calls in startup init run BEFORE applyIdeaMode("designers") — so it read ideaMode while
// it was still its initial "spirits", passed straight through, and launched a fetch of MD's ~9,000 spirits
// whose only effect on arrival was to wipe the companies.
//
// Two properties are pinned here, because fixing only the ordering would leave two other callers of
// renderIdeasList — the sidebar search and the new-draft path — able to do the same thing:
//   * the mode is known from the URL before any list load can run, and
//   * the guard lives in the function that actually clears the element, not in each caller.
//
// Also pinned: the watcher's label. The company editor is mounted inside the Spirits page, which renames
// its heading and buttons per mode; the unsaved-work watcher was the one thing that did not follow, so
// editing a company warned about "the Spirit maker".
//
// Comments are stripped first — this file and the fix both describe the broken shape in prose.
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const PUB = path.join(__dirname, "public");
const read = (f) => stripJsComments(fs.readFileSync(path.join(PUB, f), "utf8"));

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + detail));
  if (!cond) fails.push(label);
};

// Does `guard` appear before `clear`, inside the first `span` characters after `start`?
function guardsBefore(src, start, guard, clear, span) {
  const at = src.indexOf(start);
  if (at === -1) return { ok: false, why: "function not found" };
  const body = src.slice(at, at + span);
  const g = body.indexOf(guard), c = body.indexOf(clear);
  if (c === -1) return { ok: false, why: "the clearing line was not found — did it move?" };
  if (g === -1) return { ok: false, why: "no guard before the clear" };
  return { ok: g < c, why: g < c ? "" : "guard appears AFTER the clear" };
}

try {
  const ideas = read("ideas.js");
  const overlay = read("loading-overlay.js");

  // ---------------------------------------------------------------------------------------------
  console.log("\n1. The mode is known before anything can load a list");
  // Startup calls loadIdeasList() twice before applyIdeaMode() runs, so a mode settled inside
  // applyIdeaMode is settled too late for every guard that depends on it.
  rec("ideaMode is resolved from the URL where it is declared",
    /let\s+ideaMode\s*=\s*\(function[\s\S]{0,320}location\.search/.test(ideas));
  rec("it recognises both the query flag and the embedded iframe",
    /let\s+ideaMode\s*=\s*\(function[\s\S]{0,320}designers[\s\S]{0,160}embed/.test(ideas));
  rec("it is no longer the bare literal that could only change later",
    !/^\s*let ideaMode = "spirits";\s*$/m.test(ideas));

  // ---------------------------------------------------------------------------------------------
  console.log("\n2. The function that clears the sidebar refuses to in designers mode");
  const r = guardsBefore(ideas, "function renderIdeasList", 'ideaMode === "designers"', 'ideasList.innerHTML = ""', 700);
  rec("renderIdeasList guards before it clears #ideasList", r.ok, r.why);

  // The pre-existing guard must survive too: without it the page still fetches ~9,000 spirits it will
  // never show, on every visit to the Companies tab.
  const r2 = guardsBefore(ideas, "async function loadIdeasList", 'ideaMode === "designers"', "Loading Spirits", 700);
  rec("loadIdeasList still short-circuits before starting the spirit fetch", r2.ok, r2.why);

  // Every caller is covered because the guard is in the callee. Prove there IS more than one caller, or
  // this is a claim about nothing.
  const callers = (ideas.match(/renderIdeasList\s*\(/g) || []).length - 1; // minus the definition itself
  rec("more than one caller relies on that guard", callers >= 2, "call sites: " + callers);

  // ---------------------------------------------------------------------------------------------
  console.log("\n3. The sidebar search is hidden rather than left inert");
  // With the guard above it can no longer filter that sidebar, and a search box that silently does
  // nothing reads as broken.
  rec("designers mode hides the spirit-list search", /showEl\("ideasListSearch",\s*!designers\)/.test(ideas));

  // ---------------------------------------------------------------------------------------------
  console.log("\n4. The maker names itself correctly in both modes");
  rec("ideas.js passes a label FUNCTION, not a fixed string",
    /label:\s*function\s*\(\)\s*\{[^}]*ideaMode/.test(ideas));
  rec("that function can produce both names",
    /label:\s*function[\s\S]{0,200}Company maker[\s\S]{0,60}Spirit maker/.test(ideas));
  rec("the old hardcoded label is gone", !/label:\s*"the Spirit maker"/.test(ideas));

  // Both prompt sites must resolve it, or one of the two exits still shows the stale name.
  rec("novaWatchUnsaved resolves the label when it prompts",
    /labelNow\s*=\s*function[\s\S]{0,160}typeof\s+label\s*===\s*"function"/.test(overlay) &&
    /unsaved changes in "\s*\+\s*labelNow\(\)/.test(overlay));
  rec("the tab-nav guard resolves it too",
    /whatNow\s*=\s*function[\s\S]{0,200}typeof\s+label\s*===\s*"function"/.test(overlay) &&
    /unsaved changes in "\s*\+\s*whatNow\(\)/.test(overlay));

  // A string label is what every other maker passes; breaking that would rename two working pages.
  const stringLabels = (read("characters.js").match(/label:\s*"the Character maker"/g) || []).length +
                       (read("events.js").match(/label:\s*"the Event Maker"/g) || []).length;
  rec("plain string labels are still supported and still used", stringLabels === 2,
    "string-label callers: " + stringLabels);

  // ---------------------------------------------------------------------------------------------
  console.log("\n5. The checks above can actually fail (composed here, not assumed)");
  // A green run must not be achievable by a detector that stopped matching anything.
  const OLD_IDEAS =
    'function renderIdeasList(items, filterText = "") {\n' +
    '    const ideasList = document.getElementById("ideasList");\n' +
    '    if (!ideasList) return;\n' +
    '    ideasList.innerHTML = "";\n';
  const OLD_OVERLAY = 'var what = label ? String(label) : "this page";';
  rec("the ordering check rejects the version that shipped the bug",
    !guardsBefore(OLD_IDEAS, "function renderIdeasList", 'ideaMode === "designers"', 'ideasList.innerHTML = ""', 700).ok);
  rec("the label check rejects the eagerly-stringified version",
    !/whatNow\s*=\s*function/.test(OLD_OVERLAY));

  console.log(`\n=== the companies sidebar is not overwritten: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
