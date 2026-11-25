// #spirit-loc-second-definition — SAVING A SPIRIT DEFINED THE SAME LOC KEY TWICE IN ONE MOD.
//
// The spirit writer only ever upserted inside ONE file: custom_ideas_l_english.yml, or whatever path the
// client named. If the mod already defined `<ideaId>:0` in a DIFFERENT .yml — its own hand-written file, a
// per-country file, the loc that came with a spirit copied in from a base mod, or (as the MIO twin proved)
// another Nova writer's file — the upsert found nothing to replace and APPENDED. HOI4 then picks whichever
// file loads first, so renaming the spirit in Nova often edited the copy the game does NOT read: the save
// reported success and the spirit kept its old name in game.
//
// Nova already resolves a key's existing home before writing it — the events, characters and technology
// writers all call findModLocalizationEntry. The idea writer never adopted it. Same shape as every other
// guard in this codebase that exists next door and was taken up by one sibling and not the others.
//
// Name and description resolve INDEPENDENTLY because splitting them across files is ordinary practice
// (Millennium Dawn does it; scanLocalizationForIdea was fixed for exactly this).
//
// #spirit-save-blanks-inherited-desc — and an empty description box no longer writes `<id>_desc:0 ""`
// against a key the mod does not own. That is not a no-op: an explicit empty string BLANKS the description in
// game, and because the mod loads last it beats the one the dependency defines. Same rule the import path
// already had (#import-blanks-desc). Clearing your OWN text still works, because then the mod owns the key.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-spiritloc-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const MOD = path.join(ROOT, "spiritloc");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english", "replace"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="SpiritLoc"\nsupported_version="1.19.*"\n', "utf8");

// The mod already keeps this spirit's name in ITS OWN file, not in Nova's default one.
const MINE = path.join(MOD, "localisation", "english", "my_spirits_l_english.yml");
fs.writeFileSync(MINE, "﻿l_english:\n sp_alpha:0 \"Old Alpha\"\n sp_alpha_desc:0 \"An inherited description.\"\n neighbour:0 \"Untouched\"\n", "utf8");
const DEFAULT_LOC = path.join(MOD, "localisation", "english", "custom_ideas_l_english.yml");

const allLoc = () => {
  const out = [];
  const walk = (d) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp);
      else if (/\.yml$/i.test(e.name)) out.push({ file: path.relative(MOD, fp).replace(/\\/g, "/"), text: fs.readFileSync(fp, "utf8") });
    }
  };
  walk(path.join(MOD, "localisation"));
  return out;
};
const filesDefining = (key) =>
  allLoc().filter((f) => new RegExp(`^[ \\t]*${key.replace(/\./g, "\\.")}:\\d*[ \\t]*".*"[ \\t]*$`, "m").test(f.text)).map((f) => f.file);
const valueOf = (key) => {
  for (const f of allLoc()) {
    const m = new RegExp(`^[ \\t]*${key.replace(/\./g, "\\.")}:\\d*[ \\t]*"([^"]*)"[ \\t]*$`, "m").exec(f.text);
    if (m) return m[1];
  }
  return null;
};

const PORT = 43311;
const app = createApp();
const srv = app.listen(PORT, async () => {
  const save = (body) => fetch(`http://127.0.0.1:${PORT}/api/ideas/upsert-definition`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({
      modPath: MOD, category: "country",
      targetRelativeFile: "common/ideas/nova_spirits.txt",
      targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
      selectedEffects: ["modifier = {\n\twar_support_factor = 0.05\n}"],
      picture: "generic_morale_bonus",
    }, body)),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[fixture] the mod already defines the key, in its own file");
    rec("sp_alpha is defined exactly once to begin with", filesDefining("sp_alpha").length === 1, filesDefining("sp_alpha"));
    rec("…in the mod's own file, not Nova's default", filesDefining("sp_alpha")[0] === "localisation/english/my_spirits_l_english.yml",
      filesDefining("sp_alpha"));

    console.log("\n[the bug] a save must edit that copy, not append a second one");
    let r = await save({ ideaId: "sp_alpha", name: "New Alpha", desc: "A new description." });
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("the key is still defined EXACTLY ONCE", filesDefining("sp_alpha").length === 1, filesDefining("sp_alpha"));
    rec("…in the file that already had it", filesDefining("sp_alpha")[0] === "localisation/english/my_spirits_l_english.yml",
      filesDefining("sp_alpha"));
    rec("…and it now holds the new name", valueOf("sp_alpha") === "New Alpha", valueOf("sp_alpha"));
    rec("the description followed the same rule", filesDefining("sp_alpha_desc").length === 1, filesDefining("sp_alpha_desc"));
    rec("…and holds the new text", valueOf("sp_alpha_desc") === "A new description.", valueOf("sp_alpha_desc"));
    rec("an unrelated key in that file was not disturbed", valueOf("neighbour") === "Untouched", allLoc());

    console.log("\n[control] a spirit the mod does NOT localise yet still goes to the default file");
    r = await save({ ideaId: "sp_brandnew", name: "Brand New", desc: "Fresh." });
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("it landed in the file the client asked for",
      filesDefining("sp_brandnew").join() === "localisation/english/custom_ideas_l_english.yml", filesDefining("sp_brandnew"));
    rec("…exactly once", filesDefining("sp_brandnew").length === 1, filesDefining("sp_brandnew"));

    console.log("\n[the bug] an empty description must not BLANK one the mod does not own");
    // sp_gamma's description is defined by a dependency, not by this mod. Writing `""` here would win in game.
    r = await save({ ideaId: "sp_gamma", name: "Gamma", desc: "" });
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("the name was written", valueOf("sp_gamma") === "Gamma", valueOf("sp_gamma"));
    rec("…and no empty _desc was written at all", filesDefining("sp_gamma_desc").length === 0, filesDefining("sp_gamma_desc"));

    console.log("\n[control] clearing a description the mod DOES own still clears it");
    r = await save({ ideaId: "sp_alpha", name: "New Alpha", desc: "" });
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("the mod's own description was cleared", valueOf("sp_alpha_desc") === "", {
      v: valueOf("sp_alpha_desc"), files: filesDefining("sp_alpha_desc"),
    });
    rec("…still in one file only", filesDefining("sp_alpha_desc").length === 1, filesDefining("sp_alpha_desc"));

    console.log("\n[precedence] localisation/<lang>/replace/ is what the game reads, so that is what we edit");
    const REPL = path.join(MOD, "localisation", "english", "replace", "override_l_english.yml");
    fs.writeFileSync(REPL, "﻿l_english:\n sp_delta:0 \"From replace\"\n", "utf8");
    fs.writeFileSync(DEFAULT_LOC, fs.readFileSync(DEFAULT_LOC, "utf8").replace(/\n$/, "") + "\n sp_delta:0 \"From plain\"\n", "utf8");
    rec("the fixture has it in both places", filesDefining("sp_delta").length === 2, filesDefining("sp_delta"));
    r = await save({ ideaId: "sp_delta", name: "Delta Renamed", desc: "d" });
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    const replText = fs.readFileSync(REPL, "utf8");
    rec("the replace/ copy — the one the game reads — got the new name",
      /sp_delta:0 "Delta Renamed"/.test(replText), replText);
    rec("…and no THIRD copy was created", filesDefining("sp_delta").length === 2, filesDefining("sp_delta"));

    console.log(`\n=== spirit loc second definition: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
srv.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
