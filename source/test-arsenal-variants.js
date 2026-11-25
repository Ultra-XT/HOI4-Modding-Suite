// Arsenal layer: /api/equipment/variants/all (every country's create_equipment_variant — modular,
// legacy-upgrades, name-only, Nova-managed region, commented-out blocks) + the generic statsAll /
// missions / one_use_only capture on /api/equipment/list. Run: node test-arsenal-variants.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const PORT = 47934;
const BASE = `http://127.0.0.1:${PORT}`;

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-arsenal-"));
fs.mkdirSync(path.join(mod, "history", "countries"), { recursive: true });
fs.mkdirSync(path.join(mod, "common", "units", "equipment"), { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="arsenal test"\n');

// Country file: modular + legacy + name-only variants inside a has_dlc gate, a fully COMMENTED-OUT
// block (regression: it must not swallow its neighbours — MD's SOV file ships this), a Nova-managed
// region (reported from its JSON header as ONE logical entry, not the has_dlc pair), and a date block.
const NOVA_START = "# >>> NOVA equipment variants (managed by Nova — do not edit inside) >>>";
const NOVA_END = "# <<< NOVA equipment variants <<<";
const novaHdr = "# NOVA-VARIANT " + JSON.stringify({ name: "Nova Gunship", chassisType: "mbt_hull_0", modules: { main_slot: "gun_a" }, dlc: "No Step Back", icon: "", obsolete: false });
fs.writeFileSync(path.join(mod, "history", "countries", "TST - Testland.txt"), [
  "capital = 1",
  "",
  NOVA_START,
  novaHdr,
  "if = {",
  '\tlimit = { has_dlc = "No Step Back" }',
  "\tcreate_equipment_variant = {",
  '\t\tname = "Nova Gunship"',
  "\t\ttype = mbt_hull_0",
  "\t\tmodules = { main_slot = gun_a }",
  "\t}",
  "}",
  NOVA_END,
  "",
  "if = {",
  '\tlimit = { has_dlc = "No Step Back" }',
  "\tcreate_equipment_variant = {",
  '\t\tname = "AH-9 Testcopter"',
  "\t\ttype = heavy_tank_chassis_0",
  "\t\tparent_version = 2",
  "\t\tmodules = {",
  "\t\t\tchassis_type_slot = helicopter_light_chassis",
  "\t\t\tengine_type_slot = turbine_gen1",
  "\t\t}",
  "\t\tobsolete = yes",
  '\t\ticon = "gfx/interface/technologies/TST/AH9.dds"',
  "\t}",
  "\t#create_equipment_variant = {",
  '\t\t#name = "Ghost Rifle" #commented out',
  "\t\t#type = infantry_weapons1",
  "\t\t#upgrades = {",
  "\t\t#\tInf_eq_gadjets = 4",
  "\t\t#}",
  "\t#}",
  "\tcreate_equipment_variant = {",
  '\t\tname = "TST M4 Carbine"',
  "\t\ttype = infantry_weapons3",
  "\t\tupgrades = {",
  "\t\t\tInf_eq_gadjets = 2",
  "\t\t\tInf_eq_heavy_weapons = 1",
  "\t\t}",
  "\t}",
  "\tcreate_equipment_variant = {",
  '\t\tname = "Armored Train Alpha"',
  "\t\ttype = train_equipment_1",
  "\t\tmark_older_equipment_obsolete = yes",
  "\t}",
  "}",
  "",
  "1936.1.1 = {",
  '\tadd_political_power = 10',
  "}",
  "",
].join("\n"));

// Exotic equipment: statsAll must capture EVERY top-level numeric (incl. @var indirection + keys Nova
// has never seen), never leak nested-block numbers (resources), and skip structural keys (year).
fs.writeFileSync(path.join(mod, "common", "units", "equipment", "exotic.txt"), [
  "@rng = 777",
  "equipments = {",
  "\tplasma_drone_equipment_1 = {",
  "\t\tyear = 1970",
  "\t\ttype = strategic_bomber",
  "\t\tweird_range = @rng",
  "\t\tplasma_damage = 42.5",
  "\t\tinterface_overview_category_index = 3",
  "\t\tdefault_carrier_composition_weight = 5",
  "\t\tbuild_cost_ic = 9",
  "\t\tone_use_only = yes",
  "\t\tallow_mission_type = { sam_mission }",
  "\t\tresources = {",
  "\t\t\taluminium = 3",
  "\t\t}",
  "\t}",
  "}",
].join("\n"));

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  try {
    console.log("=== /api/equipment/variants/all ===");
    const j = await fetch(`${BASE}/api/equipment/variants/all?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    ok("ok:true", j && j.ok === true, j && j.error);
    const tst = (j.variants || []).filter((v) => v.tag === "TST");
    ok("TST has exactly 4 logical variants (3 raw + 1 Nova header; pair + commented block not double-counted)", tst.length === 4, tst.map((v) => v.name));
    const heli = tst.find((v) => v.name === "AH-9 Testcopter");
    ok("modular variant parsed (type/parent_version/modules/obsolete/icon)",
      heli && heli.type === "heavy_tank_chassis_0" && heli.parentVersion === 2 &&
      heli.modules && heli.modules.chassis_type_slot === "helicopter_light_chassis" &&
      heli.obsolete === true && /AH9\.dds$/.test(heli.icon), heli);
    const rifle = tst.find((v) => v.name === "TST M4 Carbine");
    ok("legacy variant parsed (numeric upgrades, no modules)",
      rifle && rifle.upgrades && rifle.upgrades.Inf_eq_gadjets === 2 && rifle.upgrades.Inf_eq_heavy_weapons === 1 && !rifle.modules, rifle);
    const train = tst.find((v) => v.name === "Armored Train Alpha");
    ok("name-only variant parsed (mark_older_equipment_obsolete, no modules/upgrades)",
      train && train.markOlderObsolete === true && !train.modules && !train.upgrades, train);
    ok("commented-out 'Ghost Rifle' was NOT parsed", !tst.some((v) => /Ghost/.test(v.name)));
    const nova = tst.find((v) => v.novaManaged);
    ok("Nova-managed region reported as ONE logical entry", nova && nova.name === "Nova Gunship" && nova.type === "mbt_hull_0", nova);
    ok("all TST variants editable (active non-game root) + source mod", tst.every((v) => v.editable && v.source === "mod"));
    const roster = (j.countries || []).find((c) => c.tag === "TST");
    ok("countries roster has TST with count 4", roster && roster.count === 4, roster);

    console.log("=== in-place edit endpoints ===");
    const rifle2 = tst.find((v) => v.name === "TST M4 Carbine");
    const upd = await fetch(`${BASE}/api/equipment/variant/update`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: mod, file: rifle2.file, blockIdx: rifle2.blockIdx, expect: { name: rifle2.name, type: rifle2.type }, set: { name: "TST M4A1", obsolete: true, upgrades: { Inf_eq_gadjets: 4 } } }),
    }).then((r) => r.json());
    ok("update ok", upd && upd.ok === true, upd && upd.error);
    const after = fs.readFileSync(path.join(mod, "history", "countries", "TST - Testland.txt"), "utf8");
    ok("rename + obsolete + upgrade landed; gate/date intact",
      /name = "TST M4A1"/.test(after) && /obsolete = yes/.test(after) && /Inf_eq_gadjets = 4/.test(after)
      && /has_dlc = "No Step Back"/.test(after) && /1936\.1\.1/.test(after), after.slice(0, 200));
    const staleUpd = await fetch(`${BASE}/api/equipment/variant/update`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: mod, file: rifle2.file, blockIdx: rifle2.blockIdx, expect: { name: "TST M4 Carbine", type: rifle2.type }, set: { name: "X" } }),
    }).then((r) => r.json());
    ok("stale expect (old name) is refused — never rewrites the wrong block", staleUpd && staleUpd.ok === false, staleUpd);
    const j2 = await fetch(`${BASE}/api/equipment/variants/all?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const train2 = j2.variants.find((v) => v.name === "Armored Train Alpha");
    const del = await fetch(`${BASE}/api/equipment/variant/remove-block`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: mod, file: train2.file, blockIdx: train2.blockIdx, expect: { name: train2.name, type: train2.type } }),
    }).then((r) => r.json());
    const afterDel = fs.readFileSync(path.join(mod, "history", "countries", "TST - Testland.txt"), "utf8");
    ok("remove-block deletes it, neighbours + balance intact", del && del.ok === true && !/Armored Train Alpha/.test(afterDel)
      && /TST M4A1/.test(afterDel) && (afterDel.match(/{/g) || []).length === (afterDel.match(/}/g) || []).length, del);
    const mk = await fetch(`${BASE}/api/equipment/variant/create-simple`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: mod, tag: "GER", name: "Plasma Drone Ace", type: "plasma_drone_equipment_1" }),
    }).then((r) => r.json());
    const gerF = fs.readdirSync(path.join(mod, "history", "countries")).find((f) => /^GER/i.test(f));
    ok("create-simple: country file created with the named variant", mk && mk.ok === true && !!gerF
      && /Plasma Drone Ace/.test(fs.readFileSync(path.join(mod, "history", "countries", gerF), "utf8")), mk);
    const dup = await fetch(`${BASE}/api/equipment/variant/create-simple`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: mod, tag: "GER", name: "Plasma Drone Ace", type: "plasma_drone_equipment_1" }),
    }).then((r) => r.json());
    ok("create-simple rejects a duplicate name for the same country", dup && dup.ok === false, dup);
    const arch = await fetch(`${BASE}/api/equipment/variant/create-simple`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: mod, tag: "GER", name: "Bad", type: "qa_nonexistent_equipment" }),
    }).then((r) => r.json());
    ok("create-simple rejects an unknown base equipment", arch && arch.ok === false, arch);
    // Data-safety: a name with a raw newline or CR must NOT corrupt the file (it would split the name= line).
    //
    // #name-sanitize-deletes-a-legal-hash — a TAB and a `#` are NOT stripped any more. Both are legal inside a
    // quoted Clausewitz string and vanilla ships one in this very field: `version_name = "FT mod. #31"` in
    // history/units/AFG_1936_nsb.txt. cleanVarName here and qstr in unit-data.js carried the identical
    // character class and the identical stale justification — that Nova's brace checker would read the hash
    // as a comment. It has not since braceBalanceOf learned about strings, and the write guard beside it now
    // knows too. #brace-guard-reads-a-quoted-hash-as-a-comment
    const nasty = await fetch(`${BASE}/api/equipment/variant/create-simple`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: mod, tag: "FRA", name: "Evil\nLine\tTwo\r3 \"q\" {b} #h", type: "plasma_drone_equipment_1" }),
    }).then((r) => r.json());
    const fraFile = fs.readdirSync(path.join(mod, "history", "countries")).find((f) => /^FRA/i.test(f));
    const fraText = fraFile ? fs.readFileSync(path.join(mod, "history", "countries", fraFile), "utf8") : "";
    const wantVariant = 'name = "EvilLine' + "\t" + 'Two3 q b #h"';
    ok("newline/CR/quote/brace stripped from a variant name, but a legal # and tab kept — file stays balanced",
      nasty && nasty.ok === true && fraText.includes(wantVariant)
      && !/name\s*=\s*"[^"]*\n[^"]*"/.test(fraText)
      && (fraText.match(/{/g) || []).length === (fraText.match(/}/g) || []).length,
      { ok: nasty && nasty.ok, want: wantVariant, snippet: fraText.slice(0, 120) });

    console.log("=== generic statsAll on /api/equipment/list ===");
    const l = await fetch(`${BASE}/api/equipment/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const drone = (l.equipment || []).find((e) => e.id === "plasma_drone_equipment_1");
    ok("exotic equipment found", !!drone);
    ok("statsAll captures never-seen keys (plasma_damage=42.5)", drone && drone.statsAll && drone.statsAll.plasma_damage === 42.5, drone && drone.statsAll);
    ok("statsAll resolves @var indirection (weird_range=777)", drone && drone.statsAll.weird_range === 777, drone && drone.statsAll);
    ok("statsAll does NOT leak nested resources (no aluminium key)", drone && !("aluminium" in drone.statsAll), drone && drone.statsAll);
    ok("statsAll excludes structural year", drone && !("year" in drone.statsAll), drone && drone.statsAll);
    ok("statsAll excludes UI/AI structural fields (interface_overview_category_index, default_carrier_composition_weight)",
      drone && !("interface_overview_category_index" in drone.statsAll) && !("default_carrier_composition_weight" in drone.statsAll), drone && drone.statsAll);
    ok("missions + one_use_only captured", drone && (drone.missions || []).includes("sam_mission") && drone.oneUseOnly === true, drone && { m: drone.missions, o: drone.oneUseOnly });

    console.log("=== air family creation with assigned roles ===");
    const airFam = await fetch(`${BASE}/api/equipment/family`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: mod, id: "nova_test_drone_equipment", name: "Test Drone", domain: "air", type: "cas", tierCount: 2, year: 1985, air_attack: 6, air_range: 1200, missions: ["cas", "strategic_bomber", "recon", "not_a_real_mission"] }),
    }).then((r) => r.json());
    ok("air family created; domain=air; invalid mission dropped, order kept",
      airFam && airFam.ok === true && airFam.domain === "air" && JSON.stringify(airFam.missions) === JSON.stringify(["cas", "strategic_bomber", "recon"]), airFam);
    const airFile = fs.readFileSync(path.join(mod, "common", "units", "equipment", airFam.file), "utf8");
    ok("air archetype well-formed (allow_mission_type, interface_air, type, brace-balanced)",
      /allow_mission_type = \{/.test(airFile) && /interface_category = interface_category_air/.test(airFile)
      && /type = cas/.test(airFile) && !/not_a_real_mission/.test(airFile)
      && (airFile.match(/{/g) || []).length === (airFile.match(/}/g) || []).length, airFile.slice(0, 160));
    const l2 = await fetch(`${BASE}/api/equipment/list?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const scannedDrone = l2.equipment.find((e) => e.id === "nova_test_drone_equipment");
    ok("air archetype scans back with its missions + planes designer",
      scannedDrone && JSON.stringify(scannedDrone.missions) === JSON.stringify(["cas", "strategic_bomber", "recon"]) && scannedDrone.designer === "planes", scannedDrone && { m: scannedDrone.missions, d: scannedDrone.designer });
    const noRole = await fetch(`${BASE}/api/equipment/family`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: mod, id: "nova_test_scout_equipment", name: "Scout", domain: "air", type: "scout_plane", tierCount: 1, missions: [] }),
    }).then((r) => r.json());
    const noRoleFile = fs.readFileSync(path.join(mod, "common", "units", "equipment", noRole.file), "utf8");
    ok("no roles picked → safe default, never an empty allow_mission_type block",
      noRole && noRole.ok === true && (noRole.missions || []).length === 1 && !/allow_mission_type = \{\s*\}/.test(noRoleFile), noRole);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nARSENAL-VARIANTS: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
