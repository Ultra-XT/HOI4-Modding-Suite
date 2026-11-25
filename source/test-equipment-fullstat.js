// Full stat editor: /api/equipment/save now accepts a generic `statsAll` map so armor_value / maximum_speed
// / hardness / naval / air / missile stats are editable on mod-owned equipment (was read-only). The edit
// must win over the preserved value + over the core mapping, without duplicating or dropping other keys.
// Run: node test-equipment-fullstat.js
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
  const PORT = 3939, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fullstat-"));
  const mk = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  mk("descriptor.mod", 'name="Nova Full Stat Test"\n');

  const EQ = "common/units/equipment/custom_tank.txt";
  // A mod tank with 8-core soft_attack + extra armour/speed/hardness + a hand-added key that must survive.
  mk(EQ,
    'equipments = {\n' +
    '\tnova_tank_equipment = {\n' +
    '\t\tyear = 1936\n' +
    '\t\tarchetype = tank_equipment\n' +
    '\t\tsoft_attack = 5\n' +
    '\t\tarmor_value = 30\n' +
    '\t\tmaximum_speed = 8\n' +
    '\t\thardness = 0.8\n' +
    '\t\tnova_secret = 77\n' +
    '\t}\n' +
    '}\n');

  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const abs = path.join(mod, EQ);

  try {
    console.log("=== edit extra stats (armour / speed) via statsAll ===");
    const r1 = await post("/api/equipment/save", { modPath: mod, id: "nova_tank_equipment", statsAll: { armor_value: 40, maximum_speed: 12 } });
    ok("save ok", r1 && r1.ok === true, r1);
    let txt = fs.readFileSync(abs, "utf8");
    ok("brace-balanced", balanced(txt), txt);
    ok("armor_value now 40", /armor_value\s*=\s*40/.test(txt), txt);
    ok("maximum_speed now 12", /maximum_speed\s*=\s*12/.test(txt), txt);
    ok("old armor_value 30 gone (no duplicate)", !/armor_value\s*=\s*30/.test(txt) && count(txt, /\barmor_value\s*=/g) === 1, txt);
    ok("armor_value not duplicated", count(txt, /\barmor_value\s*=/g) === 1, count(txt, /\barmor_value\s*=/g));
    ok("hardness (unedited extra) preserved", /hardness\s*=\s*0\.8/.test(txt), txt);
    ok("hand-added nova_secret = 77 preserved", /nova_secret\s*=\s*77/.test(txt), txt);
    ok("soft_attack (untouched core) preserved as 5", /soft_attack\s*=\s*5/.test(txt) && count(txt, /\bsoft_attack\s*=/g) === 1, txt);

    console.log("\n=== statsAll WINS over the core mapping for a shared key ===");
    const r2 = await post("/api/equipment/save", { modPath: mod, id: "nova_tank_equipment", statsAll: { soft_attack: 9 } });
    ok("save ok", r2 && r2.ok === true, r2);
    txt = fs.readFileSync(abs, "utf8");
    ok("soft_attack edited to 9 (statsAll wins, no dup)", /soft_attack\s*=\s*9/.test(txt) && count(txt, /\bsoft_attack\s*=/g) === 1, txt);
    ok("still brace-balanced", balanced(txt));

    console.log("\n=== validation + guards ===");
    const r3 = await post("/api/equipment/save", { modPath: mod, id: "nova_tank_equipment", statsAll: { "bad key!": 3, armor_value: "notanumber", hardness: 0.9 } });
    ok("invalid key + non-numeric filtered; valid hardness applied", r3 && r3.ok === true, r3);
    txt = fs.readFileSync(abs, "utf8");
    ok("hardness updated to 0.9", /hardness\s*=\s*0\.9/.test(txt), txt);
    ok("no junk 'bad key' written", !/bad key/.test(txt), txt);
    ok("still brace-balanced at the end", balanced(txt));

    // A zero is a legal value (not falsy-dropped) — armour 0 must write.
    const r4 = await post("/api/equipment/save", { modPath: mod, id: "nova_tank_equipment", statsAll: { armor_value: 0 } });
    txt = fs.readFileSync(abs, "utf8");
    ok("armor_value = 0 writes (legal zero, not dropped)", r4.ok === true && /armor_value\s*=\s*0\b/.test(txt), txt);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nEQUIPMENT-FULLSTAT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
