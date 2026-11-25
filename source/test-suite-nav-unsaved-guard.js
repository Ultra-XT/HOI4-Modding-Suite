// #suite-nav-discards-unsaved-work — THE DESKTOP BUILD IS THE ONE WHERE THE GUARD IS OFF.
//
// Every maker page carries the same top bar of 11 `.suite-nav-link`s. Leaving a page with unsaved edits is
// guarded two different ways, and in the shipped Electron build only one of them works:
//
//   · `beforeunload` — Chromium's own "Leave site?" prompt. Nova deliberately does NOT register it under
//     Electron (app.js, army.js and research.js all gate on the Electron UA), because Electron shows no such
//     prompt and the handler instead silently CANCELS the navigation. So in the desktop app it does nothing.
//   · intercepting the nav link's own click and confirming. research.js and map.js do this. Nobody else did.
//
// The result, in the app users actually run:
//   · Focus Tree and Military: click a nav link with unsaved work → it navigates instantly, edits gone,
//     nothing asked. In a plain browser the same click at least raises Chromium's prompt, so the defect
//     exists only in the shipped build.
//   · Decisions: registers `beforeunload` with NO Electron gate, so a nav click does NOTHING AT ALL — no
//     dialog, no navigation. The user is stuck on the page. And because decisions.js never defines
//     `window.__focusEditorHasUnsavedChanges`, main.js's quit handler asks, is told "no unsaved changes",
//     sets allowWindowClose and calls close() — which that same beforeunload then cancels. THE APP CANNOT
//     BE QUIT.
//   · Map: guards nav, but its check is `dirtyMap || paintDiff.size` and ignores the 🪖 Army tool entirely,
//     so staged divisions and templates vanish on any hop out — while the 💾 button still reads "No unsaved
//     changes yet".
//
// One owner: the guard now lives in loading-overlay.js, the script every maker page already loads, and each
// page hands it a dirty-check.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const PUB = path.join(__dirname, "public");
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
// LF whatever the checkout: the guard block is found by a marker that spans a line end (#a-lift-reads-lf)
const read = (f) => { try { return fs.readFileSync(path.join(PUB, f), "utf8").replace(/\r\n/g, "\n"); } catch (_) { return ""; } };
// Comments do not run. Every fix here explains itself directly above the code, and that prose contains the
// very strings these checks look for. Uses the shared scanner rather than a regex pair: stripping BLOCK
// comments first is backwards, and public/army.js:45 has `/*.txt` inside a LINE comment, which opened a
// phantom block that swallowed 3,091 lines of real code and hid a genuine call site.
const { stripJsComments: code } = require("./testlib-strip-comments.js");

const MAKERS = ["app.js", "army.js", "decisions.js", "events.js", "research.js", "map.js", "ideas.js", "characters.js", "country-setup.js"];

console.log("\n[the surface] how many ways out of a page there are");
{
  let links = 0;
  for (const h of ["index.html", "army.html", "decisions.html", "map.html", "research.html"]) {
    const n = (read(h.replace(".js", "")).match(/class="[^"]*suite-nav-link/g) || []).length;
    const html = fs.existsSync(path.join(PUB, h)) ? fs.readFileSync(path.join(PUB, h), "utf8") : "";
    const c = (html.match(/suite-nav-link/g) || []).length;
    links += c;
    console.log(`     ${h}: ${c} suite-nav references`);
  }
  rec("the nav bar is on every maker page", links > 20, links);
}

