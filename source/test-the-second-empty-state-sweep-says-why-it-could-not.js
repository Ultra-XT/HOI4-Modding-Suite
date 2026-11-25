// An empty state one "Auto-fix all" click could NOT remove is said — whatever else that click's second
// empty-state sweep managed to delete. #the-second-empty-state-sweep-says-why-it-could-not
//
// ⛔ THE DEFECT. An empty state is fatal: HOI4 logs "no provinces in state", loads the map, and then refuses to start a
// game ("MAP_ERROR: no air base site defined for state" → "Failed to load the map"). autoFixMap therefore sweeps for them
// TWICE, because fixEmptyStates deliberately skips a country's CAPITAL state and fixForeignCapitals then moves that
// capital away, leaving a now-non-capital empty state nothing had re-checked. Whatever that second sweep cannot delete
// comes back as `skipped`, with a reason, and public/map.js prints it in the Map Errors summary:
//
//     (1 empty state left alone — <reason>)
//
// The merge dropped it. It ran only `if (es2.deleted.length)`, and then assigned `skipped` to the second pass's list
// outright. So:
//   · a second sweep that deleted NOTHING and refused something had its refusal thrown away entirely, and the click said
//     nothing at all about a fatal it was leaving behind;
//   · a second sweep that deleted something erased the FIRST pass's refusals with its own.
//
// MEASURED, not reasoned. Tracking #a-carve-must-not-empty-a-state-it-cannot-delete down on the mod the owner's workflow
// built at 4601d18 (new mod over vanilla → Delete map → Generate land → Auto-fix), a later Auto-fix answers:
//
//     emptyStates: { deleted: [], skipped: [{ id: 932, reason: "State 932 comes from the base game or a dependency, and
//                    this mod doesn't replace history/states — deleting your copy of it would just bring the original
//                    back, with its own provinces and buildings." }] }
//
// The sweep sees the empty state perfectly well and deleteState refuses it (#delete-inherited-state). On the click that
// MADE it, that same refusal came back from the second pass with nothing deleted beside it, and was dropped — which is
// why the click that left a fatal on the screen reported an empty-state sweep with nothing deleted and nothing skipped.
//
// THE FIXTURE is the exact shape the second sweep exists for, so the two passes disagree about the reason:
//   · the layer below owns state 3 and AAA's capital points at it;
//   · the mod ships its own copy of that state file, emptied but still declaring buildings.
// Pass one skips it as a CAPITAL state ("give it a province or move the country's capital"); fixForeignCapitals then
// moves AAA's capital onto land it holds; pass two finds it is no longer a capital, tries to delete it, and is refused
// because the base game supplies that id. The later reason is the true one — the click has already done the thing the
// first reason tells the modder to do — and it is the one the summary must carry.
//
// Requests are the page's: GET /api/map/validate?modPath and POST /api/map/auto-fix { modPath }.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");
const { isFatalRule } = require("./public/map-rule-labels.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("b16-empty-why");
const { createApp } = require("./server.js");

// The layer below is the lib's own little world (states 1 = { 4 }, 2 = { 2 5 }, 3 = { 3 }, all owned by AAA) plus one
// country file that points AAA's capital at state 3.
lib.write(world.GAME, { "history/countries/AAA - Aaa.txt": "capital = 3\n" });

// The mod ships its own copy of that state, under the base file's OWN name (which is how editStateBlock materialises
// one, and how HOI4 overrides history/states), emptied but still declaring a building.
const EMPTIED = 'state = {\n\tid = 3\n\tname = "STATE_3"\n\tmanpower = 4000\n\tstate_category = rural\n\tprovinces = { }\n'
  + '\thistory = {\n\t\towner = AAA\n\t\tbuildings = {\n\t\t\tinfrastructure = 3\n\t\t}\n\t}\n}\n';

const rulesOf = (v) => { const t = {}; for (const p of (v && v.problems) || []) t[p.rule] = (t[p.rule] || 0) + 1; return t; };
const skipOf = (fixes, id) => (((fixes || {}).emptyStates || {}).skipped || []).find((s) => s && s.id === id) || null;

(async () => {
  let srv = null;
  try {
    srv = await lib.startServer(createApp);
    const mod = world.mod("b16 empty why", { "descriptor.mod": 'name="b16ew"\nsupported_version="1.*"\n', "history/states/3-C.txt": EMPTIED });

    console.log("1. ⭐⭐ CONTROL: the shape — a capital's empty state, whose id the layer below also supplies");
    const before = await srv.validate(mod);
    {
      const r = rulesOf(before);
      rec("validate calls it an EMPTY CAPITAL state, and that is fatal", r.empty_capital_state === 1 && isFatalRule("empty_capital_state"), r);
      rec("…and the mod ships the file, so deleting its copy would only un-shadow the base game's",
        fs.existsSync(path.join(mod, "history", "states", "3-C.txt")) && fs.existsSync(path.join(world.GAME, "history", "states", "3-C.txt")));
    }

    console.log("\n2. ⭐⭐⭐ One click: the capital moves, the state cannot be deleted, and the click SAYS WHICH");
    const res = await srv.autoFix(mod);
    const fixes = (res.body && res.body.fixes) || {};
    {
      rec("the click moved AAA's capital off the empty state", ((fixes.capitals || {}).fixed || 0) >= 1, fixes.capitals);
      rec("…and the empty state is still there, because nothing can remove it",
        !((fixes.emptyStates || {}).deleted || []).includes(3) && fs.existsSync(path.join(mod, "history", "states", "3-C.txt")), fixes.emptyStates);
      const s = skipOf(fixes, 3);
      rec("⭐⭐⭐ the click names state 3 as an empty state it left alone", !!s, fixes.emptyStates);
      rec("⭐⭐⭐ …with the reason the SECOND sweep found — that the base game supplies it — not the first sweep's",
        !!s && /base game or a dependency/.test(s.reason || "") && !/capital state/.test(s.reason || ""), s);
      rec("…and that reason no longer tells the modder to do what this same click already did",
        !!s && !/move the country's capital/.test(s.reason || ""), s && s.reason);
    }

    console.log("\n3. ⭐⭐ The screen still shows the fatal, so the summary had to say something about it");
    {
      const after = await srv.validate(mod);
      const r = rulesOf(after);
      rec("the state is now an empty state with content — still fatal", r.empty_state_with_content === 1 && isFatalRule("empty_state_with_content"), r);
      rec("…and it is no longer reported as a capital's, because the capital moved", !r.empty_capital_state, r);
    }

    console.log("\n4. ⭐⭐ A second click says the same thing, rather than forgetting");
    {
      const res2 = await srv.autoFix(mod);
      const s2 = skipOf((res2.body && res2.body.fixes) || {}, 3);
      rec("the second click also names state 3, with the same reason", !!s2 && /base game or a dependency/.test(s2.reason || ""), s2);
    }

    console.log("\n5. ⭐ …and the Map Errors summary is still wired to that field (the reason this is worth carrying)");
    {
      const SRC = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
      rec("public/map.js prints es.skipped's reason in the click's summary",
        /es\.skipped/.test(SRC) && /empty state.{0,40}left alone/.test(SRC.replace(/\s+/g, " ")),
        (SRC.match(/.{0,80}left alone.{0,80}/) || [""])[0]);
    }
  } catch (e) {
    rec("the test ran to the end", false, String((e && e.stack) || e));
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }

  console.log(`\n=== the second empty-state sweep says why it could not: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
})();
