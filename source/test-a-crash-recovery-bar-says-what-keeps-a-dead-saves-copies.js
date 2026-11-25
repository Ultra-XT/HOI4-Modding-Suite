// ⛔ #a-dead-saves-first-copies-outlive-it — THE CRASH-RECOVERY BAR SAYS WHAT KEEPS THE COPIES A SAVE THAT DID NOT FINISH TOOK, AND WHAT DOES NOT.
//
// B6-28 (tool campaign, CONFIRMED, medium), G3's words. A Save of 268 writes was killed after 152 files had landed; the bar on the next
// page said Nova's backups folder had those files as they were before it "until newer backups push them out" — and the Save it invites
// (Restore, then 💾 Save) was exactly what pushed 68 of the 152 out. G2's half (safe-write.js) keeps a record of each Save run's first
// copies, and the next Save of the mod takes a dead run up: it pushes none of them out, and when its own backups would, it moves them
// into a folder of their own and its answers name it (saveCopies.earlier), which the page words as "⚠ An earlier Save of this mod: …"
// (saveCopiesNote). What can still push some out is anything else that writes first — a Save of another mod, an Auto-fix — and that is
// the warning the bar now gives, in place of one that read as if nothing could.
//
// Run, not read: the page's own saveMapBackup / readMapBackup / showRestoreBar (the way test-a-save-keeps-its-own-first-copies.js
// opens the bar), and saveCopiesNote, which keeps the bar's promise that the finishing Save's line names the folder.
"use strict";
const P = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)); }
}
const strip = (h) => String(h).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

// ── 1. the bar, over the crash-recovery record a Save that did not finish leaves ──
{
  const store = new Map();
  const rb = P.runPage([["const MAP_BACKUP_KEY = ", "\n"], "function saveMapBackup()", "function readMapBackup()", "function showRestoreBar(b)"], {
    localStorage: { setItem: (k, v) => store.set(k, v), getItem: (k) => (store.has(k) ? store.get(k) : null), removeItem: (k) => store.delete(k) },
    pendingWrites: [{ url: "/api/map/set-owner", body: { stateId: 1, owner: "BBB" } }], modPath: () => "m", model: { saveRunId: "kept-by-a-save" },
    $: (id) => (id === "mapRestoreBar" || id === "mapWrap" ? null : P.element()),
  });
  rb.sb.saveMapBackup();
  const b1 = rb.sb.readMapBackup();
  rb.sb.showRestoreBar(b1);
  const said = strip(rb.overlays[rb.overlays.length - 1].innerHTML);
  rec("THE CONTROL: the record says a Save left it, and the bar says the Save did not finish", b1 && b1.partWay === true && /left by a Save that did not finish/.test(said), { b1, said: said.slice(0, 300) });
  rec("⭐⭐⭐ the bar says the 💾 Save that finishes these edits does not push those copies out, and names their folder if it moves them",
    /the 💾 Save that finishes these edits does not \(if its own backups would, it moves them into a folder of their own, and its line names it\)/.test(said), said);
  rec("⭐⭐ …and what still can: anything else that writes first, a Save of another mod or an Auto-fix", /anything else that writes first — a Save of another mod, an Auto-fix — can push some out\./.test(said), said);
  rec("⚠️ …and no longer ends its claim at \"until newer backups push them out.\", as if nothing in particular could", !/until newer backups push them out\.(?:\s|$)/.test(said), said);
  rb.sb.model.saveRunId = null;
  rb.sb.saveMapBackup();
  const b2 = rb.sb.readMapBackup();
  rb.sb.showRestoreBar(b2);
  const plain = strip(rb.overlays[rb.overlays.length - 1].innerHTML);
  rec("THE CONTROL: a queue nobody tried to Save says none of it", b2 && b2.partWay === false && !/did not finish/.test(plain) && !/push some out/.test(plain), plain.slice(0, 300));
}

// ── 2. the promise kept: the finishing Save's line names the folder the dead run's copies were moved into ──
{
  const { sb } = P.runPage(["function saveCopiesNote(", "function generatedLandBackupsNote("]);
  const DIR = "C:/Users/x/.nova/map_saves/My_mod_ab12/2026-11-19T05-00-00-000Z";
  const line = String(sb.saveCopiesNote({ earlier: [{ dir: DIR, files: 152, written: 152, failed: 0 }] }));
  rec("⭐⭐ the Save's line words the earlier run's folder its answers name (saveCopies.earlier): the run, the count and where",
    /An earlier Save of this mod: Changed 152 files\. A copy of all of them was saved first, outside your mod, at:/.test(line) && line.includes(DIR), line);
  const lost = String(sb.saveCopiesNote({ earlier: [{ dir: DIR, files: 20, written: 40, failed: 20 }] }));
  rec("…and the copies something else pushed out first are counted, not hidden", /20 more files could not be copied/.test(lost), lost);
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("All green");
