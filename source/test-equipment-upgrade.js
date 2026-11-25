// Custom equipment UPGRADE definition writer: create/edit an `upgrades` entry (max_level, cost, stat
// modifiers) in a mod-owned common/units/equipment/upgrades/*.txt. Run: node test-equipment-upgrade.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const balanced = (s) => (s.replace(/#.*$/gm, "").replace(/"[^"]*"/g, '""').match(/{/g) || []).length === (s.replace(/#.*$/gm, "").replace(/"[^"]*"/g, '""').match(/}/g) || []).length;

(async () => {
  const PORT = 3949, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-upg-"));
  const mk = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  mk("descriptor.mod", 'name="Nova Upgrade Test"\n');
  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const upgFile = path.join(mod, "common", "units", "equipment", "upgrades", "nova_custom_upgrades.txt");

  try {
    console.log("=== create a new upgrade (empty file) ===");
    const r1 = await post("/api/equipment/upgrade", { modPath: mod, id: "nova_armor_upgrade", abbreviation: "arm", cost: "land", max_level: 5, stats: { armor_value: 0.1, maximum_speed: -0.02 } });
    ok("upgrade save ok", r1 && r1.ok === true && r1.id === "nova_armor_upgrade" && r1.cost === "land", r1);
    let txt = fs.readFileSync(upgFile, "utf8");
    ok("upgrades wrapper + id block", /upgrades\s*=\s*\{[\s\S]*nova_armor_upgrade = \{/.test(txt), txt);
    ok("max_level + cost + abbreviation", /max_level = 5/.test(txt) && /cost = land/.test(txt) && /abbreviation = "arm"/.test(txt), txt);
    ok("stat modifiers written", /armor_value = 0\.1/.test(txt) && /maximum_speed = -0\.02/.test(txt), txt);
    ok("brace-balanced", balanced(txt), txt);

    console.log("\n=== scan (GET) sees it ===");
    const g = await fetch(`${BASE}/api/equipment/upgrades?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    ok("GET finds it with cost+max_level", g.ok === true && g.upgrades.some((u) => u.id === "nova_armor_upgrade" && u.cost === "land" && u.max_level === 5), g && g.upgrades && g.upgrades.length);

    console.log("\n=== edit in place, preserve an un-modeled nested key ===");
    txt = fs.readFileSync(upgFile, "utf8").replace(/(nova_armor_upgrade = \{\n)/, "$1\t\tlevel_requirements = { 3 = { has_tech = nova_tech } }\n");
    fs.writeFileSync(upgFile, txt, "utf8");
    const r2 = await post("/api/equipment/upgrade", { modPath: mod, id: "nova_armor_upgrade", cost: "land", max_level: 8, stats: { armor_value: 0.15 } });
    txt = fs.readFileSync(upgFile, "utf8");
    ok("edit ok", r2.ok === true, r2);
    ok("max_level updated to 8, armor to 0.15, old speed dropped", /max_level = 8/.test(txt) && /armor_value = 0\.15/.test(txt) && !/maximum_speed/.test(txt), txt);
    ok("un-modeled level_requirements PRESERVED", /level_requirements = \{ 3 = \{ has_tech = nova_tech \} \}/.test(txt), txt);
    ok("one upgrade block for the id", (txt.match(/nova_armor_upgrade = \{/g) || []).length === 1, txt);
    ok("edit brace-balanced", balanced(txt), txt);

    console.log("\n=== a 2nd upgrade in the same file ===");
    const r3 = await post("/api/equipment/upgrade", { modPath: mod, id: "nova_engine_upgrade", cost: "land", max_level: 10, stats: { maximum_speed: 0.05 } });
    txt = fs.readFileSync(upgFile, "utf8");
    ok("second upgrade added, first preserved, one wrapper", r3.ok === true && /nova_engine_upgrade = \{/.test(txt) && /nova_armor_upgrade = \{/.test(txt) && (txt.match(/upgrades\s*=\s*\{/g) || []).length === 1, txt);
    ok("two-upgrade file brace-balanced", balanced(txt), txt);

    console.log("\n=== a mod override of a VANILLA upgrade id wins (last-wins, not first-wins) ===");
    // plane_gun_upgrade exists in vanilla air_upgrades.txt (max_level 5). The mod redefines it at 3 → the mod wins.
    await post("/api/equipment/upgrade", { modPath: mod, id: "plane_gun_upgrade", cost: "air", max_level: 3, stats: { air_attack: 0.2 } });
    const gz = await fetch(`${BASE}/api/equipment/upgrades?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const pg = gz.ok && (gz.upgrades || []).find((u) => u.id === "plane_gun_upgrade");
    ok("mod's plane_gun_upgrade shadows vanilla (max_level 3, not vanilla 5)", !!pg && pg.max_level === 3, pg);

    console.log("\n=== guards ===");
    const bad1 = await post("/api/equipment/upgrade", { modPath: mod, id: "9bad", cost: "land", max_level: 5, stats: { armor_value: 0.1 } });
    ok("leading-digit id rejected", bad1.ok === false, bad1);
    const bad2 = await post("/api/equipment/upgrade", { modPath: mod, id: "nova_x", cost: "space", max_level: 5, stats: { armor_value: 0.1 } });
    ok("invalid cost type rejected", bad2.ok === false, bad2);
    const bad3 = await post("/api/equipment/upgrade", { modPath: mod, id: "nova_y", cost: "land", max_level: 5, stats: {} });
    ok("no stats rejected", bad3.ok === false, bad3);
    const r4 = await post("/api/equipment/upgrade", { modPath: mod, id: "nova_clean", cost: "air", max_level: 5, stats: { "x = 1 } evil": 3, air_attack: "notnum", reliability: -0.1 } });
    txt = fs.readFileSync(upgFile, "utf8");
    ok("injection stat key + non-numeric dropped, good kept", r4.ok === true && !/evil/.test(txt) && !/notnum/.test(txt) && /reliability = -0\.1/.test(txt) && balanced(txt), txt);
    const gameRoot = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const bad4 = await post("/api/equipment/upgrade", { modPath: gameRoot, id: "nova_x", cost: "land", max_level: 5, stats: { armor_value: 0.1 } });
    ok("game-root write rejected", bad4.ok === false, bad4);
    ok("final file brace-balanced", balanced(fs.readFileSync(upgFile, "utf8")));

    console.log("\n=== a commented-out `upgrades = {` before the real block does NOT drop the file's upgrades (round-6) ===");
    // A doc header / commented-out old block containing the literal 'upgrades = {' used to hijack the bare
    // first-match regex and (via a mis-counted brace) silently drop EVERY real upgrade in the file.
    mk("common/units/equipment/upgrades/commented.txt",
      '# format reference:\n' +
      '# upgrades = {\n' +
      '#   old_thing = { max_level = 2 cost = land }\n' +
      '# }\n' +
      'upgrades = {\n' +
      '\tnova_commented_upgrade = { max_level = 4 cost = land armor_value = 0.05 }\n' +
      '}\n');
    const gc = await fetch(`${BASE}/api/equipment/upgrades?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    ok("the real upgrade after a commented `upgrades = {` is still scanned", gc.ok === true && (gc.upgrades || []).some((u) => u.id === "nova_commented_upgrade" && u.max_level === 4 && u.cost === "land"), gc && gc.upgrades && gc.upgrades.map((u) => u.id));
    ok("the COMMENTED-out old_thing upgrade is NOT scanned as real", !(gc.upgrades || []).some((u) => u.id === "old_thing"), gc && gc.upgrades && gc.upgrades.map((u) => u.id));

    console.log("\n=== SAME-FILENAME replacement (round-10): re-shipping a vanilla upgrades filename deletes its upgrades ===");
    // HOI4: a mod file with a vanilla BASENAME replaces the vanilla file outright (no replace_path needed), so
    // upgrades the mod's file dropped must NOT still be offered. Vanilla's land_upgrades.txt defines
    // mech_cost_upgrade; this mod re-ships land_upgrades.txt WITHOUT it → it must disappear from the scan.
    const gBefore = await fetch(`${BASE}/api/equipment/upgrades?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const hadVanillaLand = (gBefore.upgrades || []).some((u) => u.id === "mech_cost_upgrade");
    mk("common/units/equipment/upgrades/land_upgrades.txt", "upgrades = {\n\tnova_only_land_upg = { max_level = 2 cost = land armor_value = 1 }\n}\n");
    const gAfter = await fetch(`${BASE}/api/equipment/upgrades?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    ok("precondition: vanilla's land_upgrades.txt supplied mech_cost_upgrade before the mod shadowed it", hadVanillaLand, (gBefore.upgrades || []).length);
    ok("mod's own upgrade in the shadowing file IS scanned", (gAfter.upgrades || []).some((u) => u.id === "nova_only_land_upg"), (gAfter.upgrades || []).map((u) => u.id).slice(0, 8));
    ok("vanilla upgrades from the REPLACED land_upgrades.txt are GONE (mech_cost_upgrade)", !(gAfter.upgrades || []).some((u) => u.id === "mech_cost_upgrade"), (gAfter.upgrades || []).filter((u) => u.file === "land_upgrades.txt").map((u) => u.id));
    ok("vanilla upgrades from a NON-shadowed file still load (air_upgrades.txt untouched)", (gAfter.upgrades || []).some((u) => u.file === "air_upgrades.txt"), (gAfter.upgrades || []).map((u) => u.file).filter((v, i, a) => a.indexOf(v) === i));
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nEQUIPMENT-UPGRADE: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
