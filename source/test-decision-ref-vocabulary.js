// #decision-rename-vocabulary — RENAMING A DECISION FOLLOWED THE RAREST OF THE EIGHT WAYS IT IS NAMED.
//
// The rename walked `activate_decision` and nothing else. Counted over the directories the walker visits,
// vanilla writes activate_decision 48 times against unlock_decision_tooltip 690, activate_mission 588,
// activate_targeted_decision 190 and has_decision 107; Millennium Dawn writes has_decision 2,030 times
// against 54 activate_decision. So a rename followed roughly 3% of vanilla's references and 2% of MD's.
//
// HOI4 reports none of the rest. An unknown id in unlock_decision_tooltip draws a tooltip line for a
// decision that does not exist; a `has_decision` naming a dead id is not an error but permanently FALSE, so
// whatever gate it guarded silently inverts — the decision that was supposed to be blocked becomes available,
// or the one that needed it never appears.
//
// A MISSION is a decision with a timeout — same id space, same file — so the mission effects are in.
// `unlock_decision_category_tooltip` deliberately is NOT: its value is a CATEGORY id, and rewriting it on a
// decision rename would corrupt an unrelated reference. That exclusion is asserted below, because a
// vocabulary list is only as good as what it leaves out.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-decref-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const MOD = path.join(ROOT, "decref");
for (const p of [["common", "decisions"], ["common", "decisions", "categories"], ["events"],
  ["common", "national_focus"], ["history", "countries"], ["localisation", "english"]]) {
  fs.mkdirSync(path.join(MOD, ...p), { recursive: true });
}
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="DecRef"\nsupported_version="1.19.*"\n', "utf8");

