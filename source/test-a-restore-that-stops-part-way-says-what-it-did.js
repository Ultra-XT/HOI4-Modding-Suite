// ⛔ #a-restore-that-stops-says-what-it-did — A 🛟 Restore baseline THAT STOPS PART-WAY SAYS WHAT IT HAD ALREADY DONE, WHERE THE FOLDERS IT
// REPLACED WENT AND THAT NOTHING WAS DELETED — AND THE PAGE READS THE MAP BACK FROM THE MOD, AS IT DOES AFTER A RESTORE THAT FINISHED.
//
// Review MF-1 of b6-g3, against B6-6's decision ("the page says where they went and that nothing was deleted"). restoreMapBaseline
// (map-data.js) answers what it had already moved even when it throws mid-way — `{ ok: false, error, ...moves() }`: restored, replacedMovedTo,
// replacedLeftInMod, movedAside — and the route hands that on with its 400. MEASURED by clicking this page's own handler with the real
// answer (scratch probe, integration of b6-g3 + b6-g1 + b6-g2): with a program holding history/states open, the answer was
//   { ok: false, error: "EBUSY: resource busy or locked, rename '…\history\states' -> '…\history\states.nova-previous'", restored: ["map"],
//     replacedMovedTo: [{ dir: "map", to: "<home>\.nova\baseline_restores\<mod>\<time>\map", files: 3 }] }
// map/ was already the baseline's, and the modder's own map/ existed only in that store. The page's one line was "Restore failed: EBUSY …":
// no folder named, nothing said of a deletion, no reload and no re-check — the page kept the map it had drawn, which a 💾 Save from there
// would write onto a half-restored mod.
// An answer that says nothing in the mod changed — a refusal before the restore began (a leftover it could not move, no baseline yet), or
// an older server's — still reads "Restore failed", and the popup stays: there is nothing new on disk to read back.
//
// Runs the page's own openMapErrorsModal (lifted out of public/map.js by testlib-map-page) and clicks 🛟 Restore against each answer shape
// restoreMapBaseline gives; the helper the line opens with is lifted and run on its own too.
"use strict";
const T = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1400) : JSON.stringify(detail).slice(0, 1400)); }
}

const CLEAN = { ok: true, errors: 0, warnings: 0, problems: [] };
const MOD = "D:\\mods\\My mod";
const STORE = "C:\\Users\\x\\.nova\\baseline_restores\\My_mod_ab12\\2026-11-19T10-35-14-327Z";
const EBUSY = `EBUSY: resource busy or locked, rename '${MOD}\\history\\states' -> '${MOD}\\history\\states.nova-previous'`;
// the measured answer, its paths shortened
const MIDWAY = { ok: false, error: EBUSY, restored: ["map"], replacedMovedTo: [{ dir: "map", to: STORE + "\\map", files: 3 }] };
// …and the other shapes `...moves()` can carry when the loop throws
const TWO = { ok: false, error: "ENOSPC: no space left on device, copyfile", restored: ["map", "history\\states"],
  replacedMovedTo: [{ dir: "map", to: STORE + "\\map", files: 3 }, { dir: "history\\states", to: STORE + "\\history\\states", files: 2 }] };
const LEFT = { ok: false, error: "EPERM: operation not permitted, rename", restored: ["map"],
  replacedLeftInMod: [{ dir: "map", at: MOD + "\\map.nova-previous", error: "EPERM: operation not permitted" }] };
const ASIDE = { ok: false, error: "ENOSPC: no space left on device, copyfile", movedAside: [{ dir: "history\\units", to: STORE + "\\history\\units", files: 2 }] };
// answers that changed nothing in the mod: the leftover refusal (its own words, map-data.js), no baseline, and no answer at all
const LEFTOVER = { ok: false, refused: "leftover",
  leftoversMovedTo: [{ dir: "map", was: "map.nova-previous", to: STORE + "\\replaced-by-an-earlier-restore\\map", files: 40 }],
  error: "history/states.nova-restoring, a folder an earlier 🛟 Restore baseline left in your mod, could not be moved out of it (EBUSY: resource busy or locked), so this restore stopped before it changed your map. Nothing was deleted. Close any program that has a file in that folder open, and Restore again." };
const NOTHING = { ok: false, error: "No baseline saved for this mod yet — save one when the map is known-good first." };
const FINISHED = { ok: true, restored: ["map", "history/states"], movedAside: [], notJudged: [], replacedMovedTo: [{ dir: "map", to: STORE + "\\map", files: 3 }] };

