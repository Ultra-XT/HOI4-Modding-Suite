// #equipment-load-order — HOI4 READS common/units/equipment ALPHABETICALLY ACROSS MOD AND VANILLA MERGED,
// SO A MOD FILE THAT SORTS TOO EARLY IS A FORWARD REFERENCE.
//
// From HOI4's own error.log while the user played their mod:
//     Malformed token: infantry_equipment   (in the mod's custom_equipment.txt)
//     Malformed token: support_equipment    (in nua_reconstruction_equipment.txt)
// Neither file was malformed. Both referenced a vanilla archetype defined in a file that sorts LATER —
// infantry.txt and support.txt — so at the moment the mod's file was read, the archetype did not exist yet
// and the game dropped the equipment. Three definitions silently never loaded.
//
// The measurement that identified it: of the 5 references in that mod to a vanilla-defined archetype,
// exactly the 2 whose filename sorts before the defining file errored, and the other 3 did not — 5/5 with
// no false positives. That also discriminates the load model: if the mod directory were read wholly AFTER
// vanilla, none would error; wholly BEFORE, all five would. Only merged-alphabetical predicts exactly two.
//
// Nova's default filename was custom_equipment.txt, which sorts before infantry.txt — so the most ordinary
// choice a user can make was broken by Nova's own default. Vanilla's alphabetically last equipment file is
// x_tank_chassis.txt, so a zz_ prefix is unconditionally safe.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqorder-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const VANILLA_EQ = path.join("D:/SteamLibrary/steamapps/common/Hearts of Iron IV", "common", "units", "equipment");
const MOD = path.join(ROOT, "eqordermod");
fs.mkdirSync(path.join(MOD, "common", "units", "equipment"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EqOrderMod"\nsupported_version="1.19.*"\n', "utf8");

const eqDir = path.join(MOD, "common", "units", "equipment");
const written = () => { try { return fs.readdirSync(eqDir).filter((f) => /\.txt$/i.test(f)); } catch (_) { return []; } };

const PORT = 42491;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[ground truth] where vanilla defines the archetypes, and what sorts last");
    let vanillaFiles = [];
    try { vanillaFiles = fs.readdirSync(VANILLA_EQ).filter((f) => /\.txt$/i.test(f)).sort((a, b) => a.localeCompare(b)); } catch (_) {}
    // If the install is not present this test cannot mean anything — say so rather than passing vacuously.
    rec("the vanilla equipment directory was readable", vanillaFiles.length > 10, vanillaFiles.length);
    const lastVanilla = vanillaFiles[vanillaFiles.length - 1] || "";
    rec("…and its alphabetically last file is known", !!lastVanilla, lastVanilla);
    const defines = (id) => vanillaFiles.find((f) => {
      try { return new RegExp(`(?:^|\\n)\\s*${id}\\s*=\\s*\\{`).test(fs.readFileSync(path.join(VANILLA_EQ, f), "utf8")); } catch (_) { return false; }
    }) || "";
    const infFile = defines("infantry_equipment");
    rec("infantry_equipment is defined by vanilla", !!infFile, infFile);
    // THE OLD DEFAULT WAS BROKEN BY CONSTRUCTION. This is the whole bug in one comparison.
    rec("…in a file that sorts AFTER the old default custom_equipment.txt",
      !!infFile && "custom_equipment.txt".localeCompare(infFile) < 0, { old: "custom_equipment.txt", defines: infFile });

    console.log("\n[the fix] Nova's default must sort after every vanilla equipment file");
    // Driven through the TECH save, because that is the path that wrote the user's broken file: a
    // technology whose enable_equipments names a new piece of equipment, with no filename supplied, so the
    // default decides where it lands (server.js persistTechnologySave -> writeEquipmentToFile).
    let r = await post("/api/technologies/save-batch", {
      modPath: MOD,
      technologies: [{
        id: "nova_order_tech", folder: "infantry_folder", x: 0, y: 1, researchCost: 1, startYear: 1936,
        prerequisites: [], mutuallyExclusive: [], dependencies: [], subTechnologies: [],
        enableEquipments: ["nova_order_probe"], categories: ["infantry_tech"],
        fileName: "nova_order_tech.txt", isMod: true, leadsTo: [], pathMeta: {},
      }],
      equipments: {
        nova_order_probe: { id: "nova_order_probe", archetype: "infantry_equipment", type: "infantry", isMod: true },
      },
    });
    rec("the equipment saved", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    const files = written();
    rec("a file was written", files.length > 0, files);
    const target = files[0] || "";
    rec("…and it sorts after vanilla's last equipment file",
      !!target && !!lastVanilla && target.localeCompare(lastVanilla) > 0, { wrote: target, lastVanilla });
    // Belt and braces: check it against EVERY vanilla file, not just the last one.
    const earlierThan = vanillaFiles.filter((f) => target.localeCompare(f) < 0);
    rec("…after every one of them", earlierThan.length === 0, { wrote: target, sortsBefore: earlierThan.slice(0, 5) });
    rec("the archetype reference was written as asked",
      /archetype\s*=\s*infantry_equipment/.test(fs.readFileSync(path.join(eqDir, target), "utf8")),
      fs.readFileSync(path.join(eqDir, target), "utf8").slice(0, 300));

    console.log("\n[control] an EXPLICIT filename is still honoured — this is a default, not a policy");
    // A user who names their own file keeps it. The default must not quietly become a policy that
    // overrides the author — that would be a different bug wearing this fix as a disguise.
    r = await post("/api/technologies/save-batch", {
      modPath: MOD,
      technologies: [{
        id: "nova_order_tech2", folder: "infantry_folder", x: 0, y: 2, researchCost: 1, startYear: 1936,
        prerequisites: [], mutuallyExclusive: [], dependencies: [], subTechnologies: [],
        enableEquipments: ["nova_order_probe2"], categories: ["infantry_tech"],
        fileName: "nova_order_tech.txt", isMod: true, leadsTo: [], pathMeta: {},
      }],
      equipments: {
        nova_order_probe2: { id: "nova_order_probe2", archetype: "infantry_equipment", type: "infantry", isMod: true, fileName: "my_own_equipment.txt" },
      },
    });
    rec("the explicit filename saved", r.s === 200 && r.b && r.b.ok !== false, r.b || r.s);
    // ⚠️ THIS ASSERTION USED TO REQUIRE THE OPPOSITE, and the change is deliberate. It asserted the explicit
    // filename was honoured verbatim — which is precisely what let the bug through: public/research.js
    // hardcoded custom_equipment.txt and always sent it explicitly, so the safe DEFAULT was never reached and
    // the game silently dropped every weapon the Research maker made.
    //
    // "Honour what the caller asked for" is the wrong contract when the thing they asked for cannot work.
    // my_own_equipment.txt sorts before vanilla's infantry.txt, so `archetype = infantry_equipment` is a
    // forward reference and HOI4 answers "Malformed token: infantry_equipment" and drops the equipment.
    // Writing the file they asked for would mean writing a file the game ignores.
    //
    // The redirect is narrow: only a file that does not exist yet, only when the archetype is not defined by
    // this mod itself (a mod that defines its own archetype has no vanilla file to race), and only for a name
    // that actually sorts early. And it is not silent — the response carries a warning naming both files and
    // the error the game would have printed. #equipment-file-sorts-before-archetype
    rec("…and was redirected away from a name the game would drop",
      written().includes("zz_nova_equipment.txt") && !written().includes("my_own_equipment.txt"), written());
    rec("…with a warning that says so, naming both files",
      /my_own_equipment\.txt/.test(String(r.b.refWarning || "")) &&
      /zz_nova_equipment\.txt/.test(String(r.b.refWarning || "")), r.b.refWarning);
    rec("…and naming the error the game would have printed",
      /Malformed token/.test(String(r.b.refWarning || "")), r.b.refWarning);
    console.log(`\n=== equipment load order: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
