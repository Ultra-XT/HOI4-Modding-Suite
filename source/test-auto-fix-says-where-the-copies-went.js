// An Auto-fix click says WHERE the copies it took went, the way Delete map already says it.
// #a-recovery-copy-nobody-is-told-about
//
// THE DEFECT. Every fixer in one "Auto-fix all" click writes inside ONE backup scope (#a-bulk-map-click-evicted-its-own-backups),
// and map-data.js hands the click's folder back on its own answer — `fixes.backupSnapshot` — in a finally whose own comment says
// why: "a recovery copy nobody is told about is only marginally better than none". NO CLIENT READ IT. Measured on 26c2b4f,
// `rg backupSnapshot public/*.js` finds zero readers, and the Auto-fix summary — the one thing a modder reads after the click —
// never named the folder. Delete map, whose copy is taken for the same reason, has named its own since
// #blank-map-deleted-without-a-copy (public/map.js: "A copy of all of them was saved first, outside your mod, at:").
//
// MEASURED through the endpoint the page posts, POST /api/map/auto-fix { modPath }, on a mod shipping two states with no
// state_category of their own:
//     fixes.backupSnapshot = { dir: "<home>/.nova/auto_fixes/<mod>/<stamp>", files: 2, failed: 0 }
//     the folder is OUTSIDE the mod and holds both files exactly as they were before the click
//     a SECOND click, which finds nothing left to write, returns no backupSnapshot at all (undefined)
// so the field is real, it is absent when there is nothing to say, and nothing showed it to anyone.
//
// WHAT THIS PINS, and why it is not a source-shape check. The LIVE path is the Map Errors popup's "🔧 Auto-fix all" button:
// section 2 opens that popup out of public/map.js, clicks it against this test's own server, and reads the line the modder is
// left with. (public/map.js also has fixAllProblems — section 3 — which posts the same request; it is currently unreachable,
// because #mapProblemsFix was taken out of map.html in fcb7e7b, so it is checked but it is not the evidence.) The shared
// sentence is DERIVED from Delete map's own note in the same file, so the two cannot drift apart silently, and the number of
// callers that read the snapshot is derived from the number that post the click — add a third caller and this fails.
//
// ⛔ MOVED 2026-09-17, AND THIS TEST MOVED WITH IT. Mod Health's crash check has two fix buttons of its own that take the
// same copies, and modhealth.html does not load public/map.js — so they said nothing about them. The sentence now lives in
// public/map-rule-labels.js, the one map-wording module BOTH pages load; public/map.js keeps the name, the callers and
// window.__novaBackupSnapshotNote, and delegates. Section 4 still DERIVES the sentence from Delete map's own template in
// public/map.js, which is now a cross-file drift check rather than a same-file one, and is stronger for it.
//
// Run: node test-auto-fix-says-where-the-copies-went.js
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("f25-snapshot-note");
const { createApp } = require("./server.js");
const P = require("./testlib-map-page.js");          // runs the page's own functions, lifted out of public/map.js
const labels = require("./public/map-rule-labels.js"); // …and the module map.html loads beside it, which now holds the sentence          // runs the page's own functions, lifted out of public/map.js

const MAP_JS = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MASKED = maskJsComments(MAP_JS);

/** Lift a top-level (2-space) function out of public/map.js by name, comments and all. */
function lift(decl) {
  const s = MASKED.indexOf("\n  " + decl);
  if (s < 0) return "";
  const e = MASKED.indexOf("\n  }", s + 1);
  return e < 0 ? "" : MAP_JS.slice(s + 1, e + 4);
}

const filesUnder = (d, out = []) => {
  let es = [];
  try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) filesUnder(p, out); else out.push(p); }
  return out;
};

// A mod of its OWN with two states carrying no state_category line. That is a problem the mod owns (so the click does not
// decline it as inherited, #auto-fix-materialised-43-MB-to-repair-nothing), the validator calls it an error (so the popup
// offers the button), and repairing it means WRITING both files — which is what puts copies in the click's folder.
let modN = 0;
const makeMod = () => world.mod("F25 snapshot note " + (++modN), {
  "history/states/2-B.txt": lib.st(2, "2 5", { category: "" }),
  "history/states/3-C.txt": lib.st(3, "3", { category: "" }),
});

