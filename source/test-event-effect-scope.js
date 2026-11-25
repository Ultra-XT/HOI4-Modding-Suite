// #event-effect-scope — HOI4 TYPE-CHECKS AN EVENT'S EFFECTS AT LOAD TIME AND SILENTLY DROPS THE WRONG ONES.
//
// From the user's error.log while playing their mod, 7 lines, all [no_game_date][effect.cpp:435]:
//   add_political_power in 4 operative_leader_event options
//   gain_xp x2 and set_unit_leader_flag in a unit_leader_event's options
// The effect is skipped, so the option is a dead button. Nothing in Nova said a word.
//
// TWO THINGS HERE ARE COUNTER-INTUITIVE, and both were established by measurement rather than assumption:
//
// 1. A unit_leader_event does NOT start in unit-leader scope — it starts in COUNTRY scope. The differential
//    control is in the user's own log: identical `add_political_power = 5` inside a unit_leader_event option
//    was NOT flagged, while gain_xp in the same kind of block WAS. Vanilla puts a bare add_political_power
//    in a unit_leader_event option 8 times. Assuming the intuitive mapping produced 46 false positives
//    against vanilla.
//
// 2. The check must stop at the first brace. hoi4-spec.json's `scope` is "the scope this effect is valid IN",
//    never "the scope this block PRODUCES" — all 54 scope-changing wrappers are tagged with their OUTER
//    scope, so nesting cannot be followed from the spec at all. 3,659 of vanilla's 11,713 event option
//    blocks contain a wrapper, and a check that looked inside one would flag `gain_xp` exactly where it is
//    CORRECT: inside `every_unit_leader = { … }`. Depth-0 catches all 7 real cases with 0 false positives
//    across 7,426 vanilla statements.
//
// It WARNS and never blocks — see the comment at eventScopeWarnings.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evscope-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "evscopemod");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EvScopeMod"\nsupported_version="1.19.*"\n', "utf8");

const PORT = 42493;
const app = createApp();
const server = app.listen(PORT, async () => {
  let n = 0;
  const save = (type, script, extra) => fetch(`http://127.0.0.1:${PORT}/api/events/save`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({
      modPath: MOD, namespace: "evscope", id: String(++n), type, // the id field is the NUMBER only; the namespace is separate
      title: "T", description: "D", picture: "", triggeredOnly: true,
      options: [{ name: `evscope.${n}.a`, title: "OK", script }],
      hidden: false, fireOnce: false, major: false, trigger: "", immediate: "", after: "",
    }, extra || {})),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  const warn = (r) => String((r.b && r.b.refWarning) || "");

  try {
    console.log("\n[control] the effects the game ACCEPTED must stay silent");
    // FIRST, and this is the load-bearing half. A scope lint that cries wolf is worse than none, and the
    // intuitive root-scope map would fire on all of these.
    let r = await save("country_event", "add_political_power = 50");
    rec("country_event + add_political_power saves", r.s === 200 && r.b.ok !== false, r.b || r.s);
    rec("…with no scope warning", !/scope/i.test(warn(r)), warn(r));

    r = await save("unit_leader_event", "add_political_power = 5");
    rec("unit_leader_event + add_political_power saves", r.s === 200 && r.b.ok !== false, r.b || r.s);
    // THE DIFFERENTIAL. The game did not flag this in the user's mod; nor may Nova.
    rec("…and is NOT warned about — a unit_leader_event starts in COUNTRY scope", !/scope/i.test(warn(r)), warn(r));

    console.log("\n[the bug] the three shapes HOI4 actually rejected");
    r = await save("operative_leader_event", "add_political_power = 5");
    rec("operative_leader_event + add_political_power is warned about", /add_political_power/.test(warn(r)), warn(r));
    rec("…and the save still SUCCEEDS (warn, never block)", r.s === 200 && r.b.ok !== false, r.b || r.s);

    r = await save("unit_leader_event", "gain_xp = 10");
    rec("unit_leader_event + gain_xp is warned about", /gain_xp/.test(warn(r)), warn(r));
    rec("…and the message says what to do", /wrap it/i.test(warn(r)), warn(r));

    r = await save("unit_leader_event", "set_unit_leader_flag = probe_flag");
    rec("unit_leader_event + set_unit_leader_flag is warned about", /set_unit_leader_flag/.test(warn(r)), warn(r));

    console.log("\n[the limit that makes it trustworthy] a WRAPPED effect must not be flagged");
    // This is where the intuitive fix breaks: gain_xp inside every_unit_leader is the CORRECT authoring,
    // and the spec cannot tell us the wrapper changes scope, so anything below depth 0 must be left alone.
    r = await save("unit_leader_event", "every_unit_leader = {\n\tgain_xp = 10\n}");
    rec("gain_xp inside every_unit_leader is NOT warned about", !/gain_xp/.test(warn(r)), warn(r));
    r = await save("unit_leader_event", "random_army_leader = {\n\tlimit = { has_trait = x }\n\tset_unit_leader_flag = f\n}");
    rec("set_unit_leader_flag inside random_army_leader is NOT warned about", !/set_unit_leader_flag/.test(warn(r)), warn(r));

    console.log("\n[fail OPEN] anything the spec cannot judge is left alone");
    r = await save("country_event", "some_effect_nova_has_never_heard_of = yes");
    rec("an unknown effect is not warned about", !/scope/i.test(warn(r)), warn(r));
    r = await save("state_event", "add_political_power = 5");
    // state_event root is state; add_political_power is country — a real mismatch, so this one SHOULD warn.
    rec("a state_event + country effect IS warned about", /add_political_power/.test(warn(r)), warn(r));

    console.log("\n[immediate and after are checked too, not just options]");
    r = await save("unit_leader_event", "", { immediate: "gain_xp = 5" });
    rec("an Immediate block is checked", /gain_xp/.test(warn(r)), warn(r));
    rec("…and named in the message", /Immediate/i.test(warn(r)), warn(r));

    console.log(`\n=== event effect scope: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
