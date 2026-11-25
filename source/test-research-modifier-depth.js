// A TECH'S REWARD MODIFIER MUST NOT BE READ FROM INSIDE ITS ai_will_do (#modifier-depth).
//
// THE BUG THIS PINS: parseModifierTextFromBlock used extractBraceBlockBodies, which matches
// `modifier = { … }` at ANY depth, and kept the LAST match. A technology normally looks like:
//
//     modifier   = { production_speed_rail_way_factor = 1 }        <- the reward it grants
//     ai_will_do = { factor = 5  modifier = { factor = 0  date < 2002.01.01 } }   <- AI weighting
//
// so the last match was the AI weighting rule. The real bonus then appeared in NO field of the model,
// and a plain re-save with NO EDITS dropped it and wrote `modifier = { factor = 0  date < 2002.01.01 }`
// at tech level — an AI weighting rule masquerading as a country modifier. Data loss and corruption in
// one step, on techs the user never opened.
//
// SCALE when it was found, by re-parsing the installed corpora both ways: 2750 of 4170 techs parsed
// differently — 15 would have lost a real modifier outright (MD's high_speed_rail chain, R56's
// winter_clothes chain) and 2735 would have gained a fabricated one.
//
// It survived a 12-slice hardening campaign because every test in that campaign stubbed the write, and
// because the rest of a save legitimately reorders and re-indents blocks — so the one semantic
// substitution hid inside a diff full of harmless hunks.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const http = require("http");
const assert = require("assert");

// #a-bare-test-run-writes-into-the-real-app-data — the runner names its sandboxed server here. Run bare there is none,
// and this fell back to the app's own port: the owner's open Nova. Now it starts a server of its own, in its sandbox.
const { ownLiveServer } = require("./testlib-live-server.js");
let PORT = +(process.env.NOVA_PORT || 0);
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };
const serverUp = () => new Promise((res) => {
  const s = net.connect({ port: PORT, host: "127.0.0.1" }, () => { s.destroy(); res(true); });
  s.on("error", () => res(false));
  s.setTimeout(1500, () => { s.destroy(); res(false); });
});
const get = (p) => new Promise((res, rej) => {
  http.get({ host: "localhost", port: PORT, path: p }, (r) => {
    const c = []; r.on("data", (d) => c.push(d)); r.on("end", () => res(Buffer.concat(c).toString()));
  }).on("error", rej);
});
const post = (p, body) => new Promise((res, rej) => {
  const data = JSON.stringify(body);
  const r = http.request({ host: "localhost", port: PORT, path: p, method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } }, (s) => {
    const c = []; s.on("data", (d) => c.push(d)); s.on("end", () => res({ status: s.statusCode, body: Buffer.concat(c).toString() }));
  });
  r.on("error", rej); r.write(data); r.end();
});

const TECHS = `technologies = {

	reward_and_ai = {
		modifier = { production_speed_rail_way_factor = 1 }
		research_cost = 2
		start_year = 1936
		folder = { name = infantry_folder position = { x = 0 y = 0 } }
		ai_will_do = { factor = 5
			modifier = { factor = 0  date < 2002.01.01 }
		}
	}

	ai_only = {
		research_cost = 1
		start_year = 1936
		folder = { name = infantry_folder position = { x = 1 y = 0 } }
		ai_will_do = { factor = 3
			modifier = { factor = 0  has_dlc = "Man the Guns" }
		}
	}

	reward_only = {
		modifier = { army_org_factor = 0.05 }
		research_cost = 1
		start_year = 1936
		folder = { name = infantry_folder position = { x = 2 y = 0 } }
	}
}
`;

