// ⛔ #a-check-that-could-not-run-is-not-a-clean-save — A SAVE WHOSE CRASH CHECK COULD NOT RUN SAYS SO, AND NEVER READS "✓ Saved".
//
// B6-2 (tool campaign, CONFIRMED): mapCrashGate is the check every map Save ends with — "the guarantee that no map Save can leave the
// mod in a launch-crashing state unnoticed". When its GET /api/map/validate failed it said nothing of it: a rejected fetch (the server
// gone after the last write) hit `catch (_) { setStatus(head); return head; } // best-effort`, and the route's own failure answer (HTTP
// 400 {ok:false, error}, server.js's catch when the validator throws) fell through every `v && v.ok` branch to the same line. Both read
// "✓ Saved 3 changes to your mod." in the normal colour, with no popup: a map nobody checked, presented as a clean Save.
//
// Runs the page's own mapCrashGate (lifted out of public/map.js by testlib-map-page) against stubbed answers, with a control that a
// clean check still reads "✓ Saved" and a FATAL still opens the popup.
"use strict";
const T = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1200) : JSON.stringify(detail).slice(0, 1200)); }
}
const answer = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
async function gate(fetchImpl, args) {
  const opened = [];
  const { sb } = T.runPage(["async function mapCrashGate("], { fetch: fetchImpl, modPath: () => "C:/any", openMapErrorsModal: (v, ctx) => opened.push(ctx) });
  const line = String(await sb.mapCrashGate(args));
  return { line, popup: opened.length, colour: sb.statusEl.style.color || "", shown: String(sb.statusEl.textContent) };
}
const unchecked = (g) => !/^✓/.test(g.line) && /could not check the map afterwards/.test(g.line) && /⚠ Map Errors/.test(g.line) && g.colour === "#e3b341" && g.shown === g.line;

(async () => {
  try {
    const A = await gate(() => Promise.reject(new TypeError("Failed to fetch")), { done: 3 });
    rec("⭐⭐⭐ the check's request failed (the server went away): no \"✓ Saved\" — the line says the map was not checked, and why",
      unchecked(A) && /^⚠ Saved 3 changes to your mod, but Nova could not check the map afterwards \(Failed to fetch\)/.test(A.line), A);
    const B = await gate(() => answer(400, { ok: false, error: "Cannot read properties of undefined (reading 'provinces')." }), { done: 3 });
    rec("⭐⭐⭐ the route answered its own failure (400 {ok:false, error}): the same, quoting the error without doubling its full stop",
      unchecked(B) && B.line.includes("(Cannot read properties of undefined (reading 'provinces'))") && !/\.\)/.test(B.line), B);
    const C = await gate(() => Promise.resolve({ ok: false, status: 502, json: () => Promise.reject(new SyntaxError("Unexpected token < in JSON")) }), { done: 1 });
    rec("⭐⭐ an answer that is not JSON at all: the same, in the singular", unchecked(C) && /^⚠ Saved 1 change to your mod, but/.test(C.line), C);
    const D = await gate(() => answer(200, {}), { done: 2 });
    rec("⭐⭐ an answer with no ok in it is not a check either", unchecked(D) && /\(the check gave no answer\)/.test(D.line), D);
    const E = await gate(() => Promise.reject(new TypeError("Failed to fetch")), { done: 1, stopped: "Save stopped at step 2: Failed to fetch. Remaining changes kept." });
    rec("⭐ a stopped Save keeps its own head, and adds that the map was not checked",
      /^Save stopped at step 2: Failed to fetch\. Remaining changes kept\.\n⚠ Nova could not check the map afterwards/.test(E.line) && E.colour === "#e3b341", E);
    const F = await gate(() => Promise.reject(new TypeError("Failed to fetch")), { done: 2, writeWarnings: ["⚠ a note the Save made"] });
    rec("⭐ …and the Save's own notes are still said", unchecked(F) && /Also, what this save changed:\n• ⚠ a note the Save made/.test(F.line), F);
    rec("…none of them opened a popup with nothing to show", [A, B, C, D, E, F].every((g) => g.popup === 0), [A, B, C, D, E, F].map((g) => g.popup));
    // controls: the gate itself is unchanged where the check ran
    const ok = await gate(() => answer(200, { ok: true, errors: 0, warnings: 0, problems: [] }), { done: 3 });
    rec("CONTROL: a check that ran and found nothing still reads \"✓ Saved 3 changes to your mod.\"", ok.line === "✓ Saved 3 changes to your mod." && ok.popup === 0, ok);
    const fatal = await gate(() => answer(200, { ok: true, errors: 1, warnings: 0, problems: [{ rule: "empty_state", severity: "error", message: "empty" }] }), { done: 3 });
    rec("CONTROL: a check that found a problem Save stops for still opens the popup", /⛔/.test(fatal.line) && fatal.popup === 1, fatal);
  } catch (e) { rec("the gate runs", false, e && e.stack); }
  const SRC = T.MASKED;
  const at = SRC.indexOf("async function mapCrashGate(");
  const body = at < 0 ? "" : SRC.slice(at, SRC.indexOf("\n  }\n", at));
  rec("⭐ the gate no longer answers a failed check with its head alone", body.length > 500 && !/catch \(_\) \{ setStatus\(head\); return head; \}/.test(body), body.length);
  console.log(`\n=== a save whose check could not run says so: ${checks} checks, ${fails.length} failed ===`);
  for (const f of fails) console.log("FAILED: " + f);
  process.exit(fails.length ? 1 : 0);
})();
