// Auto-fix closes a state-id gap in a mod that replaces history/states.
// #the-gap-closer-reads-what-loads-beneath-the-mod
//
// A mod that declares replace_path="history/states" loads none of the base game's state files. buildMapModel honours
// that, so a mod shipping states 1, 2 and 4 over a base game with 1-3 is a map with ids [1, 2, 4], and the validator
// reports state_id_gap — FATAL, "refuses-to-load" (map-rule-labels.js). Auto-fix is what its hint sends the modder to.
//
// closeStateIdGaps collected the ids "the layers beneath supply" through baseRootsFor, which honours only a
// DEPENDENCY's replace_path — deliberately, since its job is "where do I copy a file from". So the base game's
// 3-C.txt still filled id 3, the gap-closer saw 1..4 contiguous, and it returned { renumbered: [], error: null }.
// Measured on 65978a2 with the page's own request: Auto-fix answered ok, wrote nothing for the gap, said nothing,
// and Save stayed stopped (batch 7 lake, item D; probe-gap-replace-path.js). layersBelow, next door, asks the
// question this needs — what actually loads beneath this mod — and answers [] for a folder the mod replaces.
//
// Requests are the page's: POST /api/map/auto-fix { modPath } (public/map.js, the Map Errors popup and the Save
// gate's Auto-fix button), GET /api/map/validate?modPath and GET /api/map/model?modPath for what it shows after.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("b8-gap-replace-path");
const { createApp } = require("./server.js");
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");

const statesDir = (mod) => path.join(mod, "history", "states");
const stateFiles = (mod) => { try { return fs.readdirSync(statesDir(mod)).sort(); } catch (_) { return []; } };
const readState = (mod, f) => { try { return fs.readFileSync(path.join(statesDir(mod), f), "utf8"); } catch (_) { return ""; } };
const idsOf = (model) => ((model && model.states) || []).map((s) => s.id).sort((a, b) => a - b);
const gapOf = (v) => ((v && v.problems) || []).filter((p) => p.rule === "state_id_gap");

