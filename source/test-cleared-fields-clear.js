// #cleared-box-does-not-clear — the general form of the spirit bug, pinned across every maker.
//
// Nearly every check in this suite asks whether Nova KEEPS what you did not touch. This asks the inverse:
// whether emptying a field actually removes it. That is the classic failure of preserve-merge designs, where
// the machinery protecting un-modelled fields also refuses to delete a modelled one — and it is invisible,
// because the editor shows the box empty either way.
//
// Spirits had it (fixed separately, see test-spirit-cleared-box-clears.js). These seventeen fields across
// decisions, events and characters were all correct when swept, and this locks that in: the spirit case
// proves the behaviour can regress silently, and nothing else asserts it.
//
// ✅ THE LIMITATION THIS USED TO RECORD IS FIXED (2026-09-06). It read: "an equipment stat cannot be removed
// by any payload … Removing a stat needs an explicit control, which is a feature rather than a fix." The
// diagnosis was right and the control now exists — `clearStats` on the save payload, driven by a stat box
// that was RENDERED with a value and left empty.
//
// Half of the old note still stands and is still the reason the control is explicit: a blank field is
// omitted and the server overlays, so blank means "unchanged" (#full-stat-editor), because the specialized
// gear views hide inputs and must not wipe stats they never showed. That rule is unchanged; the client
// simply cannot name a key whose input it never rendered.
//
// What made it worth fixing rather than documenting: every one of those failed removals answered ok:true,
// so the editor said "✓ Saved" for a change it had not made — and in game an ABSENT stat inherits the
// archetype's value while an explicit 0 forces zero, so typing 0 (the only thing a stuck user could do)
// writes something that means something else.
//
// Both directions live in test-an-equipment-stat-can-be-taken-back-out.js.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-clearfields-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const MOD = path.join(ROOT, "clearmod");
for (const d of [["common", "decisions"], ["common", "characters"], ["events"], ["localisation", "english"]]) {
  fs.mkdirSync(path.join(MOD, ...d), { recursive: true });
}
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="ClearMod"\nsupported_version="1.18.*"\n', "utf8");
fs.writeFileSync(path.join(MOD, "localisation", "english", "nova_l_english.yml"), "﻿l_english:\n", "utf8");

const DEC_ABS = path.join(MOD, "common", "decisions", "nua_cat.txt");
const EV_ABS = path.join(MOD, "events", "nua_ns.txt");
const CH_ABS = path.join(MOD, "common", "characters", "nua_ch.txt");

const decBase = {
  modPath: MOD, categoryId: "nua_cat", id: "nua_dec", fileName: "nua_cat.txt", name: "Dec",
  cost: 0, icon: "GFX_decision_generic_decision", days: 30, fireOnce: "no",
  available: "always = yes", modifier: "", effect: "add_political_power = 10",
  decisionType: "normal", scope: "country", cooldown: 0, targetTrigger: "",
  removeEffect: "", activation: "", isGood: "no", cancelTrigger: "",
  visible: "", allowed: "", aiWillDo: "", priority: 250, cancelIfNotVisible: "yes",
  customCostText: "", customCostTrigger: "",
};
const evBase = {
  modPath: MOD, namespace: "nua_ns", id: 1, type: "country_event",
  picture: "GFX_report_event_generic_factory", triggeredOnly: "yes", hidden: "no",
  fireOnce: "no", major: "no", mtthDays: "", trigger: "", immediate: "", after: "", timeoutDays: "",
  title: "T", description: "d",
  options: [{ name: "nua_ns.1.a", title: "OK", script: "", aiChance: "", trigger: "" }],
};
const chBase = {
  modPath: MOD, token: "NUA_ch", name: "Ch", file: "nua_ch.txt",
  roleLeader: true, leaderIdeology: "conservatism", leaderExpire: "", leaderTraits: "",
  roleAdvisor: true, advisorSlot: "political_advisor", advisorIdeaToken: "NUA_ch",
  advisorTraits: "", advisorLedger: "", advisorCost: "", roleGeneral: false,
};