(async () => {
  let srv;
  try {
    srv = await lib.startServer(createApp);

    console.log("\n1. The response the client receives really carries the folder");
    const modA = makeMod();
    const before = new Map();
    for (const f of ["2-B.txt", "3-C.txt"]) before.set(f, fs.readFileSync(path.join(modA, "history", "states", f)));
    const r = await srv.autoFix(modA);                // exactly what public/map.js posts: { modPath }
    const fixes = (r.body && r.body.fixes) || {};
    const snap = fixes.backupSnapshot;
    // Positive control first: a probe that finds nothing is a probe, not a finding.
    rec("the click ran and had work of its own to do", r.status === 200 && r.body.ok === true && !r.body.nothingToFix,
      { status: r.status, note: r.body && r.body.note });
    rec("…and it really wrote: it set a category on both states", ((fixes.categories || {}).count || 0) === 2, fixes.categories);
    rec("⭐ the answer carries backupSnapshot with a folder and a file count", !!(snap && snap.dir && snap.files), snap || null);
    if (snap && snap.dir) {
      const copies = filesUnder(snap.dir);
      rec("…the folder exists and holds exactly the files it claims", copies.length === snap.files, { claimed: snap.files, onDisk: copies.length });
      rec("…and it is OUTSIDE the mod (a copy inside the mod ships with it)",
        path.relative(modA, snap.dir).startsWith(".."), snap.dir);
      // The folder the note points at has to hold the ORIGINALS, or naming it is worse than saying nothing.
      const asWas = [...before.values()].every((bytes) => copies.some((f) => { try { return fs.readFileSync(f).equals(bytes); } catch (_) { return false; } }));
      rec("⭐⭐ …and it holds both files exactly as they were before the click", asWas, copies.map((f) => path.relative(snap.dir, f)));
    }

    console.log("\n2. ⭐⭐⭐ THE LIVE PATH: the Map Errors popup's own 🔧 Auto-fix all button, opened and clicked");
    {
      const mod = makeMod();
      const requests = [];
      let leftOnScreen = "";                          // what load() is handed = the line still there after the reload
      const page = P.runPage(["function openMapErrorsModal("], P.loadGlobals({
        modPath: () => mod,
        load: async (doneMsg) => { leftOnScreen = String(doneMsg == null ? "" : doneMsg); },
        // Every request the popup makes goes to the real server, so the click really fixes and really re-validates.
        fetch: async (url, opts) => {
          const u = String(url);
          const res = await fetch(srv.base + u, opts);
          const body = await res.json().catch(() => ({}));
          requests.push({ url: u.split("?")[0], body });
          return { json: async () => body };
        },
      }));
      const v0 = await srv.validate(mod);
      rec("THE CONTROL: the map has a problem of its own for the popup to offer a fix for", v0.ok && v0.errors > 0, { errors: v0.errors, warnings: v0.warnings });
      page.sb.openMapErrorsModal(v0);
      const popup = page.overlays.find((o) => /mapErrFix/.test(o.innerHTML)) || page.overlays[page.overlays.length - 1];
      const fixBtn = popup && popup.querySelector("#mapErrFix");
      rec("THE CONTROL: the popup offers 🔧 Auto-fix all", !!(fixBtn && fixBtn.listeners && fixBtn.listeners.click), popup && String(popup.innerHTML).slice(0, 120));
      if (fixBtn && fixBtn.listeners && fixBtn.listeners.click) {
        await fixBtn.listeners.click[0]();
        const af = requests.find((q) => q.url === "/api/map/auto-fix");
        const dir = ((((af || {}).body || {}).fixes || {}).backupSnapshot || {}).dir || "";
        rec("THE CONTROL: the click posted Auto-fix and the server took copies", !!dir, af && af.body && af.body.fixes && af.body.fixes.backupSnapshot);
        const said = page.statuses[page.statuses.length - 1] || "";
        rec("⭐⭐⭐ the status line the click writes names the folder the copies went to", !!dir && said.indexOf(dir) !== -1, said);
        rec("⭐⭐ …and it is still there after the reload — the line load() is handed ENDS with the path",
          !!dir && leftOnScreen.indexOf(dir) === leftOnScreen.length - dir.length && dir.length > 0, leftOnScreen);
        rec("…and the summary still says what it fixed", /set a category on 2 state/.test(said), said);
        rec("…and the status line is told to keep the path on its own line", page.sb.statusEl.style.whiteSpace === "pre-wrap", page.sb.statusEl.style.whiteSpace);
      } else {
        for (const l of ["⭐⭐⭐ the status line the click writes names the folder the copies went to",
          "⭐⭐ …and it is still there after the reload — the line load() is handed ENDS with the path",
          "…and the summary still says what it fixed",
          "…and the status line is told to keep the path on its own line"]) rec(l, false, "no button to click");
      }
    }

    console.log("\n3. The other caller, fixAllProblems, run on a real answer of its own");
    // ⚠️ NOT THE EVIDENCE: #mapProblemsFix was removed from map.html in fcb7e7b, so nothing on the page reaches this
    // function today. It still posts the same request, and a caller that is re-wired one day must not be the one that
    // stopped saying where the copies went — so it is run, with its own mod, and the negative control lives here too.
    {
      const mod = makeMod();
      const fnSrc = lift("async function fixAllProblems()");
      const noteSrc = lift("function backupSnapshotNote(");
      const regionSrc = lift("function regionRepairNote(");
      rec("fixAllProblems, backupSnapshotNote and regionRepairNote were lifted out of public/map.js",
        fnSrc.length > 400 && noteSrc.length > 100 && regionSrc.length > 100,
        { fixAll: fnSrc.length, note: noteSrc.length, region: regionSrc.length });

      /** Run the real handler against a given response body. Returns { status, whiteSpace }. */
      const runFixAll = async (body) => {
        let status = "";
        const statusEl = { style: {}, textContent: "" };
        const sb = {
          console, JSON, encodeURIComponent,
          window: { NovaMapRuleLabels: labels },
          model: { ok: true },
          statusEl,
          setStatus: (s) => { status = String(s); },
          hasPendingMapEdits: () => false,
          $: () => null,
          modPath: () => mod,
          load: async () => {},
          problemsPanelOpen: () => false,
          refreshProblems: () => { throw new Error("the panel is closed — refreshProblems must not run"); },
          fetch: async (url, init) => {
            if (String(url) !== "/api/map/auto-fix" || !init || init.method !== "POST") throw new Error("unexpected request: " + url);
            return { json: async () => body };
          },
        };
        sb.globalThis = sb;
        vm.createContext(sb);
        // ⚠️ The note helpers are DERIVED from what the lifted code calls, not named. Naming them broke this
        // test the day duplicateStatesLeftNote joined public/map.js. regionSrc/noteSrc stay for the lift check
        // above; withNoteHelpers adds anything else fixAllProblems reaches and skips what is already declared.
        vm.runInContext(P.withNoteHelpers(`${regionSrc}\n${noteSrc}\n${fnSrc}`) + "\nglobalThis.__run = fixAllProblems;", sb);
        await sb.__run();
        return { status, whiteSpace: statusEl.style.whiteSpace || "" };
      };

      const r1 = await srv.autoFix(mod);
      const dir = (((r1.body.fixes || {}).backupSnapshot) || {}).dir || "";
      rec("THE CONTROL: this mod's own click took copies too", !!dir, (r1.body.fixes || {}).backupSnapshot || null);
      const out = await runFixAll(r1.body);
      rec("⭐⭐ the status line it produces names the snapshot folder", !!dir && out.status.indexOf(dir) !== -1, out.status);
      rec("…and says how many files were copied, and that the copy came first",
        /\b2 files\b/.test(out.status) && /saved first/.test(out.status), out.status);
      rec("…and the path is kept on its own line", out.whiteSpace === "pre-wrap", out.whiteSpace);

      // NEGATIVE CONTROL: the second click writes nothing, so there is no snapshot — and nothing may be claimed.
      const r2 = await srv.autoFix(mod);
      rec("a second click has nothing left to copy", !((r2.body.fixes || {}).backupSnapshot), (r2.body.fixes || {}).backupSnapshot || "absent");
      const out2 = await runFixAll(r2.body);
      rec("⭐⭐ …and the handler says nothing about copies rather than inventing a folder",
        !/saved first/.test(out2.status) && !/auto_fixes/.test(out2.status) && out2.status.length > 0, out2.status);
    }

    console.log("\n4. The sentence is Delete map's own, derived from it — not typed here");
    {
      const noteSrc = lift("function backupSnapshotNote(");
      const sb = { window: { NovaMapRuleLabels: labels } };
      sb.globalThis = sb;
      vm.createContext(sb);
      if (noteSrc) vm.runInContext(noteSrc, sb);
      // ⚠️ A BACK-OUT MUST NOT MAKE CHECKS DISAPPEAR. Calling a helper the reverted source does not define threw out of
      // here, and the checks below never ran — a test that stops early reads like a shorter test, not a failing one.
      // Every check runs; a missing helper simply answers nothing and fails them.
      const fn = typeof sb.backupSnapshotNote === "function" ? sb.backupSnapshotNote : null;
      rec("the note helper is in public/map.js and runs", !!fn, noteSrc.slice(0, 60) || "not found");
      const note = (arg) => { try { return fn ? String(fn(arg)) : "<no helper in public/map.js>"; } catch (e) { return "<threw: " + e.message + ">"; } };

      // Delete map's note, straight out of this same file: the backtick template on the line that uses res.snapshotPath.
      const delLine = MAP_JS.split(/\r?\n/).find((l) => l.indexOf("res.snapshotPath") !== -1 && l.indexOf("`") !== -1) || "";
      const tpl = (/`([^`]*)`/.exec(delLine) || [])[1] || "";
      const literal = tpl.replace(/\$\{[^}]*\}/g, "").replace(/\\n/g, "\n");
      const at = literal.indexOf("was saved first");
      const shared = at === -1 ? "" : literal.slice(at);            // "was saved first, outside your mod, at:\n  "
      rec("Delete map's own sentence was derived from public/map.js", shared.length > 30 && shared.indexOf("outside your mod") !== -1, JSON.stringify(shared));

      const many = note({ backupSnapshot: { dir: "C:/somewhere/.nova/auto_fixes/m/stamp", files: 7, failed: 0 } });
      rec("⭐⭐ the Auto-fix note uses that same sentence, word for word", many.indexOf(shared) !== -1, many);
      rec("…and names the folder and the count", many.indexOf("C:/somewhere/.nova/auto_fixes/m/stamp") !== -1 && /\b7 files\b/.test(many), many);

      const one = note({ backupSnapshot: { dir: "C:/one", files: 1, failed: 0 } });
      rec("…one file reads as one file, and still ends in the same sentence",
        /\b1 file\b/.test(one) && !/1 files/.test(one) && one.indexOf(shared.slice(shared.indexOf(","))) !== -1, one);

      // "all of them" is a CLAIM. A copy that could not be taken has to be said, or the sentence promises a file that is not there.
      const partial = note({ backupSnapshot: { dir: "C:/part", files: 2, failed: 3 } });
      rec("⭐ a copy that FAILED is named, not counted in", /3 more files could not be copied/.test(partial), partial);

      rec("nothing to say when the click wrote nothing",
        !!fn && note({}) === "" && note(undefined) === "" && note({ backupSnapshot: { dir: "", files: 0 } }) === "",
        [note({}), note(undefined)]);
    }

    console.log("\n5. Every caller that posts the click reads the snapshot — derived, so a new caller cannot skip it");
    {
      const posts = (MASKED.match(/fetch\("\/api\/map\/auto-fix"/g) || []).length;
      // Calls, not the declaration: `function backupSnapshotNote(` is the one occurrence that is not a call.
      // ⚠️ `ML.backupSnapshotNote(fixes)` inside the helper is the DELEGATION, not a caller — it is excluded by the
      // lookbehind, and `function backupSnapshotNote(` by the subtraction, so what is left is the call sites.
      const reads = (MASKED.match(/(?<![.\w])backupSnapshotNote\(/g) || []).length - (MASKED.match(/function backupSnapshotNote\(/g) || []).length;
      rec("public/map.js posts the Auto-fix click from more than one place", posts >= 2, posts);
      rec("⭐⭐ …and every one of them reads the snapshot", reads === posts, { posts, reads });
      rec("the helper is exposed the way the other summary-note helpers are",
        MASKED.indexOf("window.__novaBackupSnapshotNote = backupSnapshotNote") !== -1);
      // CSP: this change is script-only. Nothing was added to the markup, and nothing may be.
      const helperAt = MASKED.indexOf("function backupSnapshotNote(");
      rec("no inline handler was introduced", helperAt !== -1 && !/on(click|error|load)\s*=/.test(MASKED.slice(helperAt, helperAt + 1200)));
    }
  } catch (e) {
    rec("harness", false, String((e && e.stack) || e));
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== an auto-fix click says where the copies went: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  }
})();
