// Deleting a technology left the mod referring to it. Two separate residues, both from the same save.
//
// #tech-delete-leaves-grant — every other maker unwires its game-start grant on delete: spirits, events,
// decisions and characters all call unwireStartupItemEverywhere. Technologies called nothing. The save-batch
// deletion loop removed the tech block, its gridbox, its equipment and its localisation, and never touched
// history/countries — so the country went on being granted a technology that does not exist. HOI4 reports
// the unknown id to error.log and the country simply never gets the tech.
//
// The reachable window is wider than "some later session": the client's dirty flag resets after every save,
// so tick → Save → delete → Save inside ONE session leaves the grant. Worse, the tech-country Grant button
// writes set_technology to ANY tag immediately, while the save only ever rewrites the single country it was
// sent with — so a grant to any OTHER country was never reachable for cleanup at all. Hence the sweep is
// over every history file, and this test grants to two countries and deletes once.
//
// #equipment-liveness-country — the same save deletes the tech's equipment when nothing else in common/
// still uses it. That liveness test looked at surviving techs and at archetype/parent references in
// common/units/equipment, but never at history/countries — where Nova itself writes
// `create_equipment_variant = { … type = <equip> … }` and the managed starting-stockpile block. So deleting
// the tech pulled the equipment out from under a country that was using it: the effects silently stop
// applying (no named design, no starting stockpile) and the mod carries an error.log entry.
//
// Keeping the equipment is the conservative resolution — an unused definition costs nothing, deleting costs
// the modder work they set up on the Equipment and Army pages.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-techunwire-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
["common/technologies", "common/units/equipment", "history/countries", "localisation/english"]
  .forEach((d) => fs.mkdirSync(path.join(MOD, d), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TU"\nsupported_version="1.18.*"\n');

const TECH_FILE = path.join(MOD, "common", "technologies", "custom_technologies.txt");
fs.writeFileSync(TECH_FILE,
  "technologies = {\n\tnova_probe_tech = {\n\t\tenable_equipments = { nova_probe_eq }\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }\n\t\tcategories = { infantry_tech }\n\t}\n}\n", "utf8");
const EQ_FILE = path.join(MOD, "common", "units", "equipment", "custom_equipment.txt");
fs.writeFileSync(EQ_FILE,
  "equipments = {\n\tnova_probe_eq = {\n\t\tyear = 1936\n\t\tis_archetype = yes\n\t\tpicture = archetype_infantry_equipment\n\t\ttype = { infantry }\n\t\tbuild_cost_ic = 1\n\t}\n}\n", "utf8");

// TWO countries granted the tech: only one of them can be "the country the editor had open".
const GER = path.join(MOD, "history", "countries", "GER - Germany.txt");
const FRA = path.join(MOD, "history", "countries", "FRA - France.txt");
fs.writeFileSync(GER,
  'capital = 64\noob = "GER_1936"\nset_technology = {\n\tnova_probe_tech = 1\n\tinfantry_weapons = 1\n}\n' +
  'create_equipment_variant = {\n\tname = "Probe Rifle wz.36"\n\ttype = nova_probe_eq\n}\n', "utf8");
fs.writeFileSync(FRA,
  'capital = 16\nset_technology = {\n\tnova_probe_tech = 1\n}\n', "utf8");

const readF = (p) => fs.readFileSync(p, "utf8");

const PORT = 39921, app = createApp();
const server = app.listen(PORT, async () => {
  try {
    // Precondition — otherwise every assertion below could pass against an empty fixture.
    ok("precondition: both countries start out granted the tech",
      /nova_probe_tech\s*=\s*1/.test(readF(GER)) && /nova_probe_tech\s*=\s*1/.test(readF(FRA)));
    ok("precondition: the equipment is defined and a country creates a variant of it",
      /nova_probe_eq\s*=\s*\{/.test(readF(EQ_FILE)) && /type\s*=\s*nova_probe_eq/.test(readF(GER)));

    const del = await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modPath: MOD, technologies: [],
        deletions: [{ techId: "nova_probe_tech", techFile: "custom_technologies.txt",
                      equipId: "nova_probe_eq", equipFile: "custom_equipment.txt" }],
      }),
    }).then((r) => r.json());
    ok("the delete save succeeds", del && del.ok !== false, del);

    // ── the tech itself is gone ─────────────────────────────────────────────────────────────────────
    ok("the technology is removed from its file", !/nova_probe_tech\s*=\s*\{/.test(readF(TECH_FILE)), readF(TECH_FILE));

    // ── and nothing still grants it ─────────────────────────────────────────────────────────────────
    ok("the grant is gone from the country the editor had open", !/nova_probe_tech/.test(readF(GER)), readF(GER));
    ok("…and from a country it never had open", !/nova_probe_tech/.test(readF(FRA)), readF(FRA));
    ok("…while that country's OTHER granted tech is untouched", /infantry_weapons\s*=\s*1/.test(readF(GER)), readF(GER));
    ok("…and unrelated history lines survive", /capital\s*=\s*64/.test(readF(GER)) && /oob\s*=\s*"GER_1936"/.test(readF(GER)), readF(GER));

    // France's set_technology held only that one id — the empty husk should not be left behind.
    ok("a set_technology block left empty is removed, not left as an empty husk",
      !/set_technology/.test(readF(FRA)), readF(FRA));
    ok("…and the rest of that file is intact", /capital\s*=\s*16/.test(readF(FRA)), readF(FRA));
    ok("both history files are still brace-balanced", [GER, FRA].every((p) => {
      let d = 0; for (const c of readF(p)) { if (c === "{") d++; else if (c === "}") d--; } return d === 0;
    }), { ger: readF(GER), fra: readF(FRA) });

    // ── the equipment a country still uses must SURVIVE ─────────────────────────────────────────────
    ok("equipment a country still creates a variant of is KEPT", /nova_probe_eq\s*=\s*\{/.test(readF(EQ_FILE)), readF(EQ_FILE));
    ok("…so the country's variant still names something real", /type\s*=\s*nova_probe_eq/.test(readF(GER)), readF(GER));

    // ── and genuinely orphaned equipment is still cleaned up, or the guard is just a leak ───────────
    fs.writeFileSync(TECH_FILE,
      "technologies = {\n\tnova_orphan_tech = {\n\t\tenable_equipments = { nova_orphan_eq }\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }\n\t\tcategories = { infantry_tech }\n\t}\n}\n", "utf8");
    fs.writeFileSync(EQ_FILE,
      "equipments = {\n\tnova_orphan_eq = {\n\t\tyear = 1936\n\t\tis_archetype = yes\n\t\ttype = { infantry }\n\t\tbuild_cost_ic = 1\n\t}\n}\n", "utf8");
    const del2 = await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modPath: MOD, technologies: [],
        deletions: [{ techId: "nova_orphan_tech", techFile: "custom_technologies.txt",
                      equipId: "nova_orphan_eq", equipFile: "custom_equipment.txt" }],
      }),
    }).then((r) => r.json());
    ok("deleting a tech whose equipment nobody uses still succeeds", del2 && del2.ok !== false, del2);
    ok("…and that equipment IS removed (the guard keeps, it does not leak)",
      !/nova_orphan_eq\s*=\s*\{/.test(readF(EQ_FILE)), readF(EQ_FILE));

    console.log("\ntest-tech-delete-unwires: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 15 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
