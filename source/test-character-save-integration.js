// Live integration: boot the real /api/characters/save endpoint, edit an existing rich character
// (change advisor cost + traits), and assert the on-disk file still has every un-modeled field
// (advisor allowed/available/on_add/research_bonus/ai_will_do, country_leader id/desc, top-level gfx).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-char-int-"));
const charDir = path.join(mod, "common", "characters");
fs.mkdirSync(charDir, { recursive: true });
const charPath = path.join(charDir, "custom_characters.txt");
const original = `characters = {
	GER_rich_advisor = {
		name = GER_rich_advisor
		gfx = some_gfx_culture
		country_leader = {
			ideology = conservatism
			id = 42
			desc = "LEADER_DESC_KEY"
			traits = { nationalist }
		}
		advisor = {
			slot = political_advisor
			idea_token = GER_rich_advisor
			cost = 100
			allowed = { original_tag = GER }
			available = { has_war = no }
			on_add = { country_event = some.1 }
			research_bonus = { electronics = 0.1 }
			ai_will_do = { factor = 1 }
			traits = { ideological_crusader }
		}
	}
}
`;
fs.writeFileSync(charPath, original, "utf8");

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
    // The modder edits the advisor cost (100→200) and traits, keeps leader; saves.
    const resp = await post("/api/characters/save", {
      modPath: mod, token: "GER_rich_advisor", name: "Rich Advisor", file: "custom_characters.txt",
      roleLeader: true, leaderIdeology: "conservatism", leaderExpire: "", leaderTraits: "nationalist",
      roleAdvisor: true, advisorSlot: "political_advisor", advisorIdeaToken: "GER_rich_advisor",
      advisorCost: "200", advisorTraits: "ideological_crusader silent_workhorse",
      roleGeneral: false,
    });
    check("save returned 200", resp.status === 200, resp.status + " " + resp.body);

    const after = fs.readFileSync(charPath, "utf8");
    const balanced = (() => { let d = 0; for (const c of after) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; })();
    check("file still brace-balanced after save", balanced, after);
    check("the edit landed (advisor cost now 200)", /cost\s*=\s*200/.test(after) && !/cost\s*=\s*100/.test(after), after);
    check("the edit landed (new trait silent_workhorse present)", /silent_workhorse/.test(after));
    check("advisor allowed survived", /allowed\s*=\s*\{\s*original_tag\s*=\s*GER/.test(after), after);
    check("advisor available survived", /available\s*=\s*\{\s*has_war\s*=\s*no/.test(after));
    check("advisor on_add survived", /on_add\s*=\s*\{\s*country_event\s*=\s*some\.1/.test(after));
    check("advisor research_bonus survived", /research_bonus\s*=\s*\{\s*electronics\s*=\s*0\.1/.test(after));
    check("advisor ai_will_do survived", /ai_will_do\s*=\s*\{\s*factor\s*=\s*1/.test(after));
    check("country_leader id survived", /id\s*=\s*42/.test(after));
    check("country_leader desc survived", /desc\s*=\s*"LEADER_DESC_KEY"/.test(after));
    check("top-level gfx survived", /gfx\s*=\s*some_gfx_culture/.test(after));
    check("still exactly one advisor block (no duplicate)", (after.match(/\badvisor\s*=\s*\{/g) || []).length === 1, (after.match(/\badvisor\s*=\s*\{/g) || []).length);
    check("cost appears exactly once", (after.match(/\bcost\s*=/g) || []).length === 1);
    check("ideology appears exactly once", (after.match(/\bideology\s*=/g) || []).length === 1);
  } catch (e) {
    fail++; console.log("  FAIL harness threw →", e && e.message);
  } finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nCHARACTER-SAVE-INTEGRATION: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
