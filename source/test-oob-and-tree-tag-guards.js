// #oob-unknown-equipment / #focus-tree-tag-unparseable
//
// Two writers accepted input their own readers can never resolve, and reported success.
//
// /api/army/naval-air validated only the SHAPE of a ship's `definition` and `equipment`, never that they
// exist — while its sibling /api/army/stockpile already refuses an unknown type using the same catalog. HOI4
// cannot resolve the token, so the ship or air wing silently never spawns. This one is user-reachable: the
// definition and equipment boxes in army.html are free-text `<input list=…>`, and a datalist SUGGESTS values
// without constraining them, so `destroyer_l` for `destroyer_1` sails straight through.
//
// /api/focus/tree-properties accepted any string as a country tag while the reader only recognises 2-3
// letters. Writing anything else bricked the file: the tree then reported simple:false and every repair
// through the same endpoint was refused with "more than a plain single-country one … edit by hand" — a
// one-way door only a text editor could undo.
//
// Both directions: the refusals must not fire for legitimate input, or these makers stop working.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oobtag-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const MOD = path.join(ROOT, "oobmod");
["history/units", "history/countries", "common/national_focus", "common/units/equipment"].forEach((d) =>
  fs.mkdirSync(path.join(MOD, ...d.split("/")), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="OobMod"\nsupported_version="1.18.*"\n', "utf8");

const TREE = path.join(MOD, "common", "national_focus", "nova_tree.txt");
fs.writeFileSync(TREE, [
  "focus_tree = {",
  "\tid = nova_tree",
  "\tcountry = {",
  "\t\tfactor = 0",
  "\t\tmodifier = {",
  "\t\t\tadd = 10",
  "\t\t\ttag = GER",
  "\t\t}",
  "\t}",
  "\tfocus = {",
  "\t\tid = nova_focus_a",
  "\t\tx = 0",
  "\t\ty = 0",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

const PORT = 42195;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  // 241 is where the base game's own GER_1936_naval_mtg.txt berths its first task force: coastal land. This used 11359, which has no sea
  // beside it, and a task force there is now refused for the crash it is (#a-berth-the-mods-own-file-gives-is-judged-on-a-map-it-never-changed)
  // — which would have made "a real archetype still works" fail for its berth, not its equipment.
  const navy = (definition, equipment, fileName) => post("/api/army/naval-air", {
    modPath: MOD, tag: "GER", domain: "naval", fileName,
    fleets: [{
      name: "Fleet", naval_base: 241,
      taskForces: [{ name: "TF", location: 241, ships: [{ name: "Ship", definition, equipment, owner: "GER", amount: 1 }] }],
    }],
  });
  const unitFiles = () => { try { return fs.readdirSync(path.join(MOD, "history", "units")); } catch (_) { return []; } };

  try {
    console.log("\n[naval OOB] equipment that does not exist");
    const bogus = await navy("totally_not_a_definition", "totally_not_equipment_9", "GER_bogus.txt");
    rec("it was refused", !(bogus.body && bogus.body.ok === true), bogus.body || bogus.status);
    rec("…and says the ship would never spawn",
      /never spawn|wasn't found/i.test(String((bogus.body && bogus.body.error) || "")), bogus.body);
    rec("…and no OOB file was written", !unitFiles().includes("GER_bogus.txt"), unitFiles());

    console.log("\n[naval OOB] a real archetype still works");
    const good = await navy("destroyer", "destroyer_1", "GER_real.txt");
    rec("a real ship was accepted", good.status === 200 && good.body && good.body.ok !== false,
      good.body || good.status);
    rec("…and the OOB file was written", unitFiles().includes("GER_real.txt"), unitFiles());

    console.log("\n[air OOB] equipment that does not exist");
    const badAir = await post("/api/army/naval-air", {
      modPath: MOD, tag: "GER", domain: "air", fileName: "GER_bogus_air.txt",
      airWings: [{ state: 64, groups: [{ equipment: "not_a_real_plane_9", owner: "GER", amount: 10 }] }],
    });
    rec("it was refused", !(badAir.body && badAir.body.ok === true), badAir.body || badAir.status);
    const goodAir = await post("/api/army/naval-air", {
      modPath: MOD, tag: "GER", domain: "air", fileName: "GER_real_air.txt",
      airWings: [{ state: 64, groups: [{ equipment: "fighter_equipment_1", owner: "GER", amount: 10 }] }],
    });
    rec("a real plane archetype is accepted", goodAir.status === 200 && goodAir.body && goodAir.body.ok !== false,
      goodAir.body || goodAir.status);

    console.log("\n[focus tree tag] a string that is not a tag");
    const badTag = await post("/api/focus/tree-properties", {
      modPath: MOD, relPath: "common/national_focus/nova_tree.txt", treeId: "nova_tree",
      tag: "notarealtag", weight: 5,
    });
    rec("it was refused", !(badTag.body && badTag.body.ok === true), badTag.body || badTag.status);
    rec("…and the tree still holds its original tag", /tag = GER/.test(fs.readFileSync(TREE, "utf8")),
      fs.readFileSync(TREE, "utf8"));

    console.log("\n[focus tree tag] a real tag still works, and the file stays repairable");
    const okTag = await post("/api/focus/tree-properties", {
      modPath: MOD, relPath: "common/national_focus/nova_tree.txt", treeId: "nova_tree",
      tag: "SOV", weight: 25,
    });
    rec("a real tag was accepted", okTag.status === 200 && okTag.body && okTag.body.ok !== false,
      okTag.body || okTag.status);
    rec("…and landed in the file", /tag = SOV/.test(fs.readFileSync(TREE, "utf8")), fs.readFileSync(TREE, "utf8"));
    const again = await post("/api/focus/tree-properties", {
      modPath: MOD, relPath: "common/national_focus/nova_tree.txt", treeId: "nova_tree", tag: "FRA",
    });
    rec("…and the tree can still be changed afterwards (no one-way door)",
      again.status === 200 && again.body && again.body.ok !== false, again.body || again.status);
    rec("a lowercase tag is accepted and upper-cased", /tag = FRA/.test(fs.readFileSync(TREE, "utf8")),
      fs.readFileSync(TREE, "utf8"));

    console.log(`\n=== OOB + tree tag guards: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
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
