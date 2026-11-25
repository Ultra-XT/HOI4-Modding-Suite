// Battalion (sub_unit) stat editor: surgically retune an existing MOD sub_unit's scalar stats + its need
// block in place, leaving every other field/nested block byte-identical. Mod-owned files only.
// Run: node test-subunit-edit.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const balanced = (s) => (s.replace(/#.*$/gm, "").match(/{/g) || []).length === (s.replace(/#.*$/gm, "").match(/}/g) || []).length;

(async () => {
  const PORT = 3945, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-subunit-"));
  const mk = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  mk("descriptor.mod", 'name="Nova Subunit Test"\n');
  const FILE = "common/units/nova_units.txt";
  mk(FILE,
    'sub_units = {\n' +
    '\tnova_inf = {\n' +
    '\t\tabbreviation = "NIN"\n' +
    '\t\tsprite = infantry\n' +
    '\t\ttype = { infantry }\n' +
    '\t\tgroup = infantry\n' +
    '\t\tcategories = { category_army category_front_line }\n' +
    '\t\tcombat_width = 2\n' +
    '\t\tmax_strength = 25\n' +
    '\t\tmax_organisation = 60\n' +
    '\t\tmanpower = 1000\n' +
    '\t\tneed = {\n\t\t\tnova_gun_equipment = 100\n\t\t}\n' +
    '\t\ttraining_time = 90\n' +
    '\t}\n' +
    '}\n');
  const abs = path.join(mod, FILE);
  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

  try {
    console.log("=== edit scalar stats in place ===");
    const r1 = await post("/api/subunits/edit", { modPath: mod, key: "nova_inf", fileName: "nova_units.txt", stats: { combat_width: 3, max_strength: 30 } });
    ok("edit ok", r1 && r1.ok === true && r1.applied.includes("combat_width"), r1);
    let txt = fs.readFileSync(abs, "utf8");
    ok("brace-balanced", balanced(txt), txt);
    ok("combat_width now 3", /combat_width\s*=\s*3\b/.test(txt) && !/combat_width\s*=\s*2\b/.test(txt), txt);
    ok("max_strength now 30", /max_strength\s*=\s*30\b/.test(txt) && !/max_strength\s*=\s*25\b/.test(txt), txt);
    ok("untouched fields survive (abbreviation, sprite, type, categories, manpower, training_time)", /abbreviation\s*=\s*"NIN"/.test(txt) && /sprite\s*=\s*infantry/.test(txt) && /type\s*=\s*\{\s*infantry\s*\}/.test(txt) && /category_front_line/.test(txt) && /manpower\s*=\s*1000/.test(txt) && /training_time\s*=\s*90/.test(txt), txt);
    ok("each edited scalar appears exactly once (no dup)", (txt.match(/combat_width\s*=/g) || []).length === 1 && (txt.match(/max_strength\s*=/g) || []).length === 1, txt);

    console.log("\n=== inject a NEW scalar the block didn't have ===");
    const r2 = await post("/api/subunits/edit", { modPath: mod, key: "nova_inf", fileName: "nova_units.txt", stats: { soft_attack: 4, defense: 8 } });
    txt = fs.readFileSync(abs, "utf8");
    ok("new soft_attack + defense injected", r2.ok === true && /soft_attack\s*=\s*4\b/.test(txt) && /defense\s*=\s*8\b/.test(txt) && balanced(txt), txt);

    console.log("\n=== replace the need block ===");
    const r3 = await post("/api/subunits/edit", { modPath: mod, key: "nova_inf", fileName: "nova_units.txt", need: { nova_gun_equipment: 120, nova_support_equipment: 10 } });
    txt = fs.readFileSync(abs, "utf8");
    ok("need updated (120 + new equipment), old 100 gone, one need block", r3.ok === true && /nova_gun_equipment\s*=\s*120/.test(txt) && /nova_support_equipment\s*=\s*10/.test(txt) && !/nova_gun_equipment\s*=\s*100/.test(txt) && (txt.match(/need\s*=\s*\{/g) || []).length === 1 && balanced(txt), txt);

    console.log("\n=== guards ===");
    const bad1 = await post("/api/subunits/edit", { modPath: mod, key: "does_not_exist", fileName: "nova_units.txt", stats: { combat_width: 5 } });
    ok("unknown key rejected", bad1.ok === false, bad1);
    const bad2 = await post("/api/subunits/edit", { modPath: mod, key: "nova_inf", fileName: "missing.txt", stats: { combat_width: 5 } });
    ok("missing (non-mod) file rejected", bad2.ok === false, bad2);
    // a non-whitelisted stat key is ignored (never injects arbitrary script)
    const r4 = await post("/api/subunits/edit", { modPath: mod, key: "nova_inf", fileName: "nova_units.txt", stats: { on_add: "set_country_flag" } });
    txt = fs.readFileSync(abs, "utf8");
    ok("non-whitelisted stat key ignored (no injection)", r4.ok === true && !/on_add/.test(txt) && balanced(txt), txt);
    ok("final file still brace-balanced", balanced(fs.readFileSync(abs, "utf8")));
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nSUBUNIT-EDIT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
