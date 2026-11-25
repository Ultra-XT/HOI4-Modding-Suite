// #mio-editor-outside-the-unsaved-contract
//
// THE COMPANY EDITOR SAT INSIDE THE SPIRIT PAGE'S UNSAVED-WORK GUARD AND NEVER TALKED TO IT.
//
// public/mio-editor.js is a shared component mounted INSIDE .idea-editor-panel — deliberately, and
// ideas.js says so: the watcher root "deliberately INCLUDES #mioEditorMount, so a half-built military
// industrial organisation is protected the same way a spirit is."
//
// The snapshot half of that was true: 13 company inputs sit inside the watched root, and typing in them
// does raise the guard. Everything that has to TELL the watcher something happened was missing, because the
// component has no watcher of its own and the host page's callbacks were never wired:
//
//   1. onSaved was `function () {}`. A successful company save never re-baselined, so the page went on
//      claiming unsaved changes about work it had just written.
//   2. loadCompany() — clicking a company in the sidebar — replaced the whole form with no guard and no
//      re-baseline, discarding a half-built company without a prompt.
//   3. newCompany() never re-baselined, and the host's "+ Create New" returns at
//      `if (ideaMode === "designers") { mioEditor.newCompany(); return; }` — BEFORE its own markClean — so
//      the fresh blank read dirty the instant it was made.
//
// Measured in the running maker with the writes stubbed. Before: typing then leaving asked (correct);
// saving reported ✓ Saved "probe_company" → nova_mio.txt and leaving IMMEDIATELY afterwards still asked
// "You have unsaved changes in the Spirit maker. Leave without saving?". After: that prompt is gone, typing
// again is still caught, loading a company on a clean form does not ask and becomes the new baseline, and
// switching company with a half-built form asks "Switch company".
//
// ⭐ WHY THE EXISTING DERIVED TEST DID NOT REACH THIS. test-save-rebaselines-the-watcher.js derives its page
// list from "which files create a watcher". mio-editor.js creates none — it borrows the Spirit page's. The
// save that must re-baseline lives in a DIFFERENT FILE from the watcher it must re-baseline. The right
// invariant is below: every save button INSIDE a watcher's root must re-baseline that watcher, wherever its
// handler happens to live.
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320));
  }
}
const { stripJsComments } = require("./testlib-strip-comments.js");
const PUB = path.join(__dirname, "public");
const readJs = (f) => stripJsComments(fs.readFileSync(path.join(PUB, f), "utf8"));
const readRaw = (f) => fs.readFileSync(path.join(PUB, f), "utf8");
const MIO = readJs("mio-editor.js");
const IDEAS = readJs("ideas.js");

console.log("\n[the component asks the host page the two things only the host can answer]");
{
  rec("it takes a confirmReplace hook", /var confirmReplace = opts\.confirmReplace \|\| function \(what, proceed\) \{ proceed\(\); \};/.test(MIO),
    "there is no way for the host to guard a form replacement");
  rec("…and an onFormReplaced hook", /var onFormReplaced = opts\.onFormReplaced \|\| function \(\) \{\};/.test(MIO),
    "there is no way for the host to re-baseline after a replacement");
  // ⭐ Both must DEFAULT to working, so the component still runs on a page with no watcher.
  rec("…both defaulting to 'no host is listening'", /opts\.confirmReplace \|\| function \(what, proceed\) \{ proceed\(\); \}/.test(MIO) && /opts\.onFormReplaced \|\| function \(\) \{\}/.test(MIO),
    "the editor would break wherever it is used without a host watcher");
  rec("…and onSaved is still there", /var onSaved = opts\.onSaved \|\| function \(\) \{\};/.test(MIO), "the save callback went");
}

