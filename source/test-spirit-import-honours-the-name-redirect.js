// A national spirit may redirect its display name: `SAL_closed_nation = { name = closed_nation … }`. HOI4
// localises the idea through THAT key, not through the idea id.
//
// "Import into my mod" copied the block VERBATIM, redirect and all, but then wrote the name and description
// it had harvested under `<ideaId>`. So the game read `closed_nation`, found nothing, and the imported spirit
// had NO NAME AT ALL — it rendered as its raw key. Nova's own catalogue agreed: localizedName came back ""
// for the spirit that had just been imported, and the mod also gained a dead `<ideaId>` key nothing reads.
// The import reported ok both times.
//
// The read half of the same handler was already redirect-aware (scanLocalizationForIdea takes a
// nameKeyOverride, #idea-name-loc-redirect-ignored) and the save twin /api/ideas/upsert-definition already
// wrote the redirect key (#spirit-loc-ignores-the-name-redirect) — the import path never adopted it, so the
// two halves of one endpoint disagreed about which key the game reads.
//
// Measured with the shipped parser over common/ideas in the six installed corpora: 48,173 idea blocks, of
// which 6,514 declare a `name = <key>` different from their own id and 4,941 are localised ONLY under that
// key. This is the ordinary shape of a levelled spirit, not an edge case.
//
// The fix writes the redirect key rather than rewriting the block's `name =` to the new id: the block is
// copied verbatim, and rewriting would split levelled spirits that deliberately share one display name.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-spiritredir-"));
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
fs.mkdirSync(path.join(SRC, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(SRC, "descriptor.mod"), 'name="SrcMod"\nsupported_version="1.18.*"\n', "utf8");

fs.writeFileSync(path.join(SRC, "common", "ideas", "src_ideas.txt"), [
  "ideas = {",
  "\tcountry = {",
  // CONTROL: no redirect at all. Must keep landing under its own id.
  "\t\tredir_plain_spirit = {",
  "\t\t\tpicture = generic_morale_bonus",
  "\t\t\tmodifier = { war_support_factor = 0.05 }",
  "\t\t}",
  // The defect: name and description live under the shared key, not under the id.
  "\t\tredir_level_2_spirit = {",
  "\t\t\tname = REDIR_SHARED_KEY",
  "\t\t\tpicture = generic_morale_bonus",
  "\t\t\tmodifier = { political_power_factor = 0.1 }",
  "\t\t}",
  // A redirecting spirit whose key has a NAME but no _desc — #import-blanks-desc must still hold.
  "\t\tredir_nodesc_spirit = {",
  "\t\t\tname = REDIR_NODESC_KEY",
  "\t\t\tpicture = generic_morale_bonus",
  "\t\t\tmodifier = { stability_factor = 0.02 }",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

fs.writeFileSync(path.join(SRC, "localisation", "english", "src_l_english.yml"),
  "﻿" + [
    "l_english:",
    ' redir_plain_spirit:0 "Plain Display Name"',
    ' redir_plain_spirit_desc:0 "Plain description"',
    ' REDIR_SHARED_KEY:0 "Shared Display Name"',
    ' REDIR_SHARED_KEY_desc:0 "Shared description"',
    ' REDIR_NODESC_KEY:0 "No Description Spirit"',
    "",
  ].join("\n"), "utf8");

// ---- target mod: the one being imported INTO ----
const MOD = path.join(ROOT, "tgtmod");
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TgtMod"\nsupported_version="1.18.*"\n', "utf8");

const PORT = 53683;
const app = createApp();
const server = app.listen(PORT, async () => {
  const importIdea = async (ideaId) => {
    // Field-for-field what public/app.js:17314 sends when "Import into my mod" is ticked.
    const r = await fetch(`http://127.0.0.1:${PORT}/api/ideas/import`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ideaId, modPath: MOD, sourceModRoot: SRC, targetLocalizationPath: "" }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const LOC = path.join(MOD, "localisation", "english", "focus_editor_imported_ideas_l_english.yml");
  const IDEAS = path.join(MOD, "common", "ideas", "focus_editor_imported_ideas.txt");
  const locText = () => (fs.existsSync(LOC) ? fs.readFileSync(LOC, "utf8") : "");
  const valueOf = (key) => {
    const m = new RegExp(`^\\s*${key}:\\d*\\s*"((?:[^"\\\\]|\\\\.)*)"`, "m").exec(locText());
    return m ? m[1] : null;
  };
  const countOf = (key) => (locText().match(new RegExp(`^\\s*${key}:\\d*\\s*"`, "gm")) || []).length;

  try {
    console.log("\n[fixture control] the source block really declares a redirect");
    // Without this the whole test could pass vacuously against a block that has nothing to redirect.
    const srcText = fs.readFileSync(path.join(SRC, "common", "ideas", "src_ideas.txt"), "utf8");
    rec("the source block declares `name = REDIR_SHARED_KEY`", /name\s*=\s*REDIR_SHARED_KEY/.test(srcText), srcText.slice(0, 200));
    rec("…and REDIR_SHARED_KEY is not the idea id", "REDIR_SHARED_KEY" !== "redir_level_2_spirit", "sanity");
    rec("the source localises the redirect key, NOT the idea id",
      /REDIR_SHARED_KEY:0/.test(fs.readFileSync(path.join(SRC, "localisation", "english", "src_l_english.yml"), "utf8"))
      && !/redir_level_2_spirit:0/.test(fs.readFileSync(path.join(SRC, "localisation", "english", "src_l_english.yml"), "utf8")),
      "source loc fixture");

    console.log("\n[control] a spirit with NO redirect still lands under its own id");
    let r = await importIdea("redir_plain_spirit");
    rec("the control import succeeded", r.status === 200 && r.body && r.body.ok === true, r.body || r.status);
    rec("a write really happened (the loc file exists)", fs.existsSync(LOC), LOC);
    rec("control name under its own id", valueOf("redir_plain_spirit") === "Plain Display Name", valueOf("redir_plain_spirit"));
    rec("control description under its own id", valueOf("redir_plain_spirit_desc") === "Plain description",
      valueOf("redir_plain_spirit_desc"));

    console.log("\n[the defect] a redirecting spirit must be localised under the key the GAME reads");
    r = await importIdea("redir_level_2_spirit");
    rec("the import succeeded", r.status === 200 && r.body && r.body.ok === true, r.body || r.status);
    rec("the definition was copied", Array.isArray(r.body.imported) && r.body.imported.includes("definition"), r.body);
    rec("the copied block still declares the redirect verbatim",
      /name\s*=\s*REDIR_SHARED_KEY/.test(fs.existsSync(IDEAS) ? fs.readFileSync(IDEAS, "utf8") : ""),
      fs.existsSync(IDEAS) ? fs.readFileSync(IDEAS, "utf8") : "(no ideas file)");
    rec("the name is written under REDIR_SHARED_KEY", valueOf("REDIR_SHARED_KEY") === "Shared Display Name",
      { got: valueOf("REDIR_SHARED_KEY"), file: locText() });
    rec("the description is written under REDIR_SHARED_KEY_desc",
      valueOf("REDIR_SHARED_KEY_desc") === "Shared description", valueOf("REDIR_SHARED_KEY_desc"));
    // The OLD behaviour, composed alongside the new one: the key the game never reads must not be written.
    rec("NO dead `<ideaId>` name key was written", valueOf("redir_level_2_spirit") === null,
      { wrote: valueOf("redir_level_2_spirit"), file: locText() });
    rec("NO dead `<ideaId>_desc` key was written", valueOf("redir_level_2_spirit_desc") === null,
      valueOf("redir_level_2_spirit_desc"));

    console.log("\n[the symptom] Nova's own catalogue must now see a name for it");
    const catRes = await fetch(`http://127.0.0.1:${PORT}/api/ideas/catalog?withNames=1&modPath=${encodeURIComponent(MOD)}`);
    const cat = await catRes.json().catch(() => null);
    const rows = (cat && (cat.items || cat.ideas)) || [];
    const rowOf = (id) => rows.find((x) => String(x.ideaId || x.id || "") === id) || null;
    rec("the catalogue answered", catRes.status === 200 && rows.length > 0, { status: catRes.status, n: rows.length });
    rec("the imported redirecting spirit has a localizedName",
      rowOf("redir_level_2_spirit") && rowOf("redir_level_2_spirit").localizedName === "Shared Display Name",
      rowOf("redir_level_2_spirit"));
    rec("…and the control still has its own", rowOf("redir_plain_spirit")
      && rowOf("redir_plain_spirit").localizedName === "Plain Display Name", rowOf("redir_plain_spirit"));

    console.log("\n[must not over-correct] #import-blanks-desc still holds on the redirect path");
    r = await importIdea("redir_nodesc_spirit");
    rec("the import succeeded", r.status === 200 && r.body && r.body.ok === true, r.body || r.status);
    rec("the name landed under REDIR_NODESC_KEY", valueOf("REDIR_NODESC_KEY") === "No Description Spirit",
      valueOf("REDIR_NODESC_KEY"));
    rec("NO blanking empty description was written", valueOf("REDIR_NODESC_KEY_desc") === null,
      { wrote: valueOf("REDIR_NODESC_KEY_desc"), file: locText() });

    console.log("\n[idempotence] re-importing upserts the redirect key, it does not append a second one");
    const settled = fs.readFileSync(LOC);
    await importIdea("redir_level_2_spirit");
    rec("a second identical import changes nothing", fs.readFileSync(LOC).equals(settled),
      { before: settled.length, after: fs.readFileSync(LOC).length, file: locText() });
    rec("REDIR_SHARED_KEY is defined exactly once", countOf("REDIR_SHARED_KEY") === 1, countOf("REDIR_SHARED_KEY"));

    console.log(`\n=== spirit import name redirect: ${checks} checks, ${fails.length} failed ===`);
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
