// ⛔ #a-stopped-save-is-not-a-saved-one — THE POPUP A STOPPED SAVE OPENS DOES NOT SAY THE EDITS WERE WRITTEN.
//
// B6-22 (tool campaign, CONFIRMED): a map Save that stops part-way still runs its crash check (#a-stopped-save-skips-the-crash-gate),
// and when the map it left has an error the check opens Map Errors — on purpose (test-a-stopped-save-still-checks-for-a-crash.js pins
// that it opens). mapCrashGate knew the Save had stopped and said so on the status line ("Save stopped at step 2: … Remaining changes
// kept."), but opened the popup with `openMapErrorsModal(v, "postsave")` and nothing more, and both of the popup's post-save sentences
// are chosen by that context alone: "Your edits were written to the mod." (an error the game loads past) and "Your edits were saved,
// but they leave …" (the hard gate) — over a queue that still held the edit the Save never reached.
//
// Runs the page's own mapCrashGate and openMapErrorsModal (lifted out of public/map.js by testlib-map-page) against stubbed answers.
"use strict";
const T = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1200) : JSON.stringify(detail).slice(0, 1200)); }
}

const LOADS = { ok: true, errors: 1, warnings: 0, problems: [{ rule: "capital_state_owned_by_other", severity: "error", message: "FRA's capital, state 16, is GER's." }] };
const FATAL = { ok: true, errors: 1, warnings: 0, problems: [{ rule: "empty_state", severity: "error", message: "State 1082 has no provinces." }] };
const WRITTEN = /Your edits were (written to the mod|saved)/;
const STOPPED = /Your Save stopped part-way, so the edits it did not reach are still queued/;

function popup(res, context, opts) {
  const { sb, overlays } = T.runPage(["function openMapErrorsModal("], { modPath: () => "C:/any", fetch: async () => ({ json: async () => ({ ok: false }) }) });
  sb.openMapErrorsModal(res, context, opts);
  const o = overlays.filter((x) => /id="mapErrClose"/.test(x.innerHTML)).pop();
  return o ? o.innerHTML : "";
}

(async () => {
  try {
    // ── 1. the popup's own sentences
    const loadsStopped = popup(LOADS, "postsave", { stopped: true });
    rec("⭐⭐⭐ a stopped Save's popup over an error the game loads past no longer says the edits were written", !!loadsStopped && !WRITTEN.test(loadsStopped), loadsStopped.slice(0, 1500));
    rec("⭐⭐ …it says the Save stopped and the edits it did not reach are still queued, and that 💾 Save sends them",
      STOPPED.test(loadsStopped) && /💾 Save sends them, and the check runs again/.test(loadsStopped), loadsStopped.slice(0, 1500));
    rec("⭐ …and it does not offer the one-click fix while the edits are queued (Auto-fix waits for them)",
      !/use the one-click fix where offered/.test(loadsStopped) && /Auto-fix waits for them/.test(loadsStopped), loadsStopped.slice(0, 1500));
    const fatalStopped = popup(FATAL, "postsave", { stopped: true });
    rec("⭐⭐⭐ a stopped Save's hard gate no longer says the edits were saved", /id="mapErrGateInput"/.test(fatalStopped) && !WRITTEN.test(fatalStopped), fatalStopped.slice(0, 1500));
    rec("⭐⭐ …it says what the Save wrote leaves the problem, with the edits it did not reach still queued",
      STOPPED.test(fatalStopped) && /what it wrote leaves 1 problem Save stops for/.test(fatalStopped), fatalStopped.slice(0, 1500));
    // controls: a Save that finished keeps its words
    const loadsDone = popup(LOADS, "postsave");
    rec("CONTROL: a Save that finished still says \"Your edits were written to the mod.\"", /Your edits were written to the mod\./.test(loadsDone) && !STOPPED.test(loadsDone), loadsDone.slice(0, 900));
    const fatalDone = popup(FATAL, "postsave", { stopped: false });
    rec("CONTROL: …and its gate still says \"Your edits were saved, but they leave\"", /Your edits were saved, but they leave 1 problem Save stops for/.test(fatalDone), fatalDone.slice(0, 900));
    rec("CONTROL: Map Errors opened by hand says neither", !WRITTEN.test(popup(LOADS)) && !STOPPED.test(popup(LOADS)), popup(LOADS).slice(0, 400));

    // ── 2. mapCrashGate hands the stop to the popup
    const opened = [];
    const gate = T.runPage(["async function mapCrashGate("], {
      modPath: () => "C:/any",
      openMapErrorsModal: (v, ctx, o) => opened.push({ ctx, stopped: !!(o && o.stopped) }),
    });
    for (const v of [LOADS, FATAL]) {
      gate.sb.fetch = async () => ({ json: async () => v });
      await gate.sb.mapCrashGate({ done: 1, stopped: "Save stopped at step 2: Couldn't write 1-France.txt. Remaining changes kept." });
      await gate.sb.mapCrashGate({ done: 2 });
    }
    rec("⭐⭐ mapCrashGate tells the popup when the Save stopped, and only then",
      opened.length === 4 && opened.every((o) => o.ctx === "postsave") && opened.map((o) => o.stopped).join() === "true,false,true,false", opened);
  } catch (e) { rec("the page runs", false, e && e.stack); }
  console.log(`\n=== a stopped Save says its edits are still queued: ${checks} checks, ${fails.length} failed ===`);
  for (const f of fails) console.log("FAILED: " + f);
  process.exit(fails.length ? 1 : 0);
})();
