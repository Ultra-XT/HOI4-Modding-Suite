// Custom equipment MODULE writer: create/edit an equipment_modules entry (the guns/engines/armour parts)
// in a mod-owned common/units/equipment/modules/*.txt. Upsert by id, preserve un-modeled keys, brace-guard,
// mod-owned only. Run: node test-equipment-module.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const balanced = (s) => (s.replace(/#.*$/gm, "").match(/{/g) || []).length === (s.replace(/#.*$/gm, "").match(/}/g) || []).length;

(async () => {
  const PORT = 3946, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqmod-"));
  const mk = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  mk("descriptor.mod", 'name="Nova Equipment Module Test"\n');
  const REL = "common/units/equipment/modules/nova_custom_modules.txt";
  const abs = path.join(mod, REL);
  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

  try {
    console.log("=== create a new module (file doesn't exist yet) ===");
    const r1 = await post("/api/equipment/module", {
      modPath: mod, id: "nova_super_engine", category: "tank_engine_type", gui_category: "tank_engine",
      abbreviation: "nse", add_stats: { maximum_speed: 5, build_cost_ic: 2 }, multiply_stats: { reliability: 0.1 },
    });
    ok("create ok", r1 && r1.ok === true && r1.id === "nova_super_engine", r1);
    ok("file created", fs.existsSync(abs));
    let txt = fs.readFileSync(abs, "utf8");
    ok("has equipment_modules wrapper", /equipment_modules\s*=\s*\{/.test(txt), txt);
    ok("module id present", /nova_super_engine\s*=\s*\{/.test(txt), txt);
    ok("category written", /category\s*=\s*tank_engine_type/.test(txt), txt);
    ok("gui_category written", /gui_category\s*=\s*tank_engine/.test(txt), txt);
    ok("abbreviation written", /abbreviation\s*=\s*"nse"/.test(txt), txt);
    ok("add_stats written", /add_stats\s*=\s*\{[\s\S]*maximum_speed\s*=\s*5[\s\S]*build_cost_ic\s*=\s*2[\s\S]*\}/.test(txt), txt);
    ok("multiply_stats written", /multiply_stats\s*=\s*\{[\s\S]*reliability\s*=\s*0\.1[\s\S]*\}/.test(txt), txt);
    ok("brace-balanced", balanced(txt), txt);

    console.log("\n=== scan picks up the new module (round-trip) ===");
    const scan = await fetch(`${BASE}/api/equipment/modules?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    ok("scan finds it in its category", scan.ok === true && (scan.byCategory.tank_engine_type || []).some((m) => m.id === "nova_super_engine"), scan && scan.count);

    console.log("\n=== edit the module in place, preserving an un-modeled key ===");
    // hand-inject un-modeled statements the writer doesn't emit, to prove preserve-merge. Both a NESTED block
    // (can_convert_from) and the FLAT scalars real vanilla modules carry (parent 111x, xp_cost 154x,
    // dismantle_cost_ic 130x, gfx 42x, add_equipment_type 47x) — a nested-only filter silently dropped the flats,
    // knocking a re-saved module out of its upgrade chain and losing its designer icon. #module-preserve
    // gfx is NO LONGER in this list — it became a modeled/owned key when the module maker gained a picture
    // field (#module-gfx), so it follows owned-key semantics (asserted separately below), not preserve-as-unmodeled.
    txt = fs.readFileSync(abs, "utf8").replace(/(nova_super_engine\s*=\s*\{)/, "$1\n\t\tcan_convert_from = { module_category = tank_engine_type convert_cost_ic = 0.5 }\n\t\tparent = nova_base_engine\n\t\txp_cost = 5\n\t\tdismantle_cost_ic = 2\n\t\tadd_equipment_type = { medium_tank }");
    fs.writeFileSync(abs, txt, "utf8");
    const r2 = await post("/api/equipment/module", {
      modPath: mod, id: "nova_super_engine", category: "tank_engine_type", gui_category: "tank_engine",
      abbreviation: "nse", add_stats: { maximum_speed: 9 }, multiply_stats: {},
    });
    txt = fs.readFileSync(abs, "utf8");
    ok("edit ok", r2.ok === true, r2);
    ok("speed updated to 9, old 5 gone", /maximum_speed\s*=\s*9\b/.test(txt) && !/maximum_speed\s*=\s*5\b/.test(txt), txt);
    ok("old build_cost_ic dropped (add_stats replaced)", !/build_cost_ic/.test(txt), txt);
    ok("multiply_stats cleared (emitted empty)", /multiply_stats\s*=\s*\{\s*\}/.test(txt) && !/reliability/.test(txt), txt);
    ok("un-modeled can_convert_from PRESERVED", /can_convert_from\s*=\s*\{[\s\S]*convert_cost_ic\s*=\s*0\.5/.test(txt), txt);
    ok("un-modeled FLAT scalars PRESERVED (parent/xp_cost/dismantle_cost_ic) — real vanilla modules carry these", /parent\s*=\s*nova_base_engine/.test(txt) && /xp_cost\s*=\s*5\b/.test(txt) && /dismantle_cost_ic\s*=\s*2\b/.test(txt), txt);
    ok("un-modeled add_equipment_type block PRESERVED", /add_equipment_type\s*=\s*\{\s*medium_tank\s*\}/.test(txt), txt);
    ok("still exactly one module block for the id", (txt.match(/nova_super_engine\s*=\s*\{/g) || []).length === 1, txt);
    ok("edit brace-balanced", balanced(txt), txt);

    console.log("\n=== CLEARING a managed optional scalar (gui_category / abbreviation) stays cleared ===");
    // regression: mergePreservedModuleBlock used to re-add a cleared flat scalar from the old block.
    const r2b = await post("/api/equipment/module", {
      modPath: mod, id: "nova_super_engine", category: "tank_engine_type", gui_category: "", abbreviation: "",
      add_stats: { maximum_speed: 9 }, multiply_stats: {},
    });
    txt = fs.readFileSync(abs, "utf8");
    ok("cleared gui_category + abbreviation are GONE (not resurrected)", r2b.ok === true && !/gui_category/.test(txt) && !/abbreviation/.test(txt), txt);
    ok("but the un-modeled nested can_convert_from still survives + balanced", /can_convert_from\s*=\s*\{/.test(txt) && balanced(txt), txt);

    console.log("\n=== add a SECOND module to the same file (existing block, new id) ===");
    const r3 = await post("/api/equipment/module", { modPath: mod, id: "nova_big_gun", category: "tank_main_gun_type", add_stats: { soft_attack: 12 }, multiply_stats: {} });
    txt = fs.readFileSync(abs, "utf8");
    ok("second module added", r3.ok === true && /nova_big_gun\s*=\s*\{/.test(txt), r3);
    ok("first module still present", /nova_super_engine\s*=\s*\{/.test(txt), txt);
    ok("one equipment_modules wrapper (not duplicated)", (txt.match(/equipment_modules\s*=\s*\{/g) || []).length === 1, txt);
    ok("two-module file brace-balanced", balanced(txt), txt);

    console.log("\n=== guards ===");
    const bad1 = await post("/api/equipment/module", { modPath: mod, id: "9bad", category: "tank_engine_type", add_stats: {}, multiply_stats: {} });
    ok("leading-digit id rejected", bad1.ok === false, bad1);
    const bad2 = await post("/api/equipment/module", { modPath: mod, id: "nova_x", category: "", add_stats: {}, multiply_stats: {} });
    ok("empty category rejected", bad2.ok === false, bad2);
    const bad3 = await post("/api/equipment/module", { modPath: mod, id: "nova_x", category: "bad cat!", add_stats: {}, multiply_stats: {} });
    ok("non-token category rejected", bad3.ok === false, bad3);
    // injection-shaped stat key + non-numeric value are dropped, never written as script
    const r4 = await post("/api/equipment/module", { modPath: mod, id: "nova_clean", category: "tank_engine_type", add_stats: { "x = 1 } evil": 3, maximum_speed: "notnum", defense: 4 }, multiply_stats: {} });
    txt = fs.readFileSync(abs, "utf8");
    ok("injection stat key dropped, non-numeric dropped, good one kept", r4.ok === true && !/evil/.test(txt) && !/notnum/.test(txt) && /defense\s*=\s*4/.test(txt) && balanced(txt), txt);
    // game-root guard
    const gameRoot = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const bad4 = await post("/api/equipment/module", { modPath: gameRoot, id: "nova_x", category: "tank_engine_type", add_stats: {}, multiply_stats: {} });
    ok("game-root write rejected", bad4.ok === false, bad4);
    ok("final file still brace-balanced", balanced(fs.readFileSync(abs, "utf8")));

    console.log("\n=== fileName without .txt gets normalized (round-4/5): HOI4 only loads *.txt from modules/ ===");
    // A caller-supplied fileName with no extension must NOT write an invisible file the game never loads and the
    // scanner never re-reads (the three sibling writers already normalize; the module writer was the odd one out).
    const rExt = await post("/api/equipment/module", { modPath: mod, id: "nova_named_file_mod", category: "tank_engine_type", fileName: "my_modules", add_stats: { maximum_speed: 3 }, multiply_stats: {} });
    ok("save ok with extension-less fileName", rExt.ok === true, rExt);
    ok("written as my_modules.txt (extension appended)", rExt.file === "my_modules.txt" && fs.existsSync(path.join(mod, "common/units/equipment/modules/my_modules.txt")), rExt);
    ok("NO extension-less file created", !fs.existsSync(path.join(mod, "common/units/equipment/modules/my_modules")), "leaked extension-less file");
    const scanExt = await fetch(`${BASE}/api/equipment/modules?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    ok("scanner (which filters .txt) re-reads the module from the normalized file", scanExt.ok === true && (scanExt.byCategory.tank_engine_type || []).some((m) => m.id === "nova_named_file_mod"), scanExt && scanExt.count);
    // an EXPLICIT .txt fileName is preserved unchanged (no double extension)
    const rExt2 = await post("/api/equipment/module", { modPath: mod, id: "nova_explicit_txt", category: "tank_engine_type", fileName: "explicit.txt", add_stats: { maximum_speed: 3 }, multiply_stats: {} });
    ok("explicit .txt kept as-is (no .txt.txt)", rExt2.file === "explicit.txt" && fs.existsSync(path.join(mod, "common/units/equipment/modules/explicit.txt")), rExt2);

    // --- gfx: a made-from-scratch module can carry its OWN designer icon (#module-gfx). It's optional —
    // most real modules set none and inherit their category's icon — but when set it must be written.
    const gfxFile = path.join(mod, "common/units/equipment/modules/nova_custom_modules.txt");
    const rGfx = await post("/api/equipment/module", { modPath: mod, id: "nova_laser_module", category: "satellite_laser_type", gfx: "ship_heavy_battery_5", add_stats: { air_attack: 40 }, multiply_stats: {} });
    ok("module with gfx accepted", rGfx && rGfx.ok === true, rGfx);
    const gfxTxt = fs.readFileSync(gfxFile, "utf8");
    ok("...gfx is written to the file", /\bgfx\s*=\s*ship_heavy_battery_5\b/.test(gfxTxt), gfxTxt.slice(gfxTxt.indexOf("nova_laser_module"), gfxTxt.indexOf("nova_laser_module") + 220));
    // a FULL sprite key (GFX_SMI_x) must be stored as the bare token that `gfx =` expects
    const rGfx2 = await post("/api/equipment/module", { modPath: mod, id: "nova_beam_module", category: "satellite_laser_type", gfx: "GFX_SMI_ship_torpedo_1", add_stats: { air_attack: 20 }, multiply_stats: {} });
    ok("a full GFX_ key is stripped to the bare gfx token", rGfx2 && rGfx2.ok === true && /\bgfx\s*=\s*ship_torpedo_1\b/.test(fs.readFileSync(gfxFile, "utf8")), fs.readFileSync(gfxFile, "utf8").match(/nova_beam_module[\s\S]{0,180}/));
    // no gfx = no gfx line (it must stay optional, not write `gfx = undefined`)
    const rNo = await post("/api/equipment/module", { modPath: mod, id: "nova_plain_module", category: "satellite_laser_type", add_stats: { air_attack: 5 }, multiply_stats: {} });
    const plainBlock = (() => { const t = fs.readFileSync(gfxFile, "utf8"); const i = t.indexOf("nova_plain_module"); const o = t.indexOf("{", i); let d = 0; for (let j = o; j < t.length; j++) { if (t[j] === "{") d++; else if (t[j] === "}") { d--; if (!d) return t.slice(o, j); } } return ""; })();
    ok("a module with no picture writes no gfx line", rNo && rNo.ok === true && !/gfx/.test(plainBlock), plainBlock);
    // gfx survives a re-save (it's in MODULE_OWNED_KEYS now, so re-editing the module keeps it)
    const rReedit = await post("/api/equipment/module", { modPath: mod, id: "nova_laser_module", category: "satellite_laser_type", gfx: "ship_heavy_battery_5", add_stats: { air_attack: 44 }, multiply_stats: {} });
    ok("gfx survives a re-edit of the same module", rReedit && rReedit.ok === true && /nova_laser_module[\s\S]{0,200}gfx\s*=\s*ship_heavy_battery_5/.test(fs.readFileSync(gfxFile, "utf8")), null);
    ok("module file still brace-balanced after all gfx writes", (() => { const t = fs.readFileSync(gfxFile, "utf8").replace(/#.*$/gm, ""); return (t.match(/{/g) || []).length === (t.match(/}/g) || []).length; })());
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nEQUIPMENT-MODULE: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