(async () => {
  let srv = null;
  try {
    console.log("0. The page's request");
    {
      const MAP = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
      rec("the page still posts Auto-fix as { modPath: modPath() }",
        (MAP.match(/fetch\("\/api\/map\/auto-fix", \{ method: "POST", headers: \{ "Content-Type": "application\/json" \}, body: JSON\.stringify\(\{ modPath: modPath\(\) \}\) \}\)/g) || []).length >= 1);
      rec("state_id_gap is still a rule Save stops for (the reason this matters)", labels.isFatalRule("state_id_gap") === true);
    }

    srv = await lib.startServer(createApp);
    const model = (mod) => fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());

    console.log("\n1. ⭐⭐⭐ A mod that replaces history/states and ships states 1, 2 and 4");
    {
      const mod = world.mod("gap replace path", {
        "descriptor.mod": 'name="gap replace path"\nsupported_version="1.*"\nreplace_path="history/states"\n',
        "history/states/1-Alpha.txt": lib.st(1, "4"),
        "history/states/2-Beta.txt": lib.st(2, "2 5"),
        "history/states/4-Delta.txt": lib.st(4, "3"),
      });
      const before = await srv.validate(mod);
      const m0 = await model(mod);
      rec("the model loads only the mod's states: [1, 2, 4]", JSON.stringify(idsOf(m0)) === "[1,2,4]", idsOf(m0));
      rec("CONTROL: the validator reports the gap at 3", gapOf(before).length === 1 && JSON.stringify(gapOf(before)[0].missing) === "[3]", gapOf(before));
      const g0 = await lib.saveGate(before);
      rec("CONTROL: …and Save stops for it", g0.crashes >= 1 && /State IDs not contiguous|state ID\(s\)|state_id_gap/i.test(g0.status + JSON.stringify(before.problems.map((p) => p.rule))), g0.status);

      const fx = await srv.autoFix(mod);
      rec("Auto-fix answers 200 ok", fx.status === 200 && fx.body.ok === true, { status: fx.status, error: fx.body.error });
      const sg = (fx.body.fixes && fx.body.fixes.stateGaps) || {};
      rec("⭐⭐⭐ Auto-fix renumbers state 4 into the gap at 3", JSON.stringify(sg.renumbered) === JSON.stringify([{ from: 4, to: 3 }]), sg);
      rec("…and reports no error", !sg.error, sg.error);

      const after = await srv.validate(mod);
      rec("⭐⭐⭐ the validator no longer reports a gap", gapOf(after).length === 0, gapOf(after));
      const m1 = await model(mod);
      rec("the map's states are 1, 2 and 3", JSON.stringify(idsOf(m1)) === "[1,2,3]", idsOf(m1));
      const s3 = (m1.states || []).find((s) => s.id === 3) || {};
      rec("⭐ state 3 is the mod's former state 4, with its province", JSON.stringify(s3.provinces) === "[3]" && String(s3.rootPath || "").toLowerCase() === path.resolve(mod).toLowerCase(), { provinces: s3.provinces, rootPath: s3.rootPath });
      const files = stateFiles(mod);
      rec("the file is renamed with its id: 3-Delta.txt, and 4-Delta.txt is gone", files.includes("3-Delta.txt") && !files.includes("4-Delta.txt"), files);
      rec("…holding id = 3", /\bid = 3\b/.test(readState(mod, "3-Delta.txt")));
      rec("⚠️ no base-game state file was copied into the mod", !files.some((f) => Object.keys(lib.GAME_STATES).map((k) => path.basename(k)).includes(f)), files);
      const g1 = await lib.saveGate(after);
      rec("⭐⭐ Save no longer stops for a state-id gap", !gapOf(after).length && !/not contiguous/i.test(g1.status), g1.status);
      const fatalLeft = (after.problems || []).filter((p) => labels.isFatalRule(p.rule)).map((p) => p.rule);
      rec("⭐ nothing is left that Save stops for", g1.crashes === 0 && fatalLeft.length === 0, { crashes: g1.crashes, fatalLeft, status: g1.status });

      const t0 = lib.tree(mod);
      const fx2 = await srv.autoFix(mod);
      const sg2 = (fx2.body.fixes && fx2.body.fixes.stateGaps) || {};
      rec("a second click renumbers nothing more", fx2.status === 200 && !(sg2.renumbered || []).length, sg2);
      rec("…and leaves the mod's state files as they are", JSON.stringify(Object.keys(lib.tree(mod)).filter((k) => k.startsWith("history/states/")).sort()) === JSON.stringify(Object.keys(t0).filter((k) => k.startsWith("history/states/")).sort()));
    }

    console.log("\n2. ⚠️ CONTROL: without replace_path the base game's 3-C.txt still loads, so there is no gap to close");
    {
      // The kurdistan rule (#gap-closer-invented-a-gap-vanilla-fills) must survive: a base file the mod does not shadow
      // by name supplies its id. Called directly, so no other fixer's work muddies the answer.
      const mod = world.mod("gap no replace path", {
        "history/states/1-Alpha.txt": lib.st(1, "4"),
        "history/states/2-Beta.txt": lib.st(2, "2 5"),
        "history/states/4-Delta.txt": lib.st(4, "3"),
      });
      const r = md.closeStateIdGaps(mod, { gameRoot: world.GAME, dependencyRoots: [] });
      rec("nothing is renumbered: the game supplies id 3", (r.renumbered || []).length === 0 && !r.error, r);
      rec("…and 4-Delta.txt keeps its id", stateFiles(mod).includes("4-Delta.txt") && /\bid = 4\b/.test(readState(mod, "4-Delta.txt")), stateFiles(mod));
    }

    console.log("\n3. ⚠️ CONTROL: a mod that shadows the base's 3-C.txt by name opens a real gap, and it is closed as before");
    {
      const mod = world.mod("gap shadowed by name", {
        "history/states/3-C.txt": lib.st(4, "3"),
      });
      const r = md.closeStateIdGaps(mod, { gameRoot: world.GAME, dependencyRoots: [] });
      rec("state 4 (in the mod's 3-C.txt) slides into 3", JSON.stringify(r.renumbered) === JSON.stringify([{ from: 4, to: 3 }]) && !r.error, r);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== Auto-fix closes a state-id gap in a mod that replaces history/states: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
})();
