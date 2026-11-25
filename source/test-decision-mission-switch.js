// #decision-mission-switch-timeout — SWITCHING A MISSION TO AN ORDINARY DECISION NEVER STUCK.
//
// The visible symptom was a duplicate: the saved block carried `timeout_effect` twice, and another copy was
// added on every subsequent save (2, 3, 4, …). Two rules in the same handler contradicted each other — the
// non-mission branch un-managed `timeout_effect` so the preserve tail handed the on-disk copy back, while
// removeEffectKey ALSO picked `timeout_effect` as the key to emit the Remove-effect field under.
//
// The deeper failure is that the type switch could not complete at all. parseDecisionsFromFile treats any
// `timeout_effect` block as a mission marker, so the decision re-listed as a mission with days "0", and the
// next save overwrote the surviving `days_remove` with 0. And when the mission carried BOTH remove_effect
// and timeout_effect, the switch deleted the remove_effect body outright — remove_effect stayed managed so
// the preserve tail dropped it, while removeEffectKey emitted timeout_effect instead. That is exactly the
// loss the guard a few lines below was written to prevent; it is a no-op in this direction because the
// non-mission branch had already un-managed the same key.
//
// An ordinary decision has no timeout to fire on, so the authored `timeout_effect` MIGRATES to
// `remove_effect` rather than being kept or dropped.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-msw-"));
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

const MOD = path.join(ROOT, "mswmod");
fs.mkdirSync(path.join(MOD, "common", "decisions", "categories"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Msw"\nsupported_version="1.19.*"\n', "utf8");
fs.writeFileSync(path.join(MOD, "common", "decisions", "categories", "c.txt"),
  "nova_msw_cat = {\n\ticon = GFX_decision_category_generic_political_actions\n}\n", "utf8");
const DEC = path.join(MOD, "common", "decisions", "nova_msw.txt");
const asMission = `nova_msw_cat = {
\tnova_msw_dec = {
\t\ticon = GFX_decision_generic_decision
\t\tactivation = {
\t\t\talways = no
\t\t}
\t\tis_good = yes
\t\tdays_mission_timeout = 30
\t\tcost = 10
\t\tdays_remove = 90
\t\tfire_only_once = no
\t\tavailable = {
\t\t\talways = yes
\t\t}
\t\tcomplete_effect = {
\t\t\tadd_political_power = 1
\t\t}
\t\ttimeout_effect = {
\t\t\tadd_stability = -0.05
\t\t}
\t}
}
`;
fs.writeFileSync(DEC, asMission, "utf8");

const block = () => {
  const t = fs.readFileSync(DEC, "utf8");
  const i = t.indexOf("nova_msw_dec");
  if (i < 0) return "";
  const o = t.indexOf("{", i);
  let d = 0;
  for (let j = o; j < t.length; j++) {
    if (t[j] === "{") d++;
    else if (t[j] === "}") { d--; if (!d) return t.slice(o + 1, j); }
  }
  return "";
};
const countKey = (k) => (block().match(new RegExp(`(^|\\n)[ \\t]*${k}\\s*=\\s*\\{`, "g")) || []).length;

const PORT = 43041;
const app = createApp();
const srv = app.listen(PORT, async () => {
  const save = (body) => fetch(`http://127.0.0.1:${PORT}/api/decisions/save`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ modPath: MOD }, body)),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const list = () => fetch(`http://127.0.0.1:${PORT}/api/decisions/list?modPath=${encodeURIComponent(MOD)}`)
    .then((r) => r.json()).catch(() => ({}));

  try {
    console.log("\n[control] it starts life as a mission");
    let l = await list();
    let found = ((l && l.categories) || []).flatMap((c) => c.decisions || []).find((d) => d.id === "nova_msw_dec");
    rec("the decision is listed", !!found, l && Object.keys(l));
    rec("…as a mission", found && found.decisionType === "mission", found && found.decisionType);

    console.log("\n[the switch] save it as an ordinary decision");
    const asDecision = {
      categoryId: "nova_msw_cat", id: "nova_msw_dec", fileName: "nova_msw.txt",
      decisionType: "decision",
      icon: "GFX_decision_generic_decision", cost: "10", days: "90", fireOnce: "no",
      available: "always = yes",
      effect: "add_political_power = 1",
      removeEffect: "add_stability = -0.05",
    };
    let r = await save(asDecision);
    rec("the switch succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("timeout_effect appears exactly zero times", countKey("timeout_effect") === 0, block());
    rec("…and the effect moved to remove_effect", countKey("remove_effect") === 1, block());
    rec("…carrying the author's body", /remove_effect\s*=\s*\{[\s\S]*?add_stability\s*=\s*-0\.05/.test(block()), block());
    rec("…and days_remove survived", /days_remove\s*=\s*90\b/.test(block()), block());

    console.log("\n[it must STICK] the decision must not re-list as a mission");
    l = await list();
    found = ((l && l.categories) || []).flatMap((c) => c.decisions || []).find((d) => d.id === "nova_msw_dec");
    rec("it is still listed", !!found, l && Object.keys(l));
    rec("…and is NOT a mission any more", found && found.decisionType !== "mission", found && found.decisionType);

    console.log("\n[idempotent] saving again must not stack another copy or zero the days");
    r = await save(asDecision);
    rec("the second save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…still zero timeout_effect", countKey("timeout_effect") === 0, block());
    rec("…still exactly one remove_effect", countKey("remove_effect") === 1, block());
    rec("…and days_remove was not overwritten with 0", /days_remove\s*=\s*90\b/.test(block()), block());

    console.log("\n[the other direction still works] a real mission keeps its timeout_effect");
    fs.writeFileSync(DEC, asMission, "utf8");
    r = await save({
      categoryId: "nova_msw_cat", id: "nova_msw_dec", fileName: "nova_msw.txt",
      decisionType: "mission",
      icon: "GFX_decision_generic_decision", cost: "10", days: "30", fireOnce: "no",
      available: "always = yes",
      effect: "add_political_power = 1",
      removeEffect: "add_stability = -0.05",
    });
    rec("the mission save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and it kept timeout_effect", countKey("timeout_effect") === 1, block());
    rec("…exactly once", countKey("timeout_effect") === 1 && countKey("remove_effect") === 0, block());

    console.log("\n[safety]");
    const whole = fs.readFileSync(DEC, "utf8");
    let d = 0, ok = true;
    for (const ch of whole) { if (ch === "{") d++; else if (ch === "}") { d--; if (d < 0) ok = false; } }
    rec("the decisions file is brace-balanced", ok && d === 0, d);

    console.log(`\n=== decision mission switch: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
srv.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
