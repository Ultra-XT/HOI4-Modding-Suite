// #stale-delete-route-missing-cleanups — POST /api/technologies/delete removed the tech block and its
// localisation and stopped there. The batch path (/api/technologies/save-batch, which the editor actually
// uses since delete became deferred + undoable) carries three more steps this route was never given:
//
//   1. take out the gridbox Nova wrote into interface/countrytechtreeview.gui when the tech was created
//   2. unwire the game-start grant, or a country keeps being granted a technology that no longer exists
//   3. #equipment-liveness — do NOT delete equipment another surviving tech still enables
//
// (3) is the one that destroys content: the route deleted the equipment block unconditionally, so deleting
// one tech could take out equipment belonging to a tech nobody touched. Observed on Millennium Dawn for the
// non-NSB Anti_Air_0 branch, which is why the batch path grew the guard — this route never got it.
//
// The route is unreachable from the shipped UI (research.js says so in a comment where the call used to be)
// but it is still a live HTTP endpoint, so it gets the same protections rather than being left as a trap.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-techdel-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "techdelmod");
for (const d of [["common", "technologies"], ["common", "units", "equipment"],
  ["history", "countries"], ["localisation", "english"], ["interface"]]) {
  fs.mkdirSync(path.join(MOD, ...d), { recursive: true });
}
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TechDelMod"\nsupported_version="1.18.*"\n', "utf8");

const TECH_FILE = "nua_techs.txt";
const EQUIP_FILE = "nua_equip.txt";
const techAbs = path.join(MOD, "common", "technologies", TECH_FILE);
const equipAbs = path.join(MOD, "common", "units", "equipment", EQUIP_FILE);
const histAbs = path.join(MOD, "history", "countries", "NUA - Nova Union.txt");
const guiAbs = path.join(MOD, "interface", "countrytechtreeview.gui");

// TWO techs enabling the SAME equipment. Deleting the first must not take the equipment the second needs.
function seed() {
  fs.writeFileSync(techAbs, [
    "technologies = {",
    "\tnua_doomed_tech = {",
    "\t\tenable_equipments = { nua_shared_equipment }",
    "\t\tresearch_cost = 1",
    "\t\tstart_year = 1936",
    "\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }",
    "\t}",
    "\tnua_survivor_tech = {",
    "\t\tenable_equipments = { nua_shared_equipment }",
    "\t\tresearch_cost = 1",
    "\t\tstart_year = 1936",
    "\t\tfolder = { name = infantry_folder position = { x = 2 y = 0 } }",
    "\t}",
    "}",
    "",
  ].join("\n"), "utf8");
  fs.writeFileSync(equipAbs, [
    "equipments = {",
    "\tnua_shared_equipment = {",
    "\t\tyear = 1936",
    "\t\tis_archetype = yes",
    "\t\ttype = infantry",
    "\t\tbuild_cost_ic = 3",
    "\t}",
    "}",
    "",
  ].join("\n"), "utf8");
  fs.writeFileSync(histAbs, [
    "capital = 1",
    "set_technology = {",
    "\tnua_doomed_tech = 1",
    "}",
    "",
  ].join("\n"), "utf8");
  // A gui with Nova's own sentinel region holding the doomed tech's gridbox — what a create leaves behind.
  fs.writeFileSync(guiAbs, [
    "guiTypes = {",
    "\tcontainerWindowType = {",
    '\t\tname = "countrytechtreeview"',
    "\t\tgridboxtype = {",
    '\t\t\tname = "vanilla_infantry_tree"',
    "\t\t\tposition = { x = 10 y = 10 }",
    "\t\t}",
    "\t\t# >>> NOVA_NEW_TECH_GRIDBOXES (gridboxes for techs added in Nova — safe to edit or move)",
    "\t\tgridboxtype = {",
    '\t\t\tname = "nua_doomed_tech_tree"',
    "\t\t\tposition = { x = 140 y = 210 }",
    "\t\t\tslotsize = { width = 70 height = 70 }",
    '\t\t\tformat = "LEFT"',
    "\t\t}",
    "\t\tgridboxtype = {",
    '\t\t\tname = "nua_survivor_tech_tree"',
    "\t\t\tposition = { x = 140 y = 280 }",
    "\t\t\tslotsize = { width = 70 height = 70 }",
    '\t\t\tformat = "LEFT"',
    "\t\t}",
    "\t\t# <<< NOVA_NEW_TECH_GRIDBOXES",
    "\t}",
    "}",
    "",
  ].join("\n"), "utf8");
  fs.writeFileSync(path.join(MOD, "localisation", "english", "custom_technologies_l_english.yml"),
    "﻿l_english:\n nua_doomed_tech:0 \"Doomed\"\n nua_shared_equipment:0 \"Shared Gun\"\n nua_survivor_tech:0 \"Survivor\"\n", "utf8");
}

