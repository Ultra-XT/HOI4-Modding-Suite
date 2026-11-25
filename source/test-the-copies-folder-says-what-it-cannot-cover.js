// ⛔ #the-copies-folder-says-what-it-cannot-cover — A CLICK THAT CREATED FILES SAYS ITS FOLDER OF COPIES DOES NOT COVER THEM.
//
// B6-20 (tool campaign, CONFIRMED, medium), G3's words: 🔧 Auto-fix's line said "Changed N files. A copy of all of them was saved first,
// outside your mod, at: <folder>" — the folder laid out for copying back — while the click had also CREATED files (backupSnapshot
// {files: 4, written: 6, created: 3} in the repro: state files, names files), which have no "before" to copy: copying the folder back over
// the mod leaves every one of them in place. 🌍 Generate land already said so of its own (generatedLandBackupsNote, #generate-land-
// created-what-its-copies-cannot-cover), from the same `created` count, in its own wrapper; Auto-fix and Mod Health's two map fixes call
// the shared sentence directly (public/map-rule-labels.js backupSnapshotNote), so they never did. The line now lives IN the shared
// sentence, said once for every caller. (What the click writes inside its scope, and which first copies it takes, is G2's half.)
//
// Run, not read: the shared sentence on the answer's shapes; the Map Errors popup's own 🔧 Auto-fix all click (openMapErrorsModal lifted
// out of public/map.js, testlib-map-page) over an answer that created files; and Generate land's wrapper, which must not say it twice.
"use strict";
const P = require("./testlib-map-page.js");
const labels = require("./public/map-rule-labels.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)); }
}
const DIR = "C:/Users/x/.nova/auto_fixes/My_mod_ab12/2026-11-19T05-00-00-000Z";
const count = (s, sub) => s.split(sub).length - 1;

(async () => {
  // ── 1. the shared sentence ──
  const note = (snap) => String(labels.backupSnapshotNote({ backupSnapshot: snap }));
  const none = note({ dir: DIR, files: 4, written: 4, created: 0, failed: 0 });
  rec("THE CONTROL: a click that created nothing gets the sentence it always got", none === ` Changed 4 files. A copy of all of them was saved first, outside your mod, at:\n  ${DIR}`, none);
  const made = note({ dir: DIR, files: 4, written: 6, created: 3, failed: 0 });
  rec("⭐⭐⭐ a click that created files: the folder's line, then that it created them and copying the folder back leaves them in place",
    made.indexOf(none) === 0 && made.slice(none.length) === "\n  It also created 3 new files, which that folder has no copy of: copying it back over your mod leaves them in place.", made);
  rec("…one file in the singular", note({ dir: DIR, files: 1, created: 1, failed: 0 }).endsWith("It also created 1 new file, which that folder has no copy of: copying it back over your mod leaves that file in place."), note({ dir: DIR, files: 1, created: 1, failed: 0 }));
  const noFolder = note({ dir: "", files: 0, failed: 2, created: 1 });
  rec("⭐ when no copy could be taken at all, it says the files it made without pointing at a folder there is not", /could not copy the 2 files/.test(noFolder) && /\n  It also created 1 new file\.$/.test(noFolder) && !/that folder/.test(noFolder), noFolder);
  rec("…and nothing at all when nothing was written", note(undefined) === "" && note({ dir: "", files: 0, failed: 0, created: 0 }) === "", note(undefined));

  // ── 2. the live path: the Map Errors popup's own 🔧 Auto-fix all click ──
  {
    let leftOnScreen = "";
    const answer = { ok: true, fixes: { categories: { fixed: 2 }, backupSnapshot: { dir: DIR, files: 4, written: 6, created: 3, failed: 0 } } };
    const page = P.runPage(["function openMapErrorsModal("], P.loadGlobals({
      modPath: () => "D:/fixture-mod",
      load: async (doneMsg) => { leftOnScreen = String(doneMsg == null ? "" : doneMsg); },
      fetch: async (url) => ({ json: async () => (String(url).indexOf("/api/map/auto-fix") === 0 ? JSON.parse(JSON.stringify(answer))
        : String(url).indexOf("/api/map/validate") === 0 ? { ok: true, problems: [], errors: 0, warnings: 0 } : {}) }),
    }));
    page.sb.openMapErrorsModal({ ok: true, errors: 1, warnings: 0, problems: [{ rule: "state_category_missing", severity: "error", message: "2 state(s) have no state_category set. Auto-fix sets one." }] });
    const popup = page.overlays.find((o) => /mapErrFix/.test(o.innerHTML)) || page.overlays[page.overlays.length - 1];
    const fixBtn = popup && popup.querySelector("#mapErrFix");
    rec("THE CONTROL: the popup offers 🔧 Auto-fix all", !!(fixBtn && fixBtn.listeners && fixBtn.listeners.click), popup && String(popup.innerHTML).slice(0, 160));
    if (fixBtn && fixBtn.listeners && fixBtn.listeners.click) {
      await fixBtn.listeners.click[0]();
      const said = leftOnScreen || page.statuses[page.statuses.length - 1] || "";
      rec("THE CONTROL: the click's line names the folder", said.includes(DIR), said.slice(-600));
      rec("⭐⭐⭐ …and says the click also created 3 files, which copying the folder back leaves in place",
        said.includes("It also created 3 new files, which that folder has no copy of: copying it back over your mod leaves them in place."), said.slice(-600));
    } else {
      rec("⭐⭐⭐ …and says the click also created 3 files, which copying the folder back leaves in place", false, "no button to click");
    }
  }

  // ── 3. Generate land's wrapper says it once, not twice ──
  {
    const { sb } = P.runPage(["function generatedLandBackupsNote("]);
    const g = String(sb.generatedLandBackupsNote({ backups: { dir: DIR, files: 3, failed: 0, written: 1093, created: 1090 } }));
    rec("⭐ Generate land's line says the files it created exactly once", count(g, "It also created") === 1 && /It also created 1,?090 new files, which that folder has no copy of/.test(g), g);
    rec("…and is the shared sentence itself", g === note({ dir: DIR, files: 3, failed: 0, written: 1093, created: 1090 }), g);
  }

  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
  console.log("All green");
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