console.log("\n[the shared guard] lives in the one script every maker page loads");
{
  const ov = read("loading-overlay.js");
  rec("loading-overlay.js exposes a nav guard", /novaGuardSuiteNav/.test(code(ov)), "no shared guard");
  // It must do BOTH halves: intercept the link click (the Electron path) and register beforeunload only
  // outside Electron (the browser path).
  rec("…it intercepts suite-nav-link clicks", /suite-nav-link/.test(code(ov)), "no click interception");
  rec("…and only registers beforeunload outside Electron", /Electron/.test(code(ov)) && /beforeunload/.test(code(ov)), "no Electron gate");
  rec("…and publishes the exit hook main.js asks for", /__focusEditorHasUnsavedChanges/.test(code(ov)), "no exit hook");

  // Drive it: a dirty page must be able to cancel the navigation, and a clean one must never interfere.
  const start = ov.indexOf("/*\n * Nova suite-nav guard");
  rec("the guard block is findable for execution", start !== -1, "marker comment missing");
  if (start !== -1) {
    const src = ov.slice(start);
    const mk = (dirty, ua) => {
      const events = {};
      const links = [{ cls: "suite-nav-link", handlers: [], prevented: false }];
      const win = {
        navigator: { userAgent: ua },
        addEventListener: (n, fn) => { (events[n] = events[n] || []).push(fn); },
        confirm: () => win.__confirmAnswer,
        __confirmAnswer: true,
        document: {
          querySelectorAll: () => links.map((l) => ({
            addEventListener: (n, fn) => { if (n === "click") l.handlers.push(fn); },
          })),
          addEventListener: () => {},
        },
      };
      win.window = win;
      vm.runInNewContext(src, { window: win, document: win.document, navigator: win.navigator, console, setTimeout });
      if (typeof win.novaGuardSuiteNav === "function") win.novaGuardSuiteNav(() => dirty, "Test Page");
      return { win, events, links };
    };

    // Electron, dirty, user says stay -> the click must be cancelled.
    {
      const { win, links } = mk(true, "Mozilla/5.0 Electron/30.0.0 Nova");
      win.__confirmAnswer = false;
      let prevented = false;
      links[0].handlers.forEach((h) => h({ preventDefault: () => { prevented = true; } }));
      rec("Electron + dirty + 'stay' cancels the navigation", prevented, "the click went through");
    }
    // Electron, dirty, user says leave -> the click must proceed.
    {
      const { win, links } = mk(true, "Mozilla/5.0 Electron/30.0.0 Nova");
      win.__confirmAnswer = true;
      let prevented = false;
      links[0].handlers.forEach((h) => h({ preventDefault: () => { prevented = true; } }));
      rec("…and 'leave' lets it through", !prevented, "the click was blocked anyway");
    }
    // Clean page -> never asks, never blocks. Otherwise the guard is worse than none.
    {
      const { win, links } = mk(false, "Mozilla/5.0 Electron/30.0.0 Nova");
      let asked = false; win.confirm = () => { asked = true; return true; };
      let prevented = false;
      links[0].handlers.forEach((h) => h({ preventDefault: () => { prevented = true; } }));
      rec("CONTROL: a clean page is never interrupted", !asked && !prevented, { asked, prevented });
    }
    // beforeunload must NOT be registered under Electron — that is what silently cancels navigation there.
    {
      const el = mk(true, "Mozilla/5.0 Electron/30.0.0 Nova");
      const br = mk(true, "Mozilla/5.0 Chrome/120 Safari/537.36");
      rec("no beforeunload under Electron", !(el.events.beforeunload || []).length, Object.keys(el.events));
      rec("…but there IS one in a plain browser", (br.events.beforeunload || []).length === 1, Object.keys(br.events));
    }
  }
}

