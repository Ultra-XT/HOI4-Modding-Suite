// #import-duplicates-existing-idea — /api/ideas/import skipped an idea already present in the file it writes
// to, but checked nowhere else. Importing an idea the mod already defines in ANOTHER file therefore created a
// SECOND definition of the same id.
//
// That is not clutter. HOI4 takes one definition and the other is dead, and which one wins depends on load
// order — so the modder ends up with an idea that silently has the wrong modifiers. Observed for real in the
// demo mod: five ids defined in both focus_editor_imported_ideas.txt and the file that seeded them.
//
// Skipping rather than refusing, for the same reason the function already skips within one file: the
// definition is simply already there. The localisation and icon steps still run, so a re-import to refresh a
// name or a picture keeps working — which is the positive control below.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-impdup-"));
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

// ---- source mod ----
const SRC = path.join(ROOT, "srcmod");
fs.mkdirSync(path.join(SRC, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(SRC, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(SRC, "descriptor.mod"), 'name="SrcMod"\nsupported_version="1.18.*"\n', "utf8");
fs.writeFileSync(path.join(SRC, "common", "ideas", "src.txt"), [
  "ideas = {",
  "\tcountry = {",
  "\t\tdup_probe_spirit = {",
  "\t\t\tpicture = generic_morale_bonus",
  "\t\t\tmodifier = { political_power_factor = 0.1 }",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");
fs.writeFileSync(path.join(SRC, "localisation", "english", "src_l_english.yml"),
  "﻿" + ['l_english:', ' dup_probe_spirit:0 "Source Name"', ' dup_probe_spirit_desc:0 "Source description"', ""].join("\n"), "utf8");

// ---- target mod, which ALREADY defines that idea in a file of its own ----
const MOD = path.join(ROOT, "tgtmod");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TgtMod"\nsupported_version="1.18.*"\n', "utf8");
const OWN = path.join(MOD, "common", "ideas", "my_own_ideas.txt");
fs.writeFileSync(OWN, [
  "ideas = {",
  "\tcountry = {",
  "\t\tdup_probe_spirit = {",
  "\t\t\tpicture = generic_morale_bonus",
  "\t\t\tmodifier = { war_support_factor = 0.99 }",   // deliberately DIFFERENT from the source
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

const IMPORTED = path.join(MOD, "common", "ideas", "focus_editor_imported_ideas.txt");

const countDefs = (id) => {
  let n = 0;
  const dir = path.join(MOD, "common", "ideas");
  for (const f of fs.readdirSync(dir)) {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    n += (t.match(new RegExp(`(?:^|\\n)\\s*${id}\\s*=\\s*\\{`, "g")) || []).length;
  }
  return n;
};

const PORT = 42459;
const app = createApp();
const server = app.listen(PORT, async () => {
  const importIdea = async (ideaId) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/ideas/import`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ideaId, sourceModRoot: SRC, modPath: MOD }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  try {
    console.log("\n[fixture control] the target really does define it already, exactly once");
    rec("one definition before importing", countDefs("dup_probe_spirit") === 1, countDefs("dup_probe_spirit"));

    console.log("\n[import] must NOT create a second definition");
    let r = await importIdea("dup_probe_spirit");
    rec("the import succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("STILL exactly one definition mod-wide", countDefs("dup_probe_spirit") === 1,
      { count: countDefs("dup_probe_spirit"), files: fs.readdirSync(path.join(MOD, "common", "ideas")) });
    rec("…and it says the definition was skipped",
      !!(r.body && Array.isArray(r.body.imported) && r.body.imported.includes("definition-skipped")), r.body);
    rec("…naming the file that already owns it",
      !!(r.body && /my_own_ideas/.test(String(r.body.alreadyDefinedIn || ""))), r.body);

    console.log("\n[the mod's own version wins] its modifiers must be untouched");
    // The whole point: the user's own definition is the real one, and importing must not shadow it.
    rec("the mod's own modifier survived", /war_support_factor\s*=\s*0\.99/.test(fs.readFileSync(OWN, "utf8")),
      fs.readFileSync(OWN, "utf8"));
    rec("the source's modifier was NOT written anywhere",
      !fs.readdirSync(path.join(MOD, "common", "ideas"))
        .some((f) => /political_power_factor\s*=\s*0\.1/.test(fs.readFileSync(path.join(MOD, "common", "ideas", f), "utf8"))),
      fs.readdirSync(path.join(MOD, "common", "ideas")));

    console.log("\n[control] localisation still runs, so a re-import can refresh a name");
    // Without this the fix could be "do nothing at all when the idea exists", which breaks re-import.
    const locDir = path.join(MOD, "localisation", "english");
    const locText = fs.readdirSync(locDir).map((f) => fs.readFileSync(path.join(locDir, f), "utf8")).join("\n");
    rec("the name was still imported", /dup_probe_spirit:\d*\s*"Source Name"/.test(locText), locText.slice(0, 300));

    console.log("\n[control] an idea the mod does NOT have is still imported normally");
    fs.writeFileSync(path.join(SRC, "common", "ideas", "src2.txt"), [
      "ideas = {",
      "\tcountry = {",
      "\t\tbrand_new_spirit = {",
      "\t\t\tpicture = generic_morale_bonus",
      "\t\t\tmodifier = { stability_factor = 0.05 }",
      "\t\t}",
      "\t}",
      "}",
      "",
    ].join("\n"), "utf8");
    r = await importIdea("brand_new_spirit");
    rec("the new idea imported", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    rec("…and reports a real definition write",
      !!(r.body && (r.body.imported || []).includes("definition")), r.body);
    rec("…and it landed exactly once", countDefs("brand_new_spirit") === 1, countDefs("brand_new_spirit"));
    rec("…in the imported-ideas file", fs.existsSync(IMPORTED) && /brand_new_spirit/.test(fs.readFileSync(IMPORTED, "utf8")),
      fs.existsSync(IMPORTED));

    console.log("\n[idempotence] importing the same new idea twice stays at one definition");
    await importIdea("brand_new_spirit");
    rec("still exactly one", countDefs("brand_new_spirit") === 1, countDefs("brand_new_spirit"));

    console.log(`\n=== idea import no duplicate: ${checks} checks, ${fails.length} failed ===`);
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
