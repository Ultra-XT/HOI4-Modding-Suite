// Regression tests for the 2026-07-05 bug-hunt fixes (verified by an adversarial review workflow):
//  #1 folder-container-transform: a valid width with a blank/invalid height no longer DROPS the width.
//  #2 ideas: editing a spirit whose on-disk modifier is a ONE-LINE block no longer DUPLICATES it.
//  #3 characters: an advisor's ai_will_do (non-default factor) is no longer duplicated + clobbered on edit.
// Run: node test-bughunt-fixes.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const { createApp } = require("./server.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + x : ""); } };
const balanced = (s) => { let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };
const count = (s, re) => (s.match(re) || []).length;

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bugfix-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="BugFix"\n');

// #1 fixture: a folder gui whose container size is 100%% × 100%%.
fs.mkdirSync(path.join(mod, "interface"), { recursive: true });
const guiPath = path.join(mod, "interface", "countrytechtreeview.gui");
fs.writeFileSync(guiPath, `guiTypes = {
	containerWindowType = {
		name = "infantry_folder"
		position = { x = 0 y = 47 }
		size = { width = 100%% height = 100%% }
	}
}
`);
// #2 fixture: a spirit with a ONE-LINE modifier (as stock/MD/community files author them).
fs.mkdirSync(path.join(mod, "common", "ideas"), { recursive: true });
fs.writeFileSync(path.join(mod, "common", "ideas", "custom_ideas.txt"), `ideas = {
	country = {
		test_spirit = {
			picture = militant_group_soldier
			modifier = { stability_factor = 0.1 }
		}
	}
}
`);
// #3 fixture: a character whose advisor has a non-default ai_will_do factor.
fs.mkdirSync(path.join(mod, "common", "characters"), { recursive: true });
const charPath = path.join(mod, "common", "characters", "custom_characters.txt");
fs.writeFileSync(charPath, `characters = {
	GER_adv = {
		name = GER_adv
		advisor = {
			slot = political_advisor
			idea_token = GER_adv
			cost = 100
			ai_will_do = { factor = 2 }
			traits = { ideological_crusader }
		}
	}
}
`, "utf8");

const app = createApp();
const server = http.createServer(app);
const post = (p, body) => new Promise((res, rej) => {
  const data = Buffer.from(JSON.stringify(body));
  const r = http.request({ host: "127.0.0.1", port: server.address().port, path: p, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length } },
    (rs) => { let o = ""; rs.on("data", c => o += c); rs.on("end", () => res({ status: rs.statusCode, body: o })); });
  r.on("error", rej); r.write(data); r.end();
});

server.listen(0, "127.0.0.1", async () => {
  try {
    // ── #1 folder-container-transform: width only (height blank) ──
    const r1 = await post("/api/research/folder-container-transform", { modPath: mod, folder: "infantry_folder", x: 0, y: 47, width: "800", height: "" });
    ok("#1 container POST ok", r1.status === 200, r1.status + " " + r1.body);
    let gui = fs.readFileSync(guiPath, "utf8");
    ok("#1 width applied (not dropped)", /width\s*=\s*800/.test(gui), gui.match(/size[^}]*\}/));
    ok("#1 height preserved (100%)", /height\s*=\s*100%%/.test(gui));
    ok("#1 gui brace-balanced", balanced(gui));

    // ── #2 ideas: edit a spirit whose on-disk modifier is one-line ──
    const r2 = await post("/api/ideas/upsert-definition", {
      modPath: mod, ideaId: "test_spirit", targetRelativeFile: "custom_ideas.txt",
      targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
      name: "Test Spirit", desc: "", picture: "militant_group_soldier", category: "country", mode: "edit",
      selectedEffects: ["modifier = {\n\tstability_factor = 0.2\n}"],
    });
    ok("#2 idea edit ok", r2.status === 200 && (JSON.parse(r2.body).ok !== false), r2.body);
    const ideas = fs.readFileSync(path.join(mod, "common", "ideas", "custom_ideas.txt"), "utf8");
    ok("#2 exactly ONE modifier block (no dup)", count(ideas, /\bmodifier\s*=\s*\{/g) === 1, count(ideas, /\bmodifier\s*=\s*\{/g));
    ok("#2 modifier UPDATED to 0.2", /stability_factor\s*=\s*0\.2/.test(ideas) && !/stability_factor\s*=\s*0\.1/.test(ideas), ideas);
    ok("#2 ideas brace-balanced", balanced(ideas));

    // ── #3 characters: edit the advisor; ai_will_do (factor 2) must survive exactly once ──
    const r3 = await post("/api/characters/save", {
      modPath: mod, token: "GER_adv", name: "Adv", file: "custom_characters.txt",
      roleAdvisor: true, advisorSlot: "political_advisor", advisorIdeaToken: "GER_adv",
      advisorCost: "200", advisorTraits: "ideological_crusader", roleLeader: false, roleGeneral: false,
    });
    ok("#3 character save ok", r3.status === 200, r3.status + " " + r3.body);
    const chars = fs.readFileSync(charPath, "utf8");
    ok("#3 exactly ONE ai_will_do (no dup)", count(chars, /\bai_will_do\s*=\s*\{/g) === 1, count(chars, /\bai_will_do\s*=\s*\{/g));
    ok("#3 factor still 2 (not clobbered to 1)", /ai_will_do\s*=\s*\{\s*factor\s*=\s*2/.test(chars) && !/factor\s*=\s*1\b/.test(chars), chars.match(/ai_will_do[^}]*\}/));
    ok("#3 the edit landed (cost 200)", /cost\s*=\s*200/.test(chars));
    ok("#3 chars brace-balanced", balanced(chars));
  } catch (e) { fail++; console.log("  FAIL harness threw →", e && e.stack || e); }
  finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nBUGHUNT-FIXES: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
