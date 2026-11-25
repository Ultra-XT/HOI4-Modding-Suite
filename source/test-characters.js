/**
 * Characters Maker tests (Phase 6). Drives the real server over HTTP against a
 * throwaway temp mod. Run: node test-characters.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp, constants } = require("./server.js");

const PORT = 3494;
const BASE = `http://127.0.0.1:${PORT}`;
let passes = 0, failures = 0;
function ok(c, m) { if (c) { passes++; console.log(`  ✓ ${m}`); } else { failures++; console.error(`  ✗ FAIL: ${m}`); } }
function braceBalanced(t) { let d = 0; for (const c of t) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; }
async function post(p, b) { const r = await fetch(`${BASE}${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, json: j }; }

let server;
(async () => {
  const app = createApp();
  await new Promise((res) => { server = app.listen(PORT, res); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-chartest-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Char Test"\n', "utf8");

  try {
    console.log("\n[1] vanilla write guard");
    const g = await post("/api/characters/save", { modPath: constants.resolveHoi4GameRoot(), token: "evil", roleLeader: true });
    ok(g.status === 400, `save to game root rejected (got ${g.status})`);

    console.log("\n[2] save all three roles + portraits");
    const body = {
      modPath: mod, token: "TST_test_char", name: "Test Character", file: "custom_characters.txt",
      portraitCivLarge: "gfx/x.dds", portraitArmyLarge: "gfx/y.dds",
      roleLeader: true, leaderIdeology: "fascism_ideology", leaderExpire: "1965.1.1", leaderTraits: "warmonger nervous_leader",
      roleAdvisor: true, advisorSlot: "army_chief", advisorIdeaToken: "TST_chief", advisorCost: 200, advisorTraits: "army_chief_offense_1",
      roleGeneral: true, generalType: "field_marshal", genSkill: 5, genAttack: 4, genDefense: 3, genPlanning: 2, genLogistics: 1, generalTraits: "inspirational_leader",
    };
    const s = await post("/api/characters/save", body);
    ok(s.status === 200, `save succeeded (got ${s.status})`);
    const file = fs.readFileSync(path.join(mod, "common", "characters", "custom_characters.txt"), "utf8");
    ok(braceBalanced(file), "characters file brace-balanced");
    ok(/country_leader = \{/.test(file) && /ideology = fascism_ideology/.test(file), "country_leader written");
    ok(/advisor = \{/.test(file) && /slot = army_chief/.test(file), "advisor written");
    ok(/field_marshal = \{/.test(file) && /skill = 5/.test(file), "field_marshal written");
    ok(/traits = \{ warmonger nervous_leader \}/.test(file), "leader traits written");
    const loc = fs.readFileSync(path.join(mod, "localisation", "english", "custom_characters_l_english.yml"), "utf8");
    ok(/TST_test_char:0 "Test Character"/.test(loc), "name localization written");

    console.log("\n[3] round-trip via list");
    const lst = await fetch(`${BASE}/api/characters/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const fileObj = lst.files.find(f => f.file === "custom_characters.txt");
    const c = (fileObj || {}).characters.find((x) => x.token === "TST_test_char");
    ok(!!c, "character present in list");
    ok(c.roleLeader && c.leaderIdeology === "fascism_ideology", "leader round-trips");
    ok(c.roleAdvisor && c.advisorSlot === "army_chief", "advisor round-trips");
    ok(c.roleGeneral && c.generalType === "field_marshal" && c.genSkill === "5", "general round-trips");
    ok(c.leaderTraits === "warmonger nervous_leader", "leader traits round-trip");

    console.log("\n[4] sibling preservation on second save");
    await post("/api/characters/save", { modPath: mod, token: "TST_second", name: "Second", file: "custom_characters.txt", roleAdvisor: true, advisorSlot: "theorist" });
    const file2 = fs.readFileSync(path.join(mod, "common", "characters", "custom_characters.txt"), "utf8");
    ok(/TST_test_char = \{/.test(file2) && /TST_second = \{/.test(file2), "both characters present");
    ok(braceBalanced(file2), "file still brace-balanced");

    console.log("\n[5] delete");
    await post("/api/characters/delete", { modPath: mod, token: "TST_second", file: "custom_characters.txt" });
    const file3 = fs.readFileSync(path.join(mod, "common", "characters", "custom_characters.txt"), "utf8");
    ok(!/TST_second = \{/.test(file3), "deleted character removed");
    ok(/TST_test_char = \{/.test(file3), "other character preserved after delete");
    ok(braceBalanced(file3), "file brace-balanced after delete");
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    if (server) server.close();
  }

  console.log(`\n========================================`);
  console.log(`  ${passes} passed, ${failures} failed`);
  console.log(`========================================`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR:", e); if (server) server.close(); process.exit(1); });
