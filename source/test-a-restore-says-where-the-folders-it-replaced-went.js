// ⛔ #a-restore-moves-the-folders-it-replaces — 🛟 Restore baseline SAYS WHERE THE FOLDERS IT REPLACED WENT.
//
// B6-6 (tool campaign, CONFIRMED, blocker): Restore swapped each live folder of the mod (map/, history/states, …) for the baseline's and
// then fs.rmSync'd the live one, so a line typed into a state file after the baseline was found nowhere — not in the mod, not beside it,
// not in any Nova store. The data half (map-data.js, G1) MOVES each replaced folder out of the mod instead and answers where, in a NEW
// field, `replacedMovedTo: [{ dir, to, files }]` — not in `movedAside`, whose sentence says "was not in that baseline". This is the page's
// half: the line Restore leaves says where they went, in the words the page already uses for a move ("MOVED out of your mod (not
// deleted) to:"). An answer without the field is an older server's, and nothing is said, as before.
// G1's answer (restoreMapBaseline on b6-g1) carries two more: a folder it could not move stays in the mod under its scratch name
// (replacedLeftInMod: [{ dir, at, error }]), and the leftovers of an earlier restore are moved out before it begins (leftoversMovedTo:
// [{ dir, was, to, files }]). Both are said too, each from a fixture of that shape.
//
// Pure: the page's own note, lifted out of public/map.js and run on both answer shapes; the click's wiring read from its source.
"use strict";
const T = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1200) : JSON.stringify(detail).slice(0, 1200)); }
}

