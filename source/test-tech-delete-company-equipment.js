// #equipment-liveness-company — deleting a technology deleted its equipment even when one of the mod's own
// companies still builds it, and removed it with a raw write that left no backup.
//
// The save-batch deletion loop decides whether a tech's equipment is still in use before removing it. It
// checked three places: surviving techs' enableEquipments, `archetype =` / `parent =` references inside
// common/units/equipment, and `type = <equip>` inside history/countries. It never looked at
// common/military_industrial_organization/organizations — where a company declares the equipment it works on
// as `equipment_type = { <id> <id> … }`.
//
// Millennium Dawn, the mod Nova is built against, writes RAW ARCHETYPE IDS there
// (`equipment_type = { Inf_equipment util_vehicle_equipment heavy_tank_chassis }`), which is exactly the shape
// Nova's OWN MIO editor writes. So deleting a tech took the equipment out from under a company that still
// lists it, and the company silently worked on nothing.
//
// Second half of the same finding: removeNamedBlockFromFile used a raw fs.writeFileSync — the one destructive
// writer left in the file not going through safeModWrite — so a wrong delete was unrecoverable.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-eqlive-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
// Redirect Nova's app-data dir into the temp root BEFORE requiring the server: safeModWrite puts its backups
// under <APPDATA>/NovaModdingSuite/backups, so this both keeps the test hermetic and keeps it out of the
// user's real AppData. resolveNovaAppDataDir reads APPDATA on win32, XDG_CONFIG_HOME elsewhere.
const APPDATA_ROOT = path.join(ROOT, "appdata");
fs.mkdirSync(APPDATA_ROOT, { recursive: true });
process.env.APPDATA = APPDATA_ROOT;
process.env.XDG_CONFIG_HOME = APPDATA_ROOT;
const BACKUP_DIR = path.join(APPDATA_ROOT, "NovaModdingSuite", "backups");
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
["common/technologies", "common/units/equipment", "common/military_industrial_organization/organizations"]
  .forEach((d) => fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="E"\nsupported_version="1.18.*"\n');

const EQFILE = path.join(MOD, "common", "units", "equipment", "probe_eq.txt");
fs.writeFileSync(EQFILE,
  "equipments = {\n" +
  "\tcompany_gun = {\n\t\tis_archetype = yes\n\t\tyear = 1936\n\t\tsoft_attack = 4\n\t}\n" +
  "\tlonely_gun = {\n\t\tis_archetype = yes\n\t\tyear = 1936\n\t\tsoft_attack = 2\n\t}\n" +
  "}\n", "utf8");
const TECHFILE = path.join(MOD, "common", "technologies", "probe_tech.txt");
const mkTech = (id, eq) =>
  `\t${id} = {\n\t\tenable_equipments = { ${eq} }\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n` +
  `\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }\n\t\tcategories = { infantry_weapons }\n\t}\n`;
fs.writeFileSync(TECHFILE, "technologies = {\n" + mkTech("company_tech", "company_gun") + mkTech("lonely_tech", "lonely_gun") + "}\n", "utf8");

// A company that builds company_gun — the raw-archetype shape MD and Nova's own MIO editor both write.
fs.writeFileSync(path.join(MOD, "common", "military_industrial_organization", "organizations", "nova_mio.txt"),
  "probe_works = {\n\ticon = GFX_idea_generic_air_manufacturer_3\n\tallowed = { always = yes }\n" +
  "\tequipment_type = { company_gun other_thing }\n\tinitial_trait = { name = probe_works_initial }\n}\n", "utf8");

const PORT = 40023, app = createApp();
const server = app.listen(PORT, async () => {
  const get = () => fetch(`http://127.0.0.1:${PORT}/api/technologies/catalog?includeVanilla=0&includeActiveMod=1&sourcePath=${encodeURIComponent(MOD)}&modPath=${encodeURIComponent(MOD)}`).then((r) => r.json());
  const eqText = () => fs.readFileSync(EQFILE, "utf8");
  try {
    const cat = await get();
    const keep = (cat.technologies || []).filter((t) => t.id !== "company_tech" && t.id !== "lonely_tech");
    ok("the catalog loaded both techs", (cat.technologies || []).length >= 2, (cat.technologies || []).map((t) => t.id));

    // Delete BOTH techs in one batch: one whose equipment a company builds, one whose equipment nothing uses.
    const r = await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modPath: MOD, technologies: keep,
        deletions: [
          { techId: "company_tech", techFile: "probe_tech.txt", equipId: "company_gun", equipFile: "probe_eq.txt" },
          { techId: "lonely_tech", techFile: "probe_tech.txt", equipId: "lonely_gun", equipFile: "probe_eq.txt" },
        ],
      }),
    }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) }));
    // Assert the operation succeeded before asserting anything about its effects.
    ok("the delete batch succeeds", r.status === 200 && r.body && (r.body.ok || r.body.success), r);

    const eq = eqText();
    ok("THE COMPANY'S EQUIPMENT SURVIVED", /company_gun\s*=\s*\{/.test(eq), eq);
    ok("…with its stats intact", /soft_attack\s*=\s*4/.test(eq), eq);
    ok("the genuinely unused equipment WAS removed", !/lonely_gun\s*=\s*\{/.test(eq), eq);
    let d = 0; for (const c of eq) { if (c === "{") d++; else if (c === "}") d--; }
    ok("…and the equipment file is brace-balanced", d === 0, d);

    const techs = fs.readFileSync(TECHFILE, "utf8");
    ok("both techs were deleted as asked", !/company_tech\s*=\s*\{/.test(techs) && !/lonely_tech\s*=\s*\{/.test(techs), techs);

    // The company must be untouched and still name its equipment.
    const mio = fs.readFileSync(path.join(MOD, "common", "military_industrial_organization", "organizations", "nova_mio.txt"), "utf8");
    ok("the company file is untouched", /equipment_type = \{ company_gun other_thing \}/.test(mio), mio);

    // ── a backup must exist for the removal that DID happen ─────────────────────────────────────
    // Backups live under <APPDATA>/NovaModdingSuite/backups, which this test redirected into its temp root —
    // NOT inside the mod. My first version walked the mod and found nothing, which is a wrong assumption
    // rather than a missing backup.
    let backups = [];
    try { backups = fs.readdirSync(BACKUP_DIR).map((f) => path.join(BACKUP_DIR, f)); } catch (_) { backups = []; }
    ok("removing equipment left a recoverable backup", backups.some((b) => /probe_eq/.test(path.basename(b))), backups.slice(0, 4).map((b) => path.basename(b)));
    ok("…containing the deleted definition",
      backups.some((b) => { try { return /lonely_gun\s*=\s*\{/.test(fs.readFileSync(b, "utf8")); } catch (_) { return false; } }),
      backups.slice(0, 4).map((b) => path.basename(b)));

    // ── the source ──────────────────────────────────────────────────────────────────────────────
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    ok("the liveness check now looks at the organizations dir",
      src.includes('path.join(activeRoot, "common", "military_industrial_organization", "organizations")') &&
      /#equipment-liveness-company/.test(src), "check missing");
    ok("…scoped to an equipment_type list", /\\bequipment_type\\s\*=\\s\*\\\{\(\[\^\{\}\]\*\)\\\}/.test(src) || src.includes("\\bequipment_type\\s*=\\s*\\{([^{}]*)\\}"), "not scoped to equipment_type");
    ok("the block removal uses safeModWrite now", src.includes('safeModWrite(abs, txt, "equipment-delete");'), "still a raw write");
    ok("…and brace-checks before writing", /if \(!bracesAreBalanced\(txt\)\) return false;\s*\n\s*safeModWrite\(abs, txt, "equipment-delete"\)/.test(src), "no brace guard");
    ok("…and the log line mentions a company", /a country's history, or a company/.test(src), "log not updated");

    console.log("\ntest-tech-delete-company-equipment: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 14 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
