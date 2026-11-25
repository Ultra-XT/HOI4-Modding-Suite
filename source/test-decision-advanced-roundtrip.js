// End-to-end for the Decision Maker's "⚙️ Advanced options" fields (priority, custom_cost_text/trigger,
// targeted_modifier, remove_trigger, cancel_if_not_visible, and — for state scope — on_map_mode +
// highlight_states). Proves the FULL authoring path: a fresh save writes each field; the parser
// (/api/decisions/list) reads them back so editing repopulates the form; and re-saving with a field
// CLEARED removes it from the file exactly once (no orphan, no duplicate). This is the round-trip
// contract for the newly-modeled fields.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
const balanced = (s) => { let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };
const count = (s, re) => (s.match(re) || []).length;

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dec-adv-"));
fs.mkdirSync(path.join(mod, "common", "decisions"), { recursive: true });
const decPath = path.join(mod, "common", "decisions", "custom_decisions.txt");

const app = createApp();
const server = http.createServer(app);
function req(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const r = http.request({ host: "127.0.0.1", port: server.address().port, path: pathname, method,
      headers: data ? { "Content-Type": "application/json", "Content-Length": data.length } : {} }, (res) => {
      let out = ""; res.on("data", c => out += c); res.on("end", () => resolve({ status: res.statusCode, body: out }));
    });
    r.on("error", reject); if (data) r.write(data); r.end();
  });
}
const post = (p, b) => req("POST", p, b);
const getJson = async (p) => JSON.parse((await req("GET", p)).body);