/** The popup on a page whose restore-baseline answers `answer`; Restore is clicked and its confirm answered yes. */
async function restore(answer) {
  const st = { posts: [], loads: [], validates: 0, confirmed: null };
  const { sb, statuses, overlays } = T.runPage(["function openMapErrorsModal(", "function baselineRestoreConfirmText(", "function baselineRestoreTitle("], {
    modPath: () => MOD,
    hasPendingMapEdits: () => false,
    pendingWrites: [],
    load: async (line) => { st.loads.push(String(line)); },
    fetch: async (url, opts) => {
      const u = String(url).split("?")[0];
      if (opts && opts.method === "POST") st.posts.push(u);
      if (u === "/api/map/validate") { st.validates++; return { json: async () => CLEAN }; }
      if (u === "/api/map/baseline-info") return { json: async () => ({ exists: true, savedAt: "2026-11-19T10:00:00.000Z", sizeMB: 3, heldUnits: true, heldDescriptors: true, heldFiles: true }) };
      if (u === "/api/map/restore-baseline") return { json: async () => JSON.parse(JSON.stringify(answer)) };
      return { json: async () => ({ ok: false, error: "not stubbed: " + u }) };
    },
    window: { NovaMapRuleLabels: require("./public/map-rule-labels.js"), novaConfirm: (msg, yes) => { st.confirmed = yes(); } },
  });
  const popups = () => overlays.filter((o) => /id="mapErrClose"/.test(o.innerHTML));
  sb.openMapErrorsModal(CLEAN);
  const first = popups()[0];
  const btn = first.querySelector("#mapErrRestoreBaseline");
  await btn.listeners.click[0]({ target: btn });
  await st.confirmed;
  const line = st.loads[0] !== undefined ? st.loads[0] : statuses[statuses.length - 1] || "";
  return { st, sb, statuses, popups, first, btn, line, all: statuses.concat(st.loads).join("\n") };
}
const reloaded = (p) => p.st.loads.length === 1 && p.st.validates >= 1 && p.first.removed === true && p.popups().length === 2;
const stayed = (p) => p.st.loads.length === 0 && p.st.validates === 0 && p.first.removed !== true && p.popups().length === 1
  && p.btn.disabled === false && p.btn.textContent === "🛟 Restore baseline";

