// Importing a national spirit from another mod copies its localisation. scanLocalizationForIdea did that by
// reading ONE flat directory and returning from the first file that matched EITHER key, which produced three
// distinct failures — and every one of them is silent, because import reports ok either way:
//
//  * localisation/english/replace/ was never scanned. The wiki gives that folder as THE way to override a
//    string and MD ships it for every language, so an idea whose name lives there scanned as "not found" and
//    was imported with its raw id as its name. The importing mod loads LAST, so that raw id then wins in game
//    over the correct name — the import actively made things worse than not importing.
//  * A source keeping names and descriptions in different files lost whichever sat in the later file.
//  * When no description was found the importer still wrote `<id>_desc:0 ""`. An explicit empty string BLANKS
//    the description in game, so importing a spirit to keep it erased the description it already had.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ideaimp-"));
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

// ---- source mod: the one being imported FROM ----
const SRC = path.join(ROOT, "srcmod");
fs.mkdirSync(path.join(SRC, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(SRC, "localisation", "english", "replace"), { recursive: true });
fs.writeFileSync(path.join(SRC, "descriptor.mod"), 'name="SrcMod"\nsupported_version="1.18.*"\n', "utf8");

fs.writeFileSync(path.join(SRC, "common", "ideas", "src_ideas.txt"), [
  "ideas = {",
  "\tcountry = {",
  "\t\tsrc_split_spirit = {",
  "\t\t\tpicture = generic_morale_bonus",
  "\t\t\tmodifier = { political_power_factor = 0.1 }",
  "\t\t}",
  "\t\tsrc_nodesc_spirit = {",
  "\t\t\tpicture = generic_morale_bonus",
  "\t\t\tmodifier = { war_support_factor = 0.05 }",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

// The NAME lives in replace/ (the override folder), and only there.
fs.writeFileSync(path.join(SRC, "localisation", "english", "replace", "src_override_l_english.yml"),
  "﻿" + ['l_english:', ' src_split_spirit:0 "Correct Overridden Name"', ""].join("\n"), "utf8");

// The DESCRIPTION lives in a different, ordinary file — alphabetically AFTER nothing in particular; the point
// is only that it is not the same file as the name.
fs.writeFileSync(path.join(SRC, "localisation", "english", "zz_src_desc_l_english.yml"),
  "﻿" + ['l_english:', ' src_split_spirit_desc:0 "A description kept in a separate file"', ""].join("\n"), "utf8");

// A decoy: the OLD scan would have matched this file first and returned, taking the wrong name.
fs.writeFileSync(path.join(SRC, "localisation", "english", "aaa_src_base_l_english.yml"),
  "﻿" + ['l_english:', ' src_split_spirit:0 "Stale Base Name"', ' src_nodesc_spirit:0 "No Description Spirit"', ""].join("\n"), "utf8");

// ---- target mod: the one being imported INTO ----
const MOD = path.join(ROOT, "tgtmod");
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TgtMod"\nsupported_version="1.18.*"\n', "utf8");

const PORT = 42423;
const app = createApp();
const server = app.listen(PORT, async () => {
  const importIdea = async (ideaId) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/ideas/import`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ideaId, sourceModRoot: SRC, modPath: MOD }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const LOC = path.join(MOD, "localisation", "english", "focus_editor_imported_ideas_l_english.yml");
  const locText = () => (fs.existsSync(LOC) ? fs.readFileSync(LOC, "utf8") : "");
  const valueOf = (key) => {
    const m = new RegExp(`^\\s*${key}:\\d*\\s*"((?:[^"\\\\]|\\\\.)*)"`, "m").exec(locText());
    return m ? m[1] : null;
  };

  try {
    console.log("\n[replace/ folder] the name in localisation/english/replace/ must win");
    let r = await importIdea("src_split_spirit");
    rec("the import succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("the name came from the replace/ folder", valueOf("src_split_spirit") === "Correct Overridden Name",
      valueOf("src_split_spirit"));
    rec("…not the raw id (what a failed scan produces)", valueOf("src_split_spirit") !== "src_split_spirit",
      valueOf("src_split_spirit"));
    rec("…and not the stale non-replace name", valueOf("src_split_spirit") !== "Stale Base Name",
      valueOf("src_split_spirit"));

    console.log("\n[split files] a description in a DIFFERENT file must still be found");
    rec("the description was imported", valueOf("src_split_spirit_desc") === "A description kept in a separate file",
      valueOf("src_split_spirit_desc"));

    console.log("\n[no description] must not write an empty one");
    r = await importIdea("src_nodesc_spirit");
    rec("the import succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("the name was imported", valueOf("src_nodesc_spirit") === "No Description Spirit", valueOf("src_nodesc_spirit"));
    rec("NO _desc key was written at all", valueOf("src_nodesc_spirit_desc") === null,
      { wrote: valueOf("src_nodesc_spirit_desc"), file: locText() });
    rec("…specifically not a blanking empty string",
      !/src_nodesc_spirit_desc:\d*\s*""/.test(locText()), locText());

    console.log("\n[control] a real description is still written");
    // Without this the desc fix could be "never write a description", which would break the feature.
    rec("the split spirit's description is still present",
      /src_split_spirit_desc:\d*\s*"A description kept in a separate file"/.test(locText()), locText());

    console.log("\n[idempotence] importing twice is byte-identical");
    const settled = fs.readFileSync(LOC);
    await importIdea("src_split_spirit");
    rec("a second identical import changes nothing", fs.readFileSync(LOC).equals(settled),
      { before: settled.length, after: fs.readFileSync(LOC).length });

    console.log(`\n=== idea import localisation: ${checks} checks, ${fails.length} failed ===`);
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
