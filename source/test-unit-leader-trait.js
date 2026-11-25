// Custom commander (unit_leader) trait writer: create/edit leader_traits = { <id> = { type trait_type
// modifier={…} } } in a mod-owned common/unit_leader/*.txt. Must upsert by id, preserve un-modeled keys,
// stay brace-balanced, validate, and surface in the trait reader. Run: node test-unit-leader-trait.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const balanced = (s) => (s.replace(/#.*$/gm, "").match(/{/g) || []).length === (s.replace(/#.*$/gm, "").match(/}/g) || []).length;
const count = (s, re) => (s.match(re) || []).length;

(async () => {
  const PORT = 3943, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-trait-"));
  const mk = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  mk("descriptor.mod", 'name="Nova Trait Test"\n');
  const traitFile = path.join(mod, "common", "unit_leader", "nova_custom_traits.txt");

  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const getTraits = () => fetch(`${BASE}/api/characters/traits?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());

  try {
    console.log("=== create a trait ===");
    const r1 = await post("/api/characters/trait", { modPath: mod, id: "nova_blitz_master", type: "corps_commander", trait_type: "personality_trait", cost: 200, modifier: { army_armor_attack_factor: 0.15, army_armor_speed_factor: 0.05 }, attack_skill: 2 });
    ok("create ok", r1 && r1.ok === true, r1);
    let txt = fs.readFileSync(traitFile, "utf8");
    ok("file brace-balanced", balanced(txt), txt);
    ok("wrapped in leader_traits block", /leader_traits\s*=\s*\{[\s\S]*nova_blitz_master\s*=\s*\{/.test(txt), txt);
    ok("type + trait_type written", /type\s*=\s*corps_commander[\s\S]*trait_type\s*=\s*personality_trait/.test(txt), txt);
    ok("cost + attack_skill written", /cost\s*=\s*200/.test(txt) && /attack_skill\s*=\s*2/.test(txt), txt);
    ok("modifier block with both modifiers", /modifier\s*=\s*\{[\s\S]*army_armor_attack_factor\s*=\s*0\.15[\s\S]*army_armor_speed_factor\s*=\s*0\.05[\s\S]*\}/.test(txt), txt);

    console.log("\n=== the trait reader picks it up ===");
    const g = await getTraits();
    ok("GET /api/characters/traits lists nova_blitz_master as a unit trait", g && g.ok === true && (g.unit || []).some((u) => (u.name || u) === "nova_blitz_master"), g && g.unit);

    console.log("\n=== upsert (same id) replaces, doesn't duplicate ===");
    const r2 = await post("/api/characters/trait", { modPath: mod, id: "nova_blitz_master", type: "corps_commander", trait_type: "personality_trait", cost: 350, modifier: { army_armor_attack_factor: 0.2 } });
    txt = fs.readFileSync(traitFile, "utf8");
    ok("upsert ok, single trait block", r2.ok === true && count(txt, /nova_blitz_master\s*=\s*\{/g) === 1, txt);
    ok("cost updated to 350, old 200 gone", /cost\s*=\s*350/.test(txt) && !/cost\s*=\s*200/.test(txt), txt);
    ok("still brace-balanced", balanced(txt));

    console.log("\n=== a second trait coexists ===");
    const r3 = await post("/api/characters/trait", { modPath: mod, id: "nova_sea_wolf", type: "navy", trait_type: "personality_trait", modifier: { navy_max_range_factor: 0.1 } });
    txt = fs.readFileSync(traitFile, "utf8");
    ok("both traits present, one leader_traits block", r3.ok === true && /nova_blitz_master/.test(txt) && /nova_sea_wolf/.test(txt) && count(txt, /leader_traits\s*=\s*\{/g) === 1, txt);

    console.log("\n=== preserve a hand-added un-modeled key on re-save ===");
    // Inject ai_will_do into the sea_wolf block by hand, then re-save it from Nova.
    txt = fs.readFileSync(traitFile, "utf8").replace(/(nova_sea_wolf\s*=\s*\{)/, '$1\n\t\tai_will_do = { factor = 3 }');
    fs.writeFileSync(traitFile, txt, "utf8");
    const r4 = await post("/api/characters/trait", { modPath: mod, id: "nova_sea_wolf", type: "navy", trait_type: "personality_trait", modifier: { navy_max_range_factor: 0.2 } });
    txt = fs.readFileSync(traitFile, "utf8");
    ok("hand-added ai_will_do survived the re-save", r4.ok === true && /ai_will_do\s*=\s*\{\s*factor\s*=\s*3/.test(txt), txt);
    ok("navy_max_range updated to 0.2 (edit wins)", /navy_max_range_factor\s*=\s*0\.2/.test(txt), txt);
    ok("still brace-balanced", balanced(txt));

    console.log("\n=== validation guards ===");
    const bad1 = await post("/api/characters/trait", { modPath: mod, id: "1bad", type: "land" });
    ok("bad id rejected", bad1.ok === false, bad1);
    const bad2 = await post("/api/characters/trait", { modPath: mod, id: "nova_x", type: "not_a_type" });
    ok("bad commander type rejected", bad2.ok === false, bad2);
    const bad3 = await post("/api/characters/trait", { modPath: mod, id: "nova_y", trait_type: "nonsense" });
    ok("bad trait_type rejected", bad3.ok === false, bad3);
    // a junk modifier key is dropped, not written
    const r5 = await post("/api/characters/trait", { modPath: mod, id: "nova_clean", modifier: { "bad key!": 5, army_attack_factor: 0.1 } });
    txt = fs.readFileSync(traitFile, "utf8");
    ok("junk modifier key dropped, valid one kept", r5.ok === true && /army_attack_factor\s*=\s*0\.1/.test(txt) && !/bad key/.test(txt) && balanced(txt), txt);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nUNIT-LEADER-TRAIT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
