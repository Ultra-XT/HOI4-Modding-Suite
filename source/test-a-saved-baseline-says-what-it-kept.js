// ⛔ #a-baseline-is-moved-never-deleted — 💾 SAVE BASELINE SAYS WHERE THE BASELINE IT REPLACED WENT, WHAT IT COULD NOT CHECK, AND A REFUSAL.
//
// B6-4 and B6-5 (tool campaign; the coordinator's decisions): a previous baseline is never deleted — saveMapBaseline moves it aside
// into a dated sibling and answers where (previousMovedTo), and sets aside the leftovers of a save that did not finish the same way
// (setAside); it keeps the Save check's verdict with the baseline (heldVerdict) or says why the check could not run (notChecked); and it
// REFUSES a map the Save check stops for ({ ok: false, refused: "fatal", error: <words naming the problems, saying a baseline is the copy
// known to load and what was kept> }). That is the data (map-data.js, G1). This is the line the modder reads after the click: it said
// none of it — a moved baseline nobody is told about is barely a copy, "known-good" was said of a baseline whose check never ran, and a
// refusal read "Save baseline failed". An older server's answer (none of these fields) still gets the line it always got.
//
// Run, not read: openMapErrorsModal lifted out of public/map.js (testlib-map-page), its 💾 Save baseline button clicked over each answer
// shape, the line read off the status the click leaves.
"use strict";
const T = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)); }
}

async function saveBaselineLine(answer) {
  const { sb, statuses, overlays } = T.runPage(["function openMapErrorsModal("], {
    modPath: () => "D:/fixture-mod",
    fetch: async (url) => ({ json: async () => (String(url).indexOf("/api/map/save-baseline") === 0 ? JSON.parse(JSON.stringify(answer)) : { exists: false }) }),
  });
  sb.openMapErrorsModal({ ok: true, problems: [] });
  const ov = overlays.find((o) => o.id === "mapErrOverlay");
  const btn = ov ? ov.querySelector("#mapErrSaveBaseline") : null;
  if (!btn || !(btn.listeners.click || []).length) return { line: null };
  await btn.listeners.click[0]();
  return { line: statuses.length ? statuses[statuses.length - 1] : "", wrap: sb.statusEl.style.whiteSpace || "" };
}

(async () => {
  const STORE = "C:/Users/x/AppData/Roaming/NovaModdingSuite/map_baselines/My_mod_ab12";
  const PREV = `${STORE}.replaced-2026-11-19T05-00-00-000Z`;
  const LEFT = `${STORE}.unfinished-2026-11-19T05-00-00-000Z`;

  const old = await saveBaselineLine({ ok: true, sizeMB: 3, dirs: ["map"] });
  rec("THE CONTROL: the click runs, and an older server's answer gets the line it always got", old.line === "💾 Saved a known-good map baseline (3 MB). You can always 🛟 Restore to it.", old);

  const replaced = await saveBaselineLine({ ok: true, sizeMB: 3, dirs: ["map"], previousMovedTo: PREV, heldVerdict: { fatal: 0, rules: [] } });
  rec("⭐⭐⭐ the baseline it replaced: kept, not deleted, and where it went", /^💾 Saved a known-good map baseline \(3 MB\)\./.test(replaced.line || "")
    && (replaced.line || "").includes(`Your previous baseline was kept, not deleted: it was moved aside to:\n  ${PREV}`), replaced);
  rec("…on a line that keeps its line breaks", replaced.wrap === "pre-wrap", replaced.wrap);

  const left = await saveBaselineLine({ ok: true, sizeMB: 3, dirs: ["map"], setAside: [LEFT], heldVerdict: { fatal: 0, rules: [] } });
  rec("⭐⭐ the leftovers of a save that did not finish: set aside, not deleted, and where", (left.line || "").includes(`was set aside too, not deleted, to:\n  ${LEFT}`), left);

  const unchecked = await saveBaselineLine({ ok: true, sizeMB: 3, dirs: ["map"], notChecked: "no game folder was given to check the map against" });
  rec("⭐⭐⭐ a baseline whose check could not run is not called known-good, and the line says why and that nothing promises it loads",
    /^💾 Saved a map baseline \(3 MB\)\./.test(unchecked.line || "") && !/known-good/.test(unchecked.line || "")
      && (unchecked.line || "").includes("⚠ Nova could not check this map as it saved it (no game folder was given to check the map against), so this baseline makes no promise that the game loads it"), unchecked);
  const uncheckedEmpty = await saveBaselineLine({ ok: true, sizeMB: 0, dirs: [], empty: true, notChecked: "the map check could not run (boom)." });
  rec("…the empty baseline's opening too", /^💾 Saved a map baseline\. This mod owns no map files/.test(uncheckedEmpty.line || "") && (uncheckedEmpty.line || "").includes("(the map check could not run (boom))"), uncheckedEmpty);

  const words = "this map has 2 problems Save stops for: Province in two states and State with no provinces. A baseline is the copy of your map known to load, the one 🛟 Restore baseline puts back, so Nova does not make one of a map like this. No baseline was saved. Fix them first (🔧 Auto-fix all in Map Errors, or by hand), then save the baseline again.";
  const refused = await saveBaselineLine({ ok: false, refused: "fatal", verdict: { fatal: 2, rules: ["province_in_two_states", "empty_state"] }, error: words });
  rec("⭐⭐⭐ a map Save stops for: the line says the save was REFUSED, in the answer's own words, not that it failed", refused.line === `💾 Save baseline refused: ${words}`, refused);
  const failed = await saveBaselineLine({ ok: false, error: "EBUSY: resource busy or locked" });
  rec("THE CONTROL: a save that failed still says it failed", failed.line === "Save baseline failed: EBUSY: resource busy or locked", failed);

  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
  console.log("All green");
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