console.log("\n[the QUIT contract] a page that says 'unsaved' must also offer a way to save");
{
  // ⚠️ THE HALF THE FIRST VERSION OF THIS GUARD MISSED. main.js's quit dialog is Save / Don't Save / Cancel
  // with Save as the DEFAULT (defaultId: 0, so Enter picks it), and its Save branch runs
  //     window.__focusEditorSaveBeforeExit ? …() : Promise.resolve(false)
  // A page that publishes the dirty-check but no saver therefore fails that branch, gets a "Save Failed"
  // box it cannot act on, and does not close — every retry repeating. Publishing one without the other
  // turned Decisions from unquittable into un-quittable-without-discarding.
  const mainJs = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
  rec("the quit dialog really does default to Save", /defaultId:\s*0/.test(mainJs), "default is not Save");
  rec("…and treats a missing saver as failure", /__focusEditorSaveBeforeExit \? [\s\S]{0,60}Promise\.resolve\(false\)/.test(mainJs), "no such branch");

  const ov = code(read("loading-overlay.js"));
  rec("the shared guard can publish a save hook", /__focusEditorSaveBeforeExit/.test(ov), "guard offers no save hook");

  // Every page that hands the guard a dirty-check must ALSO end up with a saver — either its own, or one
  // via the guard. Otherwise it is in exactly the broken state described above.
  for (const f of MAKERS) {
    const c = code(read(f));
    if (!/novaGuardSuiteNav\s*\(/.test(c)) continue;
    const ownHook = /__focusEditorSaveBeforeExit\s*=/.test(c);
    const viaGuard = /novaGuardSuiteNav\s*\([\s\S]{0,200}?onSave\s*:/.test(c);
    console.log(`     ${f}: own save hook=${ownHook}  via guard=${viaGuard}`);
    rec(`${f} offers a way to save on quit`, ownHook || viaGuard, "publishes 'unsaved' with no saver");
  }
}

console.log("\n[every page that tracks unsaved edits] uses it");
{
  for (const f of ["decisions.js", "army.js", "app.js"]) {
    rec(`${f} registers the shared nav guard`, /novaGuardSuiteNav\s*\(/.test(code(read(f))), "not adopted");
  }
  // The one that caused an unquittable app: no ungated beforeunload may remain anywhere.
  const offenders = [];
  for (const f of MAKERS) {
    const c = code(read(f));
    const m = /addEventListener\("beforeunload"/.exec(c);
    if (!m) continue;
    const before = c.slice(Math.max(0, m.index - 400), m.index);
    if (!/Electron/.test(before)) offenders.push(f);
  }
  rec("no page registers beforeunload without an Electron gate", offenders.length === 0, offenders);
}

console.log("\n[the Map] its guard must see the Army tool's staged work");
{
  const c = code(read("map.js"));
  // The staged army model is destroyed by the leave-page confirm and by load()'s reload confirm; both used
  // to test only dirtyMap / paintDiff.
  const m = /beforeunload|leaveGuard|suite-nav-link/.test(c);
  rec("map.js still guards leaving", m, "the map guard vanished");
  // ⚠️ NAME THE SITES, DO NOT COUNT THEM. This used to assert `armyHasUnsaved()` appeared >= 4 times, so
  // removing it from the leave-page guard still left 4 and the control did not bite. The two paths that
  // silently destroyed the staged army model are the leave-page confirm and load()'s reload confirm — check
  // each one specifically.
  const leave = /suite-nav-link[\s\S]{0,600}?window\.confirm\(/.exec(c);
  rec("the leave-page guard is findable", !!leave, "nav-link confirm not found");
  // The predicate moved into a named function when the Map page started publishing the same answer to
  // Electron's quit dialog (#map-page-never-publishes-the-quit-hooks) — ONE OWNER, so the nav guard and the
  // quit hook cannot disagree. Follow it: the guard must consult armyHasUnsaved either inline or through
  // that function, and the function must actually consult it.
  const viaOwner = leave && /mapHasUnsavedWork\(\)/.test(leave[0])
    && /function mapHasUnsavedWork\(\)[\s\S]{0,300}?armyHasUnsaved\(\)/.test(c);
  rec("…and it consults armyHasUnsaved()", !!(leave && (/armyHasUnsaved\(\)/.test(leave[0]) || viaOwner)),
    leave && leave[0].slice(0, 300));
  const reload = /async function load\([\s\S]{0,400}?window\.confirm\(/.exec(c);
  rec("load()'s reload confirm is findable", !!reload, "reload confirm not found");
  rec("…and it consults armyHasUnsaved() too", reload && /armyHasUnsaved\(\)/.test(reload[0]), reload && reload[0].slice(0, 300));
}

console.log(`\n=== suite nav unsaved guard: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