(async () => {
  if (!PORT) PORT = await ownLiveServer("test-research-modifier-depth");
  if (!(await serverUp())) { console.log(`test-research-modifier-depth: SKIPPED (no server on ${PORT})`); process.exit(0); }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-modifier-depth-"));
  fs.writeFileSync(path.join(root, "descriptor.mod"), 'name="modifier depth"\nsupported_version="1.19.*"\n', "utf8");
  const dir = path.join(root, "common", "technologies");
  fs.mkdirSync(dir, { recursive: true });
  const FILE = path.join(dir, "probe.txt");
  fs.writeFileSync(FILE, TECHS, "utf8");

  // ---- PARSE ----
  const cat = JSON.parse(await get(`/api/technologies/catalog?modPath=${encodeURIComponent(root)}`));
  const by = Object.fromEntries((cat.technologies || []).map((t) => [t.id, t]));
  ok(!!by.reward_and_ai, "the fixture loaded");

  ok(/production_speed_rail_way_factor/.test(by.reward_and_ai.modifiers || ""),
    "a tech's own reward modifier is what lands in `modifiers`");
  ok(!/factor\s*=\s*0/.test(by.reward_and_ai.modifiers || ""),
    "the ai_will_do weighting rule does NOT land in `modifiers`");
  ok(!/date\s*</.test(by.reward_and_ai.modifiers || ""),
    "...nor its date condition");

  ok(!(by.ai_only.modifiers || "").trim(),
    "a tech with ONLY an ai_will_do modifier has an EMPTY reward modifier, not the AI rule");
  ok(/army_org_factor/.test(by.reward_only.modifiers || ""),
    "a tech with only a reward modifier is unaffected");

  // ai_will_do itself must still be captured — the fix must not have moved the problem
  ok(/factor/.test(JSON.stringify(by.reward_and_ai.aiWillDo || "")), "ai_will_do is still parsed");

  // ---- ROUND TRIP: a save with NO edits must not change the tech's meaning ----
  const before = fs.readFileSync(FILE, "utf8");
  const r = await post("/api/technologies/save-batch", {
    technologies: [by.reward_and_ai, by.ai_only, by.reward_only], equipments: {}, customTabs: [],
    modPath: root, countryTag: null, countryTechIds: [], deletions: [], newTechIds: [],
  });
  ok(r.status === 200, "the save succeeded", r.body);
  const after = fs.readFileSync(FILE, "utf8");

  ok(after.includes("production_speed_rail_way_factor"),
    "the authored reward modifier SURVIVES a re-save (this is the data-loss the bug caused)");
  ok(before.includes("army_org_factor") && after.includes("army_org_factor"),
    "the plain reward modifier survives too");
  // the AI rule must not have been promoted to a tech-level modifier
  const rewardBlock = /reward_and_ai\s*=\s*\{[\s\S]*?\n\t\}/.exec(after);
  ok(!!rewardBlock, "the tech block is still parseable after the save");
  if (rewardBlock) {
    const topLevelModifier = /\n\t\tmodifier\s*=\s*\{([\s\S]*?)\n\t\t\}/.exec(rewardBlock[0]);
    ok(!!topLevelModifier, "the tech still has a top-level modifier block");
    if (topLevelModifier) {
      ok(!/factor\s*=\s*0/.test(topLevelModifier[1]),
        "the top-level modifier is NOT the ai_will_do rule (that was the corruption)");
    }
  }
  ok(!/\n\t\tmodifier\s*=\s*\{[\s\S]{0,80}date\s*</.test(after),
    "no `date <` condition was written as a country modifier");

  // ---- CORPUS: no installed mod should parse an AI-weighting token as a reward modifier ----
  const CORPORA = {
    vanilla: "D:/SteamLibrary/steamapps/common/Hearts of Iron IV",
    MD: "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649",
  };
  let corpusChecked = 0;
  for (const [tag, croot] of Object.entries(CORPORA)) {
    if (!fs.existsSync(path.join(croot, "common", "technologies"))) continue;
    const c = JSON.parse(await get(`/api/technologies/catalog?modPath=${encodeURIComponent(croot)}`));
    const bad = (c.technologies || []).filter((t) => /(^|\s)factor\s*=/.test(t.modifiers || ""));
    ok(bad.length === 0,
      `${tag}: no tech parses an ai_will_do weighting rule as its reward modifier (found ${bad.length}${bad.length ? ": " + bad.slice(0, 3).map((t) => t.id).join(", ") : ""})`);
    corpusChecked += 1;
  }
  if (!corpusChecked) console.log("  (no installed corpus to cross-check — fixture checks only)");

  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  console.log(`test-research-modifier-depth: ${checks} checks passed`);
})();