const CASES = [
  ["decision  visible", "/api/decisions/save", decBase, "visible", "has_war = yes", /\bvisible\s*=\s*\{/, DEC_ABS],
  ["decision  allowed", "/api/decisions/save", decBase, "allowed", "always = yes", /\ballowed\s*=\s*\{/, DEC_ABS],
  ["decision  ai_will_do", "/api/decisions/save", decBase, "aiWillDo", "factor = 2", /ai_will_do\s*=\s*\{/, DEC_ABS],
  ["decision  modifier", "/api/decisions/save", decBase, "modifier", "political_power_gain = 1", /(^|\n)\s*modifier\s*=\s*\{/, DEC_ABS],
  ["decision  remove_effect", "/api/decisions/save", decBase, "removeEffect", "add_stability = 0.1", /remove_effect\s*=\s*\{/, DEC_ABS],
  ["decision  target_trigger", "/api/decisions/save", decBase, "targetTrigger", "is_core_of = ROOT", /target_trigger\s*=\s*\{/, DEC_ABS],
  ["decision  custom_cost_trigger", "/api/decisions/save", decBase, "customCostTrigger", "command_power > 10", /custom_cost_trigger\s*=\s*\{/, DEC_ABS],
  ["decision  days_remove", "/api/decisions/save", decBase, "days", 45, /days_remove\s*=/, DEC_ABS],
  ["decision  days_re_enable", "/api/decisions/save", decBase, "cooldown", 12, /days_re_enable\s*=/, DEC_ABS],

  ["event     trigger", "/api/events/save", evBase, "trigger", "has_war = yes", /(^|\n)\s*trigger\s*=\s*\{/, EV_ABS],
  ["event     immediate", "/api/events/save", evBase, "immediate", "set_country_flag = f", /immediate\s*=\s*\{/, EV_ABS],
  ["event     after", "/api/events/save", evBase, "after", "add_political_power = 5", /(^|\n)\s*after\s*=\s*\{/, EV_ABS],
  ["event     timeout_days", "/api/events/save", evBase, "timeoutDays", 20, /timeout_days\s*=/, EV_ABS],
  ["event     mean_time_to_happen", "/api/events/save", evBase, "mtthDays", 15, /mean_time_to_happen\s*=\s*\{/, EV_ABS],

  ["character leader traits", "/api/characters/save", chBase, "leaderTraits", "nationalist", /nationalist/, CH_ABS],
  ["character advisor traits", "/api/characters/save", chBase, "advisorTraits", "war_industrialist", /war_industrialist/, CH_ABS],
  ["character leader expire", "/api/characters/save", chBase, "leaderExpire", "1965.1.1", /1965\.1\.1/, CH_ABS],
];

const PORT = 42397;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (r, b) => {
    const res = await fetch(`http://127.0.0.1:${PORT}${r}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const wipe = () => { for (const f of [DEC_ABS, EV_ABS, CH_ABS]) { try { fs.rmSync(f, { force: true }); } catch (_) {} } };

  try {
    console.log("\nfill the field, save, clear it, save — is it gone?\n");
    for (const [label, route, base, field, filled, re, abs] of CASES) {
      wipe();
      const set = await post(route, Object.assign({}, base, { [field]: filled }));
      // Assert the FILL landed first. Without this a field that never reaches disk would "clear" trivially —
      // the vacuous-pass shape that has bitten this suite repeatedly.
      const landed = fs.existsSync(abs) && re.test(fs.readFileSync(abs, "utf8"));
      rec(`${label} — the value reaches disk`, landed, set.body || set.status);
      if (!landed) continue;

      const cleared = await post(route, Object.assign({}, base, { [field]: "" }));
      rec(`${label} — clearing removes it`,
        !re.test(fs.readFileSync(abs, "utf8")),
        cleared.body && cleared.body.error ? cleared.body.error : fs.readFileSync(abs, "utf8").slice(0, 200));
    }

    console.log(`\n=== cleared fields: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
