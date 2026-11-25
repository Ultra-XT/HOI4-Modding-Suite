// Deleting a technology must not delete equipment something else is still using (#equipment-liveness).
//
// The tech-delete path removed the tech's equipment block unconditionally. It computed a
// `equipStillUsed` flag — but only used it to decide whether to strip the localisation, one line AFTER
// the block had already been removed. Two real Millennium Dawn cases fell through:
//
//   * SHARED BY ANOTHER TECH. MD defines Anti_Air_0 twice over: the base branch (gated NOT has_dlc
//     "No Step Back") and NSB's own nsb_Anti_Air_0, which lists the same equipment in
//     enable_equipments. Deleting the base tech deleted the weapon out from under the NSB branch,
//     which was never touched — leaving it unlocking equipment that does not exist.
//   * AN ARCHETYPE ITS VARIANTS NAME. Deleting the ICBM tech removed nuclear_missile_equipment while
//     eight nuclear_missile_equipment_N variants still declared `archetype = nuclear_missile_equipment`.
//     Variants are not "enabled" by the deleted tech, so the tech-only liveness check never saw them.
//
// And because a tech and its equipment often share an id (Anti_Air_0 is both), the TECH's localisation
// strip took the name off the surviving weapon as well.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqlive-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="EqLiveness"\nsupported_version="1.19.*"\n');
const tdir = path.join(mod, "common", "technologies");
const edir = path.join(mod, "common", "units", "equipment");
fs.mkdirSync(tdir, { recursive: true });
fs.mkdirSync(edir, { recursive: true });

const tech = (id, eq, x) => [
  `\t${id} = {`,
  "\t\tresearch_cost = 1",
  "\t\tstart_year = 1936",
  `\t\tenable_equipments = { ${eq} }`,
  `\t\tfolder = { name = infantry_folder position = { x = ${x} y = 0 } }`,
  "\t}",
].join("\n");

// shared_gun is enabled by BOTH techs; lone_gun only by the tech we delete;
// missile_archetype is enabled by the tech we delete but named by two surviving variants.
fs.writeFileSync(path.join(tdir, "probe.txt"), [
  "technologies = {",
  tech("doomed_tech", "shared_gun", 0),
  tech("other_tech", "shared_gun", 2),
  tech("lone_tech", "lone_gun", 4),
  tech("archetype_tech", "missile_archetype", 6),
  "}",
  "",
].join("\n"));

const EFILE = path.join(edir, "probe_equipment.txt");
fs.writeFileSync(EFILE, [
  "equipments = {",
  "\tshared_gun = {",
  "\t\tyear = 1936",
  "\t\tarchetype = infantry_equipment",
  "\t}",
  "\tlone_gun = {",
  "\t\tyear = 1936",
  "\t\tarchetype = infantry_equipment",
  "\t}",
  "\tmissile_archetype = {",
  "\t\tyear = 1936",
  "\t\tis_archetype = yes",
  "\t}",
  "\tmissile_variant_1 = {",
  "\t\tyear = 1936",
  "\t\tarchetype = missile_archetype",
  "\t}",
  "\tmissile_variant_2 = {",
  "\t\tyear = 1940",
  "\t\tarchetype = missile_archetype",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

const locDir = path.join(mod, "localisation", "english");
fs.mkdirSync(locDir, { recursive: true });
const LOC = path.join(locDir, "probe_l_english.yml");
fs.writeFileSync(LOC, "﻿l_english:\n"
  + ' doomed_tech:0 "Doomed Tech"\n other_tech:0 "Other Tech"\n lone_tech:0 "Lone Tech"\n'
  + ' archetype_tech:0 "Archetype Tech"\n shared_gun:0 "Shared Gun"\n lone_gun:0 "Lone Gun"\n'
  + ' missile_archetype:0 "Missile Archetype"\n', "utf8");

const eq = () => fs.readFileSync(EFILE, "utf8");
const loc = () => fs.readFileSync(LOC, "utf8");
const techTxt = () => fs.readFileSync(path.join(tdir, "probe.txt"), "utf8");
const hasBlock = (txt, id) => new RegExp(`(?:^|\\n)\\t${id}\\s*=\\s*\\{`).test(txt);

const PORT = 39577, app = createApp();
const server = app.listen(PORT, async () => {
  const del = (deletions) => fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ technologies: [], equipments: {}, customTabs: [], modPath: mod, countryTag: null, countryTechIds: null, deletions, newTechIds: [] }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    // ── 1. delete a tech whose equipment ANOTHER tech still enables ────────────────────────────────
    const r1 = await del([{ techId: "doomed_tech", techFile: "probe.txt", equipId: "shared_gun", equipFile: "probe_equipment.txt" }]);
    ok("delete → 200", r1.s === 200, r1.b);
    ok("the tech itself is gone", !hasBlock(techTxt(), "doomed_tech"), techTxt());
    ok("the SHARED equipment survives (the fix)", hasBlock(eq(), "shared_gun"), eq());
    ok("the surviving tech still enables it", /other_tech[\s\S]*?enable_equipments = \{ shared_gun \}/.test(techTxt()));
    ok("the shared equipment keeps its name", /shared_gun:0 "Shared Gun"/.test(loc()), loc());
    ok("the deleted tech's own loc is stripped", !/doomed_tech:0/.test(loc()), loc());

    // ── 2. delete a tech whose equipment is an ARCHETYPE its variants name ─────────────────────────
    const r2 = await del([{ techId: "archetype_tech", techFile: "probe.txt", equipId: "missile_archetype", equipFile: "probe_equipment.txt" }]);
    ok("delete → 200", r2.s === 200, r2.b);
    ok("the tech is gone", !hasBlock(techTxt(), "archetype_tech"));
    ok("the ARCHETYPE survives because variants still name it", hasBlock(eq(), "missile_archetype"), eq());
    ok("both variants are untouched", hasBlock(eq(), "missile_variant_1") && hasBlock(eq(), "missile_variant_2"));
    ok("the archetype keeps its name", /missile_archetype:0 "Missile Archetype"/.test(loc()), loc());

    // ── 3. equipment nothing else uses IS still cleaned up ─────────────────────────────────────────
    const r3 = await del([{ techId: "lone_tech", techFile: "probe.txt", equipId: "lone_gun", equipFile: "probe_equipment.txt" }]);
    ok("delete → 200", r3.s === 200, r3.b);
    ok("an unreferenced equipment is removed", !hasBlock(eq(), "lone_gun"), eq());
    ok("its localisation is stripped too", !/lone_gun:0/.test(loc()), loc());
    ok("the tech's localisation is stripped", !/lone_tech:0/.test(loc()));

    // ── 4. nothing else was collateral damage ──────────────────────────────────────────────────────
    ok("every surviving tech is still defined once", ["other_tech"].every((id) => (techTxt().match(new RegExp(`\\n\\t${id}\\s*=\\s*\\{`, "g")) || []).length === 1));
    ok("the equipment file is still brace-balanced", (eq().match(/\{/g) || []).length === (eq().match(/\}/g) || []).length);
    ok("the loc file keeps its BOM header", /^﻿l_english:/.test(loc()));

    console.log(`\ntest-research-delete-equipment-liveness: ${pass}/${total} checks passed`);
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 17 ? 0 : 1;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
