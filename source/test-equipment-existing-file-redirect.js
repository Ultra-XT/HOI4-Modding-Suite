// #equipment-existing-file-no-redirect — A WEAPON ADDED TO A FILE THE MOD ALREADY OWNED WAS DROPPED BY THE
// GAME, SILENTLY.
//
// Ground truth (#equipment-load-order): HOI4 merges common/units/equipment across the base game and every
// mod and reads the result ALPHABETICALLY. `archetype = infantry_equipment` written into a file that sorts
// before vanilla's infantry.txt is a forward reference — the game logs "Malformed token: infantry_equipment"
// and drops the equipment. Nova already redirects such a write to zz_nova_equipment.txt…
//
// …but only when the target file did NOT exist yet. The reasoning ("a file already on disk keeps its name")
// is right for a block the file ALREADY defines — moving that would leave the original behind and claim the
// id twice — and wrong for a NEW one. A mod that owns a custom_equipment.txt from an older Nova, or made one
// by hand, is exactly the case the guard exists for, and every weapon added to it was dead in game with
// nothing said. Now: a new block moves, an edit stays put and the user is told the file is doomed and how to
// fix it. Either way they hear about it, which is the part that was missing.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqredir-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const MOD = path.join(ROOT, "eqredir");
const EQDIR = path.join(MOD, "common", "units", "equipment");
fs.mkdirSync(EQDIR, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EqRedir"\nsupported_version="1.19.*"\n', "utf8");

const read = (f) => { try { return fs.readFileSync(path.join(EQDIR, f), "utf8"); } catch (_) { return ""; } };
const defines = (f, id) => new RegExp(`(^|\\n)\\s*${id}\\s*=\\s*\\{`).test(read(f));

const PORT = 43323;
const app = createApp();
const srv = app.listen(PORT, async () => {
  // /api/technologies/save is the caller that reaches writeEquipmentToFile with a CALLER-CHOSEN filename —
  // it is what public/research.js drives, and the path the audit-mod sweep found this on. (/api/equipment/save
  // is an EDIT endpoint: it looks the equipment up and reuses its existing fileName.)
  let techN = 0;
  const save = ({ relativeFile, equipment }) => fetch(`http://127.0.0.1:${PORT}/api/technologies/save`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      modPath: MOD,
      tech: {
        id: `nv_tech_${++techN}`, isMod: true, fileName: "nova_tech.txt", research_cost: 1,
        folder: [{ name: "infantry_folder", position: { x: 0, y: 0 } }],
        enable_equipments: [equipment.id],
      },
      equipment: Object.assign({ fileName: relativeFile }, equipment),
    }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[ground truth] the alphabetical hazard is real in the shipping base game");
    const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/units/equipment";
    let vfiles = [];
    try { vfiles = fs.readdirSync(V).filter((f) => /\.txt$/i.test(f)).sort(); } catch (_) {}
    rec("vanilla's equipment directory was readable", vfiles.length > 20, vfiles.length);
    const infFile = vfiles.find((f) => /(^|\n)\s*infantry_equipment\s*=\s*\{/.test(fs.readFileSync(path.join(V, f), "utf8")));
    rec("infantry_equipment is defined in infantry.txt", infFile === "infantry.txt", infFile);
    rec("…and custom_equipment.txt would sort before it", "custom_equipment.txt" < String(infFile), infFile);
    rec("…while Nova's default sorts after every vanilla file",
      "zz_nova_equipment.txt" > String(vfiles[vfiles.length - 1]), vfiles[vfiles.length - 1]);

    console.log("\n[already covered] a NEW badly-sorted file is redirected");
    let r = await save({
      relativeFile: "custom_equipment.txt",
      equipment: { id: "nv_rifle_a", archetype: "infantry_equipment", year: 1936 },
    });
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and it went to zz_nova_equipment.txt", defines("zz_nova_equipment.txt", "nv_rifle_a"), read("zz_nova_equipment.txt"));

    console.log("\n[the bug] the file now EXISTS — a second weapon must still not be written into it");
    // Make the doomed file real, exactly as an older Nova or a hand edit would leave it.
    fs.writeFileSync(path.join(EQDIR, "custom_equipment.txt"),
      "equipments = {\n\tnv_legacy_gun = {\n\t\tarchetype = infantry_equipment\n\t\tyear = 1936\n\t}\n}\n", "utf8");
    r = await save({
      relativeFile: "custom_equipment.txt",
      equipment: { id: "nv_rifle_b", archetype: "infantry_equipment", year: 1938 },
    });
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("the new weapon was NOT written into the doomed file", !defines("custom_equipment.txt", "nv_rifle_b"),
      read("custom_equipment.txt"));
    rec("…it went to the safe file instead", defines("zz_nova_equipment.txt", "nv_rifle_b"), read("zz_nova_equipment.txt"));
    rec("…and the file's existing content was left alone", defines("custom_equipment.txt", "nv_legacy_gun"),
      read("custom_equipment.txt"));
    rec("…and the user was told why", /alphabetically/i.test(String(r.b.warning || r.b.refWarning || r.b.note || "")),
      r.b);

    console.log("\n[the other half] EDITING a block the doomed file already defines stays put — and warns");
    r = await save({
      relativeFile: "custom_equipment.txt",
      equipment: { id: "nv_legacy_gun", archetype: "infantry_equipment", year: 1940 },
    });
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("the edit stayed in the file that already defined it", defines("custom_equipment.txt", "nv_legacy_gun"),
      read("custom_equipment.txt"));
    rec("…and was NOT duplicated into the safe file", !defines("zz_nova_equipment.txt", "nv_legacy_gun"),
      read("zz_nova_equipment.txt"));
    rec("…and the user was told the file is doomed and how to fix it",
      /Malformed token/.test(String(r.b.warning || r.b.refWarning || r.b.note || ""))
      && /rename/i.test(String(r.b.warning || r.b.refWarning || r.b.note || "")), r.b);

    console.log("\n[control] a mod that defines its own archetype has no vanilla file to race");
    fs.writeFileSync(path.join(EQDIR, "aaa_mod_archetypes.txt"),
      "equipments = {\n\tnv_own_archetype = {\n\t\tis_archetype = yes\n\t\ttype = { infantry }\n\t}\n}\n", "utf8");
    r = await save({
      relativeFile: "aaa_mod_weapons.txt",
      equipment: { id: "nv_own_child", archetype: "nv_own_archetype", year: 1936 },
    });
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and it was NOT redirected", defines("aaa_mod_weapons.txt", "nv_own_child"), read("aaa_mod_weapons.txt"));

    console.log("\n[control] a well-sorted filename is never touched");
    r = await save({
      relativeFile: "zz_my_own_stuff.txt",
      equipment: { id: "nv_late_gun", archetype: "infantry_equipment", year: 1936 },
    });
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and it stayed in the file that was asked for", defines("zz_my_own_stuff.txt", "nv_late_gun"),
      read("zz_my_own_stuff.txt"));

    console.log(`\n=== equipment existing-file redirect: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
srv.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
