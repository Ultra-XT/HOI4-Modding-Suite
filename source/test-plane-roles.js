// Aircraft ROLE editor (Military > Equipment): surgically rewrite an existing MOD archetype's
// allow_mission_type (add / change / clear) while keeping every other key byte-exact. Roles live on
// the ARCHETYPE — a create_equipment_variant cannot carry allow_mission_type — so this is the only
// way to edit an existing plane's roles. Run: node test-plane-roles.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const balanced = (s) => (s.replace(/#.*$/gm, "").match(/{/g) || []).length === (s.replace(/#.*$/gm, "").match(/}/g) || []).length;

(async () => {
  const PORT = 3937, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-planeroles-"));
  const mk = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  mk("descriptor.mod", 'name="Nova Plane Roles Test"\n');

  const EQ = "common/units/equipment/custom_air.txt";
  // Three archetypes: a block-form roles one, a NO-roles one, a single-line-form one.
  // Each carries a hand-added exotic key we must never touch.
  mk(EQ,
    'equipments = {\n' +
    '\tnova_fighter = {\n' +
    '\t\tyear = 1936\n' +
    '\t\tallow_mission_type = {\n\t\t\tair_superiority\n\t\t\tinterception\n\t\t}\n' +
    '\t\tis_archetype = yes\n' +
    '\t\ttype = fighter\n' +
    '\t\tair_attack = 4\n' +
    '\t\tnova_secret_field = 42\n' +
    '\t}\n' +
    '\tnova_bomber = {\n' +
    '\t\tyear = 1936\n' +
    '\t\tis_archetype = yes\n' +
    '\t\ttype = tactical_bomber\n' +
    '\t\tair_bombing = 8\n' +
    '\t\tnova_keep_me = yes\n' +
    '\t}\n' +
    '\tnova_cas = {\n' +
    '\t\tyear = 1936\n' +
    '\t\tallow_mission_type = cas\n' +
    '\t\tis_archetype = yes\n' +
    '\t\ttype = cas\n' +
    '\t}\n' +
    // Mirrors MD's real sam_missile_equipment: a mod-owned archetype whose mission Nova had no checkbox
    // for. The UI can only send back what it rendered, so the save filter used to DELETE it outright.
    '\tnova_sam = {\n' +
    '\t\tyear = 1970\n' +
    '\t\tallow_mission_type = {\n\t\t\tsam_mission\n\t\t}\n' +
    '\t\tis_archetype = yes\n' +
    '\t\ttype = fighter\n' +
    '\t}\n' +
    '}\n');

  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const abs = path.join(mod, EQ);
  const missionsOf = (id, txt) => {
    const re = new RegExp(`(?:^|\\n)\\s*${id}\\s*=\\s*\\{`);
    const m = re.exec(txt); if (!m) return null;
    const openIdx = txt.indexOf("{", m.index);
    // naive block slice for the test
    let depth = 0, close = -1;
    for (let i = openIdx; i < txt.length; i++) { if (txt[i] === "{") depth++; else if (txt[i] === "}") { depth--; if (depth === 0) { close = i; break; } } }
    const block = txt.slice(openIdx, close);
    const bm = /allow_mission_type\s*=\s*\{([^}]*)\}/.exec(block);
    if (bm) return bm[1].trim().split(/\s+/).filter(Boolean);
    const sm = /allow_mission_type\s*=\s*([A-Za-z0-9_]+)/.exec(block);
    return sm ? [sm[1]] : [];
  };

  try {
    console.log("=== CHANGE roles on a block-form archetype ===");
    const r1 = await post("/api/equipment/archetype-missions", { modPath: mod, id: "nova_fighter", missions: ["cas", "naval_bomber"] });
    ok("change accepted, returns normalized missions", r1 && r1.ok === true && JSON.stringify(r1.missions) === JSON.stringify(["cas", "naval_bomber"]), r1);
    let txt = fs.readFileSync(abs, "utf8");
    ok("file still brace-balanced", balanced(txt), txt);
    ok("nova_fighter now has [cas, naval_bomber]", JSON.stringify(missionsOf("nova_fighter", txt)) === JSON.stringify(["cas", "naval_bomber"]), missionsOf("nova_fighter", txt));
    ok("old roles (air_superiority/interception) are gone", !/air_superiority|interception/.test(txt.slice(txt.indexOf("nova_fighter"), txt.indexOf("nova_bomber"))), txt);
    ok("hand-added nova_secret_field = 42 preserved", /nova_secret_field\s*=\s*42/.test(txt), txt);
    ok("type = fighter + air_attack preserved", /nova_fighter[\s\S]*type\s*=\s*fighter[\s\S]*air_attack\s*=\s*4/.test(txt), txt);

    console.log("\n=== ADD roles to an archetype that had none ===");
    const r2 = await post("/api/equipment/archetype-missions", { modPath: mod, id: "nova_bomber", missions: ["strategic_bomber", "naval_bomber"] });
    ok("add accepted", r2 && r2.ok === true, r2);
    txt = fs.readFileSync(abs, "utf8");
    ok("nova_bomber now has [strategic_bomber, naval_bomber]", JSON.stringify(missionsOf("nova_bomber", txt)) === JSON.stringify(["strategic_bomber", "naval_bomber"]), missionsOf("nova_bomber", txt));
    ok("nova_bomber hand key nova_keep_me preserved", /nova_bomber[\s\S]*nova_keep_me\s*=\s*yes/.test(txt), txt);
    ok("still brace-balanced", balanced(txt));

    console.log("\n=== CLEAR roles (empty removes the block) ===");
    const r3 = await post("/api/equipment/archetype-missions", { modPath: mod, id: "nova_fighter", missions: [] });
    ok("clear accepted, missions []", r3 && r3.ok === true && r3.missions.length === 0, r3);
    txt = fs.readFileSync(abs, "utf8");
    ok("nova_fighter allow_mission_type removed", missionsOf("nova_fighter", txt).length === 0, missionsOf("nova_fighter", txt));
    ok("nova_fighter other keys survive the clear", /nova_fighter[\s\S]*type\s*=\s*fighter[\s\S]*nova_secret_field\s*=\s*42/.test(txt), txt);
    ok("still brace-balanced after clear", balanced(txt));

    console.log("\n=== single-line form → replaced with a block ===");
    const r4 = await post("/api/equipment/archetype-missions", { modPath: mod, id: "nova_cas", missions: ["interception"] });
    ok("single-line replace accepted", r4 && r4.ok === true, r4);
    txt = fs.readFileSync(abs, "utf8");
    ok("nova_cas now [interception], old single-line cas gone", JSON.stringify(missionsOf("nova_cas", txt)) === JSON.stringify(["interception"]), missionsOf("nova_cas", txt));
    // Count within nova_cas's OWN block — slicing to end-of-file also counted later archetypes' roles.
    const casBlock = (() => {
      const o = txt.indexOf("{", txt.indexOf("nova_cas"));
      let d = 0; for (let i = o; i < txt.length; i++) { if (txt[i] === "{") d++; else if (txt[i] === "}") { d--; if (!d) return txt.slice(o, i); } } return "";
    })();
    ok("exactly one allow_mission_type on nova_cas (no leftover)", (casBlock.match(/allow_mission_type/g) || []).length === 1, casBlock);

    console.log("\n=== validation + guards ===");
    const r5 = await post("/api/equipment/archetype-missions", { modPath: mod, id: "nova_bomber", missions: ["cas", "not_a_real_mission", "cas"] });
    ok("invalid missions filtered + de-duped → [cas]", r5 && r5.ok === true && JSON.stringify(r5.missions) === JSON.stringify(["cas"]), r5);
    const r6 = await post("/api/equipment/archetype-missions", { modPath: mod, id: "does_not_exist", missions: ["cas"] });
    ok("unknown equipment id rejected", r6 && r6.ok === false, r6);
    const r7 = await post("/api/equipment/archetype-missions", { modPath: mod, id: "1bad", missions: ["cas"] });
    ok("invalid id shape rejected", r7 && r7.ok === false, r7);

    // --- The engine's mission VOCABULARY must be real. Nova shipped `naval_mine_planting` /
    // `naval_mine_sweeping`, which appear ZERO times in vanilla — the real tokens are PLURAL. Those two
    // checkboxes therefore wrote a token HOI4 does not know, and did nothing in game.
    // VALID_AIR_MISSIONS is scoped inside createApp, so assert on the declaration itself.
    const vamLine = (/const VALID_AIR_MISSIONS = \[([\s\S]*?)\];/.exec(fs.readFileSync("./server.js", "utf8")) || [])[1] || "";
    const VAM = vamLine.split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
    ok("mission vocabulary found in server.js", VAM.length > 0, vamLine.slice(0, 60));
    ok("mission vocabulary uses the PLURAL mine tokens", VAM.includes("naval_mines_planting") && VAM.includes("naval_mines_sweeping"), VAM);
    ok("the fake singular mine tokens are gone", !VAM.includes("naval_mine_planting") && !VAM.includes("naval_mine_sweeping"), VAM);
    ok("the 4 real vanilla missions Nova lacked are present", ["sam_mission", "naval_kamikaze", "barrage_mission", "drop_nuke"].every((m) => VAM.includes(m)), VAM);
    // Every token must be one HOI4 actually accepts — checked against the real game files when present.
    const GAME = "D:\\SteamLibrary\\steamapps\\common\\Hearts of Iron IV\\common";
    if (fs.existsSync(GAME)) {
      const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : (e.name.endsWith(".txt") ? [path.join(d, e.name)] : []));
      const blob = walk(GAME).map((f) => { try { return fs.readFileSync(f, "utf8"); } catch (_) { return ""; } }).join("\n");
      const unknown = VAM.filter((m) => !new RegExp("\\b" + m + "\\b").test(blob));
      ok("every mission token appears in the real HOI4 files", unknown.length === 0, unknown);
    }
    // A mission already in the file that Nova has NO checkbox for must survive a save. MD's
    // sam_missile_equipment / nuclear + kamikaze missiles are live, mod-owned users of exactly this.
    const r8 = await post("/api/equipment/archetype-missions", { modPath: mod, id: "nova_sam", missions: ["sam_mission"] });
    ok("a known-but-newly-added mission round-trips", r8 && r8.ok === true && (missionsOf("nova_sam", fs.readFileSync(abs, "utf8")) || []).includes("sam_mission"), r8);
    // Now simulate a UI that never rendered the token at all: it posts a DIFFERENT set, omitting it.
    fs.writeFileSync(abs, fs.readFileSync(abs, "utf8").replace(/sam_mission/, "some_future_engine_mission"), "utf8");
    const r9 = await post("/api/equipment/archetype-missions", { modPath: mod, id: "nova_sam", missions: ["cas"] });
    const after9 = missionsOf("nova_sam", fs.readFileSync(abs, "utf8")) || [];
    ok("an UNRECOGNISED mission is preserved, not silently deleted", r9 && r9.ok === true && after9.includes("some_future_engine_mission"), { r9, after9 });
    ok("...and the requested one still applied alongside it", after9.includes("cas"), after9);

    // Final: the whole file survives every write brace-balanced.
    ok("file brace-balanced at the very end", balanced(fs.readFileSync(abs, "utf8")));
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nPLANE-ROLES: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
