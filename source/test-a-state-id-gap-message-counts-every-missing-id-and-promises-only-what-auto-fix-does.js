// state_id_gap's message counts every missing id, and says Auto-fix closes the gap only where Auto-fix does.
// #a-state-id-gap-message-says-what-auto-fix-does
//
// THE DEFECT (batch 8 discovery F12, code + response on 65978a2). validateMapModel collected missing ids with
// `for (let i = 1; i <= max && missing.length <= 60; i++)` and printed `missing.length`, so any map missing more than 60 ids was
// told "61 state ID(s) … are missing": on the owner's Delete-map + Generate land world the disk checker counted 1,081. And the
// message ended "Run Auto-fix to re-create each missing state." Auto-fix creates no state for a gap — the wording predates
// closeStateIdGaps and names the retired fillMissingStateGaps — it moves the highest-numbered state into the gap, and only a state
// the mod defines (closeStateIdGaps: "state N belongs to the base game or a dependency, so gap G can't be closed automatically").
// Batch 8 engine (1210149) reworded the claim about the game; this is the rest.
//
// JUDGED BY BEHAVIOUR, NOT BY TYPED WORDS: the expected count is derived from the model the page loads (max id minus the ids it
// has), and the message's promise is held to what one "Auto-fix all" click (POST /api/map/auto-fix { modPath }) then does to
// the rule and to the number of states.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("b9-gap-message");
const { createApp } = require("./server.js");

const RULE = "state_id_gap";
const gapOf = (v) => ((v && v.problems) || []).find((p) => p.rule === RULE) || null;
/** Does the message tell the modder Auto-fix will deal with the gap? Any mention of Auto-fix that is not a "cannot". */
const promisesAutoFix = (m) => /Auto-fix/i.test(m) && !/Auto-fix[^.]{0,60}\bcannot\b|\bcannot\b[^.]{0,60}Auto-fix/i.test(m);
const CREATES = /\bre-?creat|\bcreates? (?:a|each|the) (?:missing )?state/i;

(async () => {
  let srv = null;
  try {
    srv = await lib.startServer(createApp);
    const model = (mod) => fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());

    console.log("1. ⭐⭐⭐ A mod that replaces history/states and ships states 1, 2 and 70: every id from 3 to 69 is missing");
    {
      const mod = world.mod("gap message own", {
        "descriptor.mod": 'name="gap message own"\nsupported_version="1.*"\nreplace_path="history/states"\n',
        "history/states/1-A.txt": lib.st(1, "4"),
        "history/states/2-B.txt": lib.st(2, "2 5"),
        "history/states/70-G.txt": lib.st(70, "3"),
      });
      const m0 = await model(mod);
      const ids = [...new Set((m0.states || []).map((s) => s.id).filter((n) => Number.isFinite(n) && n > 0))];
      const max = Math.max(...ids);
      const expected = max - ids.length;
      const v = await srv.validate(mod);
      const g = gapOf(v) || {};
      const said = +((/^(\d+) state ID/.exec(g.message || "") || [])[1]);
      console.log(`     model ids ${JSON.stringify(ids.sort((a, b) => a - b))}, max ${max}: ${expected} missing; the message says ${said}`);
      rec("CONTROL: more than 60 ids are missing, so a cap would show", expected > 61, expected);
      rec("⭐⭐⭐ the message counts every missing id", said === expected, g.message);
      rec("…and still lists the first 60 of them in `missing`", Array.isArray(g.missing) && g.missing.length === Math.min(60, expected) && g.missing[0] === 3, g.missing);
      rec("…with maxId the highest id", g.maxId === max, g.maxId);
      rec("⭐⭐ it does not say Auto-fix re-creates a state", !CREATES.test(g.message || ""), g.message);

      const fx = await srv.autoFix(mod);
      const m1 = await model(mod);
      const v1 = await srv.validate(mod);
      rec("Auto-fix answers 200 ok", fx.status === 200 && fx.body.ok === true, { status: fx.status, error: fx.body.error });
      rec("⭐⭐ the message's promise matches what Auto-fix did (the highest state is the mod's own, so it closes the gap)",
        promisesAutoFix(g.message || "") === !gapOf(v1) && !gapOf(v1), { promises: promisesAutoFix(g.message || ""), after: gapOf(v1), stateGaps: fx.body.fixes && fx.body.fixes.stateGaps });
      rec("⭐ …and it created no state: the map has as many states as before", (m1.states || []).length === (m0.states || []).length, [(m0.states || []).length, (m1.states || []).length]);
    }

    console.log("\n2. ⭐⭐⭐ An add-on whose own gap sits under a state its dependency defines");
    {
      const DEP = "gap message dep";
      world.mod(DEP, {
        "descriptor.mod": `name="${DEP}"\nsupported_version="1.*"\nreplace_path="history/states"\n`,
        "history/states/1-A.txt": lib.st(1, "4"),
        "history/states/2-B.txt": lib.st(2, "2 5"),
        "history/states/3-C.txt": lib.st(3, "3"),
      });
      // The add-on folds state 2's provinces into its copy of state 1 and empties 2-B.txt: id 2 goes missing below the
      // dependency's state 3, the highest id, which the add-on does not define.
      const addon = world.mod("gap message addon", {
        "history/states/1-A.txt": lib.st(1, "4 2 5"),
        "history/states/2-B.txt": "# state 2 folded into state 1 by the add-on\n",
      }, [DEP]);
      const v = await srv.validate(addon);
      const g = gapOf(v) || {};
      rec("CONTROL: the add-on is told id 2 is missing", Array.isArray(g.missing) && g.missing.indexOf(2) !== -1, g);
      rec("⭐⭐ the message counts it", +((/^(\d+) state ID/.exec(g.message || "") || [])[1]) === (g.missing || []).length, g.message);
      rec("⭐⭐ it does not say Auto-fix re-creates a state", !CREATES.test(g.message || ""), g.message);
      const fx = await srv.autoFix(addon);
      const v1 = await srv.validate(addon);
      const sg = (fx.body.fixes && fx.body.fixes.stateGaps) || {};
      console.log(`     Auto-fix stateGaps: ${JSON.stringify(sg)}`);
      rec("Auto-fix answers 200 ok", fx.status === 200 && fx.body.ok === true, { status: fx.status, error: fx.body.error });
      rec("CONTROL: Auto-fix cannot close it — the highest state is the dependency's", !!gapOf(v1) && !(sg.renumbered || []).length, { after: gapOf(v1), stateGaps: sg });
      rec("⭐⭐⭐ …so the message does not promise that it will", promisesAutoFix(g.message || "") === !gapOf(v1), g.message);
      rec("⭐ …and names the state that is in the way", new RegExp(`\\b${g.maxId}\\b`).test(String(g.message || "").replace(/^[^.]*\./, "")), g.message);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== a state-id gap message counts every missing id and promises only what Auto-fix does: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
})();
