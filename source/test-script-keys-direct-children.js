// #script-keys-any-depth — the equipment/resource pickers must offer only real top-level entries.
//
// scanHoi4ScriptKeys matched `key = {` at ANY nesting depth and then tried to filter the wreckage with a
// 14-entry blocklist. Against the equipment folder that returned 417 "equipment" ids of which 97 were not
// equipment at all: script keywords (NOT, if, else, for_each), block names (upgrades, module_slots,
// default_modules, duplicate_archetypes, search_filters), stat names (hardness, air_superiority) and roughly
// 45 module-slot names.
//
// It is not cosmetic. The focus-tree "Add Equipment" picker offers every entry, and choosing one writes
// `add_equipment_to_stockpile = { type = <chosen> amount = N }` into the tree — so picking NOT or hardness
// produces a focus reward that silently does nothing in game.
//
// Both directions: the junk must go AND every real archetype must stay. A scanner that is too strict empties
// the picker, which is the same bug pointed the other way.
//
// Hermetic: fake mod under tmpdir; the fixture carries the exact nesting shapes vanilla uses.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-scankeys-"));
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

const MOD = path.join(ROOT, "scanmod");
fs.mkdirSync(path.join(MOD, "common", "units", "equipment"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "resources"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="ScanMod"\nsupported_version="1.18.*"\n', "utf8");

// Every nesting shape that used to leak: a nested block, a trigger keyword, a stat, module slots, and an
// `equipments` mentioned only inside a comment.
fs.writeFileSync(path.join(MOD, "common", "units", "equipment", "nova_eq.txt"), [
  "#equipments = {   <- a commented-out block must not be scanned",
  "",
  "equipments = {",
  "",
  "\tnua_real_rifle = {",
  "\t\tyear = 1936",
  "\t\thardness = 0",
  "\t\tupgrades = {",
  "\t\t\tnua_some_upgrade = { }",
  "\t\t}",
  "\t\tmodule_slots = {",
  "\t\t\tturret_type_slot = { }",
  "\t\t\tengine_type_slot = { }",
  "\t\t}",
  "\t\tcan_be_produced = {",
  "\t\t\tNOT = { has_tech = something }",
  "\t\t}",
  "\t}",
  "",
  "\tnua_real_cannon = {",
  "\t\tyear = 1940",
  "\t\tsearch_filters = { FILTER_A }",
  "\t}",
  "}",
  "",
  "duplicate_archetypes = {",
  "\tnua_dup_thing = { archetype = nua_real_rifle }",
  "}",
  "",
].join("\n"), "utf8");

fs.writeFileSync(path.join(MOD, "common", "resources", "nova_res.txt"),
  "resources = {\n\tnua_unobtainium = {\n\t\ticon_frame = 3\n\t}\n}\n", "utf8");

const PORT = 42183;
const app = createApp();
const server = app.listen(PORT, async () => {
  const get = async (route) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}?modPath=${encodeURIComponent(MOD)}`);
    const b = await r.json().catch(() => null);
    return Array.isArray(b) ? b : ((b && (b.items || b.keys)) || []);
  };

  try {
    const eq = await get("/api/game/equipment");
    const res = await get("/api/game/resources");

    console.log("\n[real entries must be offered]");
    rec("the mod's own archetypes are listed",
      eq.includes("nua_real_rifle") && eq.includes("nua_real_cannon"), eq.filter((x) => /^nua_/.test(x)));
    rec("vanilla's archetypes are still listed",
      eq.includes("infantry_equipment") && eq.includes("artillery_equipment"),
      eq.filter((x) => /infantry_equipment|artillery_equipment/.test(x)));
    rec("the resource list is unaffected", res.includes("nua_unobtainium") && res.includes("steel"), res.slice(0, 10));

    console.log("\n[nested keys must NOT be offered]");
    const JUNK = [
      "hardness", "upgrades", "module_slots", "turret_type_slot", "engine_type_slot",
      "can_be_produced", "NOT", "search_filters", "nua_some_upgrade",
    ];
    const leaked = JUNK.filter((j) => eq.includes(j));
    rec("no nested block, keyword or stat leaked into the list", leaked.length === 0, { leaked });

    console.log("\n[comments]");
    rec("an `equipments` block that is only a comment contributes nothing",
      !eq.includes("nua_commented_out"), eq.filter((x) => /commented/.test(x)));

    console.log("\n[sanity]");
    rec("the list is not empty", eq.length > 10, eq.length);
    rec("…and did not swallow the file's other top-level block name", !eq.includes("duplicate_archetypes"),
      eq.filter((x) => /duplicate/.test(x)));

    console.log(`\n=== script keys direct children: ${checks} checks, ${fails.length} failed ===`);
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
