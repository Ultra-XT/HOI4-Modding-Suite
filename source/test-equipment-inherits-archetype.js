// #equipment-zero-stats — a new weapon was created with every combat stat overridden to zero.
//
// In HOI4 an equipment inherits its archetype for every stat it does NOT specify. The infantry_equipment
// archetype supplies defense 20, breakthrough 2, soft_attack 3, hard_attack 0.5 and ap_attack 1. Nova's
// "add a tech that unlocks equipment" wrote an explicit 0 for all five, which is not a neutral default — it
// is an override. The weapon came out strictly worse than the archetype it derives from: a division equipped
// with it fights at nothing, and the file gives no hint that anything is wrong, because 0 looks like a
// placeholder rather than a decision.
//
// The demo mod this campaign built had exactly one such weapon, "Marine Corps", sitting at zero across the
// board since the day the tech was created.
//
// The same flaw sat in the editor: any stat box left blank was written as 0, so merely opening a weapon and
// saving it turned every inherited value into a zero override.
//
// Blank now means inherit — the key is omitted and HOI4 fills it from the archetype. A typed 0 is still a
// deliberate zero and is written, which is the half that must not regress: a modder who genuinely wants a
// weapon with no armour piercing has to be able to say so.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-equip-inherit-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "equip_probe");
fs.mkdirSync(path.join(MOD, "common", "units", "equipment"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EquipProbe"\nsupported_version="1.19.*"\n');

// Read the whole equipment DIRECTORY rather than one hardcoded filename. This test is about what the writer
// puts in an equipment block, not where it puts it — and writeEquipmentToFile now redirects a name that would
// sort before the vanilla file defining the archetype, because HOI4 reads the merged directory alphabetically
// and would otherwise drop the equipment entirely. #equipment-file-sorts-before-archetype
const EQ_DIR = path.join(MOD, "common", "units", "equipment");
const read = () => {
  try {
    return fs.readdirSync(EQ_DIR)
      .filter((f) => /\.txt$/i.test(f))
      .map((f) => fs.readFileSync(path.join(EQ_DIR, f), "utf8"))
      .join("\n");
  } catch (_) { return ""; }
};

const PORT = 39633, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 200));

  const saveWith = (equipment) => post("/api/technologies/save-batch", {
    modPath: MOD,
    technologies: [{
      id: "zz_probe_tech", name: "Probe Tech", description: "d", folder: "infantry_folder",
      x: 1, y: 1, researchCost: 2, startYear: 1942, prerequisites: [], dependencies: [],
      enableEquipments: ["zz_probe_tech_equipment"], forceSmallLayout: false, modifiers: "",
      extraScript: "", isMod: true, fileName: "custom_technologies.txt",
    }],
    equipments: { [equipment.id]: equipment },
  });

  try {
    // ── stats the modder never touched are OMITTED, so the archetype supplies them ────────────────
    const r1 = await saveWith({
      id: "zz_probe_tech_equipment", year: 1942, archetype: "infantry_equipment",
      buildCostIc: 0.5, reliability: 0.9, resources: {}, name: "Probe Weapon",
      fileName: "custom_equipment.txt", isMod: true,
      // softAttack / hardAttack / defense / breakthrough / apAttack deliberately absent
    });
    await breathe();
    ok("saving a weapon with untouched stats → ok", r1.s === 200, r1.b);
    const t1 = read();
    ok("the weapon was written", /zz_probe_tech_equipment = \{/.test(t1), t1.slice(0, 200));
    ok("…and it declares its archetype", /archetype = infantry_equipment/.test(t1), t1);
    for (const stat of ["soft_attack", "hard_attack", "defense", "breakthrough", "ap_attack"]) {
      ok(`…${stat} is omitted, not zeroed`, !new RegExp("\\b" + stat + "\\s*=").test(t1), t1);
    }
    ok("…while the stats it DOES set are written", /reliability = 0\.9/.test(t1), t1);

    // ── a deliberate 0 is still honoured ──────────────────────────────────────────────────────────
    // This is the half a blunt "never write zeros" fix would have broken.
    await breathe();
    const r2 = await saveWith({
      id: "zz_probe_tech_equipment", year: 1942, archetype: "infantry_equipment",
      buildCostIc: 0.5, reliability: 0.9, resources: {}, name: "Probe Weapon",
      fileName: "custom_equipment.txt", isMod: true,
      apAttack: 0, softAttack: 7,
    });
    await breathe();
    const t2 = read();
    ok("saving with an explicit zero → ok", r2.s === 200, r2.b);
    ok("…the deliberate zero is written", /ap_attack = 0\b/.test(t2), t2);
    ok("…alongside the real value", /soft_attack = 7\b/.test(t2), t2);
    ok("…and the untouched ones are still omitted", !/\bdefense\s*=/.test(t2) && !/\bbreakthrough\s*=/.test(t2), t2);

    // ── the client half: creation template and the stat boxes ─────────────────────────────────────
    // Both live in the browser, and both were writing zeros, so assert the source directly.
    {
      const src = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
      const i = src.indexOf("if (withEquipment) {");
      const tmpl = i === -1 ? "" : src.slice(i, i + 1200);
      ok("the auto-created weapon no longer sets combat stats",
        !!tmpl && !/softAttack:\s*0/.test(tmpl) && !/defense:\s*0/.test(tmpl), tmpl.slice(0, 240));
      ok("…and a blank stat box means inherit", /function statOrInherit/.test(src));
      ok("…used by the weapon editor's save", /softAttack: statOrInherit\("equipSoftAttack"\)/.test(src));
      ok("…with inherited stats shown blank rather than as 0", /showStat\("equipSoftAttack", eq\.softAttack\)/.test(src));
    }

    console.log("\ntest-equipment-inherits-archetype: " + pass + "/" + total + " checks passed");
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
