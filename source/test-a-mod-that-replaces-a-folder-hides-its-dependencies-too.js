// ⛔ #replace-path — replace_path UNLOADS THE DEPENDENCY MODS' COPIES TOO, NOT JUST VANILLA'S.
//
// getActiveRoots(root, subpath) dropped the GAME root when anything in the chain replaced the folder, and
// nothing else. So a mod whose OWN descriptor said replace_path="common/characters" was still offered every
// character file its dependencies ship — content its own descriptor had just unloaded.
//
// Measured against the real corpus before the fix: an add-on on The Road to 56, declaring
// replace_path="common/characters" itself, was offered 295 of R56's character files. The game loads none of
// them. The commander picker would have listed 295 files' worth of generals that do not exist.
//
// Ground truth, the HOI4 modding wiki, both halves:
//
//   dependencies — "changes the order in which mods will be loaded, in particular forcing this mod to be
//   loaded after every mod listed in this attribute."
//
//   replace_path — "used in order to unload every previously-loaded file during the main menu loading
//   within the specified folder", removing files from all sources loaded before it, NOT just the base game.
//
// Put together: a mod always loads after the mods it depends on, so its own replace_path hides their copies
// exactly as it hides vanilla's. The wiki states the mirror image as well — changing the load order "will
// ensure that any replace_path within the dependency mod will leave this mod's files untouched" — which is
// why the mod's own root always survives.
//
// ⚠️ THE OTHER DIRECTION IS DELIBERATELY NOT FIXED, AND THE LAST CHECK PINS IT. When only a DEPENDENCY
// declares the replace_path, whether it also unloads a SIBLING dependency's copies depends on which of the
// two sits higher in the launcher's playset — a user choice that appears in no descriptor, so Nova cannot
// know it. Vanilla is always lowest and is dropped either way; the siblings are kept, because offering a
// superset beats emptying the picker (#replace-path-sibling-order). That is a decision, not an oversight:
// if a later change makes Nova drop siblings, this test should be updated deliberately, not deleted.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ownrp-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};

// Each mod gets a character file whose FILENAME identifies its owner, so a count can never be satisfied by
// the wrong root — the assertions below name the owner rather than trusting a total.
const mk = (name, { deps = [], replacePaths = [] } = {}) => {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "characters"), { recursive: true });
  let d = `version="1"\nname="${name}"\nsupported_version="1.19.*"\n`;
  for (const p of replacePaths) d += `replace_path="${p}"\n`;
  if (deps.length) d += `dependencies={\n${deps.map((x) => `\t"${x}"`).join("\n")}\n}\n`;
  fs.writeFileSync(path.join(dir, "descriptor.mod"), d, "utf8");
  fs.writeFileSync(path.join(dir, "common", "characters", `zz_${name}.txt`),
    `characters = {\n\t${name}_general = {\n\t\tname = "${name} General"\n\t\tcorps_commander = {\n\t\t\tskill = 3\n\t\t}\n\t}\n}\n`, "utf8");
  return dir;
};

const BASE = mk("ownrp_base");                                              // ships zz_ownrp_base.txt
const SIB = mk("ownrp_sibling");                                            // ships zz_ownrp_sibling.txt
const PLAIN = mk("ownrp_plain", { deps: ["ownrp_base"] });                  // control: replaces nothing
const OWN = mk("ownrp_own", { deps: ["ownrp_base"], replacePaths: ["common/characters"] });
const OTHER = mk("ownrp_other", { deps: ["ownrp_base"], replacePaths: ["common/ideas"] }); // a DIFFERENT folder
// The ambiguous shape: the add-on replaces nothing, one dependency does, and a sibling dependency does not.
const DEPREPL = mk("ownrp_deprepl", { replacePaths: ["common/characters"] });
const SIBCASE = mk("ownrp_sibcase", { deps: ["ownrp_deprepl", "ownrp_sibling"] });

const PORT = 42571;
const app = createApp();
const server = app.listen(PORT, async () => {
  try {
    const sourcesFor = async (mod) => {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/characters/list?includeBaseMod=1&modPath=${encodeURIComponent(mod)}`);
      const d = await r.json();
      // Read the RAW shape before counting. A wrong key here makes every list empty and every
      // "must not be offered" check pass for the worst possible reason.
      if (!Array.isArray(d.baseModFiles)) throw new Error("baseModFiles is not an array: " + JSON.stringify(d).slice(0, 200));
      return (d.baseModFiles || []).map((f) => String(f.file || f.name || "")).filter(Boolean);
    };
    const has = (list, owner) => list.some((f) => f.includes(`zz_${owner}.txt`));

    console.log("\n-- CONTROL: an add-on that replaces nothing still sees its dependency --");
    {
      const got = await sourcesFor(PLAIN);
      ok(has(got, "ownrp_base"), "the dependency's characters are offered", got.slice(0, 6));
      ok(got.length > 0, "…and the picker is not empty", got.length);
    }

    console.log("\n-- CONTROL: replacing a DIFFERENT folder changes nothing here --");
    {
      const got = await sourcesFor(OTHER);
      ok(has(got, "ownrp_base"), "replace_path=\"common/ideas\" does not hide common/characters", got.slice(0, 6));
    }

    console.log("\n-- ⭐ THE FIX: the mod's OWN replace_path hides its dependency, not only vanilla --");
    {
      const got = await sourcesFor(OWN);
      ok(!has(got, "ownrp_base"), "the dependency's characters are NOT offered", got.slice(0, 6));
      ok(got.length === 0, "…and neither is anything else, vanilla included", { count: got.length, sample: got.slice(0, 4) });
    }

    console.log("\n-- the sibling case stays a superset ON PURPOSE (#replace-path-sibling-order) --");
    {
      // ownrp_deprepl replaces common/characters; ownrp_sibling does not. Which one wins is a playset
      // ordering Nova cannot see, so both are offered. Changing this needs a reason, not a tidy-up.
      const got = await sourcesFor(SIBCASE);
      ok(has(got, "ownrp_sibling"), "a sibling dependency is still offered", got.slice(0, 6));
      ok(has(got, "ownrp_deprepl"), "…as is the one that declares the replace_path", got.slice(0, 6));
    }

    console.log(`\n${fails.length ? "FAILED" : "PASSED"}  ${pass} checks ok, ${fails.length} failed`);
    if (fails.length) fails.forEach((f) => console.log("   - " + f));
  } catch (e) {
    console.log("THREW " + (e && e.stack ? e.stack : e));
    fails.push("threw");
  } finally {
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    process.exit(fails.length ? 1 : 0);
  }
});
