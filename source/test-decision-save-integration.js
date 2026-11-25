// Live integration: boot the real /api/decisions/save endpoint, save a CHANGE to an existing rich
// decision, and assert the on-disk file survives a re-save. TWO kinds of survival now:
//   • MODELED fields the maker's "⚙️ Advanced" section owns (priority, custom_cost_text/trigger, and —
//     for state scope — on_map_mode/highlight_states): the client loads them and re-sends them, so they
//     round-trip through the managed serializer (emitted exactly once, no dup).
//   • Still-un-modeled fields (explicit name=, picture=, selectable_mission, non-mission cancel_trigger,
//     and — for this COUNTRY-scoped decision — on_map_mode/highlight_states, which are only managed for
//     state scope): carried forward verbatim by extractPreservedDecisionBody.
// This mirrors the real client, which repopulates every modeled field on load and sends them all back.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dec-int-"));
const decDir = path.join(mod, "common", "decisions");
fs.mkdirSync(decDir, { recursive: true });
const decPath = path.join(decDir, "political_decisions.txt");
const original = `political_decisions = {

	my_decision = {
		icon = GFX_decision_generic
		priority = 100
		name = my_decision_custom_name
		picture = GFX_decision_cat_picture

		allowed = { original_tag = GER }
		highlight_states = { state = 64 }
		on_map_mode = map_only
		custom_cost_trigger = { command_power > 25 }
		custom_cost_text = my_cost_text
		cancel_trigger = { has_war = no }

		visible = { has_country_flag = x }
		available = { has_war = yes }

		complete_effect = {
			add_political_power = 100
		}
		ai_will_do = { factor = 1 }
	}
}
`;
fs.writeFileSync(decPath, original, "utf8");

const app = createApp();
const server = http.createServer(app);
function post(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request({ host: "127.0.0.1", port: server.address().port, path: pathname, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": data.length } }, (res) => {
      let out = ""; res.on("data", c => out += c); res.on("end", () => resolve({ status: res.statusCode, body: out }));
    });
    req.on("error", reject); req.write(data); req.end();
  });
}

server.listen(0, "127.0.0.1", async () => {
  try {
    // Modder edits the cost + complete_effect of an existing non-mission decision and saves.
    const resp = await post("/api/decisions/save", {
      modPath: mod, categoryId: "political_decisions", id: "my_decision", name: "My Decision",
      cost: 75, icon: "GFX_decision_generic", days: 0, fireOnce: "no",
      available: "has_war = yes", modifier: "", effect: "add_political_power = 200",
      decisionType: "standard", scope: "country", cooldown: 0, targetTrigger: "",
      // cancel_trigger is valid on an ORDINARY decision — 481 of vanilla's 603 users are not missions — so it
      // now has its own field in the Advanced panel and the page sends the loaded value back, exactly like
      // every other advanced field. It used to be readable only in mission mode, which meant a non-mission
      // could never gain or lose one; it rode the preserve path instead.
      removeEffect: "", activation: "", isGood: "no", cancelTrigger: "has_war = no",
      visible: "has_country_flag = x", allowed: "original_tag = GER", aiWillDo: "factor = 1",
      // ⚙️ Advanced fields the real client loads from disk and re-sends. on_map_mode and highlight_states
      // used to be sent ONLY for state scope, which was wrong: 812 vanilla and 450 MD decisions use
      // highlight_states while only 25 and 1 of those are state-targeted, so gating them hid a legal and
      // common field — an authored block could be neither seen nor cleared. The client now always sends
      // them, so a blank value here would mean "the user cleared the box".
      priority: 100, cancelIfNotVisible: "", customCostText: "my_cost_text",
      customCostTrigger: "command_power > 25", targetedModifier: "", removeTrigger: "",
      onMapMode: "map_only", highlightStates: "state = 64",
    });
    check("save returned 200", resp.status === 200, resp.status + " " + resp.body);

    const after = fs.readFileSync(decPath, "utf8");
    const balanced = (() => { let d = 0; for (const c of after) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; })();
    check("file still brace-balanced after save", balanced, after);
    // Regression: editing the FIRST decision must not collapse the category opener and the decision
    // onto one line (`political_decisions = {\tmy_decision = {`). The replace path consumed the
    // leading newline; it's now restored. Assert the opener line has no decision id on it.
    check("category opener + first decision stay on separate lines",
      !/political_decisions\s*=\s*\{[^\n]*\bmy_decision\s*=\s*\{/.test(after),
      after.split("\n").slice(0, 3).join("  ¶  "));
    check("the edit landed (cost now 75)", /cost\s*=\s*75/.test(after));
    check("the edit landed (effect now 200)", /add_political_power\s*=\s*200/.test(after));
    check("priority survived re-save", /priority\s*=\s*100/.test(after), after);
    check("explicit name survived", /name\s*=\s*my_decision_custom_name/.test(after));
    check("picture survived", /picture\s*=\s*GFX_decision_cat_picture/.test(after));
    check("highlight_states survived", /highlight_states\s*=\s*\{/.test(after) && /state\s*=\s*64/.test(after));
    check("on_map_mode survived", /on_map_mode\s*=\s*map_only/.test(after));
    check("custom_cost_trigger survived", /custom_cost_trigger\s*=\s*\{/.test(after) && /command_power/.test(after));
    check("custom_cost_text survived", /custom_cost_text\s*=\s*my_cost_text/.test(after));
    check("non-mission cancel_trigger survived", /cancel_trigger\s*=\s*\{/.test(after) && /has_war\s*=\s*no/.test(after), after);
    check("…and is declared exactly once", (after.match(/cancel_trigger\s*=/g) || []).length === 1, after);
    check("still exactly one my_decision block", (after.match(/my_decision\s*=\s*\{/g) || []).length === 1, (after.match(/my_decision\s*=\s*\{/g) || []).length);
    check("no duplicated priority/name (preserved once)", (after.match(/\bpriority\s*=/g) || []).length === 1 && (after.match(/\bname\s*=\s*my_decision_custom_name/g) || []).length === 1);
  } catch (e) {
    fail++; console.log("  FAIL harness threw →", e && e.message);
  } finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nDECISION-SAVE-INTEGRATION: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