const PORT = 42275;
const app = createApp();
const server = app.listen(PORT, async () => {
  const del = async (body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/technologies/delete`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  try {
    console.log("\n[equipment liveness] deleting one tech must not take equipment another tech still enables");
    seed();
    let r = await del({ modPath: MOD, techId: "nua_doomed_tech", techFile: TECH_FILE, equipId: "nua_shared_equipment", equipFile: EQUIP_FILE });
    rec("the delete succeeded", r.status === 200 && r.body && r.body.ok === true, r.body || r.status);

    const techTxt = fs.readFileSync(techAbs, "utf8");
    rec("the doomed tech is gone", !/nua_doomed_tech/.test(techTxt), techTxt);
    rec("the surviving tech is intact", /nua_survivor_tech/.test(techTxt), techTxt);

    const eqTxt = fs.readFileSync(equipAbs, "utf8");
    rec("the SHARED equipment survived", /nua_shared_equipment\s*=\s*\{/.test(eqTxt), eqTxt);
    rec("…and the caller was told why", /still enables it|archetype/i.test(String((r.body && r.body.equipKept) || "")),
      r.body && r.body.equipKept);
    const locTxt = fs.readFileSync(path.join(MOD, "localisation", "english", "custom_technologies_l_english.yml"), "utf8");
    rec("…and the kept equipment kept its name", /nua_shared_equipment:/.test(locTxt), locTxt);
    rec("the deleted tech's own name was stripped", !/nua_doomed_tech:/.test(locTxt), locTxt);

    console.log("\n[gridbox] the gui stops naming the deleted tech");
    const guiTxt = fs.readFileSync(guiAbs, "utf8");
    rec("the deleted tech's gridbox is gone", !/nua_doomed_tech_tree/.test(guiTxt), guiTxt);
    rec("the surviving tech's gridbox is intact", /nua_survivor_tech_tree/.test(guiTxt), guiTxt);
    rec("a gridbox OUTSIDE Nova's region is untouched", /vanilla_infantry_tree/.test(guiTxt), guiTxt);
    rec("the gui is still brace-balanced",
      (guiTxt.replace(/#[^\n]*/g, "").match(/\{/g) || []).length === (guiTxt.replace(/#[^\n]*/g, "").match(/\}/g) || []).length,
      guiTxt);

    console.log("\n[grant] the country stops being granted a technology that no longer exists");
    const hist = fs.readFileSync(histAbs, "utf8");
    rec("the set_technology grant was unwired", !/nua_doomed_tech/.test(hist), hist);
    rec("…and the rest of the history survived", /capital = 1/.test(hist), hist);

    console.log("\n[control: equipment nothing else uses IS removed]");
    seed();
    // Point the survivor at different equipment so the shared one becomes genuinely unused.
    fs.writeFileSync(techAbs, fs.readFileSync(techAbs, "utf8")
      .replace("\tnua_survivor_tech = {\n\t\tenable_equipments = { nua_shared_equipment }",
        "\tnua_survivor_tech = {\n\t\tenable_equipments = { nua_other_equipment }"), "utf8");
    r = await del({ modPath: MOD, techId: "nua_doomed_tech", techFile: TECH_FILE, equipId: "nua_shared_equipment", equipFile: EQUIP_FILE });
    rec("the delete succeeded", r.status === 200 && r.body && r.body.ok === true, r.body || r.status);
    const eqTxt2 = fs.readFileSync(equipAbs, "utf8");
    rec("the now-unused equipment WAS removed", !/nua_shared_equipment\s*=\s*\{/.test(eqTxt2), eqTxt2);
    rec("…and no false 'kept' warning was reported", !(r.body && r.body.equipKept), r.body && r.body.equipKept);

    console.log(`\n=== tech delete route cleanups: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