const DEC = path.join(MOD, "common", "decisions", "nova_decisions.txt");
fs.writeFileSync(DEC, [
  "nv_cat = {",
  "\tnv_old_dec = {",
  "\t\tcost = 25",
  "\t\tavailable = { has_war = no }",
  "\t\tcomplete_effect = { add_political_power = 10 }",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");
const CAT = path.join(MOD, "common", "decisions", "categories", "nova_categories.txt");
fs.writeFileSync(CAT, "nv_cat = {\n\ticon = generic_political_actions\n}\n", "utf8");

// Every shape, spread across the sites.
const FOCUS = path.join(MOD, "common", "national_focus", "nova_focus.txt");
fs.writeFileSync(FOCUS, [
  "focus_tree = {",
  "\tid = nova_tree",
  "\tfocus = {",
  "\t\tid = nv_focus",
  "\t\tavailable = { has_decision = nv_old_dec }",
  "\t\tcompletion_reward = {",
  "\t\t\tactivate_decision = nv_old_dec",
  "\t\t\tunlock_decision_tooltip = nv_old_dec",
  "\t\t\tactivate_mission = nv_old_dec",
  "\t\t\tactivate_mission_tooltip = nv_old_dec",
  "\t\t\tremove_decision = nv_old_dec",
  "\t\t\tactivate_targeted_decision = { target = FRA decision = nv_old_dec }",
  "\t\t\tremove_targeted_decision = { target = event_target:their_country decision = nv_old_dec }",
  // A CATEGORY tooltip that happens to name the category, not the decision — must not be rewritten.
  "\t\t\tunlock_decision_category_tooltip = nv_cat",
  "\t\t\t# unlock_decision_tooltip = nv_old_dec   <- a comment, left alone",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");
const EV = path.join(MOD, "events", "nova_events.txt");
fs.writeFileSync(EV, [
  "add_namespace = nvd",
  "country_event = {",
  "\tid = nvd.1",
  "\ttitle = nvd.1.t",
  "\tdesc = nvd.1.d",
  "\toption = { name = nvd.1.a activate_decision = nv_old_dec }",
  "\toption = { name = nvd.1.b trigger = { has_decision = nv_old_dec } }",
  "}",
  "",
].join("\n"), "utf8");
// A decoy whose id merely CONTAINS the old one.
const HIST = path.join(MOD, "history", "countries", "MZA - Mozambique.txt");
fs.writeFileSync(HIST, "capital = 1\nactivate_decision = nv_old_dec_extra\nhas_decision = nv_old_dec\n", "utf8");

const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch (_) { return ""; } };

const PORT = 43337;
const app = createApp();
const srv = app.listen(PORT, async () => {
  try {
    console.log("\n[ground truth] activate_decision is the RAREST of the decision vocabulary");
    const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const SITES = [["common", "decisions"], ["events"], ["common", "national_focus"], ["history", "countries"], ["common", "on_actions"]];
    const tally = {};
    for (const rel of SITES) {
      const dir = path.join(V, ...rel);
      let files = [];
      try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
      for (const f of files) {
        const t = read(path.join(dir, f));
        for (const k of ["activate_decision", "unlock_decision_tooltip", "activate_mission", "has_decision", "activate_targeted_decision"]) {
          const n = (t.match(new RegExp(`\\b${k}\\s*=`, "g")) || []).length;
          if (n) tally[k] = (tally[k] || 0) + n;
        }
      }
    }
    rec("vanilla was measurable", Object.keys(tally).length >= 4, tally);
    rec("…and unlock_decision_tooltip alone dwarfs activate_decision",
      (tally.unlock_decision_tooltip || 0) > (tally.activate_decision || 0) * 5, tally);
    const others = (tally.unlock_decision_tooltip || 0) + (tally.activate_mission || 0)
      + (tally.has_decision || 0) + (tally.activate_targeted_decision || 0);
    rec("…so following only activate_decision leaves ~97% of references dead",
      others > (tally.activate_decision || 0) * 20, { activate_decision: tally.activate_decision, others });

    console.log("\n[the bug] a rename must carry every shape that names the decision");
    const r = await fetch(`http://127.0.0.1:${PORT}/api/decisions/save`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modPath: MOD, isMod: true, fileName: "nova_decisions.txt",
        categoryId: "nv_cat", previousCategoryId: "nv_cat",
        id: "nv_new_dec", previousId: "nv_old_dec",
        name: "New Decision", cost: 25, available: "has_war = no",
        completeEffect: "add_political_power = 10",
      }),
    }).then(async (x) => ({ s: x.status, b: await x.json().catch(() => ({})) }));
    rec("the rename succeeded", r.s === 200 && !r.b.error, r.b || r.s);

    const focus = read(FOCUS);
    for (const kw of ["activate_decision", "unlock_decision_tooltip", "activate_mission",
      "activate_mission_tooltip", "remove_decision", "has_decision"]) {
      rec(`${kw} followed the rename`, new RegExp(`${kw}\\s*=\\s*nv_new_dec`).test(focus), focus);
    }
    rec("activate_targeted_decision's decision= followed the rename",
      /activate_targeted_decision\s*=\s*\{[^}]*decision\s*=\s*nv_new_dec/.test(focus), focus);
    rec("remove_targeted_decision's decision= followed the rename",
      /remove_targeted_decision\s*=\s*\{[^}]*decision\s*=\s*nv_new_dec/.test(focus), focus);
    rec("…and its target= was untouched",
      /remove_targeted_decision\s*=\s*\{\s*target\s*=\s*event_target:their_country/.test(focus), focus);

    console.log("\n[exclusion] a CATEGORY tooltip names a category, not a decision");
    rec("unlock_decision_category_tooltip still names the category",
      /unlock_decision_category_tooltip\s*=\s*nv_cat\b/.test(focus), focus);

    console.log("\n[safety] comments and near-miss ids are left alone");
    rec("the commented-out reward is untouched", /#\s*unlock_decision_tooltip = nv_old_dec/.test(focus), focus);
    const hist = read(HIST);
    rec("nv_old_dec_extra survived intact", /nv_old_dec_extra/.test(hist), hist);
    rec("…while the history has_decision followed the rename", /has_decision\s*=\s*nv_new_dec/.test(hist), hist);

    console.log("\n[sites] an event option and its trigger were reached too");
    const ev = read(EV);
    rec("the event option's activate_decision followed", /activate_decision\s*=\s*nv_new_dec/.test(ev), ev);
    rec("…and the option trigger's has_decision followed", /has_decision\s*=\s*nv_new_dec/.test(ev), ev);
    rec("nothing outside a comment still names the dead id",
      !/(^|\n)[^\n#]*\bnv_old_dec\b(?!_extra)/.test(focus + "\n" + ev), { focus, ev });

    console.log(`\n=== decision reference vocabulary: ${checks} checks, ${fails.length} failed ===`);
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