let sb = null;
try { sb = T.runPage(["function replacedMovedNote("]).sb; } catch (e) { rec("replacedMovedNote is lifted out of public/map.js", false, e.message); }
if (sb) {
  const note = (l, left, earlier) => String(sb.replacedMovedNote(l, left, earlier));
  const A = "C:/Users/x/AppData/Roaming/NovaModdingSuite/baseline_restores/My_mod_ab12/2026-11-13T10-00-00-000Z/map";
  const B = "C:/Users/x/AppData/Roaming/NovaModdingSuite/baseline_restores/My_mod_ab12/2026-11-13T10-00-00-000Z/history/states";
  const two = note([{ dir: "map", to: A, files: 12 }, { dir: "history\\states", to: B, files: 1 }]);
  rec("⭐⭐⭐ the answer's replacedMovedTo: the line names each folder it replaced, says it was MOVED (not deleted), and where",
    /Your mod's map\/ and history\/states\/ as they were before the restore/.test(two) && /were MOVED out of your mod \(not deleted\) to:/.test(two) && two.includes(A) && two.includes(B), two);
  rec("⭐ …with how many files went with them", /\(13 files\)/.test(two), two);
  const one = note([{ dir: "history/states", to: B, files: 1 }]);
  rec("…one folder is said in the singular", /history\/states\/ as it was before the restore \(1 file\) was MOVED out of your mod \(not deleted\) to:/.test(one), one);
  rec("⭐⭐ an answer without the field (an older server's) says nothing of it", note(undefined) === "" && note(null) === "" && note([]) === "", [note(undefined), note([])]);
  const failed = note([{ dir: "map", to: A, files: 3 }, { dir: "history/states", error: "EBUSY: resource busy or locked" }]);
  rec("⭐⭐ a folder it could not move is named, with the reason, and the line says nothing was deleted",
    /could not move your mod's history\/states\/ as it was before the restore out of your mod \(EBUSY: resource busy or locked\)/.test(failed)
      && /still in your mod folder — nothing was deleted/.test(failed) && failed.includes(A) && !failed.includes("history/states/ as they were"), failed);
  rec("…the same for _moveOutOfMod's own word for it (warning)", /could not move your mod's map\/ .* \(disk full\)/.test(note([{ dir: "map", to: "", warning: "disk full" }])), note([{ dir: "map", to: "", warning: "disk full" }]));
  // G1's shapes
  const AT = "D:/mods/My mod/history/states.nova-previous";
  const left = note([{ dir: "map", to: A, files: 3 }], [{ dir: "history/states", at: AT, error: "EPERM: operation not permitted" }]);
  rec("⭐⭐⭐ G1's replacedLeftInMod: the folder it could not move is named, with the reason, WHERE it still is in the mod, and that nothing was deleted",
    /could not move your mod's history\/states\/ as it was before the restore out of your mod \(EPERM: operation not permitted\)/.test(left)
      && left.includes(`still in your mod folder, at ${AT} — nothing was deleted`) && left.includes(A), left);
  rec("…one without a reason still says it was not moved", /could not move your mod's map\/ .*\(no reason was given\)/.test(note([], [{ dir: "map", at: "D:/m/map.nova-previous", error: "" }])), note([], [{ dir: "map", at: "D:/m/map.nova-previous", error: "" }]));
  const L1 = "C:/Users/x/AppData/Roaming/NovaModdingSuite/baseline_restores/My_mod_ab12/2026-11-13T10-00-00-000Z/replaced-by-an-earlier-restore/map";
  const L2 = "C:/Users/x/AppData/Roaming/NovaModdingSuite/baseline_restores/My_mod_ab12/2026-11-13T10-00-00-000Z/unfinished-restore/history/states";
  const earlier = note([{ dir: "map", to: A, files: 3 }], undefined, [{ dir: "map", was: "map.nova-previous", to: L1, files: 40 }, { dir: "history/states", was: "history/states.nova-restoring", to: L2, files: 2 }]);
  rec("⭐⭐ G1's leftoversMovedTo: what an earlier restore left in the mod is named, said MOVED out (not deleted), and where",
    /also MOVED out of your mod \(not deleted\) the folders an earlier restore had left in it \(map\.nova-previous\/, history\/states\.nova-restoring\/\), to:/.test(earlier) && earlier.includes(L1) && earlier.includes(L2), earlier);
  rec("⭐ an older server's answer (none of the three fields) still says nothing", note(undefined, undefined, undefined) === "" && note([], [], []) === "", note(undefined, undefined, undefined));
}

// the click's wiring: the restore handler builds the note from the answer and puts it on the line load() leaves
const SRC = T.MASKED;
const at = SRC.indexOf('fetch("/api/map/restore-baseline"');
const handler = at < 0 ? "" : SRC.slice(at, SRC.indexOf("} catch (e)", at));
rec("the Restore handler was found", handler.length > 500, handler.length);
rec("⭐⭐⭐ the handler words the answer's replacedMovedTo, replacedLeftInMod and leftoversMovedTo with replacedMovedNote", /const replacedNote = replacedMovedNote\(r\.replacedMovedTo, r\.replacedLeftInMod, r\.leftoversMovedTo\);/.test(handler), handler.slice(0, 300));
// ⚠️ MOVED WITH reviews MF-1 and MF-2 of b6-g3: the line's opening is no longer one literal — a restore that stopped part-way opens with what
// it had done (MF-1, #a-restore-that-stops-says-what-it-did), and a finished one calls the baseline known-good only when its confirm did (MF-2)
// — so the note is asked for after that opening, whatever it says
rec("⭐⭐ …and the note is on the line load() leaves on screen, which keeps its line breaks", /const restoredLine = \([^;]*🛟 Restored the map to your [^;]*baseline\.[^;]*\) \+ replacedNote \+/.test(handler)
  && /statusEl\.style\.whiteSpace = "pre-wrap"/.test(handler) && /if \(statusEl && \(replacedNote \|\|/.test(handler) && /await load\(restoredLine(?:, \{ afterSave: true \})?\)/.test(handler), handler.length);
rec("⭐ …and the replaced folders are never worded as movedAside's \"was not in that baseline\"", !/movedAside[^;]*replacedMovedTo|replacedMovedTo[^;]*movedAside/.test(handler), "");

console.log(`\n=== a restore says where the folders it replaced went: ${checks} checks, ${fails.length} failed ===`);
for (const f of fails) console.log("FAILED: " + f);
process.exit(fails.length ? 1 : 0);