console.log("\n[replacing the form asks first, then re-baselines]");
{
  // loadCompany: the guard must wrap the FETCH, not sit after it — asking after the data is already
  // in flight is not a guard.
  rec("loadCompany asks before it replaces the form", /function loadCompany\(id\) \{\s*confirmReplace\("Switch company", function \(\) \{ loadCompanyNow\(id\); \}\);/.test(MIO),
    "clicking another company still discards a half-built one silently");
  // ⭐ SCOPED TO EACH FUNCTION'S OWN BODY. Searching forward from a landmark ran past the end of
  // loadCompanyNow and found newCompany's onFormReplaced instead — so deleting the one in loadCompanyNow
  // changed nothing and the check stayed silent. Both re-baselines are the same string; only their position
  // distinguishes them.
  function bodyOf(header) {
    const at = MIO.indexOf(header);
    if (at === -1) return "";
    let i = MIO.indexOf("{", at + header.length - 1), d = 0;
    for (; i < MIO.length; i++) {
      if (MIO[i] === "{") d++;
      else if (MIO[i] === "}") { d--; if (d === 0) return MIO.slice(at, i + 1); }
    }
    return "";
  }
  const loadNow = bodyOf("function loadCompanyNow(id) {");
  rec("loadCompanyNow was extracted", loadNow.length > 400, loadNow.length);
  rec("…and the request only happens inside it", /fetch\("\/api\/mio\/detail/.test(loadNow) && !/fetch\("\/api\/mio\/detail/.test(bodyOf("function loadCompany(id) {")),
    "the request fires before the guard has answered");
  const renderAt = loadNow.indexOf('_pvIcon = "\\u0000"; render(); renderList();');
  const rebaseAt = loadNow.indexOf("onFormReplaced();");
  rec("…and the loaded company becomes the new baseline", rebaseAt !== -1 && renderAt !== -1 && rebaseAt > renderAt, { renderAt, rebaseAt });

  rec("newCompany asks before it blanks the form", /this\.newCompany = function \(\) \{\s*confirmReplace\("Start a new one", function \(\) \{/.test(MIO),
    "any caller other than the guarded one discards silently");
  const newCo = bodyOf("this.newCompany = function () {");
  rec("newCompany was extracted", newCo.length > 120, newCo.length);
  const ncFresh = newCo.indexOf("d = freshDraft();");
  const ncRebase = newCo.indexOf("onFormReplaced();");
  rec("…and the untouched blank becomes the baseline", ncRebase !== -1 && ncFresh !== -1 && ncRebase > ncFresh, { ncFresh, ncRebase });
  rec("…which matters because the host returns before its own markClean",
    /if \(ideaMode === "designers"\) \{ if \(mioEditor\) mioEditor\.newCompany\(\); return; \}/.test(IDEAS),
    "the host no longer early-returns — re-check whether this hook is still the only re-baseline");
}

console.log("\n[the Spirit page wires all three to its watcher]");
{
  rec("a saved company re-baselines the page", /onSaved: function \(\) \{ if \(ideaUnsaved\) ideaUnsaved\.markClean\(\); \}/.test(IDEAS),
    "saving a company still leaves the page claiming unsaved changes");
  rec("…a form replacement goes through the page's own guard",
    /confirmReplace: function \(what, proceed\) \{\s*if \(ideaUnsaved\) ideaUnsaved\.confirmDiscard\(what, proceed\); else proceed\(\);\s*\},/.test(IDEAS),
    "the component would ask nobody");
  rec("…and a replaced form becomes the page's baseline", /onFormReplaced: function \(\) \{ if \(ideaUnsaved\) ideaUnsaved\.markClean\(\); \},/.test(IDEAS),
    "a freshly loaded or blanked company would read dirty");
  rec("CONTROL: the watcher root still includes the company editor", /root: "\.idea-editor-panel"/.test(IDEAS), "the root moved — re-check what it covers");
  rec("CONTROL: the mount is still inside that root in the markup", (() => {
    const html = readRaw("ideas.html");
    const rootAt = html.indexOf("idea-editor-panel");
    const mountAt = html.indexOf('id="mioEditorMount"');
    return rootAt !== -1 && mountAt !== -1 && mountAt > rootAt;
  })(), "the company form may no longer be watched at all");
}

console.log("\n[⭐ the invariant that would have caught this]");
{
  // EVERY save-ish button that sits INSIDE a watcher's root must re-baseline that watcher — no matter which
  // file its handler lives in. Derived from the markup, so a new button added inside a watched panel is
  // covered automatically.
  const WATCHED = [
    { html: "ideas.html", rootClass: "idea-editor-panel", js: ["ideas.js", "mio-editor.js"], rebaseline: /markClean\(\)/ },
    { html: "events.html", rootClass: "event-editor-panel", js: ["events.js"], rebaseline: /markClean\(\)/ },
    { html: "characters.html", rootClass: "ch-main", js: ["characters.js"], rebaseline: /markClean\(\)/ },
    { html: "decisions.html", rootClass: "decision-editor-panel", js: ["decisions.js"], rebaseline: /markDecisionEditorClean\(\)/ },
  ];

  /** Extract the markup of the element carrying `cls`, by counting div open/close from its start tag. */
  function elementWithClass(html, cls) {
    const at = html.indexOf(cls);
    if (at === -1) return "";
    const start = html.lastIndexOf("<", at);
    if (start === -1) return "";
    let i = start, depth = 0;
    const re = /<div\b|<\/div>/g;
    re.lastIndex = start;
    let m;
    while ((m = re.exec(html)) !== null) {
      if (m[0] === "<div") depth++;
      else { depth--; if (depth === 0) return html.slice(start, m.index + m[0].length); }
      i = re.lastIndex;
    }
    return html.slice(start, i);
  }

  for (const w of WATCHED) {
    const html = readRaw(w.html);
    const region = elementWithClass(html, w.rootClass);
    rec(`${w.html}: the watched panel was located in the markup`, region.length > 500, region.length);
    // Buttons inside it whose id says "save". Non-save buttons (pickers, add-chip, AI) are not in scope:
    // they mutate the form, and the form is already watched.
    // The id pattern covers the words this codebase actually uses for "commit this to the mod". It is a
    // heuristic and it has a floor: a commit button named none of these would still slip past, and the
    // back-out proved it — renaming #mioSaveBtn to #mioCommitBtn simply dropped it from the set and nothing
    // complained, until "commit" was added here. What this DOES guarantee is that a button that looks like a
    // save, anywhere inside a watched panel, has to re-baseline.
    const SAVEISH = /\bid="([a-zA-Z]*(?:[sS]ave|[cC]ommit|[pP]ublish|[wW]riteTo)[a-zA-Z]*)"/g;
    const fromMarkup = [...region.matchAll(SAVEISH)].map((m) => m[1]);
    // ⭐ AND THE INJECTED ONES. Written against the static markup alone, this section found only
    // #saveIdeaBtn and would NOT have caught the bug it claims to prevent: #mioSaveBtn does not exist in
    // ideas.html at all — mio-editor.js builds it as an HTML string at render time. A save button that a
    // script injects into a watched panel is exactly as much inside that panel as one in the file.
    const fromScripts = w.js.flatMap((f) =>
      [...readJs(f).matchAll(new RegExp(SAVEISH.source, "g"))].map((m) => ({ id: m[1], file: f })));
    const saveIds = [...new Set([...fromMarkup, ...fromScripts.map((x) => x.id)])];
    console.log(`     ${w.html} · ${w.rootClass}: save buttons = ${saveIds.join(", ") || "(none)"}` +
      (fromScripts.length ? `   (injected: ${fromScripts.map((x) => x.id + " by " + x.file).join(", ")})` : ""));
    rec(`${w.html}: at least one save button belongs to the watched panel`, saveIds.length >= 1, saveIds);

    for (const id of saveIds) {
      const owner = w.js.find((f) => readJs(f).includes(`"${id}"`));
      rec(`${w.html}: #${id} is wired in one of this page's scripts`, !!owner, { id, searched: w.js });
      if (!owner) continue;
      const ownerSrc = readJs(owner);
      // Either the owning file re-baselines the watcher itself…
      const ownRebaseline = w.rebaseline.test(ownerSrc);
      // …or it CANNOT see the watcher (a shared component) and must hand off to the host, with the host
      // wiring that hand-off to a re-baseline. Anything else means a save that leaves the page dirty.
      const handsOff = /onSaved\(/.test(ownerSrc);
      const hostWires = w.js.some((f) => f !== owner && new RegExp("onSaved: function \\(\\) \\{[^}]*" + w.rebaseline.source.replace(/[\\()]/g, (c) => "\\" + c) + "").test(readJs(f)));
      const hostWiresLoose = w.js.some((f) => f !== owner && /onSaved: function \(\) \{[^}]*markClean\(\)/.test(readJs(f)));
      rec(`${w.html}: …#${id} re-baselines the watcher, itself or through its host`,
        ownRebaseline || (handsOff && (hostWires || hostWiresLoose)),
        { id, owner, ownRebaseline, handsOff, hostWires: hostWires || hostWiresLoose });
    }
  }
  // The concrete instance: mio-editor.js must not be the file that re-baselines (it cannot see the
  // watcher) — the HOST must, through the callback.
  rec("mio-editor.js does not reach for a watcher it cannot see", !/ideaUnsaved/.test(MIO),
    "the component now depends on a variable from another file");
}

console.log(`\n=== mio editor unsaved contract: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
