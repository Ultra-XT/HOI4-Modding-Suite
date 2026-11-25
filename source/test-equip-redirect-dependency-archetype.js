// #equip-redirect-blind-to-dependencies — A BASE MOD'S ARCHETYPE IS NOT A VANILLA FILE TO RACE.
//
// HOI4 merges common/units/equipment alphabetically, so a mod file that sorts BEFORE the file defining an
// archetype makes the game report "Malformed token" and drop the equipment entirely. writeEquipmentToFile
// guards that by redirecting such a write to zz_nova_equipment.txt — correct, and it has its own test.
//
// It skipped the redirect when the archetype was "defined in the mod", and that scan read activeRoot's
// equipment dir ONLY. For an add-on the archetype lives in the BASE MOD, so the answer was always "no" and
// EVERY tier edit on inherited equipment was redirected — to a basename neither root owns, so the
// #dep-equip-preserve seed (which fires when the target is absent from activeRoot and copies the lower
// layer's whole file) had nothing to copy, and the block was rebuilt from the thin field model alone.
//
// Measured on an add-on with one stat edited:
//
//     LOST   priority, visual_level, active, lend_lease_cost, hardness, armor_value
//     …and   the archetype was not carried in either
//
// so the id ends up defined twice across the load order, and the thin copy sorts last and wins. Millennium
// Dawn is the concrete exposure: 454 `archetype =` lines across 22 files, and 24 of its 25 equipment files
// sort before the redirect threshold.
//
// The redirect's premise is simply false for a dependency — the base mod's file loads, so there is no
// vanilla file to race. Sort order still has to hold, so the fix compares basenames rather than waving
// dependencies through, and the checks below spend most of their effort proving the guard STILL FIRES when
// it should.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqdep-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod(deps) {
  const n = "ED" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(path.join(dir, "common", "units", "equipment"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="' + n + '"\nsupported_version="1.19.*"\n' + (deps ? 'dependencies={ "' + deps + '" }\n' : ""));
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return { name: n, dir };
}
const EQ = [
  "equipments = {",
  "\tbm_rifle_equipment = {",
  "\t\tyear = 1918",
  "\t\tis_archetype = yes",
  "\t\ttype = { infantry }",
  "\t\tgroup_by = archetype",
  "\t\tinterface_category = interface_category_land",
  "\t\tdefense = 10",
  "\t\tbuild_cost_ic = 0.5",
  "\t\tresources = { steel = 1 }",
  "\t}",
  "\tbm_rifle_equipment_1 = {",
  "\t\tyear = 1936",
  "\t\tarchetype = bm_rifle_equipment",
  "\t\tpriority = 10",
  "\t\tvisual_level = 0",
  "\t\tactive = yes",
  "\t\tlend_lease_cost = 1",
  "\t\thardness = 0",
  "\t\tarmor_value = 0",
  "\t\tsoft_attack = 3.75",
  "\t}",
  "}",
  "",
].join("\n");
const TIER_FIELDS = ["priority", "visual_level", "active", "lend_lease_cost", "hardness", "armor_value"];

function blockLeaves(txt, id) {
  const m = new RegExp("(^|\\n)\\s*" + id + "\\s*=\\s*\\{").exec(txt);
  if (!m) return null;
  const open = txt.indexOf("{", m.index + m[0].length - 1);
  let d = 0, end = -1;
  for (let i = open; i < txt.length; i++) { const c = txt[i]; if (c === "{") d++; else if (c === "}") { d--; if (!d) { end = i; break; } } }
  const out = new Set();
  for (const mm of txt.slice(open + 1, end).replace(/#.*$/gm, "").matchAll(/([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*("[^"]*"|[^\s{}]+)/g)) out.add(mm[1]);
  return out;
}
const eqDir = (mod) => {
  const d = path.join(mod, "common", "units", "equipment");
  return fs.existsSync(d) ? fs.readdirSync(d).sort() : [];
};
const readEq = (mod, f) => fs.readFileSync(path.join(mod, "common", "units", "equipment", f), "utf8");

let PORT = 49950;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      save: (b) => fetch("http://127.0.0.1:" + PORT + "/api/equipment/save", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    console.log("\n[the corpus] how much inherited equipment this reaches");
    {
      const md = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/common/units/equipment";
      if (fs.existsSync(md)) {
        const files = fs.readdirSync(md).filter((f) => /\.txt$/i.test(f));
        const early = files.filter((f) => f.toLowerCase() < "x_tank_chassis.txt");
        let tiers = 0;
        for (const f of files) tiers += (fs.readFileSync(path.join(md, f), "latin1").match(/^\s*archetype\s*=\s*/gm) || []).length;
        console.log(`  Millennium Dawn: ${files.length} equipment files, ${early.length} sorting before the redirect threshold, ${tiers} tiers`);
        rec("a real base mod's equipment is squarely in range", early.length > 10 && tiers > 100, { files: files.length, early: early.length, tiers });
      } else console.log("  (Millennium Dawn not installed — corpus skipped)");
    }

    // Fixture control: the tier must really carry the fields this test claims get lost.
    const before = blockLeaves(EQ, "bm_rifle_equipment_1");
    rec("fixture: the base mod's tier carries the fields under test",
      TIER_FIELDS.every((k) => before.has(k)), TIER_FIELDS.filter((k) => !before.has(k)));

    api = await serve(createApp());

    console.log("\n[an add-on editing a base mod's tier] nothing is lost");
    {
      const base = mkMod(null);
      fs.writeFileSync(path.join(base.dir, "common", "units", "equipment", "bm_infantry.txt"), EQ);
      const addon = mkMod(base.name);
      const r = await api.save({ modPath: addon.dir, id: "bm_rifle_equipment_1", fileName: "bm_infantry.txt",
        archetype: "bm_rifle_equipment", softAttack: 9.99 });
      rec("the save succeeds", r.ok === true, r);
      rec("…writing the file the caller asked for", r.file === "bm_infantry.txt", r);
      rec("…and not redirecting", eqDir(addon.dir).join() === "bm_infantry.txt", eqDir(addon.dir));
      const txt = readEq(addon.dir, "bm_infantry.txt");
      const after = blockLeaves(txt, "bm_rifle_equipment_1");
      rec("…losing no leaf assignment from the tier",
        [...before].every((k) => after.has(k)), [...before].filter((k) => !after.has(k)));
      rec("…carrying the archetype in with it", !!blockLeaves(txt, "bm_rifle_equipment"), "archetype missing");
      rec("…with the edit actually applied", /soft_attack = 9\.99/.test(txt), "edit lost");
      rec("…and the base mod untouched",
        readEq(base.dir, "bm_infantry.txt") === EQ, "base mod was written to");
    }

    // ⚠️ THE TARGET FILE IS NOT THE ONE YOU SEND. /api/equipment/save overlays onto the equipment's CURRENT
    // record and writes to `cur.fileName` — the client's `fileName` is ignored on this endpoint. My first
    // version of the two cases below posted a `fileName` and asserted against it, which measured nothing.
    // Both fixtures therefore place the equipment in the file they want targeted.
    console.log("\n[the guard must still fire] a vanilla archetype in a file that sorts after the target");
    {
      // infantry_equipment is vanilla's, defined in infantry.txt — which sorts AFTER aa_early.txt.
      const mod = mkMod(null);
      fs.writeFileSync(path.join(mod.dir, "common", "units", "equipment", "aa_early.txt"),
        "equipments = {\n\tzz_my_rifle_1 = {\n\t\tyear = 1936\n\t\tarchetype = infantry_equipment\n\t\tsoft_attack = 5\n\t}\n}\n");
      const r = await api.save({ modPath: mod.dir, id: "zz_my_rifle_1", softAttack: 6 });
      rec("the save succeeds", r.ok === true, r);
      // A NEW block moves; an EDIT of a block the file already defines stays put and is explained instead —
      // moving it would leave the original behind and claim the id twice (#equipment-existing-file-no-redirect).
      // My first version asserted a redirect here and was simply wrong about the contract.
      rec("…an existing block is left where it is", r.file === "aa_early.txt", r);
      rec("…but the doomed filename is called out, naming the fix",
        /Malformed token/.test(String(r.refWarning || "")) && /rename aa_early\.txt/.test(String(r.refWarning || "")),
        r.refWarning || "(none)");
    }

    console.log("\n[sort order still holds] a dependency archetype in a file that sorts after the target");
    {
      const base = mkMod(null);
      // Split the pair: the ARCHETYPE in zz_late.txt, the TIER in aa_early.txt. The tier's own file is the
      // target, and it loads first, so the archetype is still a forward reference and the redirect must fire.
      fs.writeFileSync(path.join(base.dir, "common", "units", "equipment", "zz_late.txt"),
        "equipments = {\n\tbm_rifle_equipment = {\n\t\tyear = 1918\n\t\tis_archetype = yes\n\t\ttype = { infantry }\n\t\tgroup_by = archetype\n\t\tdefense = 10\n\t\tbuild_cost_ic = 0.5\n\t}\n}\n");
      fs.writeFileSync(path.join(base.dir, "common", "units", "equipment", "aa_early.txt"),
        "equipments = {\n\tbm_rifle_equipment_1 = {\n\t\tyear = 1936\n\t\tarchetype = bm_rifle_equipment\n\t\tpriority = 10\n\t\tsoft_attack = 3.75\n\t}\n}\n");
      const addon = mkMod(base.name);
      const r = await api.save({ modPath: addon.dir, id: "bm_rifle_equipment_1", softAttack: 9.99 });
      rec("the save succeeds", r.ok === true, r);
      rec("…and is STILL redirected, because the archetype would load after it",
        r.file === "zz_nova_equipment.txt", r);
      rec("…and says why", /Malformed token/.test(String(r.refWarning || "")), r.refWarning || "(none)");
    }

    console.log("\n[a standalone mod] unchanged");
    {
      const solo = mkMod(null);
      fs.writeFileSync(path.join(solo.dir, "common", "units", "equipment", "bm_infantry.txt"), EQ);
      const r = await api.save({ modPath: solo.dir, id: "bm_rifle_equipment_1", fileName: "bm_infantry.txt",
        archetype: "bm_rifle_equipment", softAttack: 9.99 });
      rec("the save succeeds", r.ok === true, r);
      rec("…in place, with nothing lost",
        eqDir(solo.dir).join() === "bm_infantry.txt"
        && [...before].every((k) => blockLeaves(readEq(solo.dir, "bm_infantry.txt"), "bm_rifle_equipment_1").has(k)),
        eqDir(solo.dir));
    }

    api.stop(); api = null;
    console.log(`\n=== equip redirect dependency archetype: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