server.listen(0, "127.0.0.1", async () => {
  try {
    // ── 1. Save a NEW state-scoped decision with every advanced field set. ──
    const save1 = await post("/api/decisions/save", {
      modPath: mod, categoryId: "custom_decisions", id: "adv_decision", name: "Advanced Decision",
      cost: 0, icon: "GFX_decision_generic", days: 30, fireOnce: "no",
      available: "always = yes", modifier: "", effect: "add_political_power = 10",
      decisionType: "normal", scope: "state", cooldown: 0, targetTrigger: "is_core_of = ROOT",
      removeEffect: "", activation: "", isGood: "no", cancelTrigger: "",
      visible: "", allowed: "", aiWillDo: "",
      priority: 250, cancelIfNotVisible: "yes", customCostText: "adv_cost_key",
      customCostTrigger: "command_power > 10",
      targetedModifier: "tag = FROM\nattack_bonus_against = 0.15",
      removeTrigger: "has_war = no",
      onMapMode: "map_and_decisions_view",
      highlightStates: "highlight_state_targets = { state = 1 }\nhighlight_color_while_active = 3",
    });
    check("save #1 returned 200", save1.status === 200, save1.status + " " + save1.body);

    let disk = fs.readFileSync(decPath, "utf8");
    check("file brace-balanced after create", balanced(disk), disk);
    check("emits priority = 250", /\bpriority\s*=\s*250\b/.test(disk), disk);
    check("emits cancel_if_not_visible = yes", /\bcancel_if_not_visible\s*=\s*yes\b/.test(disk));
    check("emits custom_cost_text (bare key)", /\bcustom_cost_text\s*=\s*adv_cost_key\b/.test(disk));
    check("emits custom_cost_trigger block", /custom_cost_trigger\s*=\s*\{[^}]*command_power/.test(disk));
    check("emits targeted_modifier block w/ target + modifier", /targeted_modifier\s*=\s*\{[\s\S]*tag\s*=\s*FROM[\s\S]*attack_bonus_against/.test(disk));
    check("emits remove_trigger block", /remove_trigger\s*=\s*\{[^}]*has_war\s*=\s*no/.test(disk));
    check("emits on_map_mode (state scope)", /\bon_map_mode\s*=\s*map_and_decisions_view\b/.test(disk));
    check("emits highlight_states block (state scope)", /highlight_states\s*=\s*\{[\s\S]*highlight_state_targets/.test(disk));
    // `targets = states` was invented syntax — zero occurrences across the whole vanilla install and all of
    // Millennium Dawn. The wiki: "If the decision has state_target = yes then, instead, it'll be targeted
    // towards a state", and `targets` is a BLOCK of state ids. This assertion used to encode the bug, so a
    // state-scoped decision made here was never actually state-targeted in game. (#state-decision-keys)
    check("emits state_target (state scope)", /\bstate_target\s*=\s*yes\b/.test(disk), disk);
    check("does NOT emit the invented targets = states", !/\btargets\s*=\s*states\b/.test(disk), disk);
    check("exactly one adv_decision block", count(disk, /\badv_decision\s*=\s*\{/g) === 1, count(disk, /\badv_decision\s*=\s*\{/g));

    // ── 2. Parser reads every advanced field back (so the form repopulates on edit). ──
    const list = await getJson(`/api/decisions/list?modPath=${encodeURIComponent(mod)}`);
    const dec = (list.categories || []).flatMap(c => c.decisions || []).find(d => d.id === "adv_decision");
    check("parser found the decision", !!dec, JSON.stringify(list).slice(0, 200));
    if (dec) {
      check("parsed priority", dec.priority === "250", dec.priority);
      check("parsed cancelIfNotVisible", dec.cancelIfNotVisible === "yes", dec.cancelIfNotVisible);
      check("parsed customCostText", dec.customCostText === "adv_cost_key", dec.customCostText);
      check("parsed customCostTrigger body", /command_power/.test(dec.customCostTrigger || ""), dec.customCostTrigger);
      check("parsed targetedModifier body", /attack_bonus_against/.test(dec.targetedModifier || "") && /tag\s*=\s*FROM/.test(dec.targetedModifier || ""), dec.targetedModifier);
      check("parsed removeTrigger body", /has_war/.test(dec.removeTrigger || ""), dec.removeTrigger);
      check("parsed onMapMode", dec.onMapMode === "map_and_decisions_view", dec.onMapMode);
      check("parsed highlightStates body", /highlight_state_targets/.test(dec.highlightStates || ""), dec.highlightStates);
      check("parsed scope=state", dec.scope === "state", dec.scope);
      // plain `modifier` must NOT capture targeted_modifier's inner (\\b boundary guard)
      check("plain modifier not polluted by targeted_modifier", !dec.modifier || !/attack_bonus_against/.test(dec.modifier), dec.modifier);
    }

    // ── 3. Edit: clear priority + targeted_modifier (send ""); they must vanish, nothing duplicates. ──
    const save2 = await post("/api/decisions/save", {
      modPath: mod, categoryId: "custom_decisions", id: "adv_decision", name: "Advanced Decision",
      cost: 0, icon: "GFX_decision_generic", days: 30, fireOnce: "no",
      available: "always = yes", modifier: "", effect: "add_political_power = 10",
      decisionType: "normal", scope: "state", cooldown: 0, targetTrigger: "is_core_of = ROOT",
      removeEffect: "", activation: "", isGood: "no", cancelTrigger: "",
      visible: "", allowed: "", aiWillDo: "",
      priority: "", cancelIfNotVisible: "yes", customCostText: "adv_cost_key",
      customCostTrigger: "command_power > 10",
      targetedModifier: "", // cleared
      removeTrigger: "has_war = no",
      onMapMode: "map_and_decisions_view",
      highlightStates: "highlight_state_targets = { state = 1 }",
    });
    check("save #2 (edit) returned 200", save2.status === 200, save2.status + " " + save2.body);
    disk = fs.readFileSync(decPath, "utf8");
    check("file brace-balanced after edit", balanced(disk), disk);
    check("cleared priority is GONE", !/\bpriority\s*=/.test(disk), disk);
    check("cleared targeted_modifier is GONE", !/\btargeted_modifier\s*=/.test(disk), disk);
    check("kept custom_cost_text still present exactly once", count(disk, /\bcustom_cost_text\s*=/g) === 1, count(disk, /\bcustom_cost_text\s*=/g));
    check("kept on_map_mode still present exactly once", count(disk, /\bon_map_mode\s*=/g) === 1, count(disk, /\bon_map_mode\s*=/g));
    check("still exactly one adv_decision block after edit", count(disk, /\badv_decision\s*=\s*\{/g) === 1);
  } catch (e) {
    fail++; console.log("  FAIL harness threw →", e && e.stack || e);
  } finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nDECISION-ADVANCED-ROUNDTRIP: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