(async () => {
  try {
    // ── 1. the measured answer: map/ swapped and the modder's own map/ moved out, then history/states refused
    {
      const p = await restore(MIDWAY);
      rec("CONTROL: the click posts restore-baseline once", p.st.posts.filter((u) => u === "/api/map/restore-baseline").length === 1, p.st.posts);
      rec("⭐⭐⭐ the line names the folder the restore had already moved out of the mod, says it was MOVED (not deleted), and where",
        /Your mod's map\/ as it was before the restore \(3 files\) was MOVED out of your mod \(not deleted\) to:\n {2}/.test(p.line) && p.line.includes(STORE + "\\map"), p.line);
      rec("⭐⭐⭐ …it says the restore stopped part-way, with the reason, and what it had already put back from the baseline",
        p.line.startsWith("⚠ 🛟 Restore baseline stopped part-way: " + EBUSY + ".") && /It had already put back your mod's map\/ from the baseline/.test(p.line), p.line);
      rec("⭐⭐ …that nothing was deleted, and that Restore again finishes it", /Nothing was deleted\./.test(p.line) && /🛟 Restore again to finish it\./.test(p.line), p.line);
      rec("⭐⭐⭐ the page reads the map back from the mod with that line, and Map Errors checks it again (the popup is replaced)", reloaded(p),
        { loads: p.st.loads.length, validates: p.st.validates, removed: p.first.removed, popups: p.popups().length });
      rec("⭐ …saying the same line until then, with Re-checking…", p.statuses.includes(p.line + " Re-checking…"), p.statuses);
      rec("⭐ …in the warning colour, its line breaks kept", p.sb.statusEl.style.color === "#e3b341" && p.sb.statusEl.style.whiteSpace === "pre-wrap", p.sb.statusEl.style);
      rec("⭐⭐ …and nothing says the restore finished, or failed with nothing done", !/Restored the map to your/.test(p.all) && !/Restore failed/.test(p.all) && !/known-good/.test(p.line), p.all);
    }
    // ── 2. the other shapes of a restore that had changed the mod when it stopped
    {
      const p = await restore(TWO);
      rec("⭐⭐ two folders put back: both named, each where it went, and the map read back",
        /It had already put back your mod's map\/ and history\/states\/ from the baseline, so your mod now has the baseline's copies of those folders/.test(p.line)
          && p.line.includes(STORE + "\\map") && p.line.includes(STORE + "\\history\\states") && /\(5 files\) were MOVED out of your mod \(not deleted\)/.test(p.line) && reloaded(p), p.line);
    }
    {
      const p = await restore(LEFT);
      rec("⭐⭐⭐ a folder it could not move out: named, WHERE it still is in the mod, that nothing was deleted — and the map read back",
        p.line.startsWith("⚠ 🛟 Restore baseline stopped part-way: EPERM") && p.line.includes(`still in your mod folder, at ${MOD.replace(/\\/g, "/")}/map.nova-previous — nothing was deleted`) && reloaded(p), p.line);
    }
    {
      const p = await restore(ASIDE);
      rec("⭐⭐ a folder the baseline does not hold, moved out before it stopped: said in movedAside's words, and the map read back",
        p.line.startsWith("⚠ 🛟 Restore baseline stopped part-way: ENOSPC") && /history\/units\/ folder was not in that baseline, so it was MOVED out of your mod \(not deleted\) to:\n {2}/.test(p.line)
          && p.line.includes(STORE + "\\history\\units") && !/It had already put back/.test(p.line) && reloaded(p), p.line);
    }
    // ── 3. answers that changed nothing in the mod: "Restore failed", and the popup stays
    {
      const p = await restore(LEFTOVER);
      rec("⭐⭐ a leftover it could not move (the restore stopped before it changed the map): \"Restore failed\" with its own words, nothing reloaded",
        p.line.startsWith("Restore failed: " + LEFTOVER.error) && stayed(p), { line: p.line, loads: p.st.loads.length, removed: p.first.removed, disabled: p.btn.disabled });
      rec("⭐⭐ …and where the leftover of an earlier restore it DID move out went",
        /also MOVED out of your mod \(not deleted\) a folder an earlier restore had left in it \(map\.nova-previous\/\), to:\n {2}/.test(p.line) && p.line.includes(STORE + "\\replaced-by-an-earlier-restore\\map"), p.line);
    }
    {
      const p = await restore(NOTHING);
      rec("CONTROL: no baseline yet — the line it always had, nothing reloaded, the button back", p.line === "Restore failed: " + NOTHING.error && stayed(p), p.line);
    }
    {
      const p = await restore(null);
      rec("CONTROL: no answer at all — \"Restore failed: unknown\", nothing reloaded", p.line === "Restore failed: unknown" && stayed(p), p.line);
    }
    // ── 4. CONTROL: a restore that finished is said and read back as before
    {
      const p = await restore(FINISHED);
      rec("CONTROL: a finished restore opens \"🛟 Restored the map to your … baseline.\", names where map/ went, and reads the map back",
        /^🛟 Restored the map to your (known-good )?baseline\. Your mod's map\/ as it was before the restore \(3 files\) was MOVED out of your mod \(not deleted\)/.test(p.line)
          && !/stopped part-way/.test(p.line) && reloaded(p), p.line);
    }
  } catch (e) { rec("the popup runs", false, e && e.stack); }

  // ── 5. the helper the line opens with, on its own: "" exactly when the answer says nothing in the mod changed
  let note = null;
  try { note = T.runPage(["function baselineRestoreStoppedNote("]).sb.baselineRestoreStoppedNote; } catch (e) { rec("baselineRestoreStoppedNote is lifted out of public/map.js", false, e.message); }
  if (note) {
    const none = { finished: FINISHED, nul: null, nothing: NOTHING, leftover: LEFTOVER, older: { ok: false, error: "EBUSY" }, empties: { ok: false, error: "x", restored: [], replacedMovedTo: [], movedAside: [] } };
    for (const [k, r] of Object.entries(none)) rec(`⭐ (${k}) an answer that changed nothing in the mod opens no stopped line`, note(r) === "", note(r));
    for (const [k, r] of Object.entries({ MIDWAY, TWO, LEFT, ASIDE })) rec(`⭐⭐ (${k}) an answer that changed the mod opens one`, /^⚠ 🛟 Restore baseline stopped part-way: /.test(note(r)), note(r));
    rec("…a reason it was not given is said as such", /stopped part-way: it gave no reason\./.test(note({ ok: false, restored: ["map"] })), note({ ok: false, restored: ["map"] }));
  }

  console.log(`\n=== a restore that stops part-way says what it did: ${checks} checks, ${fails.length} failed ===`);
  for (const f of fails) console.log("FAILED: " + f);
  process.exit(fails.length ? 1 : 0);
})();
