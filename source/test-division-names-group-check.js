// #division-names-group-undefined — an order of battle naming a division_names_group nothing defines.
//
// HOI4 resolves the group against common/units/names_divisions. When nothing defines it, every division built
// from that template is NAMELESS in game — on the map, in the army list, on every order you give it.
//
// Nova already knew how to detect this. The knowledge just lived somewhere you had to walk to: the Army maker
// reports it in the response to SAVING a country's order of battle, so you hear it only if you happen to open
// and re-save that exact country. The mod this campaign built shipped a template pointing at a group defined
// nowhere, and Mod Health called the mod clean. Same shape as the missing country flag — right knowledge,
// wrong place.
//
// The case-insensitivity is not a detail. Vanilla defines GER_Inf_01; a mod writing GER_INF_01 works fine.
// A case-sensitive check reports real, working groups as missing — this campaign already made that mistake
// once, on a different check, and it produced a confident false alarm about vanilla content.
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const mi = require("./mod-index.js");

let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const groupsOf = (probs) => probs.filter((p) => p.rule === "division_names_group_undefined").map((p) => p.entityId);

const tmpl = (name, group) =>
  `division_template = {\n\tname = "${name}"\n\tdivision_names_group = ${group}\n\tregiments = {\n\t\tinfantry = { x = 0 y = 0 }\n\t}\n}\n`;
const groupDef = (id) => `${id} = {\n\tname = "${id}"\n\tfor_countries = { AAA }\n\tcan_use = { always = yes }\n\tdivision_types = { "infantry" }\n\tfallback_name = "%d. Division"\n}\n`;

// A "base game" that defines one group, in vanilla's mixed casing.
const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dng-game-"));
mk(path.join(GAME, "common", "units", "names_divisions", "GER_names.txt"), groupDef("GER_Inf_01"));

(() => {
  console.log("=== a group nothing defines ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dng-mod-"));
  mk(path.join(mod, "descriptor.mod"), 'name="DngMod"\nsupported_version="1.19.*"\n');
  mk(path.join(mod, "history", "units", "AAA_oob.txt"), tmpl("Line Infantry", "AAA_INF_01"));

  const r1 = mi.buildModIndex(mod, { vanillaRoot: GAME });
  ok("the undefined group is reported", groupsOf(r1.problems).includes("AAA_INF_01"), groupsOf(r1.problems));
  const p = r1.problems.find((x) => x.rule === "division_names_group_undefined");
  ok("…as a warning, not an error", p.severity === "warning", p.severity);
  ok("…pointing at the OOB file that uses it", p.file === "history/units/AAA_oob.txt", p.file);
  ok("…and saying what goes wrong in game", /no name in game/i.test(p.message), p.message);

  console.log("\n=== …and once the mod defines it ===");
  mk(path.join(mod, "common", "units", "names_divisions", "AAA_names.txt"), groupDef("AAA_INF_01"));
  const r2 = mi.buildModIndex(mod, { vanillaRoot: GAME });
  ok("it is no longer reported", !groupsOf(r2.problems).includes("AAA_INF_01"), groupsOf(r2.problems));

  console.log("\n=== casing must not create a false alarm ===");
  // Vanilla ships GER_Inf_01. A mod referring to GER_INF_01 works in game; reporting it would be a confident
  // lie about working content.
  const mod2 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dng-case-"));
  mk(path.join(mod2, "descriptor.mod"), 'name="CaseMod"\nsupported_version="1.19.*"\n');
  mk(path.join(mod2, "history", "units", "GER_oob.txt"), tmpl("German Infantry", "GER_INF_01"));
  const r3 = mi.buildModIndex(mod2, { vanillaRoot: GAME });
  ok("a group that differs only in CASE from a real one is not reported",
    !groupsOf(r3.problems).includes("GER_INF_01"), groupsOf(r3.problems));

  console.log("\n=== a group the parent mod defines is the parent's, not the add-on's ===");
  const DEP = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dng-dep-"));
  mk(path.join(DEP, "common", "units", "names_divisions", "PAR_names.txt"), groupDef("PAR_INF_01"));
  const mod3 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dng-addon-"));
  mk(path.join(mod3, "descriptor.mod"), 'name="AddOn"\nsupported_version="1.19.*"\n');
  mk(path.join(mod3, "history", "units", "PAR_oob.txt"), tmpl("Parent Infantry", "PAR_INF_01"));
  const r4 = mi.buildModIndex(mod3, { vanillaRoot: GAME, dependencyRoots: [DEP] });
  ok("an add-on is not blamed for a group its parent defines",
    !groupsOf(r4.problems).includes("PAR_INF_01"), groupsOf(r4.problems));
  const r5 = mi.buildModIndex(mod3, { vanillaRoot: GAME, dependencyRoots: [] });
  ok("…but with no parent supplying it, it is reported", groupsOf(r5.problems).includes("PAR_INF_01"), groupsOf(r5.problems));

  console.log("\n=== a template with no group at all is fine ===");
  // Leaving the field out is the documented way to fall back to the country's default division names.
  const mod4 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dng-none-"));
  mk(path.join(mod4, "descriptor.mod"), 'name="NoGroup"\nsupported_version="1.19.*"\n');
  mk(path.join(mod4, "history", "units", "BBB_oob.txt"),
    'division_template = {\n\tname = "Plain"\n\tregiments = {\n\t\tinfantry = { x = 0 y = 0 }\n\t}\n}\n');
  const r6 = mi.buildModIndex(mod4, { vanillaRoot: GAME });
  ok("omitting the group entirely raises nothing",
    r6.problems.every((x) => x.rule !== "division_names_group_undefined"), groupsOf(r6.problems));

  console.log("\n=== one missing group used twice is reported once ===");
  const mod5 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dng-dup-"));
  mk(path.join(mod5, "descriptor.mod"), 'name="DupMod"\nsupported_version="1.19.*"\n');
  mk(path.join(mod5, "history", "units", "CCC_oob.txt"), tmpl("A", "CCC_INF_01") + tmpl("B", "CCC_INF_01"));
  const r7 = mi.buildModIndex(mod5, { vanillaRoot: GAME });
  ok("…not once per template", groupsOf(r7.problems).filter((g) => g === "CCC_INF_01").length === 1, groupsOf(r7.problems));

  [GAME, DEP, mod, mod2, mod3, mod4, mod5].forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
  console.log("\ntest-division-names-group-check: " + pass + " checks passed");
})();
